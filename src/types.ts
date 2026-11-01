export type DocStatus = 'pending' | 'ready' | 'failed';

export interface DocumentRow {
  id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  page_count: number;
  chunk_count: number;
  status: DocStatus;
  error: string | null;
  created_at: string;
}

/** A retrieved chunk, already joined with its document filename. */
export interface ChunkHit {
  id: number;
  docId: string;
  filename: string;
  ordinal: number;
  page: number;
  headingPath: string;
  content: string;
  charStart: number;
  charEnd: number;
  score: number;
}

export interface Citation {
  index: number;
  chunkId: number;
  docId: string;
  filename: string;
  page: number;
  headingPath: string;
  snippet: string;
}

export interface AnswerResult {
  answer: string;
  mode: 'llm' | 'extractive';
  citations: Citation[];
  retrievedIds: number[];
  citedIds: number[];
  latencyMs: number;
  degraded?: string;
}

export interface ParsedPage {
  page: number;
  text: string;
  /** Markdown heading trail at the start of the page, empty for PDF/TXT. */
  headingPath: string;
}

export interface ChunkDraft {
  page: number;
  ordinal: number;
  headingPath: string;
  content: string;
  charStart: number;
  charEnd: number;
}
