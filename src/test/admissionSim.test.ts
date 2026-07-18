// admissionSim.test.ts — « what if this task fails? » answered by the
// ALGEBRA, never by guessing (gate algebra v2 · spec 03:720-728).
//
// The simulation replays admission: every task is admitted iff EVERY
// incoming scheduling edge's producer settles inside that edge's
// pass-set; a refused consumer settles cancelled and cascades. The
// failure reads (failure-observation · recovery parking) are the
// point: they LIGHT UP — the canvas shows why on_error exists.

import { describe, it, expect } from 'vitest';
import { simulateFailure } from '../core/admissionSim';

const EDGES = [
  // a → b, a → c (values) · b → d (value) · c → d (value)
  { source: 'a', target: 'b', kind: 'value' },
  { source: 'a', target: 'c', kind: 'value' },
  { source: 'b', target: 'd', kind: 'value' },
  { source: 'c', target: 'd', kind: 'value' },
  // e reads b's failure (the .error read)
  { source: 'b', target: 'e', kind: 'failure-observation' },
  // f observes b terminally (any outcome admits)
  { source: 'b', target: 'f', kind: 'terminal-observation' },
  // g runs after b succeeds (control · succeeded)
  { source: 'b', target: 'g', kind: 'control', predicate: 'succeeded' },
  // h is d's recovery reader (parking — never scheduled by d)
  { source: 'd', target: 'h', kind: 'recovery' },
];
const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

describe('simulateFailure — the algebra decides', () => {
  it('the blast: value consumers die cancelled, cascade included', () => {
    const sim = simulateFailure('b', IDS, EDGES);
    expect(sim.get('b')).toBe('failed');
    expect(sim.get('d')).toBe('cancelled'); // value from b: failure ∉ {success, skipped}
    expect(sim.get('a')).toBe('ok');        // upstream untouched
    expect(sim.get('c')).toBe('ok');        // sibling untouched
  });

  it('the point: failure reads LIGHT — terminal observation survives — the success gate dies', () => {
    const sim = simulateFailure('b', IDS, EDGES);
    expect(sim.get('e')).toBe('lit');       // failure-obs admits {failure, skipped}
    expect(sim.get('f')).toBe('ok');        // terminal-obs admits everything
    expect(sim.get('g')).toBe('cancelled'); // control succeeded admits {success} only
  });

  it('a cancelled producer does NOT feed a failure read (cancelled ∉ its pass-set)', () => {
    const edges = [
      { source: 'x', target: 'y', kind: 'value' },
      { source: 'y', target: 'z', kind: 'failure-observation' },
    ];
    const sim = simulateFailure('x', ['x', 'y', 'z'], edges);
    expect(sim.get('y')).toBe('cancelled');
    expect(sim.get('z')).toBe('cancelled'); // y cancelled: ∉ {failure, skipped}
  });

  it('recovery is a parking read — it never schedules, never dies with its source', () => {
    const sim = simulateFailure('b', IDS, EDGES);
    // h reads d (cancelled) through recovery — non-scheduling: h keeps
    // its own admission (no scheduling inputs → ok).
    expect(sim.get('h')).toBe('ok');
  });

  it('control terminal lives in both worlds — it survives as ok, never lit', () => {
    const edges = [{ source: 'b', target: 'w', kind: 'control', predicate: 'terminal' }];
    const sim = simulateFailure('b', ['b', 'w'], edges);
    // lit is reserved for paths that exist ONLY because of failure
    // (a failure read); a terminal gate admits success too.
    expect(sim.get('w')).toBe('ok');
  });
});
