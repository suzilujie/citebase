import { CircleSlash, TriangleAlert } from 'lucide-react';
import type { AnswerResult } from '../api';

interface Props {
  result: AnswerResult;
  activeIndex: number | null;
  onMarker: (index: number) => void;
}

/**
 * Renders `[n]` as a button instead of text: the marker is the product, so it
 * has to be clickable and to show which source is currently open.
 */
interface Token {
  key: number;
  text: string;
  marker: number | null;
}

function tokenizeAnswer(text: string): Token[] {
  const tokens: Token[] = [];
  let seq = 0;
  for (const part of text.split(/(\[\d+\])/g)) {
    const match = /^\[(\d+)\]$/.exec(part);
    tokens.push({ key: seq++, text: part, marker: match ? Number(match[1]) : null });
  }
  return tokens;
}

function renderAnswer(text: string, activeIndex: number | null, onMarker: (n: number) => void) {
  return tokenizeAnswer(text).map((token) => {
    if (token.marker === null) return <span key={token.key}>{token.text}</span>;

    const n = token.marker;
    return (
      <button
        key={token.key}
        type="button"
        onClick={() => onMarker(n)}
        className={`marker cursor-pointer ${activeIndex === n ? 'marker-active' : ''}`}
        title={`查看出处 ${n}`}
      >
        {n}
      </button>
    );
  });
}

export default function AnswerPanel({ result, activeIndex, onMarker }: Props) {
  const refused = result.citations.length === 0;

  return (
    <div className="panel animate-fade-up p-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
        <span className={result.mode === 'llm' ? 'text-accent-soft' : 'text-[#FBBF24]'}>
          {result.mode === 'llm' ? 'generative' : 'extractive'}
        </span>
        <span>·</span>
        <span>{result.latencyMs} ms</span>
        <span>·</span>
        <span>{result.citations.length} sources</span>
      </div>

      <p className="whitespace-pre-wrap text-[14.5px] leading-[1.85] text-paper">
        {renderAnswer(result.answer, activeIndex, onMarker)}
      </p>

      {refused && (
        <p className="mt-3 flex items-start gap-1.5 border-t border-white/5 pt-2.5 text-[12px] leading-relaxed text-faint">
          <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          已入库文档中没有可支撑该问题的内容，系统选择不回答，而不是编造。
        </p>
      )}

      {result.degraded && (
        <p className="mt-3 flex items-start gap-1.5 rounded-md border border-[#FBBF24]/25 bg-[#FBBF24]/10 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-[#FBBF24]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {result.degraded}
        </p>
      )}
    </div>
  );
}
