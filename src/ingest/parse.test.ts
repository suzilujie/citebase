import { describe, expect, it } from 'bun:test';
import { parseMarkdown, parsePlainText } from './parse';

describe('parseMarkdown', () => {
  it('splits on headings and keeps the heading trail', () => {
    const md = [
      '# 员工手册',
      '',
      '本手册适用于全体正式员工。',
      '',
      '## 一、考勤',
      '',
      '标准工作时间为 9:30 至 18:30。',
      '',
      '## 二、休假',
      '',
      '满 3 年享有 15 天年假。',
    ].join('\n');

    const pages = parseMarkdown(md);
    expect(pages.map((p) => p.headingPath)).toEqual([
      '员工手册',
      '员工手册 > 一、考勤',
      '员工手册 > 二、休假',
    ]);
    expect(pages[2].text).toContain('15 天年假');
    // Markdown has no real pages: everything is page 1 and the trail carries the
    // location instead.
    expect(pages.every((p) => p.page === 1)).toBe(true);
  });

  it('keeps a heading-only document instead of dropping it', () => {
    const pages = parseMarkdown('# 只有一个标题');
    expect(pages).toHaveLength(1);
    expect(pages[0].text).toContain('只有一个标题');
  });

  it('treats a file without headings as a single page', () => {
    const pages = parseMarkdown('第一段内容。\n\n第二段内容。');
    expect(pages).toHaveLength(1);
    expect(pages[0].headingPath).toBe('');
  });
});

describe('parsePlainText', () => {
  it('normalises line endings and drops an empty file', () => {
    expect(parsePlainText('第一行\r\n第二行')[0].text).toBe('第一行\n第二行');
    expect(parsePlainText('   \n\n ')).toHaveLength(0);
  });
});
