import { extractText, getDocumentProxy } from 'unpdf';
import type { ParsedPage } from '../types';

// Parser contract: every format becomes an ordered list of pages. Keeping the
// page number in the data model is what lets a citation point at a page instead
// of an opaque "somewhere in the file".

export type DocKind = 'pdf' | 'markdown' | 'text';

export function detectKind(filename: string, mime: string): DocKind {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown' || mime.includes('markdown')) return 'markdown';
  return 'text';
}

function normalize(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * PDF text arrives hard-wrapped at the layout width, so a sentence is spread
 * over several lines. Left as-is, every chunk starts mid-sentence and citations
 * read like torn paper. Rebuild paragraphs: a line that ends with a terminator
 * closes the paragraph, an empty line or a section heading starts a new one.
 */
export function reflow(text: string): string {
  const paragraphs: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length > 0) {
      paragraphs.push(buffer.join(' '));
      buffer = [];
    }
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    // "1. Scope" / "5. Payment terms" style headings stand on their own.
    if (/^\d+\.\s+\S/.test(line) && line.length < 60) {
      flush();
      paragraphs.push(line);
      continue;
    }
    buffer.push(line);
    if (/[。！？；.!?:;]$/.test(line)) flush();
  }
  flush();

  return paragraphs.join('\n\n');
}

/** PDF: one page per page. `mergePages: false` keeps the 1:1 mapping. */
async function parsePdf(bytes: Uint8Array): Promise<ParsedPage[]> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [text]).map((raw, i) => ({
    page: i + 1,
    text: reflow(normalize(raw)).trim(),
    headingPath: '',
  }));

  const usable = pages.filter((p) => p.text.length > 0);
  if (usable.length === 0) {
    // No OCR in scope: say so instead of silently indexing an empty document.
    throw new Error('PDF 中没有可提取的文本层（可能是扫描件，本项目不做 OCR）');
  }
  return usable;
}

/**
 * Markdown: one section per heading. Sections become separate "pages" (page 1)
 * so a chunk never straddles two headings — the heading trail is what makes a
 * citation readable, and a chunk spanning two sections has no honest trail.
 */
export function parseMarkdown(text: string): ParsedPage[] {
  const lines = normalize(text).split('\n');
  const sections: { trail: string[]; lines: string[] }[] = [];
  let trail: string[] = [];
  let buffer: string[] = [];
  let sawHeading = false;

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body) sections.push({ trail: [...trail], lines: [body] });
    buffer = [];
  };

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      sawHeading = true;
      flush();
      const level = m[1].length;
      trail = trail.slice(0, level - 1);
      trail[level - 1] = m[2].trim();
      // Keep the title inside the section body: it is often the only place the
      // topic word appears, so dropping it would hurt keyword recall.
      buffer.push(m[2].trim());
      continue;
    }
    buffer.push(line);
  }
  flush();

  if (!sawHeading) {
    const body = normalize(text).trim();
    return body ? [{ page: 1, text: body, headingPath: '' }] : [];
  }

  return sections.map((s) => ({
    page: 1,
    text: s.lines.join('\n'),
    headingPath: s.trail.filter(Boolean).join(' > '),
  }));
}

export function parsePlainText(text: string): ParsedPage[] {
  const body = normalize(text).trim();
  return body ? [{ page: 1, text: body, headingPath: '' }] : [];
}

export async function parseDocument(input: {
  filename: string;
  mime: string;
  bytes: Uint8Array;
}): Promise<ParsedPage[]> {
  const kind = detectKind(input.filename, input.mime);

  if (kind === 'pdf') return parsePdf(input.bytes);

  // Buffer/TextDecoder is fine here: all supported text formats are UTF-8 in
  // practice, and a wrong encoding shows up as an empty/garbled preview rather
  // than as silent data loss.
  const text = new TextDecoder('utf-8').decode(input.bytes);
  if (kind === 'markdown') return parseMarkdown(text);

  const pages = parsePlainText(text);
  if (pages.length === 0) throw new Error('文件中没有可提取的文本');
  return pages;
}
