// graphIntel.ts — graph-theoretic intelligence over the DAG (pure).
//
// Transitive reduction (Aho, Garey & Ullman 1972 · SIAM J. Comput. 1(2))
// finds depends_on edges that add NO ordering the graph doesn't already
// guarantee through longer paths. Authors over-constrain DAGs constantly
// — every redundant edge silently narrows parallelism. Surfacing them
// (hint + one-click removal) is the cheapest wall-clock win a workflow
// editor can offer. O(V·E) reachability flavor — fine at workflow scale.
//
// Damerau-Levenshtein (Damerau 1964 · Levenshtein 1966), bounded ≤2,
// powers did-you-mean on task/var/alias references — same UX contract as
// the engine's tool suggestions, applied client-side where the engine
// has no suggestion field yet.

export interface SimpleEdge {
  source: string;
  target: string;
}

/**
 * Redundant edges under transitive reduction: u→v is redundant when v is
 * reachable from u WITHOUT using that edge. Data-carrying edges are the
 * caller's business to exempt (removing a wire the prompt READS would be
 * wrong even though ordering survives — pass only order-only edges).
 */
export function redundantEdges<E extends SimpleEdge>(nodes: string[], edges: E[]): E[] {
  const adjacency = new Map<string, string[]>();
  for (const id of nodes) { adjacency.set(id, []); }
  for (const e of edges) {
    adjacency.get(e.source)?.push(e.target);
  }

  const reachableWithout = (from: string, to: string, skip: E): boolean => {
    const stack = [...(adjacency.get(from) ?? [])].filter(
      (next) => !(from === skip.source && next === skip.target),
    );
    const seen = new Set<string>(stack);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur === to) { return true; }
      for (const next of adjacency.get(cur) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    return false;
  };

  return edges.filter((e) => reachableWithout(e.source, e.target, e));
}

// ─── Damerau-Levenshtein (optimal string alignment · bounded) ───────────────

/** OSA distance with early-exit band; returns Infinity past `max`. */
export function damerau(a: string, b: string, max = 2): number {
  if (a === b) { return 0; }
  if (Math.abs(a.length - b.length) > max) { return Infinity; }
  const al = a.length;
  const bl = b.length;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: bl + 1 }, (_, j) => j);
  for (let i = 1; i <= al; i++) {
    const row: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(
        prev[j] + 1,        // deletion
        row[j - 1] + 1,     // insertion
        prev[j - 1] + cost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1); // transposition
      }
      row.push(v);
      if (v < rowMin) { rowMin = v; }
    }
    if (rowMin > max) { return Infinity; }
    prev2 = prev;
    prev = row;
  }
  return prev[bl] <= max ? prev[bl] : Infinity;
}

/** Closest candidate within distance ≤2 (ties → shortest, then lexical). */
export function didYouMean(input: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    if (candidate === input) { continue; }
    const d = damerau(input, candidate, 2);
    if (d < bestDist || (d === bestDist && best !== undefined && candidate < best)) {
      best = candidate;
      bestDist = d;
    }
  }
  return bestDist <= 2 ? best : undefined;
}
