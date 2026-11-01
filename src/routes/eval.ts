import { Hono } from 'hono';
import { loadQuestions } from '../eval/questions';
import { latestRun, runEval } from '../eval/run';

export const evalRoute = new Hono();

evalRoute.get('/questions', async (c) => {
  return c.json({ questions: await loadQuestions() });
});

evalRoute.get('/latest', async (c) => {
  const run = await latestRun();
  return c.json({ run });
});

evalRoute.post('/run', async (c) => {
  // Synchronous by design: 20 questions against a local corpus finish in a few
  // seconds, and a background job would need polling for no gain here.
  const result = await runEval();
  return c.json({
    run: result.run,
    outcomes: result.outcomes,
  });
});
