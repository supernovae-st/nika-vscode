// layoutCache.test.ts — the layout memory, held to its key discipline.
//
// The key covers exactly what ELK sees (scope · opts rev · heights ·
// edge shape/labels) and structurally excludes what it doesn't
// (positions · statuses · order of declaration). The LRU stays bounded,
// the persist stays under its byte cap, and compact/expand round-trips
// what renderEdges/renderNodes actually consume.

import { describe, it, expect } from 'vitest';
import type { ElkNode } from 'elkjs';
import {
  fnv1a32, layoutKeyStringOf, layoutHashOf, LayoutLru,
  compactLaid, expandLaid, OPTS_REV,
  type LayoutKeyNode, type LayoutKeyEdge, type CachedLayout,
} from '../webview/layoutCache';

const NODES: LayoutKeyNode[] = [
  { id: 'gather', h: 96 },
  { id: 'digest', h: 128 },
  { id: 'save', h: 96 },
];
const EDGES: LayoutKeyEdge[] = [
  { id: 'gather->digest', source: 'gather', target: 'digest', labelLen: 7 },
  { id: 'digest->save', source: 'digest', target: 'save', labelLen: 0 },
];

describe('fnv1a32 — canonical vectors', () => {
  it('matches the published FNV-1a 32-bit test vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });
});

describe('layoutHashOf — the key discipline', () => {
  it('emits 16 lowercase hex chars', () => {
    expect(layoutHashOf('file:///w/a.nika.yaml', NODES, EDGES)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is INSENSITIVE to declaration order (nodes and edges sort canonically)', () => {
    const a = layoutHashOf('s', NODES, EDGES);
    const b = layoutHashOf('s', [...NODES].reverse(), [...EDGES].reverse());
    expect(b).toBe(a);
  });

  it('is SENSITIVE to a height change (the density dial reaches the key)', () => {
    const grown = NODES.map((n) => (n.id === 'digest' ? { ...n, h: 240 } : n));
    expect(layoutHashOf('s', grown, EDGES)).not.toBe(layoutHashOf('s', NODES, EDGES));
  });

  it('is SENSITIVE to a label length change (labels are layout participants)', () => {
    const relabeled = EDGES.map((e) => (e.labelLen === 7 ? { ...e, labelLen: 12 } : e));
    expect(layoutHashOf('s', NODES, relabeled)).not.toBe(layoutHashOf('s', NODES, EDGES));
  });

  it('is SENSITIVE to OPTS_REV (an option-set bump invalidates every entry)', () => {
    expect(layoutHashOf('s', NODES, EDGES, OPTS_REV + 1)).not.toBe(layoutHashOf('s', NODES, EDGES, OPTS_REV));
  });

  it('NEVER collides across workflows — same structure, different scope (the leak gate)', () => {
    const a = layoutHashOf('file:///w/a.nika.yaml', NODES, EDGES);
    const b = layoutHashOf('file:///w/b.nika.yaml', NODES, EDGES);
    expect(b).not.toBe(a);
    // The canonical strings differ ONLY by scope — pin the shape.
    expect(layoutKeyStringOf('X', NODES, EDGES)).toContain(`|o:${OPTS_REV}|`);
    expect(layoutKeyStringOf('X', NODES, EDGES).startsWith('v1|X|')).toBe(true);
  });
});

describe('LayoutLru — bounded recency', () => {
  const entry = (n: number): CachedLayout => ({ c: [[`t${n}`, 0, 0, 96]], e: [] });

  it('evicts the least-recently-used past the cap', () => {
    const lru = new LayoutLru(3);
    lru.set('a', entry(1));
    lru.set('b', entry(2));
    lru.set('c', entry(3));
    lru.get('a'); // touch — 'b' becomes oldest
    lru.set('d', entry(4));
    expect(lru.get('b')).toBeUndefined();
    expect(lru.get('a')).toBeDefined();
    expect(lru.size).toBe(3);
  });

  it('seed fills absent keys only (fresher in-memory entries win)', () => {
    const lru = new LayoutLru(3);
    lru.set('a', entry(9));
    lru.seed([['a', entry(1)], ['b', entry(2)]]);
    expect(lru.get('a')?.c[0][0]).toBe('t9');
    expect(lru.get('b')).toBeDefined();
  });

  it('toPersist drops the OLDEST entries first until the byte cap fits', () => {
    const lru = new LayoutLru(10);
    const big = (n: number): CachedLayout => ({
      c: Array.from({ length: 50 }, (_, i) => [`t${n}-${i}`, i * 8, i * 8, 96]),
      e: [],
    });
    lru.set('old', big(1));
    lru.set('mid', big(2));
    lru.set('new', big(3));
    const all = JSON.stringify(lru.toPersist(10_000_000));
    const capped = lru.toPersist(Math.ceil(all.length * 0.7));
    expect(capped.length).toBeLessThan(3);
    // Newest survives; oldest goes first.
    expect(capped.map(([k]) => k)).toContain('new');
    expect(capped.map(([k]) => k)).not.toContain('old');
  });
});

describe('compactLaid / expandLaid — the render round-trip', () => {
  const laidOf = (): ElkNode => ({
    id: 'root',
    children: [
      { id: 'gather', x: 40.4, y: 8, width: 248, height: 96 },
      { id: 'digest', x: 160, y: 231.6, width: 248, height: 128 },
    ],
    edges: [{
      id: 'gather->digest',
      sources: ['gather'],
      targets: ['digest'],
      sections: [{
        id: 's0',
        startPoint: { x: 164.2, y: 104 },
        endPoint: { x: 284, y: 231.9 },
        bendPoints: [{ x: 164.2, y: 180.1 }],
      }],
      labels: [{ text: 'commits', x: 170.5, y: 150.2, width: 50, height: 12 }],
    }],
  });

  it('rounds every coordinate and keeps what renderEdges consumes', () => {
    const cached = compactLaid(laidOf());
    expect(cached.c).toEqual([['gather', 40, 8, 96], ['digest', 160, 232, 128]]);
    const e = cached.e[0];
    expect(e.sections?.[0].startPoint).toEqual({ x: 164, y: 104 });
    expect(e.sections?.[0].bendPoints).toEqual([{ x: 164, y: 180 }]);
    expect(e.labels?.[0]).toEqual({ text: 'commits', x: 171, y: 150, width: 50, height: 12 });
    expect(e.sources).toEqual(['gather']);
    expect(e.targets).toEqual(['digest']);
  });

  it('deep-copies — mutating the live result never corrupts the entry', () => {
    const laid = laidOf();
    const cached = compactLaid(laid);
    (laid.children ?? [])[0].x = 999;
    (laid.edges ?? [])[0].sections![0].startPoint.x = 999;
    expect(cached.c[0][1]).toBe(40);
    expect(cached.e[0].sections?.[0].startPoint.x).toBe(164);
  });

  it('expand rebuilds children with the injected width and the stored heights', () => {
    const out = expandLaid(compactLaid(laidOf()), 248);
    expect(out.children).toEqual([
      { id: 'gather', x: 40, y: 8, width: 248, height: 96 },
      { id: 'digest', x: 160, y: 232, width: 248, height: 128 },
    ]);
    expect(out.edges?.[0].id).toBe('gather->digest');
    expect(out.edges?.[0].sections?.length).toBe(1);
  });
});
