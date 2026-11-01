// Postgres has no Chinese word segmenter by default: it treats a whole run of
// CJK characters as one lexeme, so `to_tsvector('simple', '报销流程')` produces a
// single token and keyword search for `报销` finds nothing.
//
// Fix without installing an extension: tokenise Chinese into overlapping
// bigrams ourselves and store the joined result in `chunks.search_text`.
// "报销流程" -> "报销 销流 流程". The query side uses the same function, so the
// two always meet.

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/;
const WORD = /[a-z0-9][a-z0-9._-]*/g;

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];

  const words = lower.match(WORD);
  if (words) tokens.push(...words.filter((w) => w.length > 1));

  // Walk the string and cut maximal runs of Chinese characters.
  let run = '';
  for (const ch of lower) {
    if (CJK.test(ch)) {
      run += ch;
      continue;
    }
    if (run) {
      pushCjkBigrams(run, tokens);
      run = '';
    }
  }
  if (run) pushCjkBigrams(run, tokens);

  return tokens;
}

function pushCjkBigrams(run: string, out: string[]): void {
  if (run.length === 1) {
    out.push(run);
    return;
  }
  for (let i = 0; i + 1 < run.length; i++) {
    out.push(run.slice(i, i + 2));
  }
}

export function toSearchText(text: string): string {
  return tokenize(text).join(' ');
}

/**
 * Builds an OR-ed tsquery so a single rare bigram does not make the whole query
 * return nothing. Common words are filtered out to keep the candidate set small.
 */
export function toTsQuery(text: string, maxTerms = 24): string | null {
  const counts = new Map<string, number>();
  for (const t of tokenize(text)) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const terms = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerms)
    .map(([t]) => `'${t.replace(/'/g, "''")}'`);

  if (terms.length === 0) return null;
  return terms.join(' | ');
}
