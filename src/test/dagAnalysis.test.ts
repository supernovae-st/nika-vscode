// dagAnalysis.test.ts — the DAG engineering space, proven.
//
// The classics carry mathematical guarantees; these tests pin the
// guarantees as PROPERTIES, not examples-only: Dilworth duality (witness
// is a real antichain · width ≥ every wave), Brent's law (span ≤ work ·
// makespan ≥ span), the Graham bracket max(W/k, S) ≤ T_k ≤ W/k + S(k−1)/k,
// and monotonicity in k.

import { describe, expect, it } from 'vitest';
import {
  analyzeDag,
  descendantSets,
  hopcroftKarp,
  listScheduleMakespan,
  maxAntichain,
  weightedSpan,
  type AnalysisEdge,
  type AnalysisNode,
} from '../core/dagAnalysis';
import { topoWaves } from '../core/cliContract';

const nodes = (...ids: string[]): AnalysisNode[] => ids.map((id) => ({ id }));
const edges = (...pairs: Array<[string, string]>): AnalysisEdge[] =>
  pairs.map(([source, target]) => ({ source, target }));

// Canonical fixtures.
const CHAIN_N = nodes('a', 'b', 'c', 'd');
const CHAIN_E = edges(['a', 'b'], ['b', 'c'], ['c', 'd']);
const DIAMOND_N = nodes('a', 'b', 'c', 'd');
const DIAMOND_E = edges(['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']);
// Two independent chains — width is cross-component.
const TWO_CHAINS_N = nodes('a1', 'a2', 'b1', 'b2');
const TWO_CHAINS_E = edges(['a1', 'a2'], ['b1', 'b2']);
// Total order with a skip edge (a→v→b plus a→b): width 1 everywhere.
const SKIP_N = nodes('a', 'v', 'b');
const SKIP_E = edges(['a', 'v'], ['v', 'b'], ['a', 'b']);

describe('descendantSets', () => {
  it('accumulates transitively on a chain', () => {
    const desc = descendantSets(CHAIN_N, CHAIN_E);
    expect([...desc.get('a')!].sort()).toEqual(['b', 'c', 'd']);
    expect([...desc.get('c')!]).toEqual(['d']);
    expect(desc.get('d')!.size).toBe(0);
  });

  it('merges branches on the diamond', () => {
    const desc = descendantSets(DIAMOND_N, DIAMOND_E);
    expect([...desc.get('a')!].sort()).toEqual(['b', 'c', 'd']);
    expect([...desc.get('b')!]).toEqual(['d']);
  });

  it('ignores recovery edges — a parking read is not real ordering', () => {
    const parked: AnalysisEdge[] = [...TWO_CHAINS_E, { source: 'a2', target: 'b1', kind: 'recovery' }];
    const desc = descendantSets(TWO_CHAINS_N, parked);
    expect(desc.get('a2')!.size).toBe(0);
  });

  it('typed scheduling kinds all order (value · observations · control)', () => {
    const typed: AnalysisEdge[] = [
      { source: 'a1', target: 'a2', kind: 'value' },
      { source: 'a2', target: 'b1', kind: 'terminal-observation' },
      { source: 'b1', target: 'b2', kind: 'control' },
    ];
    const desc = descendantSets(TWO_CHAINS_N, typed);
    expect([...desc.get('a1')!].sort()).toEqual(['a2', 'b1', 'b2']);
  });
});

describe('hopcroftKarp', () => {
  it('finds the perfect matching when one exists', () => {
    const adj = new Map<string, string[]>([
      ['u1', ['v1', 'v2']],
      ['u2', ['v1']],
    ]);
    const m = hopcroftKarp(['u1', 'u2'], adj);
    expect(m.size).toBe(2);
    expect(m.matchLeft.get('u2')).toBe('v1');
    expect(m.matchLeft.get('u1')).toBe('v2');
  });

  it('handles isolated left vertices', () => {
    const m = hopcroftKarp(['u1', 'u2'], new Map([['u1', ['v1']]]));
    expect(m.size).toBe(1);
  });
});

