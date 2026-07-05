import { describe, expect, it } from 'vitest';
import { nextFocus, type NavEdge, type NavNode } from '../core/canvasNav';

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
