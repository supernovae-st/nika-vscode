// canvasNav.ts — keyboard navigation over the DAG (the a11y + power path).
//
// The canvas is mouse-first (drag · click · scrub); this makes it
// keyboard-first too. Tab/Shift-Tab cycle every task in the engine's
// topological node order; ↑ walks to a dependency (upstream), ↓ to a
// dependent (downstream) — the DAG's own structure IS the nav graph.
// Pure — the webview binds the keys, the test pins the moves.

export interface NavNode { id: string }
export interface NavEdge { source: string; target: string }

export type NavDir = 'next' | 'prev' | 'up' | 'down';

/**
 * The task id to focus after a directional key, or undefined when the
 * move has no target (e.g. ↑ on a root). `current === undefined` starts
 * a fresh cycle: next → first node, prev → last.
 *
 * next/prev cycle the node order (topological from the engine). up/down
 * pick the FIRST dependency/dependent in node order (deterministic).
 */
export function nextFocus(
  nodes: readonly NavNode[],
  edges: readonly NavEdge[],
  current: string | undefined,
  dir: NavDir,
): string | undefined {
  if (nodes.length === 0) { return undefined; }
  const order = nodes.map((n) => n.id);

  if (dir === 'next' || dir === 'prev') {
    if (current === undefined) { return dir === 'next' ? order[0] : order[order.length - 1]; }
    const i = order.indexOf(current);
    if (i === -1) { return order[0]; }
    const step = dir === 'next' ? 1 : -1;
    return order[(i + step + order.length) % order.length];
  }

  // up = a dependency (source of an edge INTO current);
  // down = a dependent (target of an edge OUT OF current).
  if (current === undefined) { return undefined; }
  const rank = new Map(order.map((id, i) => [id, i]));
  const neighbors = edges
    .filter((e) => (dir === 'up' ? e.target === current : e.source === current))
    .map((e) => (dir === 'up' ? e.source : e.target))
    .filter((id) => rank.has(id));
  if (neighbors.length === 0) { return undefined; }
  neighbors.sort((a, b) => rank.get(a)! - rank.get(b)!);
  return neighbors[0];
}
