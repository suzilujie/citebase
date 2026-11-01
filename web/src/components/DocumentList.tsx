import { FileText, Trash2 } from 'lucide-react';
import { type DocumentRow, formatBytes, formatTime } from '../api';

interface Props {
  documents: DocumentRow[];
  onDelete: (doc: DocumentRow) => void;
}

function kindOf(doc: DocumentRow): string {
  if (doc.mime.includes('pdf')) return 'PDF';
  if (doc.mime.includes('markdown')) return 'MD';
  return 'TXT';
}

export default function DocumentList({ documents, onDelete }: Props) {
  if (documents.length === 0) {
    return (
      <div className="panel flex flex-col items-center gap-2 px-6 py-14 text-center">
        <FileText className="h-5 w-5 text-faint" />
        <p className="text-[14px] text-paper">文档库还是空的</p>
        <p className="max-w-sm text-[12.5px] leading-relaxed text-faint">
          先上传一份员工手册或报销制度试试。上传后可以直接提问「报销多久内必须提交」这类问题，
          答案会带可点击的出处。
        </p>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-[1fr_64px_72px_72px_110px_44px] items-center gap-2 border-b border-white/5 bg-ink-700/40 px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-faint">
        <span>文件</span>
        <span className="text-center">类型</span>
        <span className="text-right">页数</span>
        <span className="text-right">块数</span>
        <span>状态</span>
        <span />
      </div>

      <ul className="divide-y divide-white/5">
        {documents.map((doc) => {
          const failed = doc.status === 'failed';
          return (
            <li
              key={doc.id}
              className={`relative grid grid-cols-[1fr_64px_72px_72px_110px_44px] items-center gap-2 px-4 py-2.5 text-[13px] hover:bg-white/[0.02] ${
                failed
                  ? 'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[#F87171]'
                  : ''
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-paper" title={doc.filename}>
                  {doc.filename}
                </div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] text-faint">
                  <span>{formatBytes(doc.size_bytes)}</span>
                  <span>·</span>
                  <span>{formatTime(doc.created_at)}</span>
                </div>
                {failed && doc.error && (
                  <div className="mt-1 line-clamp-2 text-[11.5px] text-[#F87171]">{doc.error}</div>
                )}
              </div>

              <span className="text-center font-mono text-[11px] text-muted">{kindOf(doc)}</span>
              <span className="text-right font-mono text-[12px] text-muted">{doc.page_count}</span>
              <span className="text-right font-mono text-[12px] text-muted">{doc.chunk_count}</span>

              <span className="flex items-center gap-1.5 text-[11.5px]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    failed
                      ? 'bg-[#F87171]'
                      : doc.status === 'ready'
                        ? 'bg-[#34D399]'
                        : 'bg-[#FBBF24]'
                  }`}
                />
                <span className={failed ? 'text-[#F87171]' : 'text-muted'}>
                  {failed ? '解析失败' : doc.status === 'ready' ? '可检索' : '处理中'}
                </span>
              </span>

              <button
                type="button"
                title="删除文档及其全部文本块"
                onClick={() => onDelete(doc)}
                className="justify-self-end rounded-md p-1.5 text-faint transition-colors hover:bg-[#F87171]/10 hover:text-[#F87171]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
