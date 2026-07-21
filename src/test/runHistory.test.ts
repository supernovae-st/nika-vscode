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

// ─── buildHistoryRows — the native tree (V-SOTA.B B2) ────────────────────────
import { buildHistoryRows } from '../core/runHistory';

describe('buildHistoryRows', () => {
  const NOW = new Date(2026, 6, 20, 12, 0, 0).getTime(); // local noon — day math is calendar math

  it('partitions every task into exactly ONE section — flaky wins, then slowing, steady the rest', () => {
    const runs = [
      // flaky: mixed outcomes · slowing: ≥3 durations + newest ≥ +15% · steady: the rest
      run('r1', NOW - 3000, [['flk', { status: 'success' }], ['slw', { status: 'success', durationMs: 100 }], ['std', { status: 'success' }]]),
      run('r2', NOW - 2000, [['flk', { status: 'failed' }], ['slw', { status: 'success', durationMs: 100 }], ['std', { status: 'success' }]]),
      run('r3', NOW - 1000, [['flk', { status: 'success' }], ['slw', { status: 'success', durationMs: 100 }], ['std', { status: 'success' }]]),
      run('r4', NOW, [['flk', { status: 'success' }], ['slw', { status: 'success', durationMs: 300 }], ['std', { status: 'success' }]]),
    ];
    const rows = buildHistoryRows(runs, NOW);
    expect(rows.map((r) => r.id)).toEqual([
      'history.section.flaky', 'history.section.slowing', 'history.section.steady',
    ]);
    expect(rows.map((r) => r.label)).toEqual(['Flaky — 1', 'Slowing — 1', 'Steady — 1']);
    const membership = rows.map((r) => (r.children ?? []).map((t) => t.taskId));
    expect(membership).toEqual([['flk'], ['slw'], ['std']]);
    // Steady folds by default; the alarm sections start open.
    expect(rows.map((r) => r.collapsed)).toEqual([false, false, true]);
    // Total: 3 tasks in, 3 task rows out, no duplicates.
    expect(membership.flat().sort()).toEqual(['flk', 'slw', 'std']);
  });

  it('a flaky task that is ALSO slowing lands in Flaky only (disjoint partition)', () => {
    const runs = [
      run('r1', 1, [['a', { status: 'success', durationMs: 100 }]]),
      run('r2', 2, [['a', { status: 'failed' }]]),
      run('r3', 3, [['a', { status: 'success', durationMs: 100 }]]),
      run('r4', 4, [['a', { status: 'success', durationMs: 100 }]]),
      run('r5', 5, [['a', { status: 'success', durationMs: 300 }]]),
    ];
    const rows = buildHistoryRows(runs, 5);
    // Lone Flaky section KEEPS its header — the alarm needs its name.
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('history.section.flaky');
    expect(rows[0].children?.map((t) => t.taskId)).toEqual(['a']);
    // The trend still speaks on the row (the doc's own words).
    expect(rows[0].children?.[0].description).toContain('% vs median');
  });

  it('a lone Steady section dissolves to flat task rows', () => {
    const rows = buildHistoryRows([
      run('r1', 1, [['a', { status: 'success' }], ['b', { status: 'success' }]]),
    ], 1);
    expect(rows.map((r) => r.kind)).toEqual(['task', 'task']);
    expect(rows.map((r) => r.taskId)).toEqual(['a', 'b']);
  });

  it('cells are NEWEST first and #k is the exported grid column — sparse runs keep their number', () => {
    const runs = [
      run('r1', 100, [['a', { status: 'success', durationMs: 1000 }]]),
      run('r2', 200, [['b', { status: 'success' }]]), // a absent — column 2 is blank
      run('r3', 300, [['a', { status: 'failed' }]]),
    ];
    const rows = buildHistoryRows(runs, 300);
    const a = rows.flatMap((r) => r.kind === 'section' ? r.children ?? [] : [r]).find((t) => t.taskId === 'a')!;
    // Newest first · k = the chronological column number (1-based, oldest → newest);
    // the blank column 2 has no child — a blank cell is no recorded fact.
    // The label is the bare column handle; the status wears the
    // description (the §7e uniform accessory: glyph · duration · age).
    expect(a.children?.map((c) => c.label)).toEqual(['run #3', 'run #1']);
    expect(a.children?.map((c) => c.id)).toEqual(['history.cell.a.3', 'history.cell.a.1']);
    expect(a.children?.[0].description).toMatch(/^✗ failed/);
    expect(a.children?.[1].description).toMatch(/^✓ success/);
  });

  it('fsPath rides through to cells; renderHistory ignores it (zero doc break)', () => {
    const bare = [run('r1', 1, [['a', { status: 'success' }], ['b', { status: 'failed' }]])];
    const withPath = bare.map((r) => ({ ...r, fsPath: '/tmp/traces/r1.ndjson' }));
    const rows = buildHistoryRows(withPath, 1);
    const cells = rows.flatMap((r) => r.kind === 'section' ? r.children ?? [] : [r])
      .flatMap((t) => t.children ?? []);
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) { expect(c.traceFsPath).toBe('/tmp/traces/r1.ndjson'); }
    // No fsPath → no handle (never an invented path)…
    const bareCells = buildHistoryRows(bare, 1)
      .flatMap((r) => r.kind === 'section' ? r.children ?? [] : [r])
      .flatMap((t) => t.children ?? []);
    for (const c of bareCells) { expect(c.traceFsPath).toBeUndefined(); }
    // …and the exported document is byte-identical either way.
    expect(renderHistory('wf', withPath)).toBe(renderHistory('wf', bare));
  });

  it('rows speak the doc vocabulary — glyph strip · median · cache-hit', () => {
    const NOON = new Date(2026, 6, 20, 12, 0, 0).getTime();
    const rows = buildHistoryRows([
      run('r1', NOON - 86_400_000, [['a', { status: 'success', durationMs: 100 }]]),
      run('r2', NOON, [['a', { status: 'success', durationMs: 2, cached: true }]]),
    ], NOON);
    const a = rows.flatMap((r) => r.kind === 'section' ? r.children ?? [] : [r]).find((t) => t.taskId === 'a')!;
    expect(a.label).toBe('a');
    expect(a.description).toContain('✓ ○');            // the grid strip, verbatim
    expect(a.description).toContain('median');          // the doc's own column word
    expect(a.children?.[0].label).toBe('run #2');
    // The uniform accessory (§7e): glyph + the legend's word lead,
    // duration rides, AGE closes — never a dialect.
    expect(a.children?.[0].description).toBe('○ cache-hit · 2ms · today');
    expect(a.children?.[1].description).toBe('✓ success · 100ms · yesterday');
  });

  it('zero runs → zero rows (the view welcome owns the empty story)', () => {
    expect(buildHistoryRows([], 1)).toEqual([]);
  });
});

