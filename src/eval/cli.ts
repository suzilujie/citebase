import { effectiveAnswerMode } from '../config';
import { ablation } from './ablation';
import { formatPercent } from './metrics';
import { runEval } from './run';

// CLI counterpart of the /api/eval/run endpoint, so the same numbers can be
// produced in CI without a browser. `bun run eval`.
async function main(): Promise<void> {
  const mode = effectiveAnswerMode();
  console.log(`[eval] answer mode: ${mode}`);
  console.log('[eval] running question set...\n');

  const { run, outcomes, summary } = await runEval();

  for (const o of outcomes) {
    const flag = o.correct ? 'PASS' : 'FAIL';
    const recall = o.answerable ? (o.recalled ? 'hit ' : 'miss') : ' n/a';
    const cite = o.answerable ? (o.cited ? 'cite' : '----') : ' n/a';
    console.log(
      `${flag}  ${o.id.padEnd(4)} ${recall}  ${cite}  ${String(o.latencyMs).padStart(5)}ms  ${o.question}`,
    );
  }

  console.log('');
  console.log(`  recall@5            ${formatPercent(summary.recallAt5)}`);
  console.log(`  citation hit        ${formatPercent(summary.citationHit)}`);
  console.log(`  refusal accuracy    ${formatPercent(summary.refusalAcc)}`);
  console.log(
    `  questions           ${summary.total} (${summary.answerable} answerable, ${summary.unanswerable} not)`,
  );
  console.log(`  run id              ${run.id}`);
  console.log('');

  console.log('[eval] retrieval ablation (answerable questions only):');
  const rows = await ablation();
  for (const row of rows) {
    console.log(
      `  ${row.arm.padEnd(8)} recall@5 ${formatPercent(row.recallAt5).padStart(6)}   MRR ${row.mrr.toFixed(3)}`,
    );
  }
  console.log('');

  const failures = outcomes.filter((o) => !o.correct);
  if (failures.length > 0) {
    console.log('[eval] failures:');
    for (const f of failures) {
      console.log(
        `  - ${f.id}: expected ${f.expectedDoc}, top docs: ${f.topDocs.join(', ') || 'none'}`,
      );
      console.log(`    answer: ${f.answer.replace(/\s+/g, ' ').slice(0, 120)}`);
    }
  }

  process.exit(0);
}

await main();
