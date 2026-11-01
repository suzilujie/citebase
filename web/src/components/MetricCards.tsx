import type { EvalRun } from '../api';

interface Props {
  run: EvalRun | null;
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

const CARDS: { key: 'recallAt5' | 'citationHit' | 'refusalAcc'; label: string; hint: string }[] = [
  { key: 'recallAt5', label: 'Recall@5', hint: '期望文档进入前 5 个文本块' },
  { key: 'citationHit', label: '引用命中率', hint: '回答确实引用了期望文档' },
  { key: 'refusalAcc', label: '拒答准确率', hint: '该答的答、该拒的拒' },
];

export default function MetricCards({ run }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {CARDS.map((card) => {
        const value = run ? run[card.key] : null;
        const tone =
          value === null
            ? 'text-faint'
            : value >= 0.9
              ? 'text-[#34D399]'
              : value >= 0.7
                ? 'text-[#FBBF24]'
                : 'text-[#F87171]';

        return (
          <div key={card.key} className="panel relative overflow-hidden px-4 py-3.5">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-accent/40 via-accent/10 to-transparent" />
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-[0.14em] text-faint">
                {card.label}
              </span>
              <span className="font-mono text-[10.5px] text-faint">{run ? run.total : 0} q</span>
            </div>
            <div className={`mt-1.5 font-mono text-[27px] leading-none ${tone}`}>
              {value === null ? '—' : pct(value)}
            </div>
            <p className="mt-1.5 text-[11.5px] text-muted">{card.hint}</p>
          </div>
        );
      })}
    </div>
  );
}
