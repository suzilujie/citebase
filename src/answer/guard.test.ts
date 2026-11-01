import { describe, expect, it } from 'bun:test';
import type { ChunkHit } from '../types';
import { NO_ANSWER, enforceGrounding, extractCitations } from './guard';

const hit = (id: number, filename: string): ChunkHit => ({
  id,
  docId: `doc-${id}`,
  filename,
  ordinal: id,
  page: id,
  headingPath: '',
  content: `chunk ${id}`,
  charStart: 0,
  charEnd: 10,
  score: 1,
});

describe('extractCitations', () => {
  it('keeps valid markers and collects their indices', () => {
    const { text, cited } = extractCitations('报销时限是 30 天 [1]，超出需说明 [2]。', 3);
    expect(text).toContain('[1]');
    expect(text).toContain('[2]');
    expect(cited).toEqual([1, 2]);
  });

  it('drops markers that point outside the supplied context', () => {
    const { text, cited } = extractCitations('这段话引用了不存在的资料 [9]。', 3);
    expect(text).not.toContain('[9]');
    expect(cited).toEqual([]);
  });

  it('keeps the valid half of a mixed marker group', () => {
    const { cited } = extractCitations('结论 [1, 7]', 3);
    expect(cited).toEqual([1]);
  });

  it('normalises multi-marker syntax', () => {
    const { text, cited } = extractCitations('结论 [1][2][3]', 3);
    expect(text).toBe('结论 [1][2][3]');
    expect(cited).toEqual([1, 2, 3]);
  });
});

describe('enforceGrounding', () => {
  it('turns an uncited answer into a refusal', () => {
    const result = enforceGrounding('公司提供股票期权。', [], [hit(1, 'handbook.md')]);
    expect(result.answer).toBe(NO_ANSWER);
    expect(result.citations).toHaveLength(0);
    expect(result.citedIds).toHaveLength(0);
  });

  it('builds citations in marker order', () => {
    const hits = [hit(11, 'a.md'), hit(22, 'b.pdf')];
    const { citations, citedIds } = enforceGrounding('结论 [2]', [2], hits);
    expect(citations).toHaveLength(1);
    expect(citations[0].filename).toBe('b.pdf');
    expect(citations[0].page).toBe(22);
    expect(citedIds).toEqual([22]);
  });
});
