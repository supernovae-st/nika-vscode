import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderRunDetail } from '../core/runDetail';
import { renderRunReport } from '../core/runReport';
import { foldTrace } from '../core/traceFold';

const model = foldTrace('{"kind":"workflow_completed"}\n');

describe('the engine alone judges recorded evidence', () => {
  it.each([
    '../core/runDetail.ts', '../core/runReport.ts', '../features/runDetail.ts',
    '../features/runsView.ts', '../extension.ts',
  ])('%s does not maintain a second chain verifier', (file) => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    expect(source).not.toMatch(/chainVerify|verifyChain|ChainVerdict/);
  });
  it('detail describes unverified observations without attributing a seal', () => {
    const page = renderRunDetail({ model, traceName: 'run', fsPath: '/run.ndjson',
      mtimeMs: 0, nowMs: 0, artifacts: new Map() });
    expect(page).toContain('Integrity not verified by this view');
    expect(page).toContain('Verify Journal');
    expect(page).not.toContain('events sealed');
  });
  it('an exported report does not promote recorded completion into proof', () => {
    const page = renderRunReport({ model, traceName: 'run', artifacts: new Map() });
    expect(page).toContain('Integrity not verified by this view');
    expect(page).toContain('Verify Journal');
  });
});