describe('maxAntichain (Dilworth · exact width)', () => {
  it('a chain has width 1', () => {
    const { width, witness } = maxAntichain(CHAIN_N, CHAIN_E);
    expect(width).toBe(1);
    expect(witness).toHaveLength(1);
  });

  it('the diamond has width 2 with the branch pair as witness', () => {
    const { width, witness } = maxAntichain(DIAMOND_N, DIAMOND_E);
    expect(width).toBe(2);
    expect(witness.sort()).toEqual(['b', 'c']);
  });

  it('independent chains stack their widths', () => {
    const { width } = maxAntichain(TWO_CHAINS_N, TWO_CHAINS_E);
    expect(width).toBe(2);
  });

  it('a skip edge over a total order keeps width 1', () => {
    expect(maxAntichain(SKIP_N, SKIP_E).width).toBe(1);
  });

  it('isolated nodes are one big antichain', () => {
    const { width, witness } = maxAntichain(nodes('x', 'y', 'z'), []);
    expect(width).toBe(3);
    expect(witness.sort()).toEqual(['x', 'y', 'z']);
  });

  it('empty graph → width 0', () => {
    expect(maxAntichain([], []).width).toBe(0);
  });

  const CASES: Array<[string, AnalysisNode[], AnalysisEdge[]]> = [
    ['chain', CHAIN_N, CHAIN_E],
    ['diamond', DIAMOND_N, DIAMOND_E],
    ['two chains', TWO_CHAINS_N, TWO_CHAINS_E],
    ['skip', SKIP_N, SKIP_E],
  ];

  it.each(CASES)('PROPERTY %s: the witness is a true antichain of size = width', (_name, ns, es) => {
    const { width, witness } = maxAntichain(ns, es);
    expect(witness).toHaveLength(width);
    const desc = descendantSets(ns, es);
    for (const u of witness) {
      for (const v of witness) {
        if (u === v) { continue; }
        expect(desc.get(u)!.has(v), `${u} ≺ ${v} inside the witness`).toBe(false);
      }
    }
  });

  it.each(CASES)('PROPERTY %s: width ≥ every topological wave', (_name, ns, es) => {
    const { width } = maxAntichain(ns, es);
    for (const wave of topoWaves(ns, es)) {
      expect(width).toBeGreaterThanOrEqual(wave.length);
    }
  });
});

describe('weightedSpan + list scheduling', () => {
  const unit = (ns: AnalysisNode[]): Map<string, number> => new Map(ns.map((n) => [n.id, 1]));

  it('span of a unit diamond is the 3-hop path', () => {
    expect(weightedSpan(DIAMOND_N, DIAMOND_E, unit(DIAMOND_N))).toBe(3);
  });

  it('span follows the HEAVY branch, not the hop count', () => {
    const w = new Map([['a', 1], ['b', 10], ['c', 1], ['d', 1]]);
    expect(weightedSpan(DIAMOND_N, DIAMOND_E, w)).toBe(12); // a → b → d
  });

  it('one worker serializes to exactly the total work', () => {
    const w = unit(DIAMOND_N);
    expect(listScheduleMakespan(DIAMOND_N, DIAMOND_E, w, 1)).toBe(4);
  });

  it('enough workers reach the span', () => {
    const w = unit(DIAMOND_N);
    expect(listScheduleMakespan(DIAMOND_N, DIAMOND_E, w, 2)).toBe(3);
  });

  const GRAHAM_CASES: Array<[string, AnalysisNode[], AnalysisEdge[], Array<[string, number]>]> = [
    ['unit diamond', DIAMOND_N, DIAMOND_E, [['a', 1], ['b', 1], ['c', 1], ['d', 1]]],
    ['heavy branch', DIAMOND_N, DIAMOND_E, [['a', 2], ['b', 7], ['c', 3], ['d', 1]]],
    ['two chains', TWO_CHAINS_N, TWO_CHAINS_E, [['a1', 5], ['a2', 2], ['b1', 1], ['b2', 9]]],
    ['wide fan', nodes('s', 'f1', 'f2', 'f3', 'f4', 'j'),
      edges(['s', 'f1'], ['s', 'f2'], ['s', 'f3'], ['s', 'f4'], ['f1', 'j'], ['f2', 'j'], ['f3', 'j'], ['f4', 'j']),
      [['s', 1], ['f1', 4], ['f2', 3], ['f3', 2], ['f4', 1], ['j', 1]]],
  ];

  it.each(GRAHAM_CASES)('PROPERTY %s: Graham bracket holds for every k', (_name, ns, es, weightPairs) => {
    const w = new Map(weightPairs);
    const work = weightPairs.reduce((acc, [, v]) => acc + v, 0);
    const span = weightedSpan(ns, es, w);
    let previous = Number.POSITIVE_INFINITY;
    for (const k of [1, 2, 3, 4, 8]) {
      const ms = listScheduleMakespan(ns, es, w, k);
      expect(ms, `T_${k} ≥ max(W/k, S)`).toBeGreaterThanOrEqual(Math.max(work / k, span) - 1e-9);
      expect(ms, `T_${k} ≤ W/k + S(k−1)/k`).toBeLessThanOrEqual(work / k + (span * (k - 1)) / k + 1e-9);
      expect(ms, 'monotone non-increasing in k').toBeLessThanOrEqual(previous + 1e-9);
      previous = ms;
    }
  });
});

