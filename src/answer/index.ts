import { effectiveAnswerMode } from '../config';
import { retrieve } from '../retrieve/search';
import type { AnswerResult, ChunkHit } from '../types';
import { extractiveAnswer } from './extractive';
import { generateAnswer } from './generate';
import { NO_ANSWER, enforceGrounding, extractCitations } from './guard';

/**
 * Full answer pipeline: retrieve -> (generate | extract) -> verify citations.
 *
 * The guard runs on both paths. Even though the extractive path can only quote
 * real chunks, keeping a single gate means there is exactly one place where
 * "no valid citation" turns into a refusal, so the two modes cannot drift.
 */
export async function answerQuestion(
  question: string,
  /** Pre-fetched hits: the eval runner needs the ranked list itself, and
   * retrieving twice per question would be pure waste. */
  opts: { hits?: ChunkHit[] } = {},
): Promise<AnswerResult> {
  const started = performance.now();
  const requested = effectiveAnswerMode();

  const hits = opts.hits ?? (await retrieve(question));
  const retrievedIds = hits.map((h) => h.id);

  if (hits.length === 0) {
    return {
      answer: NO_ANSWER,
      mode: requested,
      citations: [],
      retrievedIds: [],
      citedIds: [],
      latencyMs: Math.round(performance.now() - started),
    };
  }

  let mode: 'llm' | 'extractive' = requested;
  let degraded: string | undefined;
  let raw = '';

  if (requested === 'llm') {
    try {
      raw = await generateAnswer(question, hits);
    } catch (err) {
      // A dead key or a flaky endpoint must not break the product: the user
      // still gets a grounded, if less fluent, answer.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[answer] llm failed, falling back to extractive: ${message}`);
      mode = 'extractive';
      degraded = `模型调用失败，已降级为抽取式回答（${message}）`;
    }
  }

  if (!raw) {
    const extracted = extractiveAnswer(question, hits);
    raw = extracted.answer;
  }

  const { text, cited } = extractCitations(raw, hits.length);
  const grounded = enforceGrounding(text, cited, hits);

  return {
    answer: grounded.answer,
    mode,
    citations: grounded.citations,
    retrievedIds,
    citedIds: grounded.citedIds,
    latencyMs: Math.round(performance.now() - started),
    degraded,
  };
}