// ─── The gate's query as the initial filter (nika.runHistory learns q) ──────

import { historyFilterHits } from '../core/runHistory';

describe('buildHistoryRows · the initial filter', () => {
  const runs = [
    run('r1', 1, [['digest', { status: 'success' }], ['upload', { status: 'success' }]]),
    run('r2', 2, [['digest', { status: 'failed' }], ['upload', { status: 'success' }]]),
  ];

  it('narrows task rows by case-insensitive substring; the partition recomputes over survivors', () => {
    const rows = buildHistoryRows(runs, 2, 'DIG');
    // digest alone survives (flaky) — a lone alarm section keeps its name.
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('history.section.flaky');
    expect(rows[0].children?.map((t) => t.taskId)).toEqual(['digest']);
  });

  it('a filter matching NOTHING relaxes to the whole story — never an empty tree', () => {
    const bare = buildHistoryRows(runs, 2);
    expect(buildHistoryRows(runs, 2, 'zzz-no-such-task')).toEqual(bare);
    // Blank and whitespace filters are no filter at all.
    expect(buildHistoryRows(runs, 2, '')).toEqual(bare);
    expect(buildHistoryRows(runs, 2, '   ')).toEqual(bare);
  });

  it('historyFilterHits counts distinct matching ids (the description tells this truth)', () => {
    expect(historyFilterHits(runs, 'digest')).toBe(1);
    expect(historyFilterHits(runs, 'UP')).toBe(1);
    expect(historyFilterHits(runs, 'd')).toBe(2); // digest + upload both carry a d
    expect(historyFilterHits(runs, 'nope')).toBe(0);
    expect(historyFilterHits(runs, '')).toBe(0);
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
