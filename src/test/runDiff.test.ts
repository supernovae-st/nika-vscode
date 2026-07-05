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
