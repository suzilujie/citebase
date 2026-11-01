import type { ChunkDraft, ParsedPage } from '../types';

// Chunking rules (see docs/system-design.html):
//   1. never merge two pages, so the page number on a citation stays true
//   2. never split inside a sentence unless a single sentence is longer than the
//      window, in which case a hard cut is the only option left
//   3. carry CHUNK_OVERLAP trailing characters into the next chunk so a fact
//      sitting on a boundary is still retrievable
//   4. drop sub-15-character fragments: they only add noise to the candidate set

interface Block {
  text: string;
  start: number;
  end: number;
}

const MIN_CHUNK = 15;

function trimBlock(raw: string, offset: number): Block | null {
  const text = raw.trim();
  if (!text) return null;
  const lead = raw.length - raw.trimStart().length;
  const trail = raw.length - raw.trimEnd().length;
  return { text, start: offset + lead, end: offset + raw.length - trail };
}

/** Splits a page on blank lines while keeping absolute character offsets. */
function splitBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const separator = /\n[ \t]*\n+/g;
  let cursor = 0;

  while (true) {
    const m = separator.exec(text);
    const end = m ? m.index : text.length;
    const block = trimBlock(text.slice(cursor, end), cursor);
    if (block) blocks.push(block);
    if (!m) break;
    cursor = m.index + m[0].length;
  }
  return blocks;
}

function sentenceSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  // Chinese and Western terminators; a period only counts when followed by
  // space or end-of-text so "1.2.3" is not torn apart.
  const boundary = /[。！？；!?;]|\.(?=\s|$)/g;
  let start = 0;
  let m = boundary.exec(text);
  while (m) {
    const end = m.index + m[0].length;
    spans.push({ start, end });
    start = end;
    m = boundary.exec(text);
  }
  if (start < text.length) spans.push({ start, end: text.length });
  return spans;
}

/** Splits an over-long paragraph at sentence ends, hard-cutting as last resort. */
function splitLongBlock(block: Block, size: number): Block[] {
  if (block.text.length <= size) return [block];

  const out: Block[] = [];
  const spans = sentenceSpans(block.text);
  let cursor = 0;
  let bufferStart = 0;

  const emit = (endExclusive: number) => {
    const piece = trimBlock(block.text.slice(bufferStart, endExclusive), block.start + bufferStart);
    if (piece) out.push(piece);
    bufferStart = endExclusive;
  };

  for (const span of spans) {
    cursor = span.end;
    if (cursor - bufferStart >= size) emit(cursor);
  }
  if (bufferStart < block.text.length) emit(block.text.length);

  // A single sentence longer than the window still has to be cut somewhere.
  return out.flatMap((piece) => {
    if (piece.text.length <= size) return [piece];
    const hard: Block[] = [];
    for (let i = 0; i < piece.text.length; i += size) {
      const slice = piece.text.slice(i, i + size);
      const t = trimBlock(slice, piece.start + i);
      if (t) hard.push(t);
    }
    return hard;
  });
}

interface Packed {
  text: string;
  start: number;
  end: number;
}

function packBlocks(blocks: Block[], size: number): Packed[] {
  const out: Packed[] = [];
  let current: Block[] = [];

  const joinedLength = (items: Block[]) =>
    items.reduce((n, b) => n + b.text.length, 0) + Math.max(0, items.length - 1);

  for (const block of blocks) {
    const wouldBe = joinedLength([...current, block]);
    if (current.length > 0 && wouldBe > size) {
      out.push({
        text: current.map((b) => b.text).join('\n'),
        start: current[0].start,
        end: current[current.length - 1].end,
      });
      current = [];
    }
    current.push(block);
  }

  if (current.length > 0) {
    out.push({
      text: current.map((b) => b.text).join('\n'),
      start: current[0].start,
      end: current[current.length - 1].end,
    });
  }
  return out;
}

/**
 * Trailing context carried into the next chunk. We snap forward to the first
 * sentence terminator inside the tail so the next chunk does not begin
 * mid-sentence, which reads badly in the citation panel.
 */
function overlapTail(previous: string, overlap: number): string {
  if (overlap <= 0 || previous.length <= overlap) return '';
  const tail = previous.slice(-overlap);
  const m = /[。！？；!?\n]|\.\s/.exec(tail);
  if (m && m.index + 1 < tail.length - 20) return tail.slice(m.index + 1).trim();
  return tail.trim();
}

export function chunkPages(
  pages: ParsedPage[],
  opts: { size: number; overlap: number },
): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  let ordinal = 0;

  for (const page of pages) {
    const blocks = splitBlocks(page.text).flatMap((b) => splitLongBlock(b, opts.size));
    const packed = packBlocks(blocks, opts.size);

    let previousText = '';
    for (const piece of packed) {
      const tail = previousText ? overlapTail(previousText, opts.overlap) : '';
      const content = tail ? `${tail}\n${piece.text}` : piece.text;
      previousText = piece.text;

      if (content.trim().length < MIN_CHUNK) continue;

      chunks.push({
        page: page.page,
        ordinal: ordinal++,
        headingPath: page.headingPath,
        content: content.trim(),
        charStart: piece.start,
        charEnd: piece.end,
      });
    }
  }

  return chunks;
}
