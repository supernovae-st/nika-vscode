// traceTimeline.ts — fold → normalized scrub timeline (pure · no vscode).
//
// The platine model: a recorded run normalized onto p ∈ [0, 1] so a
// transport (play/pause/scrub) can ask « what did the DAG look like at
// instant p? » and paint the answer through the SAME visual path as a
// live run. Everything here is a pure function of the fold — scrubbing
// backward replays the run in reverse for free and nothing accumulates.
//
// HONESTY (the site's morph-model law, kept): the engine flushes
// task_started/task_completed together at settlement, so a task's REAL
// running interval is [endMs − durationMs, endMs] — `duration_ms` is the
// authoritative clock-derived fact; ts-derived spans lie for tasks that
// ran before their settle slot. Only PACING (the transport's play
// budget) compresses the recorded clock; every displayed duration and
// status is the recorded fact.

import type { FoldedStatus, RunModel } from './traceFold';

/** One task projected onto the normalized run window. */
export interface TimelineTask {
  id: string;
  /** Running onset as a fraction of the run window. */
  startFrac: number;
  /** Settlement instant as a fraction (== startFrac for skip/cancel-at-instant). */
  endFrac: number;
  /** The task's FINAL folded status — what p ≥ endFrac displays. */
  status: FoldedStatus;
  /** Authoritative recorded duration (terminal tasks — badge fact). */
  durationMs?: number;
  /** ADR-099 — the settle was a cache-hit rehydration, not a run. */
  cached?: boolean;
}

export interface TraceTimeline {
  /** Real recorded span of the run window (ms). */
  totalMs: number;
  tasks: TimelineTask[];
  /** Visual tick positions — the running onsets of tasks that STARTED. */
  ticks: number[];
  /** Sorted unique state-change boundaries incl. 0 and 1 — snap targets. */
  events: number[];
}

/** The state the DAG paints for one task at an instant p. */
export interface TaskStateAt {
  status: FoldedStatus;
  durationMs?: number;
  /** ADR-099 — the settled state shown is a cache-hit rehydration. */
  cached?: boolean;
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const TERMINAL: ReadonlySet<FoldedStatus> = new Set([
  'success', 'failed', 'skipped', 'cancelled',
]);

/**
 * Normalize a folded run onto p ∈ [0, 1]. Returns undefined when the
 * trace carries no usable real clock (no timestamps, or a zero-width
 * span) — the caller then paints final states directly, no transport.
 */
export function buildTraceTimeline(model: RunModel): TraceTimeline | undefined {
  const t0 = model.startMs;
  const t1 = model.endMs;
  if (t0 === undefined || t1 === undefined || t1 <= t0) { return undefined; }
  const totalMs = t1 - t0;

  const tasks: TimelineTask[] = [];
  const ticks = new Set<number>();
  const events = new Set<number>([0, 1]);

  for (const task of model.tasks.values()) {
    // Never moved (scheduled only): parked at 1 — pending at every p.
    if (task.startMs === undefined && task.endMs === undefined) {
      tasks.push({ id: task.id, startFrac: 1, endFrac: 1, status: task.status });
      continue;
    }

    const terminal = TERMINAL.has(task.status);
    // A task still running/retrying when the trace ends settles nowhere:
    // its interval extends to the end of the recorded window.
    const endAbs = task.endMs ?? t1;
    // Authoritative interval start (see module doc); fall back to the
    // recorded task_started clock, then to a zero-width instant.
    const startAbs = terminal && task.durationMs !== undefined
      ? Math.max(t0, endAbs - task.durationMs)
      : task.startMs ?? endAbs;

    const startFrac = clamp01((startAbs - t0) / totalMs);
    const endFrac = Math.max(startFrac, clamp01((endAbs - t0) / totalMs));

    tasks.push({
      id: task.id,
      startFrac,
      endFrac,
      status: task.status,
      durationMs: task.durationMs,
      cached: task.cached,
    });
    // Ticks mark REAL running onsets — a task that never started
    // (skipped/cancelled while pending) leaves no tick.
    if (task.startMs !== undefined) { ticks.add(startFrac); }
    events.add(startFrac);
    events.add(endFrac);
  }

  return {
    totalMs,
    tasks,
    ticks: [...ticks].sort((a, b) => a - b),
    events: [...events].sort((a, b) => a - b),
  };
}

/**
 * The whole DAG state at instant p — the morph-model contract:
 * before startFrac → pending · inside the interval → running · at/after
 * endFrac → the task's FINAL folded status (duration attached so the
 * node badge shows the recorded fact). p ≤ 0 is « before the run »:
 * everything pending, whatever the intervals say.
 */
export function statesAt(tl: TraceTimeline, p: number): Map<string, TaskStateAt> {
  const cp = clamp01(p);
  const out = new Map<string, TaskStateAt>();
  for (const t of tl.tasks) {
    if (cp > 0 && cp >= t.endFrac) {
      out.set(t.id, { status: t.status, durationMs: t.durationMs, cached: t.cached });
    } else if (cp > 0 && cp >= t.startFrac) {
      out.set(t.id, { status: 'running' });
    } else {
      out.set(t.id, { status: 'pending' });
    }
  }
  return out;
}

const SNAP_EPS = 1e-6;

/** Next state-change boundary strictly after p (1 when none). */
export function snapNext(events: readonly number[], p: number): number {
  for (const e of events) {
    if (e > p + SNAP_EPS) { return e; }
  }
  return 1;
}

/** Previous state-change boundary strictly before p (0 when none). */
export function snapPrev(events: readonly number[], p: number): number {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i] < p - SNAP_EPS) { return events[i]; }
  }
  return 0;
}

/**
 * Transport clock readout — `0:03.2` (m:ss.tenth). Sub-second runs
 * (ms-scale mock traces) read in raw milliseconds (`4ms`) so the
 * readout stays a fact instead of a row of zeros; the SCALE decides,
 * so both sides of a `cur / total` pair format alike.
 */
export function formatClock(ms: number, scaleMs: number): string {
  if (scaleMs < 1000) { return `${Math.round(ms)}ms`; }
  const tenths = Math.floor(ms / 100);
  const m = Math.floor(tenths / 600);
  const ss = Math.floor((tenths % 600) / 10);
  const t = tenths % 10;
  return `${m}:${String(ss).padStart(2, '0')}.${t}`;
}
