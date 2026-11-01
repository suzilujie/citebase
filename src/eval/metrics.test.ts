import { describe, expect, it } from 'bun:test';
import { type EvalOutcome, formatPercent, summarize } from './metrics';

const outcome = (over: Partial<EvalOutcome>): EvalOutcome => ({
  id: 'q00',
  question: 'q',
  expectedDoc: 'doc.md',
  answerable: true,
  recalled: true,
  cited: true,
  refused: false,
  correct: true,
  topDocs: ['doc.md'],
  answer: '…',
  latencyMs: 10,
  ...over,
});

describe('summarize', () => {
  it('computes the three headline numbers', () => {
    const summary = summarize([
      outcome({ id: 'a' }),
      outcome({ id: 'b', recalled: false, cited: false, correct: false }),
      outcome({
        id: 'c',
        answerable: false,
        recalled: true,
        cited: false,
        refused: true,
        correct: true,
      }),
      outcome({ id: 'd', answerable: false, refused: false, correct: false }),
    ]);

    expect(summary.total).toBe(4);
    expect(summary.answerable).toBe(2);
    expect(summary.unanswerable).toBe(2);
    expect(summary.recallAt5).toBe(0.5);
    expect(summary.citationHit).toBe(0.5);
    expect(summary.refusalAcc).toBe(0.5);
  });

  it('returns zero instead of NaN on an empty run', () => {
    const summary = summarize([]);
    expect(summary.recallAt5).toBe(0);
    expect(summary.citationHit).toBe(0);
    expect(summary.refusalAcc).toBe(0);
  });
});

describe('formatPercent', () => {
  it('prints one decimal', () => {
    expect(formatPercent(0.8571)).toBe('85.7%');
  });
});
