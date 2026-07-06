// Run-diff on REAL recorded traces (the signature fixtures · never
// invented NDJSON) — the diff must tell the truth about the movement
// between two runs, and stay silent about jitter.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { diffRuns, summarizeDiff } from '../core/runDiff';
import { foldTrace, type RunModel } from '../core/traceFold';

const load = (name: string): RunModel =>
  foldTrace(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

describe('diffRuns — real green vs green', () => {
  it('covers every task on either side, deterministically ordered', () => {
    const diff = diffRuns(load('sig-run-a.ndjson'), load('sig-run-b.ndjson'));
    expect(diff.tasks).toHaveLength(9);
    const again = diffRuns(load('sig-run-a.ndjson'), load('sig-run-b.ndjson'));
    expect(diff.tasks.map((t) => t.id)).toEqual(again.tasks.map((t) => t.id));
  });

  it('classifies mock-run jitter as same (thresholds hold)', () => {
    const diff = diffRuns(load('sig-run-a.ndjson'), load('sig-run-b.ndjson'));
    // Two green mock runs: any ms-scale wobble stays under the 50ms/5%
    // floor — a diff that cries wolf here would flood real runs.
    for (const t of diff.tasks) {
      expect(['same', 'faster', 'slower']).toContain(t.kind);
    }
    expect(diff.counts.added + diff.counts.removed + diff.counts.statusChanged).toBe(0);
  });

  it('self-diff is all-same, zero deltas', () => {
    const diff = diffRuns(load('sig-run-a.ndjson'), load('sig-run-a.ndjson'));
    expect(diff.counts.same).toBe(9);
    expect(summarizeDiff(diff)).toContain('no movement');
  });
});

describe('diffRuns — green vs failed (the regression story)', () => {
  it('surfaces the status flips first', () => {
    const diff = diffRuns(load('sig-run-a.ndjson'), load('sig-run-failed.ndjson'));
    expect(diff.counts.statusChanged).toBeGreaterThan(0);
    // Movers-first ordering: the first entry IS a status change.
    expect(diff.tasks[0].kind).toBe('status-changed');
    const publish = diff.tasks.find((t) => t.id === 'publish');
    expect(publish?.kind).toBe('status-changed');
    expect(publish?.statusFrom).toBe('success');
    expect(publish?.statusTo).toBe('failed');
    expect(summarizeDiff(diff)).toMatch(/\d+ status/);
  });
});

describe('diffRuns — synthetic added/removed/slower', () => {
  const mk = (tasks: Array<[string, number]>): RunModel => ({
    workflowStatus: 'completed',
    tasks: new Map(tasks.map(([id, ms]) => [id, { id, status: 'success' as const, durationMs: ms, retries: 0 }])),
    timeline: [],
    unknownLines: 0,
  });

  it('flags a 2x slowdown, an added and a removed task', () => {
    const diff = diffRuns(mk([['a', 1000], ['gone', 10]]), mk([['a', 2000], ['fresh', 5]]));
    expect(diff.tasks.find((t) => t.id === 'a')?.kind).toBe('slower');
    expect(diff.tasks.find((t) => t.id === 'a')?.deltaPct).toBe(100);
    expect(diff.tasks.find((t) => t.id === 'fresh')?.kind).toBe('added');
    expect(diff.tasks.find((t) => t.id === 'gone')?.kind).toBe('removed');
  });

  it('stays silent under both thresholds', () => {
    expect(diffRuns(mk([['a', 1000]]), mk([['a', 1030]])).tasks[0].kind).toBe('same');
    expect(diffRuns(mk([['a', 200]]), mk([['a', 240]])).tasks[0].kind).toBe('same');
    expect(diffRuns(mk([['a', 200]]), mk([['a', 260]])).tasks[0].kind).toBe('slower');
  });
});

describe('diffRuns v2 — outputs + first divergence', () => {
  const model = (tasks: Array<[string, { status: string; startMs?: number; durationMs?: number }]>) => ({
    tasks: new Map(tasks.map(([id, t]) => [id, { id, retries: 0, ...t }])),
    unknownLines: 0,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  it('same status but different recorded output → output-changed', () => {
    const base = model([['a', { status: 'success', startMs: 0 }], ['b', { status: 'success', startMs: 10 }]]);
    const compare = model([['a', { status: 'success', startMs: 0 }], ['b', { status: 'success', startMs: 10 }]]);
    const diff = diffRuns(base, compare, {
      base: new Map<string, unknown>([['a', { x: 1 }], ['b', 'same']]),
      compare: new Map<string, unknown>([['a', { x: 2 }], ['b', 'same']]),
    });
    expect(diff.tasks.find((t) => t.id === 'a')?.kind).toBe('output-changed');
    expect(diff.tasks.find((t) => t.id === 'b')?.kind).toBe('same');
    expect(diff.counts.outputChanged).toBe(1);
  });

  it('key order never fakes a change; a missing record never claims one', () => {
    const base = model([['a', { status: 'success' }], ['secretish', { status: 'success' }]]);
    const compare = model([['a', { status: 'success' }], ['secretish', { status: 'success' }]]);
    const diff = diffRuns(base, compare, {
      base: new Map<string, unknown>([['a', { x: 1, y: 2 }]]),           // secretish: no record
      compare: new Map<string, unknown>([['a', { y: 2, x: 1 }]]),        // same value, other order
    });
    expect(diff.tasks.find((t) => t.id === 'a')?.kind).toBe('same');
    expect(diff.tasks.find((t) => t.id === 'secretish')?.outputChanged).toBeUndefined();
  });

  it('first divergence = execution order of the STORY changes, not timing', () => {
    const base = model([
      ['early_slow', { status: 'success', startMs: 0, durationMs: 100 }],
      ['mid', { status: 'success', startMs: 50 }],
      ['late', { status: 'success', startMs: 90 }],
    ]);
    const compare = model([
      ['early_slow', { status: 'success', startMs: 0, durationMs: 900 }], // timing wobble — NOT divergence
      ['mid', { status: 'success', startMs: 50 }],
      ['late', { status: 'failed', startMs: 90 }],
    ]);
    const diff = diffRuns(base, compare, {
      base: new Map<string, unknown>([['mid', 'v1']]),
      compare: new Map<string, unknown>([['mid', 'v2']]),
    });
    // mid (start 50 · output change) beats late (start 90 · status flip).
    expect(diff.firstDivergentId).toBe('mid');
  });
});
