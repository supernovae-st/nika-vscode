import { describe, expect, it } from 'vitest';

import { renderRunReport } from '../core/runReport';
import { foldTrace } from '../core/traceFold';

const TRACE = [
  '{"id":{"uuid":"u1"},"timestamp":1000,"kind":"workflow_started","fields":[{"key":"workflow","value":"w"}]}',
  '{"id":{"uuid":"u2"},"timestamp":2000,"kind":"task_completed","fields":[{"key":"task","value":"a"},{"key":"duration_ms","value":5}]}',
  '{"id":{"uuid":"u3"},"timestamp":3000,"kind":"workflow_completed","fields":[{"key":"workflow","value":"w"}]}',
].join('\n');

function report(chain: Parameters<typeof renderRunReport>[0]['chain']): string {
  return renderRunReport({
    traceName: 'run',
    model: foldTrace(TRACE),
    artifacts: new Map(),
    chain,
  });
}

describe('the proof-carrying report carries its proof', () => {
  it('an intact chain rides the verdict with its full head', () => {
    const md = report({ kind: 'intact', events: 3, head: 'ab'.repeat(32) });
    expect(md).toContain('chain **intact** — head `' + 'ab'.repeat(32) + '`');
    expect(md).toContain('tamper-evident');
  });

  it('a broken chain marks EVERY claim unverified', () => {
    const md = report({ kind: 'broken', line: 2 });
    expect(md).toContain('chain BROKEN at line 2');
    expect(md).toContain('every claim in this report is unverified');
  });

  it('a torn tail stays calm and a chainless report stays silent', () => {
    expect(report({ kind: 'torn', events: 2, head: 'cd'.repeat(32) })).toContain('crash mid-write, not tampering');
    expect(report(undefined)).not.toContain('Integrity');
  });
});
