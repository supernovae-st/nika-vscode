import { describe, expect, it } from 'vitest';
import { renderRunReport } from '../core/runReport';
import { foldTrace } from '../core/traceFold';
import { extractRunArtifacts } from '../core/artifacts';
import * as fs from 'fs';
import * as path from 'path';

const FIXTURE = path.join(__dirname, 'fixtures', 'sig-run-failed.ndjson');

describe('renderRunReport', () => {
  it('reports a real fixture trace: verdict, table, failures — no invention', () => {
    const ndjson = fs.readFileSync(FIXTURE, 'utf-8');
    const model = foldTrace(ndjson);
    const md = renderRunReport({
      traceName: 'sig-run-failed',
      model,
      artifacts: extractRunArtifacts(ndjson),
    });
    expect(md).toContain('# Run report — sig-run-failed');
    expect(md).toContain('| task | status |');
    // Every folded task appears as a row.
    for (const id of model.tasks.keys()) {
      expect(md).toContain(`\`${id}\``);
    }
    // A failed fixture surfaces the failures section + the fork pointer.
    expect(md).toContain('## Failures');
    expect(md).toContain('Fork From Task');
  });

  it('mock runs say « no cost data », never an invented $0', () => {
    const model = foldTrace(fs.readFileSync(FIXTURE, 'utf-8'));
    for (const t of model.tasks.values()) { t.usd = undefined; }
    const md = renderRunReport({ traceName: 'x', model, artifacts: new Map() });
    expect(md).toContain('no cost data (mock/local — nothing was priced)');
    expect(md).not.toContain('Spend: $0\n');
  });

  it('artifacts ride with provenance', () => {
    const model = foldTrace(fs.readFileSync(FIXTURE, 'utf-8'));
    const artifacts = new Map([[
      'render',
      [{ taskId: 'render', path: 'out/a.png', kind: 'image' as const, bytes: 2048, provider: 'openai', model: 'gpt-image-1' }],
    ]]);
    const md = renderRunReport({ traceName: 'x', model, artifacts });
    expect(md).toContain('## Artifacts');
    expect(md).toContain('`out/a.png` — image · 2 KB · openai/gpt-image-1 · produced by `render`');
  });

  it('resolved images render inline (the gallery); unresolved stay lines', () => {
    const model = foldTrace(fs.readFileSync(FIXTURE, 'utf-8'));
    const artifacts = new Map([[
      'render',
      [{ taskId: 'render', path: 'out/a.png', kind: 'image' as const }],
    ]]);
    const withResolver = renderRunReport({
      traceName: 'x', model, artifacts,
      resolvePath: (p) => `/abs/${p}`,
    });
    expect(withResolver).toContain('![image — render](<file:///abs/out/a.png>)');
    const without = renderRunReport({ traceName: 'x', model, artifacts });
    expect(without).not.toContain('![');
  });

  // ─── V-SOTA.B B2.c — resolved artifacts are file: LINKS ────────────────────
  it('a resolved artifact row is a file: link (angle-bracket — spaces stay one URL)', () => {
    const model = foldTrace(fs.readFileSync(FIXTURE, 'utf-8'));
    const artifacts = new Map([[
      'render',
      [{ taskId: 'render', path: 'out dir/report.pdf', kind: 'file' as const, bytes: 2048 }],
    ]]);
    const md = renderRunReport({
      traceName: 'x', model, artifacts,
      resolvePath: (p) => `/abs/${p}`,
    });
    expect(md).toContain('- [`out dir/report.pdf`](<file:///abs/out dir/report.pdf>) — file · 2 KB · produced by `render`');
  });

  it('an unresolved artifact stays a code span — the gap says, never a dead link', () => {
    const model = foldTrace(fs.readFileSync(FIXTURE, 'utf-8'));
    const artifacts = new Map([[
      'render',
      [{ taskId: 'render', path: 'gone/away.bin', kind: 'file' as const }],
    ]]);
    const md = renderRunReport({ traceName: 'x', model, artifacts, resolvePath: () => undefined });
    expect(md).toContain('- `gone/away.bin` — file · produced by `render`');
    expect(md).not.toContain('](<file://');
  });
});

describe('renderRunReport · task_recovered (D-2026-07-08-N4)', () => {
  it('a repaired success is named in the verdict line AND the task row', () => {
    const line = (kind: string, fields: Array<{ key: string; value: unknown }>, ts: number): string =>
      JSON.stringify({ id: 'x', timestamp: { unix_ms: ts }, kind, run: 'run-1', fields });
    const ndjson = [
      line('workflow_started', [{ key: 'workflow', value: 'demo' }], 1000),
      line('task_started', [{ key: 'task', value: 'fragile' }], 1001),
      line('task_recovered', [
        { key: 'task', value: 'fragile' },
        { key: 'code', value: 'NIKA-BUILTIN-READ-001' },
      ], 1002),
      line('task_completed', [{ key: 'task', value: 'fragile' }], 1003),
      line('workflow_completed', [], 1004),
    ].join('\n');
    const md = renderRunReport({
      traceName: 'recovered-run',
      model: foldTrace(ndjson),
      artifacts: new Map(),
    });
    expect(md).toContain('1 recovered');
    expect(md).toContain('recovered from NIKA-BUILTIN-READ-001');
  });
});

describe('runReport — the marathon facts (inner life · identity proof)', () => {
  it('a cached task with the identity pair proves its reuse in the notes', () => {
    const model = {
      workflowStatus: 'completed',
      tasks: new Map([['seed', {
        id: 'seed', status: 'success', retries: 0, cached: true,
        defHash: '15b188d151bfaf55', inputHash: 'c120cc20e2716d28',
      }]]),
      timeline: [], unknownLines: 0,
    } as never;
    const md = renderRunReport({ traceName: 't.ndjson', model, artifacts: new Map() });
    expect(md).toContain('cache hit (def 15b188d1… · inputs c120cc20…)');
  });

  it('an agent task narrates its loop in the notes column', () => {
    const model = {
      workflowStatus: 'completed',
      tasks: new Map([['scout', {
        id: 'scout', status: 'success', retries: 0,
        agent: { turns: 3, offered: 4, universe: 9, nudges: 2, compose: { checked: 1, valid: 1 } },
      }]]),
      timeline: [], unknownLines: 0,
    } as never;
    const md = renderRunReport({ traceName: 't.ndjson', model, artifacts: new Map() });
    expect(md).toContain('3 turns (saw 4/9 tools)');
    expect(md).toContain('nudged 2×');
    expect(md).toContain('compose 1/1');
  });
});
