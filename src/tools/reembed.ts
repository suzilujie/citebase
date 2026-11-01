import { pool, query, toVector } from '../db';
import { embedTexts } from '../retrieve/embed';

// Vectors are tied to the model that produced them: a 384-dim hashed vector and
// a 1536-dim neural vector cannot be compared, and even two neural models put
// the same sentence in different places. Changing EMBED_PROVIDER / EMBED_DIM
// therefore requires recomputing every chunk. This script does exactly that and
// nothing else.

const BATCH = 64;

async function main(): Promise<void> {
  const rows = await query<{ id: string; heading_path: string; content: string }>(
    'select id, heading_path, content from chunks order by id',
  );

  if (rows.length === 0) {
    console.log('[reembed] no chunks in the library, nothing to do');
    return;
  }

  console.log(`[reembed] recomputing ${rows.length} chunks...`);
  let done = 0;

  for (let offset = 0; offset < rows.length; offset += BATCH) {
    const slice = rows.slice(offset, offset + BATCH);
    const vectors = await embedTexts(slice.map((r) => `${r.heading_path} ${r.content}`.trim()));

    const client = await pool.connect();
    try {
      await client.query('begin');
      for (let i = 0; i < slice.length; i++) {
        await client.query('update chunks set embedding = $2::vector where id = $1', [
          slice[i].id,
          toVector(vectors[i] ?? []),
        ]);
      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }

    done += slice.length;
    console.log(`[reembed] ${done}/${rows.length}`);
  }

  console.log('[reembed] done. Re-run the eval to compare numbers.');
}

await main();
process.exit(0);
