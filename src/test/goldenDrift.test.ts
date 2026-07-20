// goldenDrift.test.ts — the drift grammar, pinned against the LIVE
// engine (nika 0.104.0 · probed 2026-07-20) and reconstructed honestly.
//
// The three line shapes under test are verbatim engine output:
//   ~ outputs.text · golden "mock(echo) · hello" → run "mock(echo) · goodbye"
//   + outputs.extra · not in the golden ("mock(echo) · goodbye")
//   - outputs.text · missing (golden has "mock(echo) · hello")

import { describe, it, expect } from 'vitest';
import {
  matchTraceToWorkflow,
  outputsBlockLine,
  parseGoldenDrift,
  reconstructActual,
} from '../core/goldenDrift';

const CHANGED = [
  '✖ outputs drifted from the golden · probe.nika.yaml.golden.json',
  '  ~ outputs.text · golden "mock(echo) · hello" → run "mock(echo) · goodbye"',
  '',
  '  intended? re-baseline: nika test probe.nika.yaml --update',
].join('\n');

describe('parseGoldenDrift — the engine grammar verbatim', () => {
  it('reads a changed path with both sides', () => {
    const drift = parseGoldenDrift(CHANGED);
    expect(drift).toHaveLength(1);
    expect(drift?.[0]).toEqual({
      op: '~', path: ['text'],
      golden: 'mock(echo) · hello', run: 'mock(echo) · goodbye',
    });
  });

  it('reads added and removed paths', () => {
    const drift = parseGoldenDrift([
      '  + outputs.extra · not in the golden ("B")',
      '  - outputs.text · missing (golden has "A")',
    ].join('\n'));
    expect(drift).toHaveLength(2);
    expect(drift?.[0]).toEqual({ op: '+', path: ['extra'], run: 'B' });
    expect(drift?.[1]).toEqual({ op: '-', path: ['text'], golden: 'A' });
  });

  it('survives a golden string CONTAINING the arrow separator', () => {
    const drift = parseGoldenDrift('  ~ outputs.t · golden "a → run b" → run "c"');
    expect(drift?.[0]).toEqual({ op: '~', path: ['t'], golden: 'a → run b', run: 'c' });
  });

  it('reads non-string JSON values (numbers · objects)', () => {
    const drift = parseGoldenDrift('  ~ outputs.n · golden 1 → run {"a":2}');
    expect(drift?.[0]).toEqual({ op: '~', path: ['n'], golden: 1, run: { a: 2 } });
  });

  it('voids the pair on any unparseable line — never an invention', () => {
    expect(parseGoldenDrift('  ~ outputs.text · golden oops-not-json → run "b"')).toBeUndefined();
    expect(parseGoldenDrift('nika test: PARSE ✗ [NIKA-PARSE-019] validation error')).toBeUndefined();
    expect(parseGoldenDrift('')).toBeUndefined();
  });
});

describe('reconstructActual — golden + drift = the run', () => {
  it('applies change/add/remove onto the golden', () => {
    const golden = { text: 'A', keep: 'K', gone: 'G' };
    const drift = parseGoldenDrift([
      '  ~ outputs.text · golden "A" → run "B"',
      '  + outputs.extra · not in the golden ("X")',
      '  - outputs.gone · missing (golden has "G")',
    ].join('\n'));
    expect(drift).toBeDefined();
    expect(reconstructActual(golden, drift ?? [])).toEqual({ text: 'B', keep: 'K', extra: 'X' });
  });

  it('walks nested paths', () => {
    const drift = parseGoldenDrift('  ~ outputs.a.b · golden 1 → run 2');
    expect(reconstructActual({ a: { b: 1 } }, drift ?? [])).toEqual({ a: { b: 2 } });
  });
});

describe('outputsBlockLine — the failure anchor', () => {
  it('finds the top-level outputs: block, never an indented one', () => {
    const yaml = 'nika: v1\nworkflow: x\n\noutputs:\n  t: 1\n\ntasks:\n  - id: a\n    outputs: nope\n';
    expect(outputsBlockLine(yaml)).toBe(3);
    expect(outputsBlockLine('nika: v1\ntasks: []\n')).toBeUndefined();
  });
});

describe('matchTraceToWorkflow — the membership gate', () => {
  const wf = (fsPath: string, taskIds: string[]): { fsPath: string; taskIds: string[] } =>
    ({ fsPath, taskIds });

  it('≥60% of the trace ids must live in the workflow; best overlap wins', () => {
    const picked = matchTraceToWorkflow(
      ['a', 'b', 'c'],
      [wf('/x/one.nika.yaml', ['a', 'b', 'c', 'd']), wf('/x/two.nika.yaml', ['a'])],
    );
    expect(picked).toBe('/x/one.nika.yaml');
  });

  it('below the gate — no match, no guess', () => {
    expect(matchTraceToWorkflow(['a', 'b', 'c', 'd', 'e'], [wf('/x/w.nika.yaml', ['a', 'b'])]))
      .toBeUndefined();
    expect(matchTraceToWorkflow([], [wf('/x/w.nika.yaml', ['a'])])).toBeUndefined();
  });
});
