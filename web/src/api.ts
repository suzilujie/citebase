// Typed wrapper around the API. Every failure path ends in a thrown Error with a
// message that can be shown to the user, so components only need `.catch`.

export type DocStatus = 'pending' | 'ready' | 'failed';

export interface DocumentRow {
  id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  page_count: number;
  chunk_count: number;
  status: DocStatus;
  error: string | null;
  created_at: string;
}

export interface Stats {
  documents: number;
  chunks: number;
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

export interface Health {
  ok: boolean;
  db: boolean;
  mode: 'llm' | 'extractive';
  embedProvider: string;
  embedDim: number;
  hasLlmKey: boolean;
  maxUploadMb: number;
  version: string;
}

export interface EvalOutcome {
  id: string;
  question: string;
  expectedDoc: string;
  answerable: boolean;
  recalled: boolean;
  cited: boolean;
  refused: boolean;
  correct: boolean;
  topDocs: string[];
  answer: string;
  latencyMs: number;
}

export interface EvalRun {
  id: number;
  recallAt5: number;
  citationHit: number;
  refusalAcc: number;
  total: number;
  detail: EvalOutcome[];
  createdAt: string;
}

async function read<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `请求失败（HTTP ${res.status}）`);
  return body;
}

export const api = {
  health: () => fetch('/api/health').then((r) => read<Health>(r)),

  documents: () =>
    fetch('/api/documents').then((r) => read<{ documents: DocumentRow[]; stats: Stats }>(r)),

  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch('/api/documents', { method: 'POST', body: form }).then((r) =>
      read<{ document: DocumentRow; duplicate: boolean }>(r),
    );
  },

  remove: (id: string) =>
    fetch(`/api/documents/${id}`, { method: 'DELETE' }).then((r) => read<{ ok: boolean }>(r)),

  ask: (question: string) =>
    fetch('/api/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question }),
    }).then((r) => read<AnswerResult>(r)),

  evalRun: () =>
    fetch('/api/eval/run', { method: 'POST' }).then((r) =>
      read<{ run: EvalRun; outcomes: EvalOutcome[] }>(r),
    ),

  evalLatest: () => fetch('/api/eval/latest').then((r) => read<{ run: EvalRun | null }>(r)),
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatTime(iso: string): string {
  // The API returns timestamptz; the browser renders it in local time, which is
  // what the operator expects when they look at "上传时间".
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { hour12: false });
}
