// Pure metric functions. Kept free of IO so they can be unit tested without a
// database, and so the definition of each number lives in exactly one place.

export interface EvalOutcome {
  id: string;
  question: string;
  expectedDoc: string;
  answerable: boolean;
  /** The expected document appears in the first 5 retrieved chunks. */
  recalled: boolean;
  /** The answer cites at least one chunk from the expected document. */
  cited: boolean;
  /** The answer is the explicit "not in the documents" refusal. */
  refused: boolean;
  /** Answerable -> answered with a citation; unanswerable -> refused. */
  correct: boolean;
  topDocs: string[];
  answer: string;
  latencyMs: number;
}

export interface EvalSummary {
  recallAt5: number;
  citationHit: number;
  refusalAcc: number;
  total: number;
  answerable: number;
  unanswerable: number;
}

const ratio = (num: number, den: number): number => (den === 0 ? 0 : num / den);

export function summarize(outcomes: EvalOutcome[]): EvalSummary {
  const answerable = outcomes.filter((o) => o.answerable);
  const unanswerable = outcomes.filter((o) => !o.answerable);

  return {
    // recall@5 only means something for questions that have an answer.
    recallAt5: ratio(answerable.filter((o) => o.recalled).length, answerable.length),
    citationHit: ratio(answerable.filter((o) => o.cited).length, answerable.length),
    // Combined decision accuracy: refusing an answerable question is just as
    // wrong as answering an unanswerable one, so both groups share one number.
    refusalAcc: ratio(outcomes.filter((o) => o.correct).length, outcomes.length),
    total: outcomes.length,
    answerable: answerable.length,
    unanswerable: unanswerable.length,
  };
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
