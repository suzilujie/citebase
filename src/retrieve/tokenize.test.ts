import { describe, expect, it } from 'bun:test';
import { toSearchText, toTsQuery, tokenize } from './tokenize';

describe('tokenize', () => {
  it('cuts Chinese into overlapping bigrams so a partial word matches', () => {
    const tokens = tokenize('报销流程');
    expect(tokens).toEqual(['报销', '销流', '流程']);
    expect(tokens).toContain('报销');
  });

  it('keeps single-character Chinese runs', () => {
    expect(tokenize('税')).toEqual(['税']);
  });

  it('lowercases Latin words and keeps codes intact', () => {
    const tokens = tokenize('Invoice PO-2025-0042 已提交');
    expect(tokens).toContain('invoice');
    expect(tokens).toContain('po-2025-0042');
    expect(tokens).toContain('提交');
  });

  it('does not split a mixed sentence into one blob', () => {
    expect(toSearchText('远程办公 Rules').split(' ').length).toBeGreaterThan(3);
  });
});

describe('toTsQuery', () => {
  it('ORs the terms so one rare bigram cannot zero the result', () => {
    const q = toTsQuery('报销 流程');
    expect(q).toContain('|');
    expect(q).toContain("'报销'");
  });

  it('returns null when the input has no usable token', () => {
    expect(toTsQuery('   ')).toBeNull();
  });

  it('caps the term count and quotes every term', () => {
    const q = toTsQuery(`it's ${'测试'.repeat(40)}`, 5);
    expect(q).not.toBeNull();
    const terms = (q ?? '').split('|');
    expect(terms.length).toBeLessThanOrEqual(5);
    for (const term of terms) expect(term.trim().startsWith("'")).toBe(true);
  });
});
