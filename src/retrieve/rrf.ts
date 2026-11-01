/**
 * Reciprocal Rank Fusion.
 *
 *   score(d) = Σ over lists  1 / (k + rank(d))
 *
 * Why not merge by raw score: cosine similarity and ts_rank live on different
 * scales and are not comparable. RRF only uses ranks, so the two arms can be
 * combined without calibrating one against the other. k=60 is the value from
 * the original paper and damps the influence of the very top ranks enough that
 * agreement between the arms matters more than one arm shouting.
 */
export function rrfFuse(lists: number[][], k: number): Map<number, number> {
  const scores = new Map<number, number>();
  for (const list of lists) {
    // A duplicated id inside one list would otherwise be counted twice.
    const seen = new Set<number>();
    list.forEach((id, i) => {
      if (seen.has(id)) return;
      seen.add(id);
      const rank = i + 1;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    });
  }
  return scores;
}

/** Descending by score; ties keep the order in which ids were first seen. */
export function sortByScore(scores: Map<number, number>, limit: number): number[] {
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, limit))
    .map(([id]) => id);
}

export function fuseAndTruncate(lists: number[][], k: number, limit: number): number[] {
  return sortByScore(rrfFuse(lists, k), limit);
}
