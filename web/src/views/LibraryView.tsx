import { Layers, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { type DocumentRow, type Stats, api } from '../api';
import DocumentList from '../components/DocumentList';
import UploadZone from '../components/UploadZone';

export default function LibraryView() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [stats, setStats] = useState<Stats>({ documents: 0, chunks: 0 });
  const [maxMb, setMaxMb] = useState(20);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .documents()
      .then((data) => {
        setDocuments(data.documents);
        setStats(data.stats);
        setError('');
      })
      .catch((err: Error) => {
        console.error(err);
        setError(err.message);
      });
  }, []);

  useEffect(() => {
    load();
    api
      .health()
      .then((h) => setMaxMb(h.maxUploadMb))
      .catch(console.error);
  }, [load]);

  const remove = (doc: DocumentRow) => {
    // Deleting also drops every chunk, so the action is confirmed once.
    if (!window.confirm(`删除《${doc.filename}》及其 ${doc.chunk_count} 个文本块？`)) return;
    api
      .remove(doc.id)
      .then(load)
      .catch((err: Error) => {
        console.error(err);
        setError(err.message);
      });
  };

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-[#E6EDF3]">文档库</h1>
          <p className="mt-1 text-[13px] text-muted">
            上传后自动解析、切块并建立向量与全文双索引，重复文件按内容哈希跳过。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md border border-white/5 bg-ink-800/70 px-2.5 py-1 font-mono text-[11.5px] text-muted">
            <Layers className="h-3 w-3 text-faint" />
            {stats.documents} docs · {stats.chunks} chunks
          </span>
          <button
            type="button"
            onClick={load}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-white/5 bg-ink-800/70 px-2.5 py-1 text-[12px] text-muted transition-colors hover:border-white/10 hover:text-paper"
          >
            <RefreshCw className="h-3 w-3" />
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[#F87171]/30 bg-[#F87171]/10 px-3 py-2 text-[12.5px] text-[#F87171]">
          {error}
        </div>
      )}

      <UploadZone maxMb={maxMb} onUploaded={load} />

      <DocumentList documents={documents} onDelete={remove} />
    </div>
  );
}
