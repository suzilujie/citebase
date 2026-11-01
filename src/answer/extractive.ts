import { tokenize } from '../retrieve/tokenize';
import type { ChunkHit } from '../types';

// Offline answer path. No model, no key, no network: score every sentence of
// the retrieved chunks against the question's vocabulary and quote the best
// ones with their markers.
//
// The hard part is not picking a sentence, it is deciding when NOT to. A vector
// search always returns its eight nearest chunks, so without a lexical gate
// every question looks answerable. Two rules keep it honest:
//   1. generic words ("公司", "员工", "多少") do not count as evidence
//   2. a chunk only contributes if at least two distinct, specific query terms
//      actually appear in one of its sentences
// A question whose specific terms appear nowhere is refused, which is exactly
// what the eval set measures.

const MAX_CHUNKS = 3;
const MIN_SENTENCE = 8;

// Question words, generic organisation nouns and English function words. These
// appear in almost every chunk, so matching them says nothing about relevance.
const GENERIC = new Set([
  '公司',
  '司的',
  '员工',
  '工手',
  '手册',
  '制度',
  '规定',
  '适用',
  '是否',
  '什么',
  '哪些',
  '多少',
  '怎么',
  '如何',
  '可以',
  '需要',
  '应该',
  '我们',
  '他们',
  '提供',
  '关于',
  '以及',
  '或者',
  '这个',
  '那个',
  '以下',
  '进行',
  '相关',
  '内容',
  '要求',
  '情况',
  '问题',
  '请问',
  '一下',
  '时候',
  '目前',
  '具体',
  '一般',
  '根据',
  '文件',
  '条款',
  '文档',
  '资料',
  '是否属于',
  '有哪些',
  '是多少',
  '怎么办',
  'the',
  'and',
  'for',
  'are',
  'was',
  'were',
  'does',
  'did',
  'has',
  'have',
  'how',
  'what',
  'who',
  'when',
  'which',
  'many',
  'much',
  'with',
  'from',
  'into',
  'that',
  'this',
  'company',
  'policy',
  'document',
  'documents',
  'employee',
  'employees',
  'according',
  'apply',
  'applies',
  'there',
  'their',
  'they',
]);

export function isGeneric(term: string): boolean {
  if (GENERIC.has(term)) return true;
  // Bare numbers are often noise ("2025", "10") and carry little evidence on
  // their own; they still help rank sentences once the gate has passed.
  return /^\d+$/.test(term);
}

/** Splits on Chinese and Western terminators, keeping the terminator attached. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[。！？；!?;])\s*|\n+|(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_SENTENCE);
}

interface Scored {
  sentence: string;
  index: number;
  matched: number;
  weight: number;
}

function scoreSentence(sentence: string, specific: string[]): { matched: number; weight: number } {
  if (specific.length === 0) return { matched: 0, weight: 0 };
  const lower = sentence.toLowerCase();
  let matched = 0;

  for (const term of specific) {
    if (lower.includes(term)) matched += 1;
  }
  if (matched === 0) return { matched: 0, weight: 0 };

  // Longer matched terms are more specific than short ones, and a short
  // sentence that answers the question should beat a long rambling one.
  const weight = (matched / specific.length) * Math.min(1, 80 / Math.max(20, sentence.length));
  return { matched, weight };
}

export interface ExtractiveAnswer {
  answer: string;
  cited: number[];
}

export function extractiveAnswer(question: string, hits: ChunkHit[]): ExtractiveAnswer {
  const terms = [...new Set(tokenize(question))];
  const specific = terms.filter((t) => !isGeneric(t));

  // Nothing but generic words: no way to prove the corpus covers it.
  if (specific.length === 0) return { answer: '', cited: [] };

  // Two distinct matches are required when the question has enough specific
  // terms to offer them; a one-term question only needs that one term.
  const need = Math.min(2, specific.length);

  const picked: Scored[] = [];

  hits.forEach((hit, i) => {
    const marker = i + 1;
    let best: { sentence: string; matched: number; weight: number } | null = null;

    for (const sentence of sentences(hit.content)) {
      const scored = scoreSentence(sentence, specific);
      if (scored.matched >= need && (!best || scored.weight > best.weight)) {
        best = { sentence, ...scored };
      }
    }

    if (best) picked.push({ ...best, index: marker });
  });

  if (picked.length === 0) return { answer: '', cited: [] };

  const top = picked
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_CHUNKS)
    .sort((a, b) => a.index - b.index);

  const body = top.map((p) => `${p.sentence.replace(/\s+/g, ' ').trim()} [${p.index}]`).join(' ');

  return {
    answer: body,
    cited: [...new Set(top.map((p) => p.index))].sort((a, b) => a - b),
  };
}
