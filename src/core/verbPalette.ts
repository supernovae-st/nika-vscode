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

/** A parsed omnibar deterministic add: `+ <verb|tool> [after <id>]`. */
export interface OmniAdd {
  verb: 'infer' | 'exec' | 'invoke' | 'agent';
  /** Full tool ref when the token named a tool (`nika:jq`). */
  tool?: string;
  /** Anchor task id (`after gather`). */
  after?: string;
}

/**
 * Parse the omnibar's deterministic-add grammar. The token is a verb,
 * a full `nika:x` ref, or a bare tool name from `knownBares` (the
 * binary's vocabulary). Anything else returns undefined — the caller
 * routes those sentences to the oracle-checked generate flow. A full
 * `nika:x` ref is accepted even outside `knownBares`: an unknown tool
 * is the ENGINE's diagnostic to give, not this parser's guess.
 */
export function parseOmniAdd(
  text: string,
  knownBares: ReadonlySet<string>,
): OmniAdd | undefined {
  const m = text.match(/^\+\s*([a-z][a-z0-9_:]*)(?:\s+after\s+([a-z][a-z0-9_]*))?\s*$/i);
  if (!m) { return undefined; }
  const token = m[1].toLowerCase();
  const after = m[2]?.toLowerCase();
  if (token === 'infer' || token === 'exec' || token === 'invoke' || token === 'agent') {
    return { verb: token, after };
  }
  const full = token.match(/^nika:([a-z][a-z0-9_]*)$/)?.[1];
  if (full !== undefined) { return { verb: 'invoke', tool: `nika:${full}`, after }; }
  if (/^[a-z][a-z0-9_]*$/.test(token) && knownBares.has(token)) {
    return { verb: 'invoke', tool: `nika:${token}`, after };
  }
  return undefined;
}
