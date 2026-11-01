import type { ChunkHit, Citation } from '../types';

// The citation guard is the difference between "an answer" and "a verifiable
// answer". A model can invent `[9]` when only five chunks were supplied, or
// answer without citing anything at all. Both are treated as ungrounded.

export const NO_ANSWER = '文档中未提及相关内容。';

const MARKER = /\[(\d+(?:\s*[,，]\s*\d+)*)\]/g;

/**
 * Keeps only markers that point at a chunk we actually supplied, and drops the
 * rest from the text so the reader never sees a dead reference.
 */
export function extractCitations(text: string, max: number): { text: string; cited: number[] } {
  const cited = new Set<number>();

  const cleaned = text.replace(MARKER, (_full, group: string) => {
    const nums = group
      .split(/[,，]/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= max);

    if (nums.length === 0) return '';
    for (const n of nums) cited.add(n);
    return nums.map((n) => `[${n}]`).join('');
  });

  return {
    text: cleaned
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    cited: [...cited].sort((a, b) => a - b),
  };
}

export function buildCitations(indices: number[], hits: ChunkHit[]): Citation[] {
  return indices
    .map((n) => {
      const hit = hits[n - 1];
      if (!hit) return null;
      return {
        index: n,
        chunkId: hit.id,
        docId: hit.docId,
        filename: hit.filename,
        page: hit.page,
        headingPath: hit.headingPath,
        snippet: hit.content,
      } satisfies Citation;
    })
    .filter((c): c is Citation => c !== null);
}

/**
 * Final gate. Zero valid citations means the answer is not supported by the
 * corpus, whatever the model claimed, so it is replaced with an explicit
 * refusal instead of being shown with an empty source panel.
 */
export function enforceGrounding(
  text: string,
  cited: number[],
  hits: ChunkHit[],
): { answer: string; citations: Citation[]; citedIds: number[] } {
  if (cited.length === 0) {
    return { answer: NO_ANSWER, citations: [], citedIds: [] };
  }
  const citations = buildCitations(cited, hits);
  if (citations.length === 0) {
    return { answer: NO_ANSWER, citations: [], citedIds: [] };
  }
  return {
    answer: text,
    citations,
    citedIds: citations.map((c) => c.chunkId),
  };
}

export function isRefusal(answer: string): boolean {
  return answer.trim() === NO_ANSWER;
}
