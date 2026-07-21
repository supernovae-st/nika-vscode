// verbPalette.ts — the task palette's ranked lists (verbs + tools).
//
// The palette adds a TASK: pick a verb (the closed set of 4 ·
// D-2026-05-22-N18) or pick a builtin tool directly (an `invoke` task
// pre-wired to it — the 28-tool vocabulary, binary-fed when present).
// The filter is the bit worth pinning: prefix matches rank above
// substring, name above description, so typing "in" lands on `infer`
// first and "j" surfaces `jq` before `json_diff`. Pure — the webview
// renders the ranked lists, the tests pin them.

import { damerau } from './graphIntel';

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

/**
 * Offline one-line blurbs for the 28 builtins — the palette's fallback
 * teaching voice. The BINARY's `tools --json` description WINS whenever
 * it ships (these are honest approximations, updated with the stdlib).
 */
export const FALLBACK_TOOL_BLURBS: Record<string, string> = {
  log: 'diagnostic line into the run stream',
  emit: 'append a structured event',
  assert: 'fail unless the condition holds',
  prompt: 'ask the human · wait for the answer',
  done: 'end an agent loop with a result',
  wait: 'pause for a duration',
  read: 'read a file (workspace-scoped)',
  write: 'write a file (workspace-scoped)',
  edit: 'surgical text replace in a file',
  glob: 'list files by pattern',
  grep: 'search file contents by regex',
  jq: 'transform JSON with a jq program',
  decide: 'decision bundle × evidence → receipt',
  json_diff: 'structural diff of two JSON values',
  validate: 'check JSON against a schema',
  json_merge_patch: 'RFC 7396 merge-patch',
  convert: 'JSON ⇄ YAML ⇄ TOML ⇄ CSV',
  uuid: 'mint a v4 uuid',
  date: 'now · format · add on dates',
  hash: 'sha-256 and friends',
  fetch: 'HTTP request (permits-gated)',
  notify: 'webhook ping (permits-gated)',
  inspect: 'describe a value’s shape',
  compose: 'statically check a drafted workflow — never runs it',
  image_generate: 'text → image (provider-priced)',
  tts_generate: 'text → speech audio',
  image_fx: 'edit / filter an image locally',
  chart: 'data → chart image (5 renderers)',
};

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
/** The `+ <token> [after <id>]` shape — parseOmniAdd and the did-you-mean
 *  read the SAME grammar (the `+` stays the deterministic gate). */
const OMNI_ADD_GRAMMAR = /^\+\s*([a-z][a-z0-9_:]*)(?:\s+after\s+([a-z][a-z0-9_]*))?\s*$/i;

export function parseOmniAdd(
  text: string,
  knownBares: ReadonlySet<string>,
): OmniAdd | undefined {
  const m = text.match(OMNI_ADD_GRAMMAR);
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

/** A near-miss reading of a failed omni add: the `+` grammar matched but
 *  the token names nothing — its Damerau ≤2 neighbours, nearest first. */
export interface OmniAddSuggestion {
  /** The mistyped token (lowercased). */
  token: string;
  /** Corrected adds — distance, then verbs before tools, then lexical. */
  candidates: OmniAdd[];
}

/**
 * Did-you-mean for the omnibar's `+` grammar (Raycast forgiveness: a
 * typo'd token is never a sentence for the LLM). Fires ONLY when the
 * text is a `+` phrase whose token missed the vocabulary — `+ ifner`
 * suggests `infer`; free prose (`make me a workflow`) stays undefined
 * so the caller keeps routing sentences to generate. A `nika:` ref is
 * never fuzzed: an unknown tool ref is the ENGINE's diagnostic to give.
 */
export function omniAddDidYouMean(
  text: string,
  knownBares: ReadonlySet<string>,
): OmniAddSuggestion | undefined {
  const m = text.match(OMNI_ADD_GRAMMAR);
  if (!m) { return undefined; }
  const token = m[1].toLowerCase();
  const after = m[2]?.toLowerCase();
  if (token.includes(':')) { return undefined; }
  const scored: Array<{ add: OmniAdd; d: number; tier: number; name: string }> = [];
  for (const { verb } of VERB_ITEMS) {
    const d = damerau(token, verb, 2);
    if (d <= 2) { scored.push({ add: { verb, after }, d, tier: 0, name: verb }); }
  }
  for (const bare of knownBares) {
    const d = damerau(token, bare, 2);
    if (d <= 2) {
      scored.push({ add: { verb: 'invoke', tool: `nika:${bare}`, after }, d, tier: 1, name: bare });
    }
  }
  if (scored.length === 0) { return undefined; }
  scored.sort((a, b) => a.d - b.d || a.tier - b.tier || (a.name < b.name ? -1 : 1));
  return { token, candidates: scored.map((s) => s.add) };
}
