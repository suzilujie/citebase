import { ArrowUp, MessagesSquare, Quote, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type AnswerResult, api } from '../api';
import AnswerPanel from '../components/AnswerPanel';
import CitationList from '../components/CitationList';

interface Turn {
  id: number;
  question: string;
  result?: AnswerResult;
  error?: string;
}

const EXAMPLES = [
  '费用发生后多少天内必须提交报销单？',
  '远程办公每周最多可以申请几天？',
  'Who approves an invoice above USD 10,000?',
];

export default function AskView({ mode }: { mode: 'llm' | 'extractive' }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [panelTurn, setPanelTurn] = useState<number | null>(null);
  const counter = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  const latest = [...turns].reverse().find((t) => t.result);
  const shown = turns.find((t) => t.id === (panelTurn ?? latest?.id)) ?? latest;
  const citations = shown?.result?.citations ?? [];

  useEffect(() => {
    // Scroll on a new question and again when its answer lands.
    if (turns.length > 0 || pending) {
      bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [turns, pending]);

  const ask = (raw: string) => {
    const question = raw.trim();
    if (!question || pending) return;

    counter.current += 1;
    const id = counter.current;
    setTurns((prev) => [...prev, { id, question }]);
    setInput('');
    setPending(true);
    setActive(null);
    setPanelTurn(id);

    api
      .ask(question)
      .then((result) => {
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, result } : t)));
      })
      .catch((err: Error) => {
        console.error(err);
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, error: err.message } : t)));
      })
      .finally(() => setPending(false));
  };

  return (
    <div className="grid animate-fade-up gap-5 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
      <div className="flex min-h-[62vh] flex-col">
        <div className="mb-3">
          <h1 className="text-[26px] font-semibold tracking-tight text-[#E6EDF3]">问答</h1>
          <p className="mt-1 text-[13px] text-muted">
            每个结论都带 [n] 角标，右侧列出对应原文；点角标即可跳到出处核对。
          </p>
        </div>

        <div className="flex-1 space-y-4">
          {turns.length === 0 && (
            <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-700/70 ring-1 ring-white/5">
                <MessagesSquare className="h-4 w-4 text-accent-soft" />
              </div>
              <p className="text-[14px] text-paper">先问一个制度细节试试</p>
              <div className="flex flex-col items-center gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => ask(example)}
                    className="cursor-pointer rounded-md border border-white/5 bg-ink-900/60 px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:border-accent/30 hover:text-paper"
                  >
                    {example}
                  </button>
                ))}
              </div>
              <p className="max-w-md text-[11.5px] leading-relaxed text-faint">
                也可以问一个文档里没有的问题，例如「公司是否提供股票期权」，看系统如何明确拒答。
              </p>
            </div>
          )}

          {turns.map((turn) => (
            <div key={turn.id} className="space-y-2.5">
              <div className="flex justify-end">
                <div className="max-w-[86%] rounded-xl rounded-br-sm bg-accent/15 px-3.5 py-2 text-[13.5px] leading-relaxed text-paper ring-1 ring-accent/25">
                  {turn.question}
                </div>
              </div>

              {turn.result && (
                <AnswerPanel
                  result={turn.result}
                  activeIndex={shown?.id === turn.id ? active : null}
                  onMarker={(n) => {
                    setPanelTurn(turn.id);
                    setActive(n);
                  }}
                />
              )}

              {!turn.result && !turn.error && (
                <div className="panel space-y-2 p-4">
                  {[92, 76, 58].map((w) => (
                    <div
                      key={w}
                      className="h-3 animate-pulse-soft rounded bg-ink-600/70"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              )}

              {turn.error && (
                <div className="panel border-[#F87171]/25 px-4 py-2.5 text-[12.5px] text-[#F87171]">
                  {turn.error}
                </div>
              )}
            </div>
          ))}
          <div ref={bottom} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="sticky bottom-0 z-10 mt-5 bg-gradient-to-t from-ink-900 via-ink-900/95 to-transparent pb-1 pt-3"
        >
          <div className="panel flex items-center gap-2 p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="问点什么，例如：出差住宿标准是多少？"
              className="min-w-0 flex-1 border-0 bg-transparent px-2 py-1.5 text-[13.5px] text-paper outline-none placeholder:text-faint"
            />
            <span className="hidden shrink-0 items-center gap-1 rounded-md bg-ink-700/70 px-2 py-1 font-mono text-[10.5px] text-muted sm:flex">
              <Sparkles className="h-3 w-3 text-accent-soft" />
              {mode === 'llm' ? '生成式' : '抽取式'}
            </span>
            <button
              type="submit"
              disabled={pending || input.trim().length === 0}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-accent text-white transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:bg-ink-600 disabled:text-faint"
              title="发送"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[10.5px] text-faint">
            回答仅基于已入库文档；找不到依据时会明确说「文档中未提及」。
          </p>
        </form>
      </div>

      <aside className="lg:sticky lg:top-[86px] lg:self-start">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[12px] uppercase tracking-[0.14em] text-faint">
            <Quote className="h-3 w-3" />
            出处
          </h2>
          <span className="font-mono text-[11px] text-faint">{citations.length} 条</span>
        </div>
        {shown?.result ? (
          <>
            <p className="mb-2.5 line-clamp-2 rounded-md border border-white/5 bg-ink-800/60 px-2.5 py-1.5 text-[11.5px] text-muted">
              {shown.question}
            </p>
            <CitationList citations={citations} activeIndex={active} onSelect={setActive} />
          </>
        ) : (
          <div className="panel px-5 py-10 text-center text-[12.5px] text-faint">
            提问后，这里会列出每一段被引用的原文与页码。
          </div>
        )}
      </aside>
    </div>
  );
}
