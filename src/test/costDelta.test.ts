// costDelta.test.ts — the delta speaks ONLY when subtraction is honest:
// bounded on both sides, above rounding dust, baseline actually known.

import { describe, it, expect } from 'vitest';
import { costDelta } from '../core/costDelta';
import type { CostCeiling } from '../core/cliContract';

const bounded = (usd: number): CostCeiling => ({ tasks: [], bounded_total_usd: usd });

describe('costDelta (the Infracost lesson — the change is the signal)', () => {
  it('reports growth with the from→to story', () => {
    const d = costDelta(bounded(0.07), { usd: 0.05, unbounded: false });
    expect(d).toMatchObject({ label: 'Δ +$0.0200', up: true });
    expect(d?.tooltip).toContain('$0.0500 → $0.0700');
    expect(d?.tooltip).toContain('vs the last commit');
  });

  it('reports shrinkage with a minus sign, not celebration amber', () => {
    const d = costDelta(bounded(0.03), { usd: 0.05, unbounded: false });
    expect(d).toMatchObject({ label: 'Δ −$0.0200', up: false });
  });

  it('a workflow priced from nothing reads as growth from $0', () => {
    const d = costDelta(bounded(0.12), { usd: undefined, unbounded: false });
    expect(d).toMatchObject({ up: true });
    expect(d?.tooltip).toContain('$0.00 → $0.12');
  });

  it('stays silent on rounding dust', () => {
    expect(costDelta(bounded(0.05000004), { usd: 0.05, unbounded: false })).toBeUndefined();
    expect(costDelta(bounded(0.05), { usd: 0.05, unbounded: false })).toBeUndefined();
  });

  it('refuses to subtract floors — unbounded on either side is silence', () => {
    const unboundedNow: CostCeiling = { tasks: [], bounded_total_usd: 0.05, has_unbounded: true };
    expect(costDelta(unboundedNow, { usd: 0.02, unbounded: false })).toBeUndefined();
    expect(costDelta(bounded(0.05), { usd: 0.02, unbounded: true })).toBeUndefined();
  });

  it('no baseline (untracked · no repo) or no cost block → silence', () => {
    expect(costDelta(bounded(0.05), undefined)).toBeUndefined();
    expect(costDelta(undefined, { usd: 0.05, unbounded: false })).toBeUndefined();
  });
});
