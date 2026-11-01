import { Check, FileUp, Loader2, TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { type DocumentRow, api, formatBytes } from '../api';

interface QueueItem {
  key: string;
  name: string;
  size: number;
  state: 'uploading' | 'done' | 'error';
  message?: string;
}

interface Props {
  maxMb: number;
  onUploaded: (doc: DocumentRow) => void;
}

export default function UploadZone({ maxMb, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const upload = (files: File[]) => {
    if (busy || files.length === 0) return;
    setBusy(true);

    // Sequential: each file is parsed and embedded server-side in one request,
    // so firing ten at once would just contend for the same pool.
    const run = async () => {
      for (const file of files) {
        const key = `${file.name}-${file.size}-${Date.now()}`;
        setQueue((prev) => [
          ...prev,
          { key, name: file.name, size: file.size, state: 'uploading' },
        ]);

        await api
          .upload(file)
          .then(({ document, duplicate }) => {
            setQueue((prev) =>
              prev.map((item) =>
                item.key === key
                  ? {
                      ...item,
                      state: 'done',
                      message: duplicate
                        ? `已在库中（${document.chunk_count} 块），未重复入库`
                        : `${document.chunk_count} 块 · ${document.page_count} 页`,
                    }
                  : item,
              ),
            );
            if (document.status === 'ready') onUploaded(document);
          })
          .catch((err: Error) => {
            console.error(err);
            setQueue((prev) =>
              prev.map((item) =>
                item.key === key ? { ...item, state: 'error', message: err.message } : item,
              ),
            );
          });
      }
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    };

    void run();
  };

  return (
    <section className="panel p-4 md:p-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(Array.from(e.dataTransfer.files));
        }}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-9 text-center transition-colors ${
          dragging ? 'border-accent/70 bg-accent/[0.06]' : 'border-white/10 bg-ink-900/40'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.md,.markdown,.txt"
          className="hidden"
          onChange={(e) => upload(Array.from(e.target.files ?? []))}
        />

        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-700/80 ring-1 ring-white/5">
          <FileUp className="h-4 w-4 text-accent-soft" />
        </div>
        <p className="text-[14.5px] text-paper">
          把制度、手册、合同拖到这里，或
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="ml-1 cursor-pointer text-accent-soft underline decoration-accent/40 underline-offset-4 hover:text-white disabled:cursor-not-allowed disabled:text-faint"
          >
            选择文件
          </button>
        </p>
        <p className="font-mono text-[11.5px] text-faint">
          PDF / Markdown / TXT · 单文件 ≤ {maxMb} MB · 解析 → 分块 → 向量化 一次完成
        </p>
        {busy && (
          <p className="flex items-center gap-1.5 text-[12px] text-accent-soft">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在入库，单个文件通常需要 2~5 秒
          </p>
        )}
      </div>

      {queue.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {queue.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between gap-3 rounded-md border border-white/5 bg-ink-900/50 px-3 py-1.5 text-[12px]"
            >
              <span className="flex min-w-0 items-center gap-2">
                {item.state === 'uploading' && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent-soft" />
                )}
                {item.state === 'done' && <Check className="h-3.5 w-3.5 shrink-0 text-[#34D399]" />}
                {item.state === 'error' && (
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-[#F87171]" />
                )}
                <span className="truncate text-paper">{item.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-faint">
                  {formatBytes(item.size)}
                </span>
              </span>
              <span
                className={`shrink-0 font-mono text-[11px] ${
                  item.state === 'error' ? 'text-[#F87171]' : 'text-muted'
                }`}
              >
                {item.message ?? '处理中…'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
