import { config } from '../config';
import { query, toVector } from '../db';
import type { ChunkHit } from '../types';
import { embedOne } from './embed';
import { fuseAndTruncate } from './rrf';
import { toTsQuery } from './tokenize';

// Hybrid retrieval: two independent arms, fused by rank.
//
//  vector arm  - cosine similarity over the pgvector column, catches paraphrase
//  keyword arm - full-text over the tokenised `search_text`, catches invoice
//                numbers, error codes and other strings a vector blurs away
//
// Neither arm alone is enough. Measured effect on the sample corpus is in
// docs/evaluation.html.

interface HitRow {
  id: string;
  doc_id: string;
  filename: string;
  ordinal: number;
  page: number;
  heading_path: string;
  content: string;
  char_start: number;
  char_end: number;
  score: string | number;
}

const SELECT_COLS = `
  c.id, c.doc_id, d.filename, c.ordinal, c.page, c.heading_path,
  c.content, c.char_start, c.char_end`;

function rowToHit(row: HitRow): ChunkHit {
  return {
    id: Number(row.id),
    docId: row.doc_id,
    filename: row.filename,
    ordinal: row.ordinal,
    page: row.page,
    headingPath: row.heading_path,
    content: row.content,
    charStart: row.char_start,
    charEnd: row.char_end,
    score: Number(row.score),
  };
}

async function vectorArm(embedding: number[], limit: number): Promise<HitRow[]> {
  return query<HitRow>(
    `select ${SELECT_COLS}, 1 - (c.embedding <=> $1::vector) as score
       from chunks c
       join documents d on d.id = c.doc_id
      where d.status = 'ready'
      order by c.embedding <=> $1::vector
      limit $2`,
    [toVector(embedding), limit],
  );
}

async function keywordArm(tsquery: string, limit: number): Promise<HitRow[]> {
  return query<HitRow>(
    `with q as (select to_tsquery('simple', $1) as tsq)
     select ${SELECT_COLS}, ts_rank_cd(c.tokens, q.tsq) as score
       from chunks c
       join documents d on d.id = c.doc_id
       cross join q
      where d.status = 'ready' and c.tokens @@ q.tsq
      order by score desc
      limit $2`,
    [tsquery, limit],
  );
}

export interface RetrieveOptions {
  limit?: number;
  /** Exposed so the eval script can measure each arm separately. */
  arms?: 'both' | 'vector' | 'keyword';
}

export async function retrieve(question: string, opts: RetrieveOptions = {}): Promise<ChunkHit[]> {
  const limit = opts.limit ?? config.CONTEXT_K;
  const arms = opts.arms ?? 'both';

  const hits = new Map<number, ChunkHit>();
  const lists: number[][] = [];

  if (arms !== 'keyword') {
    const embedding = await embedOne(question);
    const rows = await vectorArm(embedding, config.TOP_K);
    for (const row of rows) hits.set(Number(row.id), rowToHit(row));
    lists.push(rows.map((r) => Number(r.id)));
  }

  const tsquery = toTsQuery(question);
  if (arms !== 'vector' && tsquery) {
    const rows = await keywordArm(tsquery, config.TOP_K);
    for (const row of rows) hits.set(Number(row.id), rowToHit(row));
    lists.push(rows.map((r) => Number(r.id)));
  }

  // No arm produced anything (empty library, or a query with no usable tokens).
  if (lists.length === 0) return [];

  const fusedIds = fuseAndTruncate(lists, config.RRF_K, limit);
  const scores = new Map<number, number>();
  fusedIds.forEach((id, i) => scores.set(id, 1 / (i + 1)));

  return fusedIds
    .map((id) => {
      const hit = hits.get(id);
      return hit ? { ...hit, score: scores.get(id) ?? 0 } : null;
    })
    .filter((h): h is ChunkHit => h !== null);
}

/** Aggregates over every ready document, used by the library header. */
export async function corpusStats(): Promise<{ documents: number; chunks: number }> {
  const rows = await query<{ documents: string; chunks: string }>(
    `select count(*)::text as documents, coalesce(sum(chunk_count), 0)::text as chunks
       from documents
      where status = 'ready'`,
  );
  const row = rows[0];
  return {
    documents: Number(row?.documents ?? 0),
    chunks: Number(row?.chunks ?? 0),
  };
}
