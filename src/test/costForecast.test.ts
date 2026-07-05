import { describe, expect, it } from 'vitest';
import { costForecast } from '../core/costForecast';
import type { CostCeiling, TaskCost } from '../core/cliContract';

const t = (task: string, usd: number | null): TaskCost => ({ task, usd });

const cost = (over: Partial<CostCeiling>): CostCeiling => ({
  tasks: [], bounded_total_usd: 0, min_path_total_usd: 0, has_unbounded: false, ...over,
});

describe('costForecast (the run pill cost chip)', () => {
  it('undefined when there is no priced work (mock/echo · exec-only)', () => {
    expect(costForecast(undefined)).toBeUndefined();
    expect(costForecast(cost({ tasks: [t('a', 0)], bounded_total_usd: 0 }))).toBeUndefined();
  });

  it('a bounded workflow shows the ceiling (interval or single)', () => {
    const single = costForecast(cost({
      bounded_total_usd: 0.0375, min_path_total_usd: 0.0375,
      tasks: [t('g', 0.0075), t('e', 0.03)],
    }));
    expect(single?.label).toBe('$0.0375');
    expect(single?.unbounded).toBe(false);
    expect(single?.tooltip).toContain('audited before');

    const interval = costForecast(cost({ bounded_total_usd: 0.08, min_path_total_usd: 0.04, tasks: [t('a', 0.04)] }));
    expect(interval?.label).toBe('$0.0400–$0.0800');
  });

  it('an uncapped task makes the total a FLOOR (≥), never a ceiling', () => {
    const f = costForecast(cost({
      has_unbounded: true, bounded_total_usd: 0.02, min_path_total_usd: 0.02,
      tasks: [t('priced', 0.02), t('open', null)],
    }));
    expect(f?.label).toBe('≥ $0.0200');
    expect(f?.unbounded).toBe(true);
    expect(f?.tooltip).toContain('1 task without `max_tokens`');
    expect(f?.tooltip).toContain('open-ended');
  });

  it('all-uncapped reads "unbounded" with the fix hint', () => {
    const f = costForecast(cost({
      has_unbounded: true, bounded_total_usd: 0,
      tasks: [t('a', null), t('b', null)],
    }));
    expect(f?.label).toBe('unbounded');
    expect(f?.unbounded).toBe(true);
    expect(f?.tooltip).toContain('2 tasks without `max_tokens`');
  });

  it('formats sub-10-cent with 4 decimals, larger with 2', () => {
    expect(costForecast(cost({ bounded_total_usd: 0.0075, min_path_total_usd: 0.0075, tasks: [t('a', 0.0075)] }))?.label).toBe('$0.0075');
    expect(costForecast(cost({ bounded_total_usd: 1.5, min_path_total_usd: 1.5, tasks: [t('a', 1.5)] }))?.label).toBe('$1.50');
  });
});
