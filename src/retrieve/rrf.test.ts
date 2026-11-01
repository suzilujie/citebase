import { describe, expect, it } from 'bun:test';
import { fuseAndTruncate, rrfFuse, sortByScore } from './rrf';

describe('rrf', () => {
  it('scores the top of a single list higher than the tail', () => {
    const scores = rrfFuse([[10, 20, 30]], 60);
    expect(scores.get(10)).toBeGreaterThan(scores.get(20) as number);
    expect(scores.get(20)).toBeGreaterThan(scores.get(30) as number);
  });

  it('ranks an item both arms agree on above a single-arm item', () => {
    const fused = fuseAndTruncate(
      [
        [1, 2, 3],
        [4, 2, 5],
      ],
      60,
      5,
    );
    expect(fused[0]).toBe(2);
  });

  it('ignores duplicates inside one list', () => {
    const scores = rrfFuse([[7, 7, 7]], 60);
    expect(scores.get(7)).toBeCloseTo(1 / 61, 10);
  });

  it('truncates to the requested length and keeps the order', () => {
    const fused = fuseAndTruncate([[1, 2, 3, 4]], 60, 2);
    expect(fused).toEqual([1, 2]);
  });

  it('returns an empty list when nothing was retrieved', () => {
    expect(sortByScore(rrfFuse([], 60), 8)).toEqual([]);
  });
});
