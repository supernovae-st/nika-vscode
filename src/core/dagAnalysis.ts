// dagAnalysis.ts — the engineering space of a workflow DAG (pure · no vscode).
//
// Answers the questions an engineer asks of a pipeline:
//   · how parallel can it get      → exact width (Dilworth 1950 · min chain
//     cover via bipartite matching, Fulkerson 1956 · Hopcroft-Karp 1973)
//   · where does it serialize      → pinch points (nodes comparable to every
//     other node — the graph narrows to width 1 there)
//   · what does a failure cost     → blast radius (AND-join semantics: a
//     failed task blocks EVERY descendant, so radius = |descendants|)
//   · what's the speedup ceiling   → work-span (Brent 1974): parallelism
//     can never beat work/span, however many workers
//   · what does k-worker wall-clock look like → list scheduling by upward
//     rank (Graham 1966/69 bound · HEFT lineage, Topcuoglu 2002)
//
// Citations + "why these algorithms at this scale" live in
// docs/ALGORITHMS.md. Weights: measured durations when EVERY node carries
// one (a replayed/live run), else unit weights — never mix real
// milliseconds with synthetic 1s (that lesson is paid for).

import { isSchedulingKind, topoWaves } from './cliContract';

export interface AnalysisNode {
  id: string;
  durationMs?: number;
}

export interface AnalysisEdge {
  source: string;
  target: string;
  /** graph_format 2 kind — recovery/finally edges are NOT real ordering
   *  (parking reads · cleanup attachments); absent = scheduling. */
  kind?: string;
}

export interface MakespanEstimate {
  workers: number;
  makespan: number;
}

export interface DagInsights {
  nodeCount: number;
  edgeCount: number;
  /** Exact maximum antichain size — the true parallelism ceiling. */
  width: number;
  /** One maximum antichain — a concrete set of tasks that CAN run together. */
  widthWitness: string[];
  /** Tasks comparable to every other task — the DAG fully serializes there. */
  pinchPoints: string[];
  /** Per task: how many downstream tasks a failure blocks (AND-join). */
  blastRadius: Map<string, number>;
  /** Longest chain in tasks (hops + 1) — depth of the DAG. */
  criticalLength: number;
  /** Σ weights (total compute). */
  work: number;
  /** Longest weighted path (the time floor no parallelism can beat). */
  span: number;
  /** Brent: work/span — the speedup ceiling with unlimited workers. */
  parallelismCeiling: number;
  /** Estimated wall-clock under k workers (list scheduling, upward rank). */
  makespans: MakespanEstimate[];
  /** true = measured durations drove the weights; false = unit weights. */
  weighted: boolean;
}

interface Adjacency {
  down: Map<string, string[]>;
  up: Map<string, string[]>;
  ids: string[];
}

function adjacency(nodes: AnalysisNode[], edges: AnalysisEdge[]): Adjacency {
  const ids = nodes.map((n) => n.id);
  const known = new Set(ids);
  const down = new Map<string, string[]>(ids.map((id) => [id, []]));
  const up = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (!isSchedulingKind(e.kind ?? 'control')) { continue; }
    if (!known.has(e.source) || !known.has(e.target)) { continue; }
    down.get(e.source)!.push(e.target);
    up.get(e.target)!.push(e.source);
  }
  return { down, up, ids };
}

/**
 * Per-node descendant sets, accumulated in reverse topological order:
 * desc(v) = ∪ over children (child ∪ desc(child)). O(V·E) set unions —
 * right at IDE scale (≤ a few hundred tasks).
 */
export function descendantSets(nodes: AnalysisNode[], edges: AnalysisEdge[]): Map<string, Set<string>> {
  const { down } = adjacency(nodes, edges);
  const real = edges.filter((e) => isSchedulingKind(e.kind ?? 'control'));
  const waves = topoWaves(nodes, real);
  const desc = new Map<string, Set<string>>();
  for (let w = waves.length - 1; w >= 0; w--) {
    for (const id of waves[w]) {
      const set = new Set<string>();
      for (const child of down.get(id) ?? []) {
        set.add(child);
        for (const d of desc.get(child) ?? []) { set.add(d); }
      }
      desc.set(id, set);
    }
  }
  return desc;
}

// ─── Hopcroft-Karp bipartite matching (1973 · O(E√V)) ───────────────────────
// Left = right = the node set; an edge uL → vR for every u ≺ v in the
// transitive closure. Dilworth: width = n − |maximum matching|.

interface MatchingResult {
  /** matchLeft.get(u) = the right vertex u is matched to. */
  matchLeft: Map<string, string>;
  matchRight: Map<string, string>;
  size: number;
}

