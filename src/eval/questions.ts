import { readFile } from 'node:fs/promises';
import { z } from 'zod';

// The question set is a file on disk, not a database table: it is versioned with
// the code, so a recall number always maps to a known set of questions.
const QuestionSchema = z.object({
  id: z.string(),
  question: z.string().min(1),
  expectedDoc: z.string().min(1),
  answerable: z.boolean(),
  note: z.string().optional(),
});

export type EvalQuestion = z.infer<typeof QuestionSchema>;

const FILE = `${import.meta.dir}/../../evals/questions.json`;

export async function loadQuestions(): Promise<EvalQuestion[]> {
  const raw = await readFile(FILE, 'utf8');
  const parsed = JSON.parse(raw) as { questions?: unknown };
  return z.array(QuestionSchema).parse(parsed.questions ?? []);
}
