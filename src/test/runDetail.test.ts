// runDetail.test.ts — the run detail page contract (DESIGN.md §7e).
//
// Three promises. THE PAGE: verdict · per-task breakdown · artifacts ·
// the paused question — every claim a recorded event, gaps omitted or
// named, and NOT ONE `command:` link (dead in the preview · annexe R
// R13: the page teaches its doors BY NAME). THE VOCABULARY: the one
// status glyph set, the legend's `cache-hit` word, the shared age
// tokens. THE DOOR (the belt idiom): every run item's Enter — Runs
// row, History cell, omnibar run family — lands on `nika.runDetail`,
// and the feature ships the report's vehicle (virtual doc + preview),
// never a webview.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderRunDetail, renderUnreadableDetail, type RunDetailInputs } from '../core/runDetail';
import { UNREADABLE_DESCRIPTION } from '../core/runsModel';
import { foldTrace } from '../core/traceFold';
import { extractRunArtifacts } from '../core/artifacts';

/** One Diamond-shape journal line (the engine's own wire). */
function line(kind: string, tsMs: number, fields: Array<{ key: string; value: unknown }>): string {
  return JSON.stringify({
    id: '00000000-0000-0000-0000-000000000000',
    timestamp: { unix_ms: tsMs },
    kind,
    run: 'run-detail-test',
    fields,
  });
}

/** 2026-07-20 14:00 local — an ordinary afternoon (the runsModel pin). */
const NOW = new Date(2026, 6, 20, 14, 0, 0).getTime();

const NDJSON = [
  line('workflow_started', 0, [{ key: 'workflow', value: 'greet' }]),
  line('task_started', 10, [{ key: 'task', value: 'seed' }]),
  line('task_completed', 1210, [
    { key: 'task', value: 'seed' }, { key: 'duration_ms', value: 1200 }, { key: 'usd', value: 0.01 },
  ]),
  line('task_started', 1220, [{ key: 'task', value: 'cachedone' }]),
  line('task_cache_hit', 1222, [{ key: 'task', value: 'cachedone' }, { key: 'duration_ms', value: 2 }]),
  line('task_started', 1230, [{ key: 'task', value: 'flaky' }]),
  line('task_failed', 4630, [
    { key: 'task', value: 'flaky' }, { key: 'duration_ms', value: 3400 }, { key: 'detail', value: 'exit 1: boom' },
  ]),
  line('workflow_failed', 4700, []),
].join('\n');

function inputs(over: Partial<RunDetailInputs> = {}): RunDetailInputs {
  return {
    traceName: 'greet-run',
    fsPath: '/ws/.nika/traces/greet-run.ndjson',
    mtimeMs: NOW - 3600_000,
    nowMs: NOW,
    model: foldTrace(NDJSON),
    artifacts: extractRunArtifacts(NDJSON),
    ...over,
  };
}

describe('renderRunDetail — the page', () => {
  const md = renderRunDetail(inputs());

  it('titles on the recorded workflow name and opens on the verdict line', () => {
    expect(md).toContain('# Run detail — greet');
    // The row's accessories writ large: glyph + status lead, counts,
    // duration, AGE + local stamp close the line.
    expect(md).toMatch(/✗ \*\*failed\*\* · 2 succeeded · 1 failed · 1 from cache · .+ · today \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}\)/);
  });

  it('breaks down every task — glyph, the legend word for cache, duration, the failure note', () => {
    expect(md).toContain('| task | status | duration | note |');
    expect(md).toContain('| `seed` | ✓ success | 1.2s |  |');
    expect(md).toContain('| `cachedone` | ○ cache-hit | 2ms |  |');
    expect(md).toContain('| `flaky` | ✗ failed | 3.4s | exit 1: boom |');
  });

  it('carries the journal provenance and teaches the deeper doors BY NAME', () => {
    expect(md).toContain('journal: `/ws/.nika/traces/greet-run.ndjson`');
    expect(md).toContain('the provable Run Report');
    expect(md).toContain('replay on the canvas');
  });

  it('ships not one command: link — dead in the preview (annexe R R13)', () => {
    expect(md).not.toContain('](command:');
    expect(md).not.toContain('(command:');
  });

  it('spend appears only when the trace priced something — never an invented $0', () => {
    expect(md.split('\n')[2]).toContain('$0.01');
    const unpriced = foldTrace(NDJSON);
    unpriced.totalUsd = undefined;
    for (const t of unpriced.tasks.values()) { t.usd = undefined; }
    const bare = renderRunDetail(inputs({ model: unpriced }));
    expect(bare.split('\n')[2]).not.toContain('$');
  });
});

