import { config } from '../config';
import { tokenize } from './tokenize';

// Two providers behind one interface:
//   local  - deterministic hashed bag of tokens, 384 dims, no network, no key.
//   openai - any OpenAI-compatible /embeddings endpoint (real semantics).
//
// The local provider is intentionally NOT a neural model. It exists so the
// project can be demoed on a machine with no credentials: vectors still cluster
// documents that share vocabulary, which is enough for the vector arm to be
// meaningful. Better semantics require EMBED_PROVIDER=openai.
// See docs/system-design.html (decision D3).

const BATCH = 32;

export function l2Normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

/** FNV-1a, 32 bit. Cheap, stable across runs and platforms. */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function localEmbed(text: string): number[] {
  const dim = config.EMBED_DIM;
  const vec = new Array<number>(dim).fill(0);

  const counts = new Map<string, number>();
  for (const t of tokenize(text)) counts.set(t, (counts.get(t) ?? 0) + 1);

  for (const [token, count] of counts) {
    const h = fnv1a(token);
    const idx = h % dim;
    // The top bit decides the sign so collisions do not systematically add up.
    const sign = h & 0x80000000 ? -1 : 1;
    // Sublinear term frequency: the tenth mention of a word matters far less
    // than the second.
    vec[idx] += sign * (1 + Math.log(count));
  }

  // Empty or punctuation-only input: keep a valid unit vector instead of NaN.
  if (l2Normalize(vec).every((v) => v === 0)) vec[fnv1a(text) % dim] = 1;

  return l2Normalize(vec);
}

interface EmbedResponse {
  data: { embedding: number[]; index: number }[];
}

async function openaiEmbed(texts: string[]): Promise<number[][]> {
  const base = config.OPENAI_BASE_URL.replace(/\/$/, '');
  if (!base) throw new Error('OPENAI_BASE_URL is empty but EMBED_PROVIDER=openai');
  if (!config.OPENAI_API_KEY)
    throw new Error('OPENAI_API_KEY is required for EMBED_PROVIDER=openai');

  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.OPENAI_EMBED_MODEL,
      input: texts,
      // Not every compatible provider accepts this field, but the ones that do
      // return the configured width; the ones that do not are checked below.
      dimensions: config.EMBED_DIM,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`embedding request failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as EmbedResponse;
  const ordered = [...json.data].sort((a, b) => a.index - b.index);
  return ordered.map((d) => {
    if (d.embedding.length !== config.EMBED_DIM) {
      throw new Error(
        `embedding dimension mismatch: model returned ${d.embedding.length}, EMBED_DIM is ${config.EMBED_DIM}`,
      );
    }
    return l2Normalize(d.embedding);
  });
}

/** Embeds a batch, preserving order. Vectors are L2-normalised in both modes. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (config.EMBED_PROVIDER === 'local') return texts.map(localEmbed);

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    out.push(...(await openaiEmbed(slice)));
  }
  return out;
}

export async function embedOne(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  if (!vec) throw new Error('embedding returned no vector');
  return vec;
}