export function hopcroftKarp(leftIds: string[], edgesOf: Map<string, string[]>): MatchingResult {
  const matchLeft = new Map<string, string>();
  const matchRight = new Map<string, string>();
  const INF = Number.POSITIVE_INFINITY;
  const dist = new Map<string, number>();

  // The √V phase bound needs BOTH textbook details (the engine-side
  // review caught their absence — mirrored here): the BFS truncates at
  // the first layer reaching a free right vertex, and the DFS accepts a
  // free right vertex only at exactly that layer. Without them, phases
  // may augment along non-shortest paths and the bound degrades to
  // O(V·E) — the matching stays maximum either way (Berge), only the
  // complexity claim breaks.
  let freeLayer = INF;

  const bfs = (): boolean => {
    const queue: string[] = [];
    for (const u of leftIds) {
      if (!matchLeft.has(u)) {
        dist.set(u, 0);
        queue.push(u);
      } else {
        dist.set(u, INF);
      }
    }
    freeLayer = INF;
    let head = 0;
    while (head < queue.length) {
      const u = queue[head++];
      const du = dist.get(u) ?? 0;
      if (du >= freeLayer) { continue; }
      for (const v of edgesOf.get(u) ?? []) {
        const next = matchRight.get(v);
        if (next === undefined) {
          freeLayer = Math.min(freeLayer, du + 1);
        } else if (dist.get(next) === INF) {
          dist.set(next, du + 1);
          queue.push(next);
        }
      }
    }
    return freeLayer !== INF;
  };

  const dfs = (u: string): boolean => {
    const du = dist.get(u) ?? 0;
    for (const v of edgesOf.get(u) ?? []) {
      const next = matchRight.get(v);
      const advance = next === undefined
        ? du + 1 === freeLayer // free vertex: shortest-path layer only
        : dist.get(next) === du + 1 && dfs(next);
      if (advance) {
        matchLeft.set(u, v);
        matchRight.set(v, u);
        return true;
      }
    }
    dist.set(u, INF);
    return false;
  };

  let size = 0;
  while (bfs()) {
    let progressed = false;
    for (const u of leftIds) {
      if (!matchLeft.has(u) && dfs(u)) {
        size += 1;
        progressed = true;
      }
    }
    if (!progressed) { break; }
  }
  return { matchLeft, matchRight, size };
}

/**
 * Exact maximum antichain (Dilworth via König): width = n − |matching| on
 * the closure bipartite graph; the witness falls out of the minimum vertex
 * cover construction — Z = alternating-reachable from unmatched left
 * vertices, antichain = { v : vL ∈ Z ∧ vR ∉ Z }.
 */
export function maxAntichain(nodes: AnalysisNode[], edges: AnalysisEdge[]): { width: number; witness: string[] } {
  if (nodes.length === 0) { return { width: 0, witness: [] }; }
  const desc = descendantSets(nodes, edges);
  const ids = nodes.map((n) => n.id);
  const closure = new Map<string, string[]>(ids.map((id) => [id, [...(desc.get(id) ?? [])]]));

  const { matchLeft, matchRight, size } = hopcroftKarp(ids, closure);

  // König: alternating BFS from unmatched LEFT vertices —
  // left→right via NON-matching edges, right→left via MATCHING edges.
  const zLeft = new Set<string>();
  const zRight = new Set<string>();
  const queue: string[] = ids.filter((u) => !matchLeft.has(u));
  for (const u of queue) { zLeft.add(u); }
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    for (const v of closure.get(u) ?? []) {
      if (matchLeft.get(u) === v) { continue; } // matching edge — not usable left→right
      if (zRight.has(v)) { continue; }
      zRight.add(v);
      const back = matchRight.get(v);
      if (back !== undefined && !zLeft.has(back)) {
        zLeft.add(back);
        queue.push(back);
      }
    }
  }

  const witness = ids.filter((id) => zLeft.has(id) && !zRight.has(id));
  return { width: ids.length - size, witness };
}

// ─── Work-span + list scheduling ────────────────────────────────────────────

function weights(nodes: AnalysisNode[]): { weight: Map<string, number>; weighted: boolean } {
  const weighted =
    nodes.length > 0 &&
    nodes.every((n) => typeof n.durationMs === 'number' && n.durationMs >= 0) &&
    nodes.some((n) => (n.durationMs ?? 0) > 0);
  const weight = new Map(nodes.map((n) => [n.id, weighted ? Math.max(n.durationMs ?? 0, 0) : 1]));
  return { weight, weighted };
}

/** Longest weighted path through the DAG (the span — Brent's time floor). */
export function weightedSpan(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
  weight: Map<string, number>,
): number {
  const { up } = adjacency(nodes, edges);
  const real = edges.filter((e) => isSchedulingKind(e.kind ?? 'control'));
  const finish = new Map<string, number>();
  let span = 0;
  for (const wave of topoWaves(nodes, real)) {
    for (const id of wave) {
      let start = 0;
      for (const parent of up.get(id) ?? []) {
        start = Math.max(start, finish.get(parent) ?? 0);
      }
      const end = start + (weight.get(id) ?? 0);
      finish.set(id, end);
      span = Math.max(span, end);
    }
  }
  return span;
}

