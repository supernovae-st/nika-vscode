// The grandfathered ratchet's whole value is its exactness: old debt
// demotes, the N+1th occurrence stays loud, burn-down locks in.
import { describe, expect, it } from 'vitest';

import { captureBaseline, grandfatherMask, parseBaseline } from '../core/lintBaseline';

describe('grandfatherMask', () => {
  const baseline = parseBaseline(JSON.stringify({
    captured: '2026-07-05',
    counts: { 'wf/a.nika.yaml::NIKA-VAR-001': 2, 'wf/a.nika.yaml::NIKA-DAG-003': 1 },
  }));

  it('demotes exactly the budgeted count, in document order', () => {
    const mask = grandfatherMask(
      'wf/a.nika.yaml',
      ['NIKA-VAR-001', 'NIKA-VAR-001', 'NIKA-VAR-001', 'NIKA-DAG-003'],
      baseline,
    );
    // Two VAR-001 are old debt · the THIRD is new and stays loud.
    expect(mask).toEqual([true, true, false, true]);
  });

  it('a different file shares no budget', () => {
    expect(grandfatherMask('wf/b.nika.yaml', ['NIKA-VAR-001'], baseline)).toEqual([false]);
  });

  it('no baseline = everything loud (opt-in ratchet)', () => {
    expect(grandfatherMask('wf/a.nika.yaml', ['NIKA-VAR-001'], undefined)).toEqual([false]);
  });
});

describe('captureBaseline → parseBaseline round-trip', () => {
  it('folds per-file codes into sorted counts and survives the round-trip', () => {
    const captured = captureBaseline(
      new Map([
        ['wf/a.nika.yaml', ['NIKA-VAR-001', 'NIKA-VAR-001']],
        ['wf/b.nika.yaml', ['NIKA-SEC-001']],
      ]),
      '2026-07-05',
    );
    expect(captured.counts['wf/a.nika.yaml::NIKA-VAR-001']).toBe(2);
    const reparsed = parseBaseline(JSON.stringify(captured));
    expect(reparsed?.counts).toEqual(captured.counts);
    // Burn-down: re-capture after a cleanup records the SMALLER debt.
    const after = captureBaseline(new Map([['wf/a.nika.yaml', ['NIKA-VAR-001']]]), '2026-07-06');
    expect(after.counts['wf/a.nika.yaml::NIKA-VAR-001']).toBe(1);
    expect(after.counts['wf/b.nika.yaml::NIKA-SEC-001']).toBeUndefined();
  });

  it('rejects malformed baselines instead of throwing', () => {
    expect(parseBaseline('not json')).toBeUndefined();
    expect(parseBaseline('{"counts": 3}')).toBeUndefined();
    expect(parseBaseline('{"counts": {"k": "x"}}')?.counts).toEqual({});
  });
});
