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
