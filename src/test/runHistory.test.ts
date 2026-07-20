import { describe, expect, it } from 'vitest';
import { buildHistory, renderHistory, type HistoryRun } from '../core/runHistory';

const run = (
  name: string,
  mtimeMs: number,
  tasks: Array<[string, { status: string; durationMs?: number; cached?: boolean }]>,
): HistoryRun => ({
  name,
  mtimeMs,
  model: {
    tasks: new Map(tasks.map(([id, t]) => [id, { id, retries: 0, ...t }])),
    unknownLines: 0,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
});

describe('buildHistory', () => {
  it('cells are chronological; flaky = mixed outcomes; absent = blank', () => {
    const runs = [
      run('r3', 300, [['a', { status: 'success' }], ['b', { status: 'failed' }]]),
      run('r1', 100, [['a', { status: 'success' }]]),
      run('r2', 200, [['a', { status: 'failed' }], ['b', { status: 'success' }]]),
    ];
    const h = buildHistory(runs);
    const a = h.find((t) => t.id === 'a')!;
    expect(a.cells).toEqual(['✓', '✗', '✓']); // mtime order 100·200·300
    expect(a.flaky).toBe(true);
    const b = h.find((t) => t.id === 'b')!;
    expect(b.cells).toEqual([' ', '✓', '✗']);
    expect(b.runs).toBe(2);
  });

  it('trend fires only ≥3 measured durations and above the noise floor; cache-hits never count', () => {
    const steady = buildHistory([
      run('r1', 1, [['a', { status: 'success', durationMs: 100 }]]),
      run('r2', 2, [['a', { status: 'success', durationMs: 105 }]]),
      run('r3', 3, [['a', { status: 'success', durationMs: 110 }]]),
    ]);
    expect(steady[0].trendPct).toBeUndefined(); // +~5% = noise

    const slowing = buildHistory([
      run('r1', 1, [['a', { status: 'success', durationMs: 100 }]]),
      run('r2', 2, [['a', { status: 'success', durationMs: 100 }]]),
      run('r3', 3, [['a', { status: 'success', durationMs: 100 }]]),
      run('r4', 4, [['a', { status: 'success', durationMs: 200 }]]),
    ]);
    expect(slowing[0].trendPct).toBeGreaterThan(50);

    const cached = buildHistory([
      run('r1', 1, [['a', { status: 'success', durationMs: 100 }]]),
      run('r2', 2, [['a', { status: 'success', durationMs: 2, cached: true }]]),
    ]);
    expect(cached[0].cells[1]).toBe('○');
    expect(cached[0].medianMs).toBe(100); // the cache-hit's 2ms never pollutes
  });
});

describe('renderHistory', () => {
  it('renders the grid + flaky and slowdown callouts', () => {
    const md = renderHistory('wf', [
      run('r1', 1, [['a', { status: 'success', durationMs: 100 }], ['b', { status: 'success' }]]),
      run('r2', 2, [['a', { status: 'success', durationMs: 100 }], ['b', { status: 'failed' }]]),
      run('r3', 3, [['a', { status: 'success', durationMs: 100 }], ['b', { status: 'success' }]]),
      run('r4', 4, [['a', { status: 'success', durationMs: 300 }], ['b', { status: 'failed' }]]),
    ]);
    expect(md).toContain('# Run history — wf');
    expect(md).toContain('`b` ⚠');
    expect(md).toContain('## Flaky tasks');
    expect(md).toContain('failed 2/4 runs');
    expect(md).toContain('## Slowing down');
    expect(md).toContain('`a`');
  });

  it('zero runs stays honest', () => {
    expect(renderHistory('wf', [])).toContain('No recorded runs');
  });
});

// ─── traceBelongsTo — the contamination gate (0.97.2) ────────────────────────
import { traceBelongsTo } from '../core/runHistory';

describe('traceBelongsTo', () => {
  const docIds = new Set(['fetch', 'judge', 'ship']);

  it('exact workflow name WINS over any task overlap — siblings stay apart', () => {
    // deploy-staging and deploy-prod share every task id; the name splits them.
    expect(traceBelongsTo('deploy-prod', 'deploy-staging', ['fetch', 'judge', 'ship'], docIds)).toBe(false);
    expect(traceBelongsTo('deploy-staging', 'deploy-staging', ['fetch', 'judge', 'ship'], docIds)).toBe(true);
  });

  it('name match does not require any task overlap (a renamed-tasks run still belongs)', () => {
    expect(traceBelongsTo('deploy-staging', 'deploy-staging', ['other_a', 'other_b'], docIds)).toBe(true);
  });

  it('falls back to majority overlap only when a name is missing', () => {
    expect(traceBelongsTo(undefined, 'deploy-staging', ['fetch', 'judge', 'ship'], docIds)).toBe(true);
    expect(traceBelongsTo(undefined, 'deploy-staging', ['fetch', 'x', 'y', 'z', 'w'], docIds)).toBe(false);
    expect(traceBelongsTo('deploy-staging', undefined, ['fetch', 'judge'], docIds)).toBe(true);
  });

  it('an empty trace never belongs', () => {
    expect(traceBelongsTo(undefined, 'x', [], docIds)).toBe(false);
  });
});
