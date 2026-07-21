// rootSearch.ts · the root search model (pure · zero vscode · zero imports).
//
// One ranked list holds every launchable thing (the annexe-AA design):
// the gate feeds items from the four families and this module answers
// the three questions that matter. WHO matches: a house subsequence
// matcher with a word-boundary bonus, and above it the assigned alias
// (the Raycast law: a two-letter habit the USER assigned beats every
// ranking · exact equality only, never fuzzy). WHO leads: match tier
// first (alias -1 · prefix 0 · word boundary 1 · subsequence 2), then
// learned frecency, then declaration order · frecency NEVER crosses a
// tier, because a learned habit must not beat a better literal match —
// and an ASSIGNED habit outranks both. WHERE the dead ends go: nowhere
// · a zero-match query falls onto ranked fallback rows where the query
// becomes the argument (the no-dead-ends law).
//
// The frecency store is plain JSON (workspaceState-ready · the gate owns
// the `nika.search.frecency.v1` key): visits decay with a 7-day
// half-life and the store stays capped (the Memento law: 200 ids · the
// weakest score is evicted · never the id just visited). Every function
// takes the clock as a parameter (the runsModel idiom): decay is
// provable, not flaky.

export type Family = 'command' | 'task' | 'workflow' | 'run';

/** One launchable row · the gate renders it, the model never paints. */
export interface SearchItem {
  readonly id: string;
  readonly family: Family;
  readonly label: string;
  readonly detail?: string;
  /** Display-form chord (the extension.ts derivation), when one exists. */
  readonly chord?: string;
  /** User-assigned aliases (`nika.search.aliases` · attached by
   *  applyAliases): tier -1 on FULL equality, case-insensitive · never
   *  a fuzzy surface — an alias the query merely resembles is silence. */
  readonly aliases?: readonly string[];
  /** Extra match surface · participates from tier 1, never tier 0. */
  readonly keywords?: readonly string[];
  /** Index in the family-ordered build · the last tiebreak. */
  readonly declOrder: number;
  readonly run: { readonly command: string; readonly args?: readonly unknown[] };
}

/** One learned habit (JSON-serializable · workspaceState-ready). */
export interface FrecencyEntry {
  readonly count: number;
  readonly lastMs: number;
}
export type FrecencyStore = Record<string, FrecencyEntry>;

/** The Memento law: the store never holds more than this many ids. */
export const FRECENCY_CAP = 200;

/** The gate's door (PR-2 registers it) · did-you-mean re-enters here. */
export const SEARCH_COMMAND = 'nika.search';

const DAY_MS = 86_400_000;
const HALF_LIFE_DAYS = 7;

/**
 * Exponential decay with a 7-day half-life: a count halves for every
 * seven days of silence. Total on corrupt entries (a store read back
 * from disk is a fact, not a crash): non-finite fields score 0. A
 * future lastMs (clock skew) clamps to age zero and scores the full
 * count.
 */
export function frecencyScore(e: FrecencyEntry, nowMs: number): number {
  if (!Number.isFinite(e.count) || !Number.isFinite(e.lastMs)) { return 0; }
  const ageDays = Math.max(0, nowMs - e.lastMs) / DAY_MS;
  return e.count * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/** Match quality: -1 assigned alias (exact) · 0 label prefix · 1 word
 *  boundary / keyword · 2 subsequence. */
export type MatchTier = -1 | 0 | 1 | 2;

/** The separators a word can start after (label and keyword grammar). */
const WORD_SEP = new Set([' ', '\t', '-', '_', '.', ':', '/', '(', ')', '"', "'"]);

/** True when `q` sits at the start of a NON-first word of `text`. */
function startsAWord(q: string, text: string): boolean {
  for (let i = 1; i < text.length; i++) {
    if (WORD_SEP.has(text[i - 1]) && text.startsWith(q, i)) { return true; }
  }
  return false;
}

/** True when the characters of `q` appear in `text` in order. */
function isSubsequence(q: string, text: string): boolean {
  let i = 0;
  for (let j = 0; j < text.length && i < q.length; j++) {
    if (text[j] === q[i]) { i++; }
  }
  return i === q.length;
}

/**
 * The house matcher. Tier -1 belongs to the assigned alias, on FULL
 * equality only (an alias is strict: `rw` answers `rw`, never `r` ·
 * the alias string joins no other tier). Tier 0 belongs to the label
 * alone; keywords join from tier 1 (a keyword prefix is a word-boundary
 * hit, never a label prefix). Case-insensitive throughout. `undefined`
 * = no match at any tier · the caller routes those to the fallbacks.
 * The empty query matches everything at tier 0 (the resting screen).
 */
export function matchTier(q: string, item: SearchItem): MatchTier | undefined {
  const qn = q.trim().toLowerCase();
  if (qn.length === 0) { return 0; }
  if (item.aliases !== undefined) {
    for (const a of item.aliases) {
      if (a.toLowerCase() === qn) { return -1; }
    }
  }
  const label = item.label.toLowerCase();
  if (label.startsWith(qn)) { return 0; }
  if (startsAWord(qn, label)) { return 1; }
  const keywords = item.keywords ?? [];
  for (const k of keywords) {
    const kn = k.toLowerCase();
    if (kn.startsWith(qn) || startsAWord(qn, kn)) { return 1; }
  }
  if (isSubsequence(qn, label)) { return 2; }
  for (const k of keywords) {
    if (isSubsequence(qn, k.toLowerCase())) { return 2; }
  }
  return undefined;
}

/**
 * The ranked list · lexicographic (tierMatch · -frecency · declOrder).
 * Frecency tie-breaks INSIDE a tier and never crosses one. The empty
 * query is the resting screen: every item, learned habits leading,
 * declaration order at parity (never-visited items keep the build
 * order). Non-matches drop; the gate shows fallbacks when nothing
 * survives.
 */
export function rankSearch(
  q: string,
  items: readonly SearchItem[],
  frec: FrecencyStore,
  nowMs: number,
): SearchItem[] {
  const habit = (it: SearchItem): number => {
    const e = frec[it.id];
    return e === undefined ? 0 : frecencyScore(e, nowMs);
  };
  const qn = q.trim().toLowerCase();
  if (qn.length === 0) {
    return [...items].sort((a, b) => habit(b) - habit(a) || a.declOrder - b.declOrder);
  }
  const ranked: Array<{ it: SearchItem; tier: MatchTier; f: number }> = [];
  for (const it of items) {
    const tier = matchTier(qn, it);
    if (tier === undefined) { continue; }
    ranked.push({ it, tier, f: habit(it) });
  }
  ranked.sort((a, b) => a.tier - b.tier || b.f - a.f || a.it.declOrder - b.it.declOrder);
  return ranked.map((r) => r.it);
}

/**
 * OSA Damerau-Levenshtein bounded to `max` (the graphIntel contract,
 * re-implemented here so the core stays import-free) · Infinity past
 * the bound. Adjacent transpositions count 1: the typo grammar.
 */
function damerau(a: string, b: string, max: number): number {
  if (a === b) { return 0; }
  if (Math.abs(a.length - b.length) > max) { return Infinity; }
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      row.push(v);
      if (v < rowMin) { rowMin = v; }
    }
    if (rowMin > max) { return Infinity; }
    prev2 = prev;
    prev = row;
  }
  return prev[b.length] <= max ? prev[b.length] : Infinity;
}

