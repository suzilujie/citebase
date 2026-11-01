import { createHash, randomUUID } from 'node:crypto';
import { config } from '../config';
import { maybeOne, pool, query, toVector } from '../db';
import { embedTexts } from '../retrieve/embed';
import { toSearchText } from '../retrieve/tokenize';
import type { ChunkDraft, DocumentRow } from '../types';
import { chunkPages } from './chunk';
import { parseDocument } from './parse';

// Ingestion is synchronous inside the request on purpose: a single file is a
// few thousand chunks at most, which is 2-5 seconds. A job queue would add a
// process, a table and a failure mode for no user-visible benefit at this size.
// See docs/system-design.html (decision D6 / performance notes).

const DOC_COLS =
  'id, filename, mime, size_bytes, sha256, page_count, chunk_count, status, error, created_at';

export interface IngestResult {
  doc: DocumentRow;
  duplicate: boolean;
}

async function reload(docId: string): Promise<DocumentRow> {
  const row = await maybeOne<DocumentRow>(`select ${DOC_COLS} from documents where id = $1`, [
    docId,
  ]);
  if (!row) throw new Error(`document ${docId} disappeared during ingest`);
  return row;
}

async function markFailed(docId: string, message: string): Promise<DocumentRow> {
  await query('update documents set status = $2, error = $3 where id = $1', [
    docId,
    'failed',
    message.slice(0, 500),
  ]);
  return reload(docId);
}

export async function ingestDocument(input: {
  filename: string;
  mime: string;
  bytes: Uint8Array;
}): Promise<IngestResult> {
  // Only the basename is kept: the display name must never be able to escape the
  // storage layer, and nothing is written to disk under this name anyway.
  const filename = (input.filename.split(/[\\/]/).pop() ?? 'untitled').slice(0, 200);
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');

  const existing = await maybeOne<DocumentRow>(
    `select ${DOC_COLS} from documents where sha256 = $1`,
    [sha256],
  );

  if (existing && existing.status === 'ready') {
    // Re-uploading the same bytes must not burn embedding tokens again.
    return { doc: existing, duplicate: true };
  }
  if (existing) {
    // A previous attempt failed: drop it and retry cleanly instead of stacking
    // a second row with the same hash (blocked by the unique index anyway).
    await query('delete from documents where id = $1', [existing.id]);
  }

  const id = randomUUID();
  await query(
    `insert into documents (id, filename, mime, size_bytes, sha256, status)
     values ($1, $2, $3, $4, $5, 'pending')`,
    [id, filename, input.mime || 'application/octet-stream', input.bytes.byteLength, sha256],
  );

  let chunks: ChunkDraft[] = [];
  let pageCount = 0;
  try {
    const pages = await parseDocument({ filename, mime: input.mime, bytes: input.bytes });
    pageCount = pages.length;
    chunks = chunkPages(pages, {
      size: config.CHUNK_SIZE,
      overlap: config.CHUNK_OVERLAP,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ingest] parse failed for ${filename}: ${message}`);
    return { doc: await markFailed(id, message), duplicate: false };
  }

  if (chunks.length === 0) {
    return { doc: await markFailed(id, '未切分出任何有效文本块'), duplicate: false };
  }

  let vectors: number[][] = [];
  try {
    // Heading is prepended only for the keyword index and the embedding input:
    // a chunk whose section title says "差旅报销" should match that word even
    // when the body never repeats it.
    const inputs = chunks.map((c) => `${c.headingPath} ${c.content}`.trim());
    vectors = await embedTexts(inputs);
    if (vectors.length !== inputs.length) {
      throw new Error(`向量数量不匹配：应为 ${inputs.length}，实际 ${vectors.length}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ingest] embedding failed for ${filename}: ${message}`);
    return { doc: await markFailed(id, message), duplicate: false };
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const BATCH = 40;
    for (let offset = 0; offset < chunks.length; offset += BATCH) {
      const slice = chunks.slice(offset, offset + BATCH);
      const params: unknown[] = [];
      const rows = slice.map((chunk, i) => {
        const base = i * 9;
        params.push(
          id,
          chunk.ordinal,
          chunk.page,
          chunk.headingPath,
          chunk.content,
          chunk.charStart,
          chunk.charEnd,
          toSearchText(`${chunk.headingPath} ${chunk.content}`),
          toVector(vectors[offset + i] ?? []),
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, to_tsvector('simple', $${base + 8}), $${base + 9}::vector)`;
      });

      await client.query(
        `insert into chunks
           (doc_id, ordinal, page, heading_path, content, char_start, char_end, search_text, tokens, embedding)
         values ${rows.join(', ')}`,
        params,
      );
    }

    await client.query(
      `update documents
          set chunk_count = $2, page_count = $3, status = 'ready', error = null
        where id = $1`,
      [id, chunks.length, pageCount],
    );
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ingest] write failed for ${filename}: ${message}`);
    return { doc: await markFailed(id, message), duplicate: false };
  } finally {
    client.release();
  }

  return { doc: await reload(id), duplicate: false };
}

export async function listDocuments(): Promise<DocumentRow[]> {
  return query<DocumentRow>(`select ${DOC_COLS} from documents order by created_at desc`);
}

export async function deleteDocument(id: string): Promise<boolean> {
  const row = await maybeOne<{ id: string }>('delete from documents where id = $1 returning id', [
    id,
  ]);
  return row !== null;
}

/** Rebuilds the raw text of a document from its chunks, for the "open source" link. */
export async function documentText(id: string): Promise<{ filename: string; text: string } | null> {
  const doc = await maybeOne<{ filename: string }>('select filename from documents where id = $1', [
    id,
  ]);
  if (!doc) return null;

  const rows = await query<{ page: number; heading_path: string; content: string }>(
    'select page, heading_path, content from chunks where doc_id = $1 order by ordinal',
    [id],
  );

  const text = rows
    .map((r) => {
      const path = r.heading_path ? ` [${r.heading_path}]` : '';
      return `--- p.${r.page}${path} ---\n${r.content}`;
    })
    .join('\n\n');

  return { filename: doc.filename, text };
}
