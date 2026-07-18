// timelineModel.test.ts — the timeline lens's pure model (annexe G laws).
//
// The Gantt is engine truth only: rows come from the fold's REAL
// clocks (startMs/endMs — synthetic-clock tasks earn no bar), retries
// stack as sub-segments on the SAME row, a cache hit is a hollow
// no-time mark, the $ column is blank when nothing was spent (never
// $0.00), and the run's own span derives from the rows it actually
// has. Pure: provable without a webview.

import { describe, it, expect } from 'vitest';
import { buildTimeline, formatUsd } from '../core/timelineModel';
import type { RunModel, FoldedTask } from '../core/traceFold';

function task(partial: Partial<FoldedTask> & { id: string }): FoldedTask {
  return { status: 'success', retries: 0, ...partial } as FoldedTask;
}

function model(tasks: FoldedTask[]): RunModel {
  const map = new Map(tasks.map((t) => [t.id, t]));
  return {
    tasks: map,
    workflowStatus: 'completed',
    startMs: 1000,
    endMs: 9000,
  } as unknown as RunModel;
}

describe('buildTimeline — rows from real clocks only', () => {
  it('a settled task with clocks earns a bar; a clockless one earns a row without a bar', () => {
    const tl = buildTimeline(
      model([
        task({ id: 'a', startMs: 1000, endMs: 3000, durationMs: 2000, usd: 0.004 }),
        task({ id: 'b', status: 'skipped' }),
      ]),
      new Map(),
      [['a'], ['b']],
    );
    expect(tl.rows).toHaveLength(2);
    expect(tl.rows[0].bar).toEqual({ startMs: 1000, endMs: 3000 });
    expect(tl.rows[1].bar).toBeUndefined();
    expect(tl.spanMs).toBe(8000);
  });

  it('rows follow wave order — the plan grammar, not the map order', () => {
    const tl = buildTimeline(
      model([
        task({ id: 'z', startMs: 1000, endMs: 2000 }),
        task({ id: 'a', startMs: 2000, endMs: 3000 }),
      ]),
      new Map(),
      [['z'], ['a']],
    );
    expect(tl.rows.map((r) => r.id)).toEqual(['z', 'a']);
    // A task the waves do not know still lands (last, never dropped).
    const tl2 = buildTimeline(
      model([task({ id: 'ghost', startMs: 1000, endMs: 2000 })]),
      new Map(),
      [],
    );
    expect(tl2.rows.map((r) => r.id)).toEqual(['ghost']);
  });

  it('retries stack as sub-segments on the SAME row (attempt 1 faded, final solid)', () => {
    const tl = buildTimeline(
      model([task({ id: 'flaky', startMs: 1000, endMs: 5000, retries: 2 })]),
      new Map([
        ['flaky', [
          { n: 1, outcome: 'retried' as const, atMs: 2000 },
          { n: 2, outcome: 'retried' as const, atMs: 3500 },
          { n: 3, outcome: 'success' as const, atMs: 5000 },
        ]],
      ]),
      [['flaky']],
    );
    const segs = tl.rows[0].segments;
    expect(segs).toHaveLength(3);
    expect(segs[0]).toMatchObject({ startMs: 1000, endMs: 2000, final: false });
    expect(segs[1]).toMatchObject({ startMs: 2000, endMs: 3500, final: false });
    expect(segs[2]).toMatchObject({ startMs: 3500, endMs: 5000, final: true });
  });

  it('a cache hit is a hollow mark — no time was spent, no bar lies', () => {
    const tl = buildTimeline(
      model([task({ id: 'c', cached: true })]),
      new Map(),
      [['c']],
    );
    expect(tl.rows[0].cached).toBe(true);
    expect(tl.rows[0].bar).toBeUndefined();
  });

  it('the paused task carries its question as the row marker', () => {
    const m = model([task({ id: 'ask', status: 'running', startMs: 4000 })]);
    (m as { paused?: unknown }).paused = { task: 'ask', mode: 'confirm', message: 'overwrite?' };
    const tl = buildTimeline(m, new Map(), [['ask']]);
    expect(tl.rows[0].pausedQuestion).toBe('overwrite?');
  });
});

describe('formatUsd — the one cost grammar (blank beats a fake zero)', () => {
  it('spent renders recorded; nothing renders EMPTY (never $0.00)', () => {
    expect(formatUsd(0.0042)).toBe('$0.0042');
    expect(formatUsd(1.5)).toBe('$1.5');
    expect(formatUsd(0)).toBe('');
    expect(formatUsd(undefined)).toBe('');
  });
});
