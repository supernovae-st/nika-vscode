// intentRank.ts — BM25 ranking over the binary's embedded corpus (pure).
//
// Routes an intent ("scrape a page, summarize it, post to slack") to the
// best template + exemplars. Why BM25 and not embeddings: at a ~30-doc
// corpus, exact identifier match (verb names · field names · tool slugs)
// is the dominant signal and IDF statistics are meaningful; dense
// retrievers need in-domain training a tiny DSL corpus cannot supply and
// show no evidenced gain under 100 docs (BEIR arXiv:2104.08663 ·
// CodeRAG-Bench arXiv:2406.14497 · arXiv:2604.01733). Zero model
// dependency, zero latency, deterministic. Canonical BM25: Robertson &
// Zaragoza 2009 (FnTIR 3:4).

export interface RankDoc {
  id: string;
  text: string;
}

export interface RankedDoc {
  id: string;
  score: number;
}

/**
 * The query-side alias bridge: everyday intent words → Nika vocabulary.
 * A curated table, NOT stemming — the literature's cheap recall upgrade
 * at tiny corpus scale (in place of embeddings). Document text is never
 * expanded; only the query.
 */
const ALIASES: Record<string, string[]> = {
  scrape: ['fetch', 'extract'],
  crawl: ['fetch'],
  download: ['fetch'],
  http: ['fetch'],
  url: ['fetch'],
  website: ['fetch'],
  page: ['fetch'],
  api: ['fetch', 'invoke'],
  llm: ['infer'],
  ai: ['infer'],
  model: ['infer'],
  prompt: ['infer'],
  summarize: ['infer'],
  classify: ['infer'],
  generate: ['infer'],
  shell: ['exec'],
  command: ['exec'],
  script: ['exec'],
  build: ['exec'],
  test: ['exec'],
  parallel: ['fanout', 'fan'],
  concurrent: ['fanout', 'fan'],
  batch: ['fanout'],
  each: ['for_each', 'fanout'],
  every: ['for_each', 'fanout'],
  loop: ['agent', 'for_each'],
  iterate: ['agent', 'for_each'],
  review: ['gate'],
  approve: ['gate', 'human'],
  approval: ['gate', 'human'],
  pipeline: ['chain'],
  sequence: ['chain'],
  then: ['chain'],
  transform: ['jq', 'etl'],
  json: ['jq'],
  state: ['etl'],
};

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 2);
}

export function expandQuery(tokens: string[]): string[] {
  const out = [...tokens];
  for (const t of tokens) {
    for (const alias of ALIASES[t] ?? []) {
      out.push(alias);
    }
  }
  return out;
}

/**
 * Okapi BM25 (k1=1.2 · b=0.75 — the canonical defaults). Deterministic:
 * ties break on lexical id order.
 */
export function rankBm25(query: string, docs: RankDoc[]): RankedDoc[] {
  if (docs.length === 0) { return []; }
  const k1 = 1.2;
  const b = 0.75;
  const docTokens = docs.map((d) => tokenize(d.text));
  const avgLen = docTokens.reduce((acc, t) => acc + t.length, 0) / docs.length || 1;

  const df = new Map<string, number>();
  const tfs = docTokens.map((tokens) => {
    const tf = new Map<string, number>();
    for (const t of tokens) { tf.set(t, (tf.get(t) ?? 0) + 1); }
    for (const t of tf.keys()) { df.set(t, (df.get(t) ?? 0) + 1); }
    return tf;
  });

  const n = docs.length;
  const queryTerms = new Set(expandQuery(tokenize(query)));

  return docs
    .map((d, i) => {
      const tf = tfs[i];
      const len = docTokens[i].length || 1;
      let score = 0;
      for (const term of queryTerms) {
        const f = tf.get(term) ?? 0;
        if (f === 0) { continue; }
        const docFreq = df.get(term) ?? 0;
        const idf = Math.log(1 + (n - docFreq + 0.5) / (docFreq + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * len) / avgLen));
      }
      return { id: d.id, score };
    })
    .sort((a, z) => z.score - a.score || a.id.localeCompare(z.id));
}
