import { z } from 'zod';

// Environment is parsed once, at import time. A bad value must stop the process
// instead of failing later in the middle of an ingest.
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),

  PORT: z.coerce.number().int().positive().default(15640),
  TZ: z.string().default('Asia/Shanghai'),

  EMBED_PROVIDER: z.enum(['local', 'openai']).default('local'),
  // The vector column is created as vector(384); changing this needs a reembed.
  EMBED_DIM: z.coerce.number().int().positive().default(384),

  ANSWER_MODE: z.enum(['auto', 'extractive', 'llm']).default('auto'),
  OPENAI_BASE_URL: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_CHAT_MODEL: z.string().default('deepseek-chat'),
  OPENAI_EMBED_MODEL: z.string().default('text-embedding-3-small'),

  TOP_K: z.coerce.number().int().positive().max(200).default(30),
  RRF_K: z.coerce.number().int().positive().default(60),
  CONTEXT_K: z.coerce.number().int().positive().max(50).default(8),

  MAX_UPLOAD_MB: z.coerce.number().positive().default(20),
  CHUNK_SIZE: z.coerce.number().int().min(200).default(700),
  CHUNK_OVERLAP: z.coerce.number().int().min(0).default(120),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
  console.error(`Invalid environment configuration:\n${lines.join('\n')}`);
  process.exit(1);
}

export const config = parsed.data;

export const hasLlmKey = config.OPENAI_API_KEY.trim().length > 0;

/**
 * Resolves the effective answer mode. `auto` means: use the model when a key is
 * present, otherwise quote the retrieved text. This is what makes the project
 * demoable on a machine without any paid credentials.
 */
export function effectiveAnswerMode(): 'llm' | 'extractive' {
  if (config.ANSWER_MODE === 'extractive') return 'extractive';
  if (config.ANSWER_MODE === 'llm') return hasLlmKey ? 'llm' : 'extractive';
  return hasLlmKey ? 'llm' : 'extractive';
}
