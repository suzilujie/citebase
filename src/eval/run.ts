import { answerQuestion } from '../answer';
import { isRefusal } from '../answer/guard';
import { maybeOne, query } from '../db';
import { retrieve } from '../retrieve/search';
import { type EvalOutcome, type EvalSummary, summarize } from './metrics';
import { type EvalQuestion, loadQuestions } from './questions';

export interface EvalRun {
  id: number;
  recallAt5: number;
  citationHit: number;
  refusalAcc: number;
  total: number;
  detail: EvalOutcome[];
  createdAt: string;
}

interface RunRow {
  id: string;
  recall_at_5: string;
  citation_hit: string;
  refusal_acc: string;
  total: number;
  detail: EvalOutcome[];
  created_at: string;
}

function toRun(row: RunRow): EvalRun {
  return {
    id: Number(row.id),
    recallAt5: Number(row.recall_at_5),
    citationHit: Number(row.citation_hit),
    refusalAcc: Number(row.refusal_acc),
    total: row.total,
    detail: Array.isArray(row.detail) ? row.detail : [],
    createdAt: row.created_at,
  };
}

async function evaluateOne(question: EvalQuestion): Promise<EvalOutcome> {
  // One retrieval per question, shared by the metrics and the answer pipeline.
  const hits = await retrieve(question.question);
  const result = await answerQuestion(question.question, { hits });

  const topDocs = [...new Set(hits.slice(0, 5).map((h) => h.filename))];
  const refused = isRefusal(result.answer);

  const recalled = question.answerable ? topDocs.includes(question.expectedDoc) : true;
  const cited = question.answerable
    ? result.citations.some((c) => c.filename === question.expectedDoc)
    : false;
  const correct = question.answerable ? !refused && cited : refused;

  return {
    id: question.id,
    question: question.question,
    expectedDoc: question.expectedDoc,
    answerable: question.answerable,
    recalled,
    cited,
    refused,
    correct,
    topDocs,
    answer: result.answer,
    latencyMs: result.latencyMs,
  };
}

export async function runEval(): Promise<{
  run: EvalRun;
  outcomes: EvalOutcome[];
  summary: EvalSummary;
}> {
  const questions = await loadQuestions();
  const outcomes: EvalOutcome[] = [];

  // Sequential on purpose: parallel runs would interleave the model calls and
  // make per-question latency meaningless.
  for (const q of questions) {
    outcomes.push(await evaluateOne(q));
  }

  const summary = summarize(outcomes);

  const row = await maybeOne<RunRow>(
    `insert into eval_runs (recall_at_5, citation_hit, refusal_acc, total, detail)
     values ($1, $2, $3, $4, $5::jsonb)
     returning id, recall_at_5, citation_hit, refusal_acc, total, detail, created_at`,
    [
      summary.recallAt5,
      summary.citationHit,
      summary.refusalAcc,
      summary.total,
      JSON.stringify(outcomes),
    ],
  );

  if (!row) throw new Error('failed to persist eval run');
  return { run: toRun(row), outcomes, summary };
}

export async function latestRun(): Promise<EvalRun | null> {
  const row = await maybeOne<RunRow>(
    `select id, recall_at_5, citation_hit, refusal_acc, total, detail, created_at
       from eval_runs order by created_at desc limit 1`,
  );
  return row ? toRun(row) : null;
}

export async function runHistory(limit = 8): Promise<EvalRun[]> {
  const rows = await query<RunRow>(
    `select id, recall_at_5, citation_hit, refusal_acc, total, detail, created_at
       from eval_runs order by created_at desc limit $1`,
    [limit],
  );
  return rows.map(toRun);
}
