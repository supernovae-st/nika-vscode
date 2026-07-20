// layoutCache.ts — the ELK layout memory (pure · DOM-free · host-persistable).
//
// A laid-out graph is expensive (300 nodes ≈ seconds in ELK) and perfectly
// re-derivable: the SAME structure at the SAME heights lays out the SAME
// way. This module keys that determinism — FNV-1a over a canonical string
// of what ELK actually sees — and remembers the SNAPPED result in a small
// LRU that survives panel disposal through workspaceState (the host owns
// the store; this module only shapes the entries).
//
// What the key reads: workflow scope (layoutKeyOf — uri, else name) ·
// OPTS_REV (bump when the layout option set changes) · nodes sorted as
// id:height · edges sorted as id:source:target:labelLen.
// What the key structurally EXCLUDES: positions · statuses · manualPos ·
// zoom — none of them are layout inputs, so none of them may miss the
// cache (statuses reach the key only when they change a height, which is
// exactly when a fresh layout is due).

import type { ElkNode, ElkExtendedEdge } from 'elkjs';

/** Bump when computeLayout's option set changes — stale entries miss. */
export const OPTS_REV = 1;

/** Two distinct FNV offset bases — a 2×32-bit key, 16 hex chars. */
const SEED_A = 0x811c9dc5; // canonical FNV-1a 32-bit offset basis
const SEED_B = 0xcbf29ce4; // 64-bit offset basis, high word

/** FNV-1a 32-bit over UTF-16 code units — deterministic, allocation-free. */
export function fnv1a32(str: string, seed: number = SEED_A): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface LayoutKeyNode { id: string; h: number }
export interface LayoutKeyEdge { id: string; source: string; target: string; labelLen: number }

/** The canonical pre-hash string — exported so tests can pin its shape.
 *  JSON-encoded end to end: ids are author-controlled free text (an
 *  `after:` predicate rides into edge ids verbatim), so a delimiter
 *  scheme built on `:`/`,` was NOT injective — refuter-proven collision:
 *  nodes [a:1, b:2] vs the single node [`a:1,b`:2] serialized byte-equal
 *  under v1. JSON string encoding closes the class: quotes delimit,
 *  content cannot escape them, the mapping is injective by construction. */
export function layoutKeyStringOf(
  scope: string,
  nodes: LayoutKeyNode[],
  edges: LayoutKeyEdge[],
  optsRev: number = OPTS_REV,
): string {
  const n = [...nodes]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((x) => [x.id, x.h] as const);
  const eKey = (x: LayoutKeyEdge): string => JSON.stringify([x.id, x.source, x.target]);
  const e = [...edges]
    .sort((a, b) => (eKey(a) < eKey(b) ? -1 : eKey(a) > eKey(b) ? 1 : 0))
    .map((x) => [x.id, x.source, x.target, x.labelLen] as const);
  return JSON.stringify(['v2', scope, optsRev, n, e]);
}

/** 16-hex layout hash — FNV-1a ×2 seeds over the canonical string. */
export function layoutHashOf(
  scope: string,
  nodes: LayoutKeyNode[],
  edges: LayoutKeyEdge[],
  optsRev: number = OPTS_REV,
): string {
  const s = layoutKeyStringOf(scope, nodes, edges, optsRev);
  return (
    fnv1a32(s, SEED_A).toString(16).padStart(8, '0')
    + fnv1a32(s, SEED_B).toString(16).padStart(8, '0')
  );
}

// ─── Compact laid value ─────────────────────────────────────────────────────
// Children compress to [id, x, y, h] (width is the canvas constant — the
// caller re-injects it at expand). Edges keep sections + labels because
// renderEdges consumes them; every coordinate rounds to the pixel (the
// node grid is 8px — sub-pixel wire noise is pure bytes).

