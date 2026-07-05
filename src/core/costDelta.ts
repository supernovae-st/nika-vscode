// costDelta.ts — the cost chip's DELTA lens (pure · no vscode).
//
// The Infracost lesson: at review time the signal is the CHANGE, not the
// total — "+$0.02 vs last commit" reads instantly where "$0.07" needs the
// reader to remember yesterday's number. This compares the live check's
// cost ceiling against the SAME ceiling computed for the file's git-HEAD
// content, and only speaks when it has something honest to say:
//   · either side unbounded → silent (a floor vs a ceiling is not a delta)
//   · no baseline (untracked · no repo · HEAD didn't check) → silent
//   · sub-dust movement → silent (rounding, not information)

import type { CostCeiling } from './cliContract';

/** The HEAD-version ceiling, resolved once per (file, HEAD sha). */
export interface CostBaseline {
  /** Bounded ceiling of the HEAD content — undefined when HEAD had no
   *  priced work (delta then reads as growth from $0). */
  usd?: number;
  /** HEAD's ceiling was a floor (uncapped task) — deltas are refused. */
  unbounded: boolean;
}

export interface CostDelta {
  /** Chip suffix: `Δ +$0.02` · `Δ −$0.01`. */
  label: string;
  /** The honest sentence: what moved, from what, to what. */
  tooltip: string;
  /** The ceiling went UP (the review-attention case). */
  up: boolean;
}

/** Movements under half a display unit ($0.0001 renders) are dust. */
const DUST_USD = 0.00005;

function usd(n: number): string {
  if (n === 0) { return '$0.00'; } // `$0.0000` is dust theatre
  return `$${n.toFixed(n < 0.1 ? 4 : 2)}`;
}

/**
 * The delta between the live ceiling and the HEAD baseline, or undefined
 * when silence is the honest rendering. `current` is the live check's
 * `cost` block; `baseline` comes from checking the HEAD content.
 */
export function costDelta(
  current: CostCeiling | undefined,
  baseline: CostBaseline | undefined,
): CostDelta | undefined {
  if (!current || !baseline) { return undefined; }
  // A floor on either side makes subtraction a lie, not a signal.
  if (current.has_unbounded === true || baseline.unbounded) { return undefined; }
  const now = current.bounded_total_usd ?? 0;
  const then = baseline.usd ?? 0;
  const delta = now - then;
  if (Math.abs(delta) < DUST_USD) { return undefined; }
  const up = delta > 0;
  const sign = up ? '+' : '−';
  const label = `Δ ${sign}${usd(Math.abs(delta))}`;
  return {
    label,
    up,
    tooltip: `Cost ceiling ${up ? 'up' : 'down'} ${usd(Math.abs(delta))} vs the last commit (${usd(then)} → ${usd(now)}).`,
  };
}
