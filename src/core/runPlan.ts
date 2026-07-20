// runPlan.ts — the run pill's stale summary (dirty-nodes ↔ run).
//
// The per-card △ badges say WHICH tasks changed since their last run;
// the pill says HOW MANY, so a glance answers "is what I see what last
// ran?". Honest framing: a run re-executes the stale set (today the
// whole graph; a true partial run lands when the engine ships `--from`).
// Pure — the webview renders from this, the test pins the phrasing.

export interface StaleNode {
  stale?: boolean;
  /** stale purely because an upstream task changed (inherited). */
  staleUpstream?: boolean;
}

export interface RunPlanSummary {
  /** All stale tasks (direct edits + their downstream cone). */
  total: number;
  /** Tasks whose OWN substance changed (not merely inherited). */
  direct: number;
  /** Pill chip text — `△ N` — or empty when nothing is stale. */
  label: string;
  /** The honest tooltip (undefined when nothing is stale). */
  tooltip?: string;
}

export function runPlanSummary(
  nodes: readonly StaleNode[],
  opts?: { partialRun?: boolean },
): RunPlanSummary {
  let total = 0;
  let direct = 0;
  for (const n of nodes) {
    if (!n.stale) { continue; }
    total += 1;
    if (!n.staleUpstream) { direct += 1; }
  }
  if (total === 0) { return { total: 0, direct: 0, label: '' }; }

  const editedPhrase = direct === total
    ? `${direct} task${direct === 1 ? '' : 's'} edited since the last run`
    : `${direct} edited · ${total - direct} downstream`;
  // Two honest worlds: with `--resume` (ADR-099 · 0.93+) Δ re-runs only
  // the stale set (unchanged tasks cache-hit their recorded output);
  // without it, a run re-executes the whole graph.
  const runPhrase = opts?.partialRun === true
    ? `Δ re-runs ${total === 1 ? 'it' : 'them'} — unchanged tasks cache-hit their recorded output (engine --resume).`
    : `a run re-executes ${total === 1 ? 'it' : 'them'} (whole-graph on this binary; partial needs the 0.93+ engine).`;
  return {
    total,
    direct,
    label: `△ ${total}`,
    tooltip: `${editedPhrase} — ${runPhrase}`,
  };
}
