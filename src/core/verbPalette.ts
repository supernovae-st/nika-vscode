// verbPalette.ts — the cmdk verb list for the drop-a-port palette.
//
// Dropping a node's out-port on empty canvas opens a small command
// palette at the cursor to pick the next task's verb (pre-wired
// depends_on). The 4 verbs are the closed set (D-2026-05-22-N18); the
// filter is the one bit worth pinning: prefix matches rank above
// substring, name above description, so typing "in" lands on `infer`
// first. Pure — the webview renders the ranked list, the test pins it.

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
