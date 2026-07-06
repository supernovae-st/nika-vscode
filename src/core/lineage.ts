// lineage.ts — data-lineage illumination sets (pure · no vscode).
//
// « Select ${{ tasks.fetch.output }} and SEE the data's path »: from one
// focus task, compute who feeds it (producers), who consumes it, in two
// tiers (direct vs transitive), plus the exact edges that belong to the
// story. Ghost edges (a data ref WITHOUT depends_on · NIKA-DAG-003)
// count as real consumption — the missing wire is part of the lineage,
// not hidden by it.

export interface LineageEdge {
  source: string;
  target: string;
  isDataEdge?: boolean;
  ghost?: boolean;
}

export interface LineageView {
  focus: string;
  /** Direct producers (one edge into focus). */
  upDirect: string[];
  /** Direct consumers (one edge out of focus). */
  downDirect: string[];
  /** All transitive producers (includes directs, excludes focus). */
  upAll: string[];
  /** All transitive consumers (includes directs, excludes focus). */
  downAll: string[];
  /** Everything illuminated: focus + upAll + downAll. */
  lit: string[];
  /** Edge keys `source->target` inside the ancestor or descendant subgraph. */
  litEdges: string[];
}

/** BFS closure over an adjacency map. */
function closure(start: string, adj: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  seen.delete(start);
  return seen;
}

/**
 * The lineage of one task over the edge list. Pure and total: an unknown
 * or isolated focus yields an empty view (lit = [focus] only) — the
 * caller dims nothing extra and nothing crashes.
 */
export function lineageOf(edges: LineageEdge[], focus: string): LineageView {
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  const pairSeen = new Set<string>();
  for (const e of edges) {
    const key = `${e.source}->${e.target}`;
    if (pairSeen.has(key)) { continue; }
    pairSeen.add(key);
    (up.get(e.target) ?? up.set(e.target, []).get(e.target)!).push(e.source);
    (down.get(e.source) ?? down.set(e.source, []).get(e.source)!).push(e.target);
  }

  const upAll = closure(focus, up);
  const downAll = closure(focus, down);
  const upDirect = (up.get(focus) ?? []).filter((id) => id !== focus);
  const downDirect = (down.get(focus) ?? []).filter((id) => id !== focus);

  // An edge belongs to the story iff it lives INSIDE the ancestor
  // subgraph or INSIDE the descendant subgraph — an edge between an
  // ancestor and an unrelated cousin stays dark.
  const upSide = new Set([focus, ...upAll]);
  const downSide = new Set([focus, ...downAll]);
  const litEdges: string[] = [];
  for (const key of pairSeen) {
    const [s, t] = key.split('->');
    if ((upSide.has(s) && upSide.has(t)) || (downSide.has(s) && downSide.has(t))) {
      litEdges.push(key);
    }
  }

  return {
    focus,
    upDirect,
    downDirect,
    upAll: [...upAll],
    downAll: [...downAll],
    lit: [focus, ...upAll, ...downAll],
    litEdges,
  };
}