/** Closest id within distance 2 · exact hits skip (they match upstream) ·
 *  ties go lexical. Compared case-insensitively, returned verbatim. */
function closestId(q: string, ids: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestFolded = '';
  let bestDist = Infinity;
  for (const id of ids) {
    const folded = id.toLowerCase();
    if (folded === q) { continue; }
    const d = damerau(q, folded, 2);
    if (d < bestDist || (d === bestDist && best !== undefined && folded < bestFolded)) {
      best = id;
      bestFolded = folded;
      bestDist = d;
    }
  }
  return bestDist <= 2 ? best : undefined;
}

/** The wizard prefill: lowercase, runs of anything else become one dash. */
function slugify(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * The no-dead-ends rows, ranked (the annexe-AA order): did-you-mean
 * before create · generate (the pipeline, now CHOSEN, never a silent
 * mis-route) · new workflow with the slug prefilled · run history · the
 * native command palette. The query becomes the argument. NEVER empty:
 * generate and new ride every query; the other rows need one, and
 * did-you-mean also needs a close id from `ids`.
 */
export function fallbacksFor(q: string, ids: Iterable<string>): SearchItem[] {
  const qn = q.trim();
  const rows: SearchItem[] = [];
  const row = (id: string, label: string, command: string, args?: readonly unknown[]): void => {
    rows.push({
      id,
      family: 'command',
      label,
      declOrder: rows.length,
      run: args === undefined ? { command } : { command, args },
    });
  };
  if (qn.length === 0) {
    row('fallback.generate', 'Generate workflow', 'nika.generateWorkflow');
    row('fallback.new', 'New workflow', 'nika.newWorkflow');
    return rows;
  }
  const best = closestId(qn.toLowerCase(), ids);
  if (best !== undefined) {
    row('fallback.didYouMean', `Did you mean "${best}"?`, SEARCH_COMMAND, [best]);
  }
  row('fallback.generate', `Generate workflow "${qn}"`, 'nika.generateWorkflow', [qn]);
  const slug = slugify(qn);
  row('fallback.new', `New workflow "${qn}"`, 'nika.newWorkflow', slug.length > 0 ? [slug] : []);
  row('fallback.history', `Search run history for "${qn}"`, 'nika.runHistory', [qn]);
  row('fallback.vscode', `VS Code commands: ${qn}`, 'workbench.action.quickOpen', ['>' + qn]);
  return rows;
}

/**
 * Record one launch (immutable): count+1 · lastMs=now. A corrupt prior
 * entry heals to a fresh count of 1. Over the cap the weakest score is
 * evicted · never the id just visited: a visit always survives its own
 * write.
 */
export function visit(store: FrecencyStore, id: string, nowMs: number): FrecencyStore {
  const prior = store[id];
  const count = prior !== undefined && Number.isFinite(prior.count) && prior.count > 0
    ? prior.count + 1
    : 1;
  const next: FrecencyStore = { ...store, [id]: { count, lastMs: nowMs } };
  const keys = Object.keys(next);
  if (keys.length <= FRECENCY_CAP) { return next; }
  let weakest: string | undefined;
  let weakestScore = Infinity;
  for (const k of keys) {
    if (k === id) { continue; }
    const s = frecencyScore(next[k], nowMs);
    if (s < weakestScore) {
      weakest = k;
      weakestScore = s;
    }
  }
  if (weakest !== undefined) { delete next[weakest]; }
  return next;
}