describe('analyzeDag (the full read)', () => {
  it('diamond: width 2 · pinch a+d · blast radius from a is total', () => {
    const ins = analyzeDag(DIAMOND_N, DIAMOND_E);
    expect(ins.width).toBe(2);
    expect(ins.pinchPoints.sort()).toEqual(['a', 'd']);
    expect(ins.blastRadius.get('a')).toBe(3);
    expect(ins.blastRadius.get('b')).toBe(1);
    expect(ins.blastRadius.get('d')).toBe(0);
    expect(ins.work).toBe(4);
    expect(ins.span).toBe(3);
    expect(ins.parallelismCeiling).toBeCloseTo(4 / 3, 5);
    expect(ins.weighted).toBe(false);
    expect(ins.criticalLength).toBe(3);
  });

  it('a total order is pinch everywhere (width 1 the whole way down)', () => {
    const ins = analyzeDag(SKIP_N, SKIP_E);
    expect(ins.width).toBe(1);
    expect(ins.pinchPoints.sort()).toEqual(['a', 'b', 'v']);
  });

  it('measured durations flip the weights to milliseconds', () => {
    const measured: AnalysisNode[] = [
      { id: 'a', durationMs: 100 },
      { id: 'b', durationMs: 900 },
      { id: 'c', durationMs: 200 },
      { id: 'd', durationMs: 300 },
    ];
    const ins = analyzeDag(measured, DIAMOND_E);
    expect(ins.weighted).toBe(true);
    expect(ins.work).toBe(1500);
    expect(ins.span).toBe(1300); // a → b → d
    // criticalLength stays the structural hop measure.
    expect(ins.criticalLength).toBe(3);
  });

  it('a PARTIAL run never mixes real ms with synthetic units', () => {
    const partial: AnalysisNode[] = [
      { id: 'a', durationMs: 100 },
      { id: 'b' },
      { id: 'c', durationMs: 200 },
      { id: 'd' },
    ];
    const ins = analyzeDag(partial, DIAMOND_E);
    expect(ins.weighted).toBe(false);
    expect(ins.work).toBe(4); // unit weights
  });

  it('recovery edges shape nothing (a parking read never schedules)', () => {
    const withParked: AnalysisEdge[] = [...DIAMOND_E, { source: 'b', target: 'c', kind: 'recovery' }];
    const ins = analyzeDag(DIAMOND_N, withParked);
    expect(ins.width).toBe(2);
    expect(ins.edgeCount).toBe(DIAMOND_E.length);
  });

  it('makespan table covers 1 … width and ends at the span', () => {
    const ins = analyzeDag(DIAMOND_N, DIAMOND_E);
    expect(ins.makespans[0]).toEqual({ workers: 1, makespan: 4 });
    const last = ins.makespans[ins.makespans.length - 1];
    expect(last.workers).toBe(ins.width);
    expect(last.makespan).toBe(ins.span);
  });
});

describe('hopcroftKarp · the layered-phase details (review mirror)', () => {
  it('staircase gadget needs long augmenting paths and still reaches maximum', () => {
    // u_i → {v_i, v_{i+1}}: alternating chains force real augmentation —
    // the free-layer gate must not starve them.
    const k = 40;
    const ids = Array.from({ length: k }, (_, i) => `u${i}`);
    const adj = new Map<string, string[]>(
      ids.map((u, i) => [u, i + 1 < k ? [`v${i}`, `v${i + 1}`] : [`v${i}`]]),
    );
    expect(hopcroftKarp(ids, adj).size).toBe(k);
  });

  it('maximum matching equals n minus width on every fixture (Dilworth dual)', () => {
    const CASES: Array<[AnalysisNode[], AnalysisEdge[]]> = [
      [CHAIN_N, CHAIN_E],
      [DIAMOND_N, DIAMOND_E],
      [TWO_CHAINS_N, TWO_CHAINS_E],
      [SKIP_N, SKIP_E],
    ];
    for (const [ns, es] of CASES) {
      const { width } = maxAntichain(ns, es);
      const desc = descendantSets(ns, es);
      const adj = new Map([...desc].map(([id, set]) => [id, [...set]]));
      const { size } = hopcroftKarp(ns.map((n) => n.id), adj);
      expect(size).toBe(ns.length - width);
    }
  });
});
