import { Pool, type QueryResultRow } from 'pg';
import { config } from './config';

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 8,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});

export async function query<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(sql, params as never[]);
  return res.rows;
}

export async function maybeOne<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** pgvector accepts the textual form, e.g. `[0.1,-0.2,...]`. */
export function toVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export async function ping(): Promise<boolean> {
  const rows = await query<{ ok: number }>('select 1 as ok');
  return rows[0]?.ok === 1;
}
