import { describe, expect, it } from 'vitest';
import { NO_MATCH_HINT, NUDGE_STEP, connectTargets, nextFocus, nudgedPosition, searchCountLabel, type NavEdge, type NavNode } from '../core/canvasNav';

// seed → a, seed → b, a → join, b → join  (diamond)
const nodes: NavNode[] = [{ id: 'seed' }, { id: 'a' }, { id: 'b' }, { id: 'join' }];
const edges: NavEdge[] = [
  { source: 'seed', target: 'a' },
  { source: 'seed', target: 'b' },
  { source: 'a', target: 'join' },
  { source: 'b', target: 'join' },
];

describe('nextFocus (keyboard canvas nav)', () => {
  it('next/prev with no current start at the ends', () => {
    expect(nextFocus(nodes, edges, undefined, 'next')).toBe('seed');
    expect(nextFocus(nodes, edges, undefined, 'prev')).toBe('join');
  });

  it('next/prev cycle the node order and wrap', () => {
    expect(nextFocus(nodes, edges, 'seed', 'next')).toBe('a');
    expect(nextFocus(nodes, edges, 'join', 'next')).toBe('seed'); // wrap
    expect(nextFocus(nodes, edges, 'seed', 'prev')).toBe('join'); // wrap
    expect(nextFocus(nodes, edges, 'a', 'prev')).toBe('seed');
  });

  it('up walks to a dependency (first in node order)', () => {
    expect(nextFocus(nodes, edges, 'join', 'up')).toBe('a'); // a before b in order
    expect(nextFocus(nodes, edges, 'a', 'up')).toBe('seed');
    expect(nextFocus(nodes, edges, 'seed', 'up')).toBeUndefined(); // root
  });

  it('down walks to a dependent (first in node order)', () => {
    expect(nextFocus(nodes, edges, 'seed', 'down')).toBe('a');
    expect(nextFocus(nodes, edges, 'a', 'down')).toBe('join');
    expect(nextFocus(nodes, edges, 'join', 'down')).toBeUndefined(); // sink
  });

  it('a current not in the graph falls back to the first node', () => {
    expect(nextFocus(nodes, edges, 'ghost', 'next')).toBe('seed');
  });

  it('empty graph yields nothing', () => {
    expect(nextFocus([], [], undefined, 'next')).toBeUndefined();
    expect(nextFocus([], [], 'x', 'up')).toBeUndefined();
  });
});

describe('connectTargets (keyboard connect-mode · the drag\'s table, pointer-free)', () => {
  it('refuses self, refuses every cycle-closing ancestor', () => {
    // from `a`: seed is upstream (a already depends on it — the wire
    // would loop) and join is already a direct dependent. Only b stays.
    expect(connectTargets(nodes, edges, 'a')).toEqual(['b']);
  });

  it('a sink with every task upstream has zero targets', () => {
    expect(connectTargets(nodes, edges, 'join')).toEqual([]);
  });

  it('already-wired direct dependents are out; transitive dependents stay in', () => {
    // seed → a and seed → b exist (no-op edits, excluded); join is only
    // TRANSITIVELY downstream — a direct wire is legal, same as the drag.
    expect(connectTargets(nodes, edges, 'seed')).toEqual(['join']);
  });

  it('the transitive ancestor walk crosses every edge kind (chain of 3)', () => {
    const chain: NavNode[] = [{ id: 'r' }, { id: 'm' }, { id: 'leaf' }, { id: 'free' }];
    const chainEdges: NavEdge[] = [
      { source: 'r', target: 'm' },
      { source: 'm', target: 'leaf' },
    ];
    // From leaf: r is a GRAND-ancestor — still refused (transitive walk).
    expect(connectTargets(chain, chainEdges, 'leaf')).toEqual(['free']);
  });

  it('an unknown source yields nothing; order follows node order', () => {
    expect(connectTargets(nodes, edges, 'ghost')).toEqual([]);
    const wide: NavNode[] = [{ id: 'z' }, { id: 'a' }, { id: 'm' }];
    expect(connectTargets(wide, [], 'a')).toEqual(['z', 'm']); // node order, not alpha
  });
});

describe('nudgedPosition (alt+arrows · 8px grid)', () => {
  it('on-grid cards move exactly one cell on the pressed axis', () => {
    expect(nudgedPosition(16, 24, 'right')).toEqual({ x: 24, y: 24 });
    expect(nudgedPosition(16, 24, 'left')).toEqual({ x: 8, y: 24 });
    expect(nudgedPosition(16, 24, 'up')).toEqual({ x: 16, y: 16 });
    expect(nudgedPosition(16, 24, 'down')).toEqual({ x: 16, y: 32 });
  });

  it('an off-grid card lands ON the grid — pressed axis only, the other never moves', () => {
    expect(nudgedPosition(13, 21.5, 'right')).toEqual({ x: 24, y: 21.5 });
    expect(nudgedPosition(13, 21.5, 'up')).toEqual({ x: 13, y: 16 });
  });

  it('every result sits on the step grid (the snap contract)', () => {
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      const p = nudgedPosition(13.7, 91.2, dir);
      if (dir === 'left' || dir === 'right') { expect(p.x % NUDGE_STEP).toBe(0); }
      else { expect(p.y % NUDGE_STEP).toBe(0); }
    }
  });

  it('honors a custom step', () => {
    expect(nudgedPosition(0, 0, 'right', 16)).toEqual({ x: 16, y: 0 });
  });
});

describe('searchCountLabel (the `/` filter count pill)', () => {
  it('counts while typing, tabular voice', () => {
    expect(searchCountLabel(7, true)).toBe('7 matches');
    expect(searchCountLabel(1, true)).toBe('1 match');
  });

  it('zero speaks the teaching line, VERBATIM the connect-mode voice', () => {
    expect(searchCountLabel(0, true)).toBe('no match — Backspace widens');
    expect(searchCountLabel(0, true)).toBe(NO_MATCH_HINT);
  });

  it('an idle filter shows nothing (null hides the pill)', () => {
    expect(searchCountLabel(0, false)).toBeNull();
    expect(searchCountLabel(5, false)).toBeNull();
  });
});
