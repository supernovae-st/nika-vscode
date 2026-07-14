import { describe, expect, it } from 'vitest';
import { lineageOf, type LineageEdge } from '../core/lineage';

const E = (source: string, target: string, extra?: Partial<LineageEdge>): LineageEdge =>
  ({ source, target, ...extra });

describe('lineageOf', () => {
  it('diamond: focus on one arm lights that arm only', () => {
    const edges = [E('a', 'b'), E('a', 'c'), E('b', 'd'), E('c', 'd')];
    const v = lineageOf(edges, 'b');
    expect(v.upDirect).toEqual(['a']);
    expect(v.downDirect).toEqual(['d']);
    expect(v.upAll).toEqual(['a']);
    expect(v.downAll).toEqual(['d']);
    expect(new Set(v.lit)).toEqual(new Set(['a', 'b', 'd']));
    expect(new Set(v.litEdges)).toEqual(new Set(['a->b', 'b->d']));
  });

  it('root focus: whole downstream cone lights, edges included', () => {
    const edges = [E('a', 'b'), E('a', 'c'), E('b', 'd'), E('c', 'd')];
    const v = lineageOf(edges, 'a');
    expect(v.upAll).toEqual([]);
    expect(new Set(v.downAll)).toEqual(new Set(['b', 'c', 'd']));
    expect(new Set(v.litEdges)).toEqual(new Set(['a->b', 'a->c', 'b->d', 'c->d']));
  });

  it('chain: direct vs transitive tiers split', () => {
    const edges = [E('a', 'b'), E('b', 'c'), E('c', 'd')];
    const v = lineageOf(edges, 'd');
    expect(v.upDirect).toEqual(['c']);
    expect(new Set(v.upAll)).toEqual(new Set(['a', 'b', 'c']));
    expect(v.downDirect).toEqual([]);
  });

  it('ghost data edge counts as consumption', () => {
    const edges = [E('x', 'y'), E('y', 'z', { kind: 'recovery' })];
    const v = lineageOf(edges, 'y');
    expect(v.downDirect).toEqual(['z']);
    expect(v.litEdges).toContain('y->z');
  });

  it('unknown or isolated focus yields the empty view', () => {
    const v = lineageOf([E('a', 'b')], 'nope');
    expect(v.lit).toEqual(['nope']);
    expect(v.litEdges).toEqual([]);
  });

  it('duplicate edges dedupe; cousin edges stay dark', () => {
    const edges = [E('a', 'b'), E('a', 'b'), E('a', 'c'), E('c', 'd')];
    const v = lineageOf(edges, 'b');
    expect(v.upDirect).toEqual(['a']);
    // a->c and c->d are the cousin branch: ancestors' OTHER children stay dark.
    expect(new Set(v.litEdges)).toEqual(new Set(['a->b']));
  });
});
