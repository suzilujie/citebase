import { Hono } from 'hono';
import { z } from 'zod';
import { answerQuestion } from '../answer';
import { query } from '../db';

export const queryRoute = new Hono();

const QuestionSchema = z.object({
  question: z.string().trim().min(1, '问题不能为空').max(500, '问题过长'),
});

queryRoute.post('/', async (c) => {
  const payload = await c.req.json().catch(() => null);
  const parsed = QuestionSchema.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? '参数错误' }, 400);
  }

  const result = await answerQuestion(parsed.data.question);

  // Every question is logged with both id lists: retrieved_ids answers "did we
  // find it", cited_ids answers "did the answer actually use it". Disagreement
  // between the two is what a bad retrieval or a hallucination looks like.
  await query(
    `insert into query_logs (question, mode, retrieved_ids, cited_ids, latency_ms)
     values ($1, $2, $3, $4, $5)`,
    [parsed.data.question, result.mode, result.retrievedIds, result.citedIds, result.latencyMs],
  ).catch((err: Error) => console.error(`[query] log failed: ${err.message}`));

  return c.json(result);
});

/** Recent questions, used by the eval view footer and for troubleshooting. */
queryRoute.get('/recent', async (c) => {
  const rows = await query<{
    id: string;
    question: string;
    mode: string;
    latency_ms: number;
    created_at: string;
  }>(
    `select id, question, mode, latency_ms, created_at
       from query_logs order by created_at desc limit 12`,
  );
  return c.json({ logs: rows });
});
