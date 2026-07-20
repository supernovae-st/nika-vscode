// runEta.test.ts — measured time-left, never a guess (annexe B #6).

import { describe, it, expect } from 'vitest';
import { formatEta, measuredEtaMs } from '../core/runEta';
import type { RunModel } from '../core/traceFold';

function model(partial: Partial<RunModel> & { ids?: string[] }): RunModel {
  const tasks = new Map<string, never>();
  for (const id of partial.ids ?? []) { tasks.set(id, {} as never); }
  return {
    workflowStatus: 'completed',
    tasks,
    timeline: [],
    unknownLines: 0,
    ...partial,
  } as RunModel;
}

describe('measuredEtaMs', () => {
  const running = model({ workflowStatus: 'running', ids: ['a', 'b'], startMs: 10_000 });

  it('newest completed sibling with majority overlap gives the measure', () => {
    const prior = model({ ids: ['a', 'b'], startMs: 0, endMs: 30_000 });
    // Prior took 30s · 10s elapsed → ~20s left.
    expect(measuredEtaMs(running, [running, prior], 20_000)).toBe(20_000);
  });

  it('no matching prior → no chip (never invented)', () => {
    const foreign = model({ ids: ['x', 'y', 'z'], startMs: 0, endMs: 30_000 });
    expect(measuredEtaMs(running, [running, foreign], 20_000)).toBeUndefined();
    expect(measuredEtaMs(running, [running], 20_000)).toBeUndefined();
  });

  it('a run past its prior duration says nothing (the measure is spent)', () => {
    const prior = model({ ids: ['a', 'b'], startMs: 0, endMs: 5_000 });
    expect(measuredEtaMs(running, [running, prior], 20_000)).toBeUndefined();
  });

  it('only RUNNING rows measure; terminal and paused rows never do', () => {
    const done = model({ ids: ['a'], startMs: 0, endMs: 1_000 });
    expect(measuredEtaMs(done, [done], 2_000)).toBeUndefined();
    const paused = model({ workflowStatus: 'paused', ids: ['a'], startMs: 0 });
    expect(measuredEtaMs(paused, [paused, done], 2_000)).toBeUndefined();
  });

  it('an unfinished or clockless sibling is no measure', () => {
    const torn = model({ ids: ['a', 'b'], startMs: 5_000 });
    expect(measuredEtaMs(running, [running, torn], 20_000)).toBeUndefined();
  });
});

describe('formatEta', () => {
  it('seconds under a minute, compact minutes above', () => {
    expect(formatEta(12_000)).toBe('~12s');
    expect(formatEta(400)).toBe('~1s');
    expect(formatEta(90_000)).toBe('~1.5m');
    expect(formatEta(120_000)).toBe('~2m');
  });
});
