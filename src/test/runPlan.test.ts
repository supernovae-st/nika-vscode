import { describe, expect, it } from 'vitest';
import { runPlanSummary } from '../core/runPlan';

describe('runPlanSummary (the run pill stale chip)', () => {
  it('is empty when nothing is stale', () => {
    const s = runPlanSummary([{}, {}, {}]);
    expect(s).toEqual({ total: 0, direct: 0, label: '' });
  });

  it('counts total (direct + downstream) and labels △ N', () => {
    const s = runPlanSummary([
      { stale: true },                          // direct
      { stale: true, staleUpstream: true },     // inherited
      { stale: true, staleUpstream: true },     // inherited
      {},                                       // clean
    ]);
    expect(s.total).toBe(3);
    expect(s.direct).toBe(1);
    expect(s.label).toBe('△ 3');
  });

  it('phrases all-direct vs mixed differently', () => {
    expect(runPlanSummary([{ stale: true }, { stale: true }]).tooltip)
      .toContain('2 tasks edited since the last run');
    expect(runPlanSummary([{ stale: true }, { stale: true, staleUpstream: true }]).tooltip)
      .toContain('1 edited · 1 downstream');
  });

  it('pluralizes the singular case and the "it/them" verb', () => {
    const one = runPlanSummary([{ stale: true }]);
    expect(one.label).toBe('△ 1');
    expect(one.tooltip).toContain('1 task edited');
    expect(one.tooltip).toContain('re-executes it');
    expect(runPlanSummary([{ stale: true }, { stale: true }]).tooltip).toContain('re-executes them');
  });

  it('names the honest partial-run limit (--from)', () => {
    expect(runPlanSummary([{ stale: true }]).tooltip).toContain('--from');
  });
});
