import { Loader2, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type EvalOutcome, type EvalRun, api, formatTime } from '../api';
import MetricCards from '../components/MetricCards';

export default function EvalView() {
  const [run, setRun] = useState<EvalRun | null>(null);
  const [outcomes, setOutcomes] = useState<EvalOutcome[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .evalLatest()
      .then(({ run: latest }) => {
        if (!latest) return;
        setRun(latest);
        setOutcomes(latest.detail);
      })
      .catch((err: Error) => {
        console.error(err);
        setError(err.message);
      });
  }, []);

  const start = () => {
    if (running) return;
    setRunning(true);
    setError('');
    api
      .evalRun()
      .then(({ run: fresh, outcomes: detail }) => {
        setRun(fresh);
        setOutcomes(detail);
      })
      .catch((err: Error) => {
        console.error(err);
        setError(err.message);
      })
      .finally(() => setRunning(false));
  };

  const failed = outcomes.filter((o) => !o.correct).length;

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-[#E6EDF3]">评测</h1>
          <p className="mt-1 text-[13px] text-muted">
            20 条人工标注问题（含 3 条不可回答）。同一份题集可重复跑，指标与逐题明细落库。
          </p>
        </div>

        <button
          type="button"
          onClick={start}
          disabled={running}
          className="flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3.5 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:bg-ink-600 disabled:text-faint"
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {running ? '正在逐题评测…' : '重新跑分'}
        </button>
      </div>

      {running && (
        <div className="h-0.5 w-full overflow-hidden rounded bg-ink-700">
          <div className="h-full w-1/3 animate-pulse-soft rounded bg-accent" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[#F87171]/30 bg-[#F87171]/10 px-3 py-2 text-[12.5px] text-[#F87171]">
          {error}
        </div>
      )}

      <MetricCards run={run} />

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 bg-ink-700/40 px-4 py-2.5">
          <span className="text-[11px] uppercase tracking-[0.14em] text-faint">逐题明细</span>
          <span className="font-mono text-[10.5px] text-faint">
            {run
              ? `run #${run.id} · ${formatTime(run.createdAt)} · ${failed} 项未通过`
              : '尚未跑分'}
          </span>
        </div>

        {outcomes.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-faint">
            还没有评测记录。点击「重新跑分」会依次检索并作答 20 道题。
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {outcomes.map((row) => (
              <li
                key={row.id}
                className={`grid grid-cols-[46px_1fr_150px_66px_64px] items-start gap-2 px-4 py-2.5 text-[12.5px] hover:bg-white/[0.02] ${
                  row.correct ? '' : 'bg-[#F87171]/[0.04]'
                }`}
              >
                <span className="font-mono text-[11px] text-faint">{row.id}</span>

                <div className="min-w-0">
                  <div className="truncate text-paper" title={row.question}>
                    {row.question}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10.5px] text-faint">
                    recall: {row.topDocs.join(', ') || '—'}
                  </div>
                </div>

                <div className="min-w-0">
                  <div
                    className="truncate font-mono text-[11px] text-muted"
                    title={row.expectedDoc}
                  >
                    {row.expectedDoc}
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-faint">
                    {row.answerable ? '可回答' : '不可回答'}
                  </div>
                </div>

                <span
                  className={`font-mono text-[11px] ${row.correct ? 'text-[#34D399]' : 'text-[#F87171]'}`}
                >
                  {row.correct ? 'PASS' : 'FAIL'}
                </span>

                <span className="text-right font-mono text-[11px] text-faint">
                  {row.latencyMs}ms
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11.5px] leading-relaxed text-faint">
        Recall@5 只在可回答题上计算；引用命中率要求回答中的角标确实指向期望文档；
        拒答准确率把「答错」和「该答却拒答」都计为失败。明细与指标同时写入 eval_runs 表。
      </p>
    </div>
  );
}
