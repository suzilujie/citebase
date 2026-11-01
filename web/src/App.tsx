import { Database, Gauge, Library, MessageSquareText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type Health, api } from './api';
import AskView from './views/AskView';
import EvalView from './views/EvalView';
import LibraryView from './views/LibraryView';

type View = 'library' | 'ask' | 'eval';

const TABS: { id: View; label: string; icon: typeof Library }[] = [
  { id: 'library', label: '文档库', icon: Library },
  { id: 'ask', label: '问答', icon: MessageSquareText },
  { id: 'eval', label: '评测', icon: Gauge },
];

export default function App() {
  const [view, setView] = useState<View>('library');
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(console.error);
  }, []);

  const offline = health?.mode === 'extractive';

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 h-14 border-b border-white/5 bg-ink-900/85 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between gap-6 px-5 md:px-8">
          <div className="flex items-center gap-3">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 ring-1 ring-accent/30">
              <Database className="h-4 w-4 text-accent-soft" strokeWidth={2.2} />
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent-cyan" />
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight text-[#E6EDF3]">
                CiteBase
              </div>
              <div className="hidden text-[10.5px] uppercase tracking-[0.18em] text-faint sm:block">
                citation-grounded q&amp;a
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-1 rounded-lg border border-white/5 bg-ink-800/70 p-1 md:flex">
            {TABS.map((tab) => {
              const active = view === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setView(tab.id)}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] transition-colors ${
                    active
                      ? 'bg-accent/15 text-[#E6EDF3] ring-1 ring-accent/30'
                      : 'text-muted hover:bg-white/5 hover:text-paper'
                  }`}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="hidden items-center gap-1.5 text-faint lg:flex">
              <span
                className={`h-1.5 w-1.5 rounded-full ${health?.db ? 'bg-[#34D399]' : 'bg-[#F87171]'}`}
              />
              pgvector
            </span>
            <span className="rounded-md border border-white/5 bg-ink-800/80 px-2 py-1 text-muted">
              {health ? (offline ? 'extractive' : 'llm') : '…'}
            </span>
          </div>
        </div>
      </header>

      {offline && (
        <div className="fixed inset-x-0 top-14 z-30 border-b border-accent/15 bg-accent/[0.07] px-5 py-1.5 text-center text-[12px] text-accent-soft md:px-8">
          当前为抽取式模式：未配置模型密钥，回答直接引用原文关键句。
          <span className="text-faint"> 在 .env 填入 OPENAI_API_KEY 即可切换生成式。</span>
        </div>
      )}

      <main
        className={`mx-auto max-w-[1200px] px-5 pb-20 pt-[72px] md:px-8 md:pb-10 ${offline ? 'md:pt-[86px]' : 'md:pt-[76px]'}`}
      >
        {view === 'library' && <LibraryView />}
        {view === 'ask' && <AskView mode={health?.mode ?? 'extractive'} />}
        {view === 'eval' && <EvalView />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-white/5 bg-ink-900/95 backdrop-blur-xl md:hidden">
        {TABS.map((tab) => {
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setView(tab.id)}
              className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-[11px] ${
                active ? 'text-accent-soft' : 'text-faint'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
