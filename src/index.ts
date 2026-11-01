import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serveStatic } from 'hono/bun';
import { config, effectiveAnswerMode, hasLlmKey } from './config';
import { ping, pool } from './db';
import { documentsRoute } from './routes/documents';
import { evalRoute } from './routes/eval';
import { queryRoute } from './routes/query';

const app = new Hono();

// Multipart framing adds a little on top of the file itself.
const MAX_BODY = Math.round(config.MAX_UPLOAD_MB * 1024 * 1024) + 2 * 1024 * 1024;

app.use(
  '/api/*',
  bodyLimit({
    maxSize: MAX_BODY,
    onError: (c) => c.json({ error: `请求体超过 ${config.MAX_UPLOAD_MB} MB 上限` }, 413),
  }),
);

app.use('/api/*', async (c, next) => {
  const started = performance.now();
  await next();
  if (c.req.path !== '/api/health') {
    const ms = Math.round(performance.now() - started);
    console.log(`[api] ${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
  }
});

app.get('/api/health', async (c) => {
  let db = false;
  try {
    db = await ping();
  } catch (err) {
    console.error(`[health] database check failed: ${(err as Error).message}`);
  }
  return c.json({
    ok: db,
    db,
    mode: effectiveAnswerMode(),
    embedProvider: config.EMBED_PROVIDER,
    embedDim: config.EMBED_DIM,
    hasLlmKey,
    maxUploadMb: config.MAX_UPLOAD_MB,
    version: '0.1.0',
  });
});

app.route('/api/documents', documentsRoute);
app.route('/api/query', queryRoute);
app.route('/api/eval', evalRoute);

// Unknown API paths must be JSON, not the SPA shell.
app.all('/api/*', (c) => c.json({ error: '接口不存在' }, 404));

// Single-port delivery: the built SPA is served from public/, with a fallback to
// index.html so client-side routing keeps working on refresh.
app.use('/*', serveStatic({ root: './public' }));
app.get('*', serveStatic({ path: './public/index.html' }));

app.notFound((c) => c.json({ error: 'not found' }, 404));

app.onError((err, c) => {
  console.error(`[api] unhandled error on ${c.req.path}: ${err.message}`);
  return c.json({ error: err.message }, 500);
});

/**
 * Applies sql/init.sql on boot. docker-entrypoint-initdb.d only runs on a fresh
 * volume, so this keeps an existing volume from silently missing new indexes.
 */
async function ensureSchema(): Promise<void> {
  const file = Bun.file('./sql/init.sql');
  if (!(await file.exists())) {
    console.warn('[db] sql/init.sql not found, skipping schema check');
    return;
  }
  await pool.query(await file.text());
  console.log('[db] schema verified');
}

async function main(): Promise<void> {
  let dbOk = false;
  try {
    dbOk = await ping();
  } catch (err) {
    console.error(`[db] cannot reach postgres: ${(err as Error).message}`);
    console.error('[db] is the container up? try: docker compose up -d');
    process.exit(1);
  }
  if (!dbOk) {
    console.error('[db] postgres answered but the connection is not healthy');
    process.exit(1);
  }

  await ensureSchema();

  const server = Bun.serve({
    port: config.PORT,
    fetch: app.fetch,
    idleTimeout: 120,
  });

  const mode = effectiveAnswerMode();
  console.log('');
  console.log(`CiteBase ready on http://localhost:${server.port}`);
  console.log(
    `  answer mode : ${mode}${mode === 'extractive' ? ' (no API key, quoting sources)' : ''}`,
  );
  console.log(`  embeddings  : ${config.EMBED_PROVIDER} (${config.EMBED_DIM} dims)`);
  console.log(`  database    : ${config.DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`);
  console.log('');
}

await main();
