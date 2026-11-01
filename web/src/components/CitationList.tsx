import { ExternalLink, Quote } from 'lucide-react';
import { useEffect } from 'react';
import type { Citation } from '../api';

interface Props {
  citations: Citation[];
  activeIndex: number | null;
  onSelect: (index: number) => void;
}

function where(citation: Citation): string {
  if (citation.headingPath) return citation.headingPath;
  return `第 ${citation.page} 页`;
}

export default function CitationList({ citations, activeIndex, onSelect }: Props) {
  useEffect(() => {
    if (activeIndex === null) return;
    document
      .getElementById(`citation-${activeIndex}`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  if (citations.length === 0) {
    return (
      <div className="panel flex flex-col items-center gap-2 px-5 py-10 text-center">
        <Quote className="h-4 w-4 text-faint" />
        <p className="text-[12.5px] text-faint">本次回答没有引用，出处面板为空</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {citations.map((citation) => {
        const active = activeIndex === citation.index;
        return (
          <article
            key={citation.chunkId}
            id={`citation-${citation.index}`}
            className={`panel overflow-hidden transition-colors ${
              active ? 'border-accent/50 bg-accent/[0.06]' : 'hover:border-white/10'
            }`}
          >
            <header className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
              <button
                type="button"
                onClick={() => onSelect(citation.index)}
                title="高亮该出处"
                className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
              >
                <span
                  className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] px-1 font-mono text-[11px] ${
                    active ? 'bg-accent text-white' : 'bg-accent/15 text-accent-soft'
                  }`}
                >
                  {citation.index}
                </span>
                <span className="truncate text-[12px] text-paper" title={citation.filename}>
                  {citation.filename}
                </span>
              </button>
              <a
                href={`/api/documents/${citation.docId}/text`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex shrink-0 items-center gap-1 font-mono text-[10.5px] text-faint transition-colors hover:text-accent-soft"
                title="打开原文"
              >
                原文 <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </header>

            <div className="px-3 py-2">
              <div className="mb-1 font-mono text-[10.5px] text-faint">{where(citation)}</div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words border-l-2 border-accent/25 pl-2.5 font-mono text-[11.5px] leading-[1.7] text-muted">
                {citation.snippet}
              </pre>
            </div>
          </article>
        );
      })}
    </div>
  );
}
