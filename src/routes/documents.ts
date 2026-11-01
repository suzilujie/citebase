import { Hono } from 'hono';
import { config } from '../config';
import { deleteDocument, documentText, ingestDocument, listDocuments } from '../ingest/store';
import { corpusStats } from '../retrieve/search';

export const documentsRoute = new Hono();

/** Library view: the list plus the two counters in the header. */
documentsRoute.get('/', async (c) => {
  const [documents, stats] = await Promise.all([listDocuments(), corpusStats()]);
  return c.json({ documents, stats });
});

documentsRoute.post('/', async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;

  if (!(file instanceof File)) {
    return c.json({ error: '缺少上传文件（multipart 字段名应为 file）' }, 400);
  }
  if (file.size === 0) {
    return c.json({ error: '文件为空' }, 400);
  }
  // Hono's bodyLimit already rejects huge bodies, but a per-file check gives a
  // readable message instead of a dropped connection.
  if (file.size > config.MAX_UPLOAD_MB * 1024 * 1024) {
    return c.json({ error: `文件超过 ${config.MAX_UPLOAD_MB} MB 上限` }, 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await ingestDocument({ filename: file.name, mime: file.type, bytes });

  // A parse failure is a normal outcome the UI must render, not a 500.
  const status = result.doc.status === 'failed' ? 422 : 200;
  return c.json({ document: result.doc, duplicate: result.duplicate }, status);
});

documentsRoute.delete('/:id', async (c) => {
  const removed = await deleteDocument(c.req.param('id'));
  if (!removed) return c.json({ error: '文档不存在' }, 404);
  return c.json({ ok: true });
});

/** Opens the source text in a new tab when a citation is clicked. */
documentsRoute.get('/:id/text', async (c) => {
  const doc = await documentText(c.req.param('id'));
  if (!doc) return c.json({ error: '文档不存在' }, 404);
  return c.text(`${doc.filename}\n\n${doc.text}`, 200, {
    'content-type': 'text/plain; charset=utf-8',
  });
});
