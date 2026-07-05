// costForecast.ts — the run pill's cost chip (forecasting on the wire).
//
// `nika check` prices the workflow STATICALLY: with `max_tokens` declared
// it computes a real per-task ceiling; without it the task is unbounded.
// This turns that into a one-glance forecast beside the Run button —
// audited before a token is spent — and it is HONEST about the unbounded
// case: an uncapped task makes the total a FLOOR (`≥`), never a ceiling.
// Pure — the webview renders it, the test pins every case.

import type { CostCeiling } from './cliContract';

export interface CostForecast {
  /** Chip text: `$X` · `$min–$max` · `≥ $X` · `unbounded`. */
  label: string;
  /** The honest tooltip. */
  tooltip: string;
  /** True when the number is a floor, not a ceiling (uncapped tasks). */
  unbounded: boolean;
}

function usd(n: number): string {
  return `$${n.toFixed(n < 0.1 ? 4 : 2)}`;
}

/**
 * A forecast chip, or undefined when there is nothing to forecast (no
 * priced LLM work — a mock/echo or exec-only workflow). Cases:
 *   bounded, >0        → `$min–$max` (or `$X` when equal) · a true ceiling
 *   unbounded, floor>0 → `≥ $X` · N uncapped task(s), real cost open-ended
 *   unbounded, floor 0 → `unbounded` · nothing priced yet, add max_tokens
 */
export function costForecast(cost: CostCeiling | undefined): CostForecast | undefined {
  if (!cost) { return undefined; }
  const bounded = cost.bounded_total_usd ?? 0;
  const minPath = cost.min_path_total_usd ?? bounded;
  const unbounded = cost.has_unbounded === true;
  // A real report can omit `tasks` (unbounded-only) despite the type —
  // guard rather than trust, this is called in a listener with no catch.
  const tasks = Array.isArray(cost.tasks) ? cost.tasks : [];
  const uncapped = tasks.filter((t) => t.usd === null || t.usd === undefined).length;

  if (!unbounded) {
    if (bounded <= 0) { return undefined; } // no priced work — no chip
    const label = usd(minPath) === usd(bounded) ? usd(bounded) : `${usd(minPath)}–${usd(bounded)}`;
    return {
      label,
      unbounded: false,
      tooltip: `Static cost ceiling (min path → worst case) — audited before a single token is spent.`,
    };
  }

  // Unbounded: the priced part is only a FLOOR.
  const capsHint = `${uncapped} task${uncapped === 1 ? '' : 's'} without \`max_tokens\` — add token limits to bound the forecast.`;
  if (bounded <= 0) {
    return { label: 'unbounded', unbounded: true, tooltip: `Cost can't be forecast: ${capsHint}` };
  }
  return {
    label: `≥ ${usd(bounded)}`,
    unbounded: true,
    tooltip: `At least ${usd(bounded)} from the priced tasks — the real cost is open-ended: ${capsHint}`,
  };
}
