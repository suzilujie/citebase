import { describe, expect, it } from 'bun:test';
import type { ParsedPage } from '../types';
import { chunkPages } from './chunk';

const page = (text: string, p = 1, headingPath = ''): ParsedPage => ({
  page: p,
  text,
  headingPath,
});

const sentence = '第一条规则要求所有费用在发生之后三十个自然日内提交报销单据。';

describe('chunkPages', () => {
  it('keeps a short page as one chunk', () => {
    const chunks = chunkPages([page('这是一段足够长的测试文本，用来验证分块逻辑是否正常。')], {
      size: 700,
      overlap: 0,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain('分块逻辑');
    expect(chunks[0].ordinal).toBe(0);
  });

  it('splits a long page and never ends mid-sentence', () => {
    const text = Array.from({ length: 30 }, () => sentence).join('');
    const chunks = chunkPages([page(text, 2, '费用 > 报销时限')], { size: 300, overlap: 0 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.endsWith('。')).toBe(true);
      expect(chunk.page).toBe(2);
      expect(chunk.headingPath).toBe('费用 > 报销时限');
    }
  });

  it('carries trailing context into the following chunk', () => {
    const paragraph = Array.from({ length: 6 }, () => sentence).join('');
    const chunks = chunkPages([page(`${paragraph}\n\n${paragraph}`)], { size: 250, overlap: 80 });

    expect(chunks.length).toBeGreaterThan(1);
    const tail = chunks[0].content.slice(-10);
    expect(chunks[1].content).toContain(tail);
  });

  it('never merges two pages into one chunk', () => {
    const chunks = chunkPages([page(sentence, 1), page(sentence, 2)], { size: 700, overlap: 60 });
    expect(chunks).toHaveLength(2);
    expect(chunks.map((c) => c.page)).toEqual([1, 2]);
  });

  it('drops punctuation-only fragments', () => {
    const chunks = chunkPages([page('段落一。\n\n……\n\n段落二内容足够长用于保留。')], {
      size: 700,
      overlap: 0,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain('段落二内容足够长用于保留');
  });

  it('keeps character offsets inside the page', () => {
    const text = `${sentence}\n\n${sentence}`;
    const chunks = chunkPages([page(text)], { size: 700, overlap: 0 });
    const chunk = chunks[0];
    expect(text.slice(chunk.charStart, chunk.charEnd).trim().length).toBeGreaterThan(0);
  });
});
