// runEta.ts — measured time-left for a LIVE run row (pure · provable).
//
// « Measured » is the law (annexe B #6): the estimate is the newest
// COMPLETED sibling run of the same workflow (majority task-id overlap,
// the house membership gate) minus the elapsed clock — never a model,
// never a guess. No matching prior run → no chip. A run past its
// prior's duration → no chip either (the measurement has nothing left
// to say; the row's live facts keep talking).

import type { RunModel } from './traceFold';

/**
 * Milliseconds left, measured against the newest completed sibling.
 * `siblings` must arrive newest-first (the Runs view's natural order).
 */
export function measuredEtaMs(
  running: RunModel,
  siblings: readonly RunModel[],
  nowMs: number,
): number | undefined {
  if (running.workflowStatus !== 'running') { return undefined; }
  if (running.startMs === undefined) { return undefined; }
  const ids = new Set(running.tasks.keys());
  if (ids.size === 0) { return undefined; }
  for (const s of siblings) {
    if (s === running) { continue; }
    if (s.workflowStatus !== 'completed') { continue; }
    if (s.startMs === undefined || s.endMs === undefined || s.endMs <= s.startMs) { continue; }
    const sids = [...s.tasks.keys()];
    if (sids.length === 0) { continue; }
    const overlap = sids.filter((id) => ids.has(id)).length / sids.length;
    if (overlap < 0.6) { continue; }
    const prior = s.endMs - s.startMs;
    const elapsed = nowMs - running.startMs;
    const left = prior - elapsed;
    return left > 0 ? left : undefined;
  }
  return undefined;
}

/** `~12s` / `~2.5m` — the chip's compact clock. */
export function formatEta(ms: number): string {
  if (ms < 60_000) { return `~${Math.max(1, Math.round(ms / 1000))}s`; }
  return `~${(ms / 60_000).toFixed(1).replace(/\.0$/, '')}m`;
}
