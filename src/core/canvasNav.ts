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

/**
 * The keyboard connect-mode's valid-target table (WCAG 2.5.7 — the
 * pointer-free equivalent of the port drag). A `from → to` wire means
 * « to runs after from », so a target is INVALID when the wire would
 * loop or when it already exists:
 *
 *   · `from` itself (a task never depends on itself),
 *   · every transitive UPSTREAM of `from` (from already depends on
 *     them — the new wire would close a cycle; the walk spans ALL edge
 *     kinds, recovery wires included: a superset can only shrink the
 *     offer, never offer an illegal wire),
 *   · every already-direct dependent (the extension edit is an
 *     idempotent no-op there — an option that does nothing is noise).
 *
 * Returns ids in node order (the engine's topological order) — the
 * same deterministic order the rest of the keyboard nav speaks.
 */
export function connectTargets(
  nodes: readonly NavNode[],
  edges: readonly NavEdge[],
  from: string,
): string[] {
  if (!nodes.some((n) => n.id === from)) { return []; }
  const upstream = new Map<string, string[]>();
  for (const e of edges) {
    (upstream.get(e.target) ?? upstream.set(e.target, []).get(e.target)!).push(e.source);
  }
  const ancestors = new Set<string>();
  const stack = [...(upstream.get(from) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (ancestors.has(id)) { continue; }
    ancestors.add(id);
    for (const up of upstream.get(id) ?? []) { stack.push(up); }
  }
  const wired = new Set(edges.filter((e) => e.source === from).map((e) => e.target));
  return nodes
    .map((n) => n.id)
    .filter((id) => id !== from && !ancestors.has(id) && !wired.has(id));
}

/** One nudge = one grid cell (8 CSS px — the house spacing base). */
export const NUDGE_STEP = 8;

export type NudgeDir = 'up' | 'down' | 'left' | 'right';

/**
 * Arrow-nudge for a pinned card: step the pressed axis by `step` and
 * snap THAT axis to the step grid (the first nudge lands the card on
 * the grid; every following one moves exactly one cell). The other
 * axis never moves — a RIGHT press must not tug y.
 */
export function nudgedPosition(
  x: number,
  y: number,
  dir: NudgeDir,
  step = NUDGE_STEP,
): { x: number; y: number } {
  const snap = (v: number): number => Math.round(v / step) * step;
  if (dir === 'left') { return { x: snap(x - step), y }; }
  if (dir === 'right') { return { x: snap(x + step), y }; }
  if (dir === 'up') { return { x, y: snap(y - step) }; }
  return { x, y: snap(y + step) };
}
