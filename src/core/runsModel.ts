// runsModel.ts — the Runs view's grouping brain (pure · zero vscode).
//
// The flight recorder answers ONE question per section (the Station's
// IA law): « is something on me right now? » (Now) · « what happened
// today / yesterday / before? » (calendar). The pin: a running or
// paused run is NOW whatever its mtime says — and paused outranks
// running, because needs-you outranks working. Sections are answers:
// an empty one hides, and a lone calendar section dissolves back to
// the flat list (a single answer needs no headline).
//
// Every decision here is a pure function of (facts · clock) — the view
// renders dumbly; the clock is injected so midnight is provable.

/** The fold's workflow verdict, verbatim (core/traceFold). */
export type RunStatus =
  | 'unknown' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

export interface RunRowFacts {
  fsPath: string;
  mtimeMs: number;
  status: RunStatus;
}

export type RunBucket = 'now' | 'today' | 'yesterday' | 'earlier';

/** Local-calendar day floor (never minus-86400000 — DST days are not
 *  24h long; the calendar owns the boundary). */
function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfPreviousLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d.getTime();
}

/**
 * The total partition: every fact lands in exactly ONE bucket.
 * running|paused pin to `now` WHATEVER the mtime (a paused run from
 * last week still waits on you); everything else (unknown included)
 * is calendar — a future mtime is `today` (clock skew is a fact, not
 * a crash), zero/negative epochs are `earlier`.
 */
export function bucketOf(f: RunRowFacts, nowMs: number): RunBucket {
  if (f.status === 'paused' || f.status === 'running') { return 'now'; }
  const today = startOfLocalDay(nowMs);
  if (f.mtimeMs >= today) { return 'today'; }
  if (f.mtimeMs >= startOfPreviousLocalDay(nowMs)) { return 'yesterday'; }
  return 'earlier';
}

export interface RunSection {
  bucket: RunBucket;
  /** Stable — expansion state survives refreshes. */
  id: string;
  /** `Now — 2` (the house section grammar). */
  label: string;
  facts: RunRowFacts[];
}

const BUCKET_ORDER: readonly RunBucket[] = ['now', 'today', 'yesterday', 'earlier'];
const BUCKET_TITLE: Record<RunBucket, string> = {
  now: 'Now',
  today: 'Today',
  yesterday: 'Yesterday',
  earlier: 'Earlier',
};

/**
 * Group facts into ordered sections (Now · Today · Yesterday ·
 * Earlier). Empty sections hide. A Now section, when non-empty,
 * ALWAYS keeps its header (the pin needs its name); when the only
 * non-empty section is a calendar one, sections dissolve — `[]`
 * tells the view to render flat.
 *
 * Ordering inside a section is newest-first; inside Now the paused
 * block leads (needs-you outranks working), newest-first within each.
 */
export function groupRuns(facts: RunRowFacts[], nowMs: number): RunSection[] {
  const byBucket: Record<RunBucket, RunRowFacts[]> = {
    now: [], today: [], yesterday: [], earlier: [],
  };
  for (const f of facts) { byBucket[bucketOf(f, nowMs)].push(f); }

  const newestFirst = (a: RunRowFacts, b: RunRowFacts): number => b.mtimeMs - a.mtimeMs;
  byBucket.today.sort(newestFirst);
  byBucket.yesterday.sort(newestFirst);
  byBucket.earlier.sort(newestFirst);
  byBucket.now.sort((a, b) => {
    const rank = (s: RunStatus): number => (s === 'paused' ? 0 : 1);
    return rank(a.status) - rank(b.status) || b.mtimeMs - a.mtimeMs;
  });

  const nonEmpty = BUCKET_ORDER.filter((b) => byBucket[b].length > 0);
  if (nonEmpty.length === 0) { return []; }
  if (nonEmpty.length === 1 && nonEmpty[0] !== 'now') { return []; }
  return nonEmpty.map((b) => ({
    bucket: b,
    id: `runs.section.${b}`,
    label: `${BUCKET_TITLE[b]} — ${byBucket[b].length}`,
    facts: byBucket[b],
  }));
}

/** Local-calendar distance in words — today · yesterday · `Nd ago`
 *  (the one age vocabulary: Runs rows, History cells, the detail page
 *  all speak it). Future mtimes read `today`: clock skew is a fact,
 *  not a crash. Math.round absorbs the ±1h a DST boundary puts
 *  between two local day floors. */
export function relativeDay(ms: number, nowMs: number): string {
  const days = Math.round((startOfLocalDay(nowMs) - startOfLocalDay(ms)) / 86_400_000);
  if (days <= 0) { return 'today'; }
  if (days === 1) { return 'yesterday'; }
  return `${days}d ago`;
}

/**
 * The uniform run-row accessory law (DESIGN.md §7e): every run row's
 * description reads the SAME three columns in Runs and History —
 * status glyph first (the summary leads with it), duration inside the
 * summary, AGE closes. Extras (live chips) trail after the age. One
 * composer, so the two trees cannot drift apart.
 */
export function runRowDescription(
  summary: string,
  mtimeMs: number,
  nowMs: number,
  extras: readonly string[] = [],
): string {
  return [summary, relativeDay(mtimeMs, nowMs), ...extras].join(' · ');
}

/** The unreadable story, verbatim from the existing toast — one
 *  vocabulary across surfaces (a row and a toast never disagree). */
export const UNREADABLE_DESCRIPTION =
  'truncated (a killed run) or from another engine generation';

/** The trailing section for journals the scan could not read — the
 *  catch COUNTS instead of swallowing. Absent at zero: an empty
 *  Unreadable section would be noise, not honesty. */
export function unreadableSection(count: number): { id: string; label: string } | undefined {
  return count > 0
    ? { id: 'runs.section.unreadable', label: `Unreadable — ${count}` }
    : undefined;
}