describe('renderRunDetail — the needs-you and trust facts', () => {
  it('a paused run leads with its question and choices', () => {
    const paused = [
      line('workflow_started', 0, [{ key: 'workflow', value: 'deploy' }]),
      line('task_started', 10, [{ key: 'task', value: 'approve' }]),
      line('workflow_paused', 20, [
        { key: 'task', value: 'approve' },
        { key: 'mode', value: 'choice' },
        { key: 'message', value: 'Ship to prod?' },
        { key: 'choices', value: ['yes', 'no'] },
      ]),
    ].join('\n');
    const md = renderRunDetail(inputs({ model: foldTrace(paused) }));
    expect(md).toContain('**waiting on you** — `approve` asks: Ship to prod? (yes · no)');
  });

  it('a broken chain outranks the verdict — stated on the page', () => {
    const md = renderRunDetail(inputs({ chain: { kind: 'broken', line: 12 } }));
    expect(md).toContain('**chain BROKEN at line 12**');
    expect(md).toContain('unverified');
  });

  it('unparsed lines are counted, never papered over', () => {
    const model = foldTrace(`${NDJSON}\nnot json at all — a foreign dialect`);
    const md = renderRunDetail(inputs({ model }));
    expect(md).toContain('1 unparsed line (foreign dialect?)');
  });
});

describe('renderRunDetail — artifacts (doors, never the gallery)', () => {
  const artifacts = new Map([[
    'render',
    [{ taskId: 'render', path: 'out/a.png', kind: 'image' as const, bytes: 2048 }],
  ]]);

  it('a resolved artifact is a file: link (the angle idiom); unresolved names the gap', () => {
    const resolved = renderRunDetail(inputs({ artifacts, resolvePath: (p) => `/abs/${p}` }));
    expect(resolved).toContain('## Artifacts — 1');
    expect(resolved).toContain('- [`out/a.png`](<file:///abs/out/a.png>) — image · 2 KB · by `render`');
    const gone = renderRunDetail(inputs({ artifacts }));
    expect(gone).toContain('- `out/a.png` — image · 2 KB · by `render` (not found on disk)');
    // The gallery stays the report's: the detail inlines no image.
    expect(resolved).not.toContain('![');
  });

  it('zero artifacts → no section (an empty headline is noise, not honesty)', () => {
    expect(renderRunDetail(inputs())).not.toContain('## Artifacts');
  });
});

describe('renderUnreadableDetail — one voice with the Runs view', () => {
  it('speaks the unreadable vocabulary verbatim and names the file', () => {
    const md = renderUnreadableDetail('/t/broken.ndjson', UNREADABLE_DESCRIPTION);
    expect(md).toContain('This journal would not read — truncated (a killed run) or from another engine generation.');
    expect(md).toContain('journal: `/t/broken.ndjson`');
  });
});

describe('the door — every run item Enters the same detail (the belt idiom)', () => {
  const read = (rel: string): string =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');

  it('a Runs row\'s own click is the detail — args explicit (the Q4 socle)', () => {
    const src = read('../features/runsView.ts');
    expect(src).toContain("command: 'nika.runDetail'");
    expect(src).toContain('arguments: [trace.uri]');
  });

  it('a Runs row wears the uniform accessories — composed through the one door', () => {
    // The description rides runRowDescription (status glyph leads via
    // the summary, AGE closes) — the same composer History cells use.
    const src = read('../features/runsView.ts');
    expect(src).toMatch(/this\.description = runRowDescription\(\s*summarizeRun\(trace\.model\), trace\.mtimeMs/);
  });

  it('a History cell\'s own click is the detail — the recorded path becomes the Uri', () => {
    const src = read('../features/historyView.ts');
    expect(src).toContain("command: 'nika.runDetail'");
    expect(src).toContain('arguments: [vscode.Uri.file(row.traceFsPath)]');
  });

  it('the omnibar run family walks through the same door', () => {
    expect(read('../core/searchCatalog.ts')).toContain("command: 'nika.runDetail'");
  });

  it('the vehicle is the report\'s — virtual doc + markdown preview, never a webview', () => {
    const src = read('../features/runDetail.ts');
    expect(src).toContain("registerTextDocumentContentProvider(RUN_SCHEME");
    expect(src).toContain("'markdown.showPreview'");
    expect(src).not.toContain('createWebviewPanel');
  });
});
