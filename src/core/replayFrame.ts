// replayFrame.ts — the scrubber's heart: the DAG state at an instant.
//
// A recorded run is an ordered timeline of task transitions. Time-travel
// (LangGraph Studio pattern) means answering, for any scrub position T:
// what was each task's status THEN? The last transition at-or-before T
// wins per task; a task with no transition yet is pending. Pure — the
// webview scrubs at 60fps against this with zero round-trips, and the
// extension tests pin it.

import type { TimelineEntry, FoldedStatus } from './traceFold';

export interface FrameEntry {
  taskId: string;
  status: FoldedStatus;
  durationMs?: number;
  /** ADR-099 — the status at this instant is a cache-hit rehydration. */
  cached?: boolean;
}

/**
 * Every task's status at instant `atMs` given the ordered `timeline`.
 * `allIds` seeds tasks that have no transition yet as `pending` (so the
 * frame is COMPLETE — scrubbing back to t0 resets the whole graph, not
 * just the tasks that happen to appear early in the timeline).
 */
export function frameAt(
  timeline: readonly TimelineEntry[],
  atMs: number,
  allIds: readonly string[],
): FrameEntry[] {
  const state = new Map<string, { status: FoldedStatus; durationMs?: number; cached?: boolean }>();
  for (const id of allIds) { state.set(id, { status: 'pending' }); }
  // Timeline is time-ordered; the last entry ≤ atMs wins per task.
  for (const e of timeline) {
    if (e.atMs > atMs) { break; }
    state.set(e.taskId, { status: e.status, durationMs: e.durationMs, cached: e.cached });
  }
  return [...state].map(([taskId, s]) => ({ taskId, status: s.status, durationMs: s.durationMs, cached: s.cached }));
}

/** The scrubber track bounds — [firstMs, lastMs] over the timeline. */
export function timelineBounds(timeline: readonly TimelineEntry[]): { startMs: number; endMs: number } {
  if (timeline.length === 0) { return { startMs: 0, endMs: 0 }; }
  return { startMs: timeline[0].atMs, endMs: timeline[timeline.length - 1].atMs };
}
