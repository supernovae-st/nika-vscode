// runDiff.ts — compare two folded runs of the same workflow (pure · the
// core layer stays vitest-testable).
//
// Answers « why is this run 3× slower » in one glance: per-task delta of
// duration, spend and terminal status between a BASE run and a COMPARE
// run. The webview paints the verdicts on the DAG (diff:load); the feed
// narrates the top movers. Facts only — both sides come from recorded
// traces through the ONE tested fold (never fabricated · canvas law 6).

import type { RunModel } from './traceFold';

/** One task's movement between the two runs. */
export interface TaskDiff {
  id: string;
  /** The paint verdict — one class per node on the canvas. */
  kind: 'faster' | 'slower' | 'same' | 'added' | 'removed' | 'status-changed';
  baseMs?: number;
  compareMs?: number;
  deltaMs?: number;
  /** Signed percent vs base (+ = slower) — undefined when base has no duration. */
  deltaPct?: number;
  deltaUsd?: number;
  statusFrom?: string;
  statusTo?: string;
}

export interface RunDiff {
  /** Every task seen on either side, sorted by |impact| (movers first). */
  tasks: TaskDiff[];
  totalBaseMs?: number;
  totalCompareMs?: number;
  totalDeltaUsd?: number;
  counts: { faster: number; slower: number; same: number; added: number; removed: number; statusChanged: number };
}

// Below BOTH thresholds a duration move is noise, not a story: mock runs
// jitter by a few ms and real providers by a few percent.
const SAME_PCT = 5;
const SAME_MS = 50;

export function diffRuns(base: RunModel, compare: RunModel): RunDiff {
  const ids = new Set<string>([...base.tasks.keys(), ...compare.tasks.keys()]);
  const tasks: TaskDiff[] = [];

  for (const id of ids) {
    const b = base.tasks.get(id);
    const c = compare.tasks.get(id);
    if (!b) {
      tasks.push({ id, kind: 'added', compareMs: c?.durationMs, statusTo: c?.status });
      continue;
    }
    if (!c) {
      tasks.push({ id, kind: 'removed', baseMs: b.durationMs, statusFrom: b.status });
      continue;
    }
    const entry: TaskDiff = {
      id,
      kind: 'same',
      baseMs: b.durationMs,
      compareMs: c.durationMs,
      statusFrom: b.status,
      statusTo: c.status,
    };
    if (b.usd !== undefined || c.usd !== undefined) {
      entry.deltaUsd = (c.usd ?? 0) - (b.usd ?? 0);
    }
    if (b.status !== c.status) {
      // A status flip outranks any timing story (failed→success IS the news).
      entry.kind = 'status-changed';
    } else if (b.durationMs !== undefined && c.durationMs !== undefined) {
      entry.deltaMs = c.durationMs - b.durationMs;
      entry.deltaPct = b.durationMs > 0 ? (entry.deltaMs / b.durationMs) * 100 : undefined;
      const meaningful =
        Math.abs(entry.deltaMs) >= SAME_MS &&
        (entry.deltaPct === undefined || Math.abs(entry.deltaPct) >= SAME_PCT);
      if (meaningful) {
        entry.kind = entry.deltaMs > 0 ? 'slower' : 'faster';
      }
    }
    tasks.push(entry);
  }

  // Movers first: status flips, then by |delta| (pct when known, ms
  // otherwise), then adds/removes, stable by id for determinism.
  const rank = (t: TaskDiff): number => {
    switch (t.kind) {
      case 'status-changed': return 3;
      case 'slower':
      case 'faster': return 2;
      case 'added':
      case 'removed': return 1;
      default: return 0;
    }
  };
  const impact = (t: TaskDiff): number =>
    Math.abs(t.deltaPct ?? (t.deltaMs !== undefined ? t.deltaMs / 10 : 0));
  tasks.sort((a, b) =>
    rank(b) - rank(a) || impact(b) - impact(a) || a.id.localeCompare(b.id));

  const durationOf = (m: RunModel): number | undefined =>
    m.startMs !== undefined && m.endMs !== undefined ? m.endMs - m.startMs : undefined;

  const counts = { faster: 0, slower: 0, same: 0, added: 0, removed: 0, statusChanged: 0 };
  for (const t of tasks) {
    if (t.kind === 'status-changed') { counts.statusChanged++; }
    else { counts[t.kind]++; }
  }

  const totalDeltaUsd =
    base.totalUsd !== undefined || compare.totalUsd !== undefined
      ? (compare.totalUsd ?? 0) - (base.totalUsd ?? 0)
      : undefined;

  return {
    tasks,
    totalBaseMs: durationOf(base),
    totalCompareMs: durationOf(compare),
    totalDeltaUsd,
    counts,
  };
}

/** Compact human line for the feed — « 2 slower · 1 faster · Δ +3.2s ». */
export function summarizeDiff(diff: RunDiff): string {
  const parts: string[] = [];
  if (diff.counts.statusChanged) { parts.push(`${diff.counts.statusChanged} status`); }
  if (diff.counts.slower) { parts.push(`${diff.counts.slower} slower`); }
  if (diff.counts.faster) { parts.push(`${diff.counts.faster} faster`); }
  if (diff.counts.added) { parts.push(`${diff.counts.added} added`); }
  if (diff.counts.removed) { parts.push(`${diff.counts.removed} removed`); }
  if (parts.length === 0) { parts.push('no movement'); }
  if (diff.totalBaseMs !== undefined && diff.totalCompareMs !== undefined) {
    const d = diff.totalCompareMs - diff.totalBaseMs;
    const sign = d > 0 ? '+' : '';
    parts.push(`Δ ${sign}${(d / 1000).toFixed(1)}s`);
  }
  return parts.join(' · ');
}