/**
 * List scheduling under k identical workers, priority = upward rank
 * (HEFT's rank_u: w(v) + max over successors). An ESTIMATE — Graham's
 * bound says any list schedule is within 2−1/k of optimal, which is
 * exactly the fidelity a planning surface needs.
 */
export function listScheduleMakespan(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
  weight: Map<string, number>,
  k: number,
): number {
  if (nodes.length === 0 || k < 1) { return 0; }
  const { down, up } = adjacency(nodes, edges);
  const real = edges.filter((e) => isSchedulingKind(e.kind ?? 'control'));
  const waves = topoWaves(nodes, real);

  // Upward rank, reverse topological.
  const rank = new Map<string, number>();
  for (let w = waves.length - 1; w >= 0; w--) {
    for (const id of waves[w]) {
      let best = 0;
      for (const child of down.get(id) ?? []) {
        best = Math.max(best, rank.get(child) ?? 0);
      }
      rank.set(id, (weight.get(id) ?? 0) + best);
    }
  }

  const indeg = new Map<string, number>(nodes.map((n) => [n.id, (up.get(n.id) ?? []).length]));
  const readyTime = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const pool: string[] = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const freeAt: number[] = new Array<number>(k).fill(0);
  let makespan = 0;

  while (pool.length > 0) {
    // Earliest-free worker; among tasks ready by then pick highest rank,
    // else the soonest-ready task (the worker waits on the dependency).
    let wi = 0;
    for (let i = 1; i < k; i++) {
      if (freeAt[i] < freeAt[wi]) { wi = i; }
    }
    const free = freeAt[wi];
    let pick = -1;
    for (let i = 0; i < pool.length; i++) {
      const id = pool[i];
      const ready = readyTime.get(id) ?? 0;
      if (pick === -1) { pick = i; continue; }
      const best = pool[pick];
      const bestReady = readyTime.get(best) ?? 0;
      const iAvailable = ready <= free;
      const bestAvailable = bestReady <= free;
      if (iAvailable !== bestAvailable) {
        if (iAvailable) { pick = i; }
        continue;
      }
      if (iAvailable) {
        // Both startable now — higher upward rank first (ties: stable id).
        if ((rank.get(id) ?? 0) > (rank.get(best) ?? 0)) { pick = i; }
      } else if (ready < bestReady || (ready === bestReady && (rank.get(id) ?? 0) > (rank.get(best) ?? 0))) {
        pick = i;
      }
    }
    const id = pool.splice(pick, 1)[0];
    const start = Math.max(free, readyTime.get(id) ?? 0);
    const end = start + (weight.get(id) ?? 0);
    freeAt[wi] = end;
    makespan = Math.max(makespan, end);
    for (const child of down.get(id) ?? []) {
      readyTime.set(child, Math.max(readyTime.get(child) ?? 0, end));
      const d = (indeg.get(child) ?? 1) - 1;
      indeg.set(child, d);
      if (d === 0) { pool.push(child); }
    }
  }
  return makespan;
}

/** The full engineering read of a DAG — one call, every insight. */
export function analyzeDag(nodes: AnalysisNode[], edges: AnalysisEdge[]): DagInsights {
  const real = edges.filter((e) => isSchedulingKind(e.kind ?? 'control'));
  const { width, witness } = maxAntichain(nodes, real);
  const desc = descendantSets(nodes, real);

  // Ancestor counts from descendant sets (membership flipped).
  const ancCount = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const [, set] of desc) {
    for (const d of set) {
      ancCount.set(d, (ancCount.get(d) ?? 0) + 1);
    }
  }

  const n = nodes.length;
  const pinchPoints = nodes
    .filter((node) => (ancCount.get(node.id) ?? 0) + (desc.get(node.id)?.size ?? 0) === n - 1)
    .map((node) => node.id);

  const blastRadius = new Map<string, number>(
    nodes.map((node) => [node.id, desc.get(node.id)?.size ?? 0]),
  );

  const { weight, weighted } = weights(nodes);
  const work = nodes.reduce((acc, node) => acc + (weight.get(node.id) ?? 0), 0);
  const span = weightedSpan(nodes, real, weight);
  const unitWeight = new Map(nodes.map((node) => [node.id, 1]));
  const criticalLength = weightedSpan(nodes, real, unitWeight);

  const ks = [...new Set([1, 2, 4, width].filter((k) => k >= 1 && k <= Math.max(width, 1)))].sort((a, b) => a - b);
  const makespans = ks.map((workers) => ({
    workers,
    makespan: listScheduleMakespan(nodes, real, weight, workers),
  }));

  return {
    nodeCount: n,
    edgeCount: real.length,
    width,
    widthWitness: witness,
    pinchPoints,
    blastRadius,
    criticalLength,
    work,
    span,
    parallelismCeiling: span > 0 ? work / span : 0,
    makespans,
    weighted,
  };
}
