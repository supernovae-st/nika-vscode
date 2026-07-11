// verbPalette.ts — the task palette's ranked lists (verbs + tools).
//
// The palette adds a TASK: pick a verb (the closed set of 4 ·
// D-2026-05-22-N18) or pick a builtin tool directly (an `invoke` task
// pre-wired to it — the 27-tool vocabulary, binary-fed when present).
// The filter is the bit worth pinning: prefix matches rank above
// substring, name above description, so typing "in" lands on `infer`
// first and "j" surfaces `jq` before `json_diff`. Pure — the webview
// renders the ranked lists, the tests pin them.

export interface VerbItem {
  verb: 'infer' | 'exec' | 'invoke' | 'agent';
  glyph: string;
  blurb: string;
}

/** The canon verb glyphs + one-line blurbs (the nika.sh set). */
export const VERB_ITEMS: readonly VerbItem[] = [
  { verb: 'infer', glyph: '◇', blurb: 'LLM call' },
  { verb: 'exec', glyph: '▷', blurb: 'shell / subprocess' },
  { verb: 'invoke', glyph: '◆', blurb: 'builtin or MCP tool' },
  { verb: 'agent', glyph: '✦', blurb: 'agent loop · default-deny tools' },
];

/**
 * Filter + rank the verbs against a query. Empty query returns the
 * canonical order. Ranking (lower = better): name-prefix < name-
 * substring < blurb-substring; non-matches are dropped.
 */
export function filterVerbs(query: string): VerbItem[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) { return [...VERB_ITEMS]; }
  const scored: Array<{ item: VerbItem; rank: number }> = [];
  for (const item of VERB_ITEMS) {
    const name = item.verb;
    const blurb = item.blurb.toLowerCase();
    let rank = Infinity;
    if (name.startsWith(q)) { rank = 0; }
    else if (name.includes(q)) { rank = 1; }
    else if (blurb.includes(q)) { rank = 2; }
    if (rank !== Infinity) { scored.push({ item, rank }); }
  }
  // Stable within a rank (VERB_ITEMS order preserved).
  return scored
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((s) => s.item);
}

/** One builtin tool row for the task palette (an invoke task, pre-wired). */
export interface ToolItem {
  /** Full tool ref (`nika:jq`). */
  tool: string;
  /** Bare name (`jq`) — the match + display text. */
  bare: string;
  /** Category (`data` · `media` · …) — the group header + weak match. */
  cat: string;
}

/**
 * Filter + rank tools. Empty query returns the given order (the caller
 * groups by category). Ranking: bare-name prefix < bare substring <
 * category substring; non-matches drop.
 */
export function filterTools(query: string, tools: readonly ToolItem[]): ToolItem[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) { return [...tools]; }
  const scored: Array<{ item: ToolItem; rank: number; i: number }> = [];
  tools.forEach((item, i) => {
    let rank = Infinity;
    if (item.bare.startsWith(q)) { rank = 0; }
    else if (item.bare.includes(q)) { rank = 1; }
    else if (item.cat.includes(q)) { rank = 2; }
    if (rank !== Infinity) { scored.push({ item, rank, i }); }
  });
  return scored
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((s) => s.item);
}