export interface CachedSection {
  id: string;
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  bendPoints?: Array<{ x: number; y: number }>;
}
export interface CachedLabel { text?: string; x?: number; y?: number; width?: number; height?: number }
export interface CachedEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections?: CachedSection[];
  labels?: CachedLabel[];
}
export interface CachedLayout {
  /** [id, x, y, height] per child — snapped coordinates. */
  c: Array<[string, number, number, number]>;
  e: CachedEdge[];
}

/** One persisted entry — [hash, value]; the host stores them opaquely. */
export type PersistedLayoutEntry = [string, CachedLayout];

const r = (v: number | undefined): number => Math.round(v ?? 0);

/** Compact a SNAPPED laid root into the cache value (deep copy — the
 *  live render may mutate its children after this returns). */
export function compactLaid(laid: ElkNode): CachedLayout {
  const c: CachedLayout['c'] = (laid.children ?? []).map((child) => [
    child.id, r(child.x), r(child.y), r(child.height),
  ]);
  const e: CachedEdge[] = (laid.edges ?? []).map((edge) => {
    const out: CachedEdge = {
      id: edge.id,
      sources: [...edge.sources],
      targets: [...edge.targets],
    };
    if (edge.sections !== undefined && edge.sections.length > 0) {
      out.sections = edge.sections.map((s) => {
        const sec: CachedSection = {
          id: s.id,
          startPoint: { x: r(s.startPoint.x), y: r(s.startPoint.y) },
          endPoint: { x: r(s.endPoint.x), y: r(s.endPoint.y) },
        };
        if (s.bendPoints !== undefined && s.bendPoints.length > 0) {
          sec.bendPoints = s.bendPoints.map((p) => ({ x: r(p.x), y: r(p.y) }));
        }
        return sec;
      });
    }
    if (edge.labels !== undefined && edge.labels.length > 0) {
      out.labels = edge.labels.map((l) => ({
        ...(l.text !== undefined ? { text: l.text } : {}),
        x: r(l.x), y: r(l.y), width: r(l.width), height: r(l.height),
      }));
    }
    return out;
  });
  return { c, e };
}

/** Rebuild a laid root from a cache value — `width` is the canvas node
 *  width constant (excluded from storage because it never varies). */
export function expandLaid(cached: CachedLayout, width: number): ElkNode {
  return {
    id: 'root',
    children: cached.c.map(([id, x, y, h]) => ({ id, x, y, width, height: h })),
    edges: cached.e as ElkExtendedEdge[],
  };
}

// ─── LRU ────────────────────────────────────────────────────────────────────

export class LayoutLru {
  /** Insertion order = recency (oldest first) — Map re-insert touches. */
  private map = new Map<string, CachedLayout>();

  constructor(private readonly cap: number = 20) {}

  get size(): number { return this.map.size; }

  get(hash: string): CachedLayout | undefined {
    const v = this.map.get(hash);
    if (v !== undefined) {
      this.map.delete(hash);
      this.map.set(hash, v);
    }
    return v;
  }

  set(hash: string, value: CachedLayout): void {
    if (this.map.has(hash)) { this.map.delete(hash); }
    this.map.set(hash, value);
    while (this.map.size > this.cap) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) { break; }
      this.map.delete(oldest);
    }
  }

  /** Seed from the host store — in-memory entries (fresher) keep priority. */
  seed(entries: PersistedLayoutEntry[]): void {
    for (const [hash, value] of entries) {
      if (!this.map.has(hash)) { this.set(hash, value); }
    }
  }

  /** Entries for the host store, oldest → newest; the byte cap drops the
   *  tail (least-recently-used first) until the JSON fits. */
  toPersist(byteCap: number = 1_500_000): PersistedLayoutEntry[] {
    let entries: PersistedLayoutEntry[] = [...this.map.entries()];
    let json = JSON.stringify(entries);
    while (entries.length > 0 && json.length > byteCap) {
      entries = entries.slice(1);
      json = JSON.stringify(entries);
    }
    return entries;
  }
}
