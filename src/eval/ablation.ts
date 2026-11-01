import { retrieve } from '../retrieve/search';
import { loadQuestions } from './questions';

// "100% recall" on three sample documents proves very little by itself. Running
// the same questions through each arm separately is what shows that the hybrid
// is doing work: the vector arm alone misses exact identifiers, the keyword arm
// alone misses paraphrase, and only the fusion gets both.

export type Arm = 'vector' | 'keyword' | 'hybrid';

export interface ArmScore {
  arm: Arm;
  recallAt5: number;
  mrr: number;
  answered: number;
}

export async function ablation(): Promise<ArmScore[]> {
  const questions = (await loadQuestions()).filter((q) => q.answerable);
  const arms: Arm[] = ['vector', 'keyword', 'hybrid'];
  const out: ArmScore[] = [];

  for (const arm of arms) {
    let recall = 0;
    let reciprocalRank = 0;

    for (const question of questions) {
      const hits = await retrieve(question.question, {
        arms: arm === 'hybrid' ? 'both' : arm,
        limit: 8,
      });

      const rank = hits.findIndex((h) => h.filename === question.expectedDoc);
      if (rank >= 0) {
        reciprocalRank += 1 / (rank + 1);
        if (rank < 5) recall += 1;
      }
    }

    out.push({
      arm,
      recallAt5: questions.length === 0 ? 0 : recall / questions.length,
      mrr: questions.length === 0 ? 0 : reciprocalRank / questions.length,
      answered: questions.length,
    });
  }

  return out;
}
