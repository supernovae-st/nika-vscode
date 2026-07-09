// edgeTruth.test.ts — the edge honesty predicates, swept over the WHOLE
// status space (a particle or a glow on a wire that carried nothing is a
// lie; the sweep proves the negative space, not just the happy path).
import { describe, expect, it } from 'vitest';

import {
  afterglowVerdict,
  isFlowing,
  type AfterglowVerdict,
  type EdgeTaskStatus,
} from '../core/edgeTruth';

const ALL: EdgeTaskStatus[] = [
  'pending', 'running', 'retrying', 'success', 'failed', 'skipped', 'cancelled',
];

describe('isFlowing', () => {
  it('flows ONLY from a settled source into a computing target', () => {
    for (const src of ALL) {
      for (const tgt of ALL) {
        const expected = src === 'success' && (tgt === 'running' || tgt === 'retrying');
        expect(isFlowing(src, tgt), `${src} → ${tgt}`).toBe(expected);
      }
    }
  });

  it('an unknown endpoint flows nothing (missing node = no truth)', () => {
    expect(isFlowing(undefined, 'running')).toBe(false);
    expect(isFlowing('success', undefined)).toBe(false);
    expect(isFlowing(undefined, undefined)).toBe(false);
  });
});

describe('afterglowVerdict', () => {
  it('heats exactly the wires whose target EXECUTED off a delivered output', () => {
    for (const src of ALL) {
      for (const tgt of ALL) {
        const v = afterglowVerdict({ status: src }, { status: tgt });
        const expected: AfterglowVerdict = src !== 'success' ? 'cold'
          : tgt === 'success' ? 'hot-success'
            : tgt === 'failed' ? 'hot-fail'
              : 'cold';
        expect(v, `${src} → ${tgt}`).toBe(expected);
      }
    }
  });

  it('a cached target stays cold — rehydration executes nothing (ADR-099)', () => {
    expect(afterglowVerdict({ status: 'success' }, { status: 'success', cached: true }))
      .toBe('cold');
    // …and an explicit cached: false keeps the heat.
    expect(afterglowVerdict({ status: 'success' }, { status: 'success', cached: false }))
      .toBe('hot-success');
  });

  it('a missing endpoint is cold, never a throw', () => {
    expect(afterglowVerdict(undefined, { status: 'success' })).toBe('cold');
    expect(afterglowVerdict({ status: 'success' }, undefined)).toBe('cold');
  });
});
