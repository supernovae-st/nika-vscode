// kPanel.ts — the K action panel's pure brain (filter + learned order).
//
// The webview panel (dag.ts openNodeActions) stays the painter; this
// module answers the two questions RC-2b added. WHICH rows survive the
// typed query: the house matcher — rootSearch's tiers, so the K panel
// and the root search speak ONE matching grammar. WHAT order the rows
// take once habits weigh in: a row rises WITHIN its group only — never
// across the separator, never past a greyed row (locked = a barrier),
// and never onto the panel's primary (pinned — the Raycast law: the
// first declared action IS ⏎, non-overridable, so a habit may reorder
// the rows but never who answers Enter-on-open). The store shape is
// rootSearch's (PR-1 provides · RC-2 consumes): the webview keeps it
// session-scoped with per-ACTION ids, so a habit learned on one card
// serves every card.

import { matchTier, frecencyScore, type FrecencyStore } from './rootSearch';

/** What the order pass needs to know about one row. */
export interface KRowSpec {
  /** Stable per-ACTION id (never per-node) — the frecency key. */
  readonly id: string;
  /** Group index — a habit never crosses a group (the separator). */
  readonly group: number;
  /** The panel primary (first declared): immovable. */
  readonly pinned?: boolean;
  /** Greyed-with-reason: immovable AND a fence no habit crosses. */
  readonly locked?: boolean;
}

/**
 * Does a row label survive the typed query? Tier MEMBERSHIP only — the
 * panel keeps its habit-shaped order and never re-ranks mid-type: with
 * a curated handful of rows, order stability beats tier shuffling. The
 * empty query keeps everything (matchTier's resting-screen contract),
 * and the glyph prefix on labels costs nothing (word-boundary tier).
 */
export function kRowMatches(query: string, label: string): boolean {
  return matchTier(query, {
    id: '', family: 'command', label, declOrder: 0, run: { command: '' },
  }) !== undefined;
}

/**
 * Habit order: within each maximal run of MOVABLE rows (same group ·
 * not pinned · not locked), sort by frecency (declaration order at
 * parity — a never-visited panel is byte-identical to its declared
 * self). Pinned and locked rows keep their exact index and fence the
 * segments on both sides: rising past a greyed row would reorder a row
 * the user cannot pick, and rising onto the primary would betray the
 * muscle that opens-and-Enters.
 */
export function orderKRows<T extends KRowSpec>(
  rows: readonly T[],
  frec: FrecencyStore,
  nowMs: number,
): T[] {
  const score = (id: string): number => {
    const e = frec[id];
    return e === undefined ? 0 : frecencyScore(e, nowMs);
  };
  const movable = (r: T): boolean => r.pinned !== true && r.locked !== true;
  const out = [...rows];
  let i = 0;
  while (i < out.length) {
    if (!movable(out[i])) { i += 1; continue; }
    let j = i;
    while (j < out.length && out[j].group === out[i].group && movable(out[j])) { j += 1; }
    const seg = out.slice(i, j)
      .map((r, k) => ({ r, k }))
      .sort((a, b) => score(b.r.id) - score(a.r.id) || a.k - b.k)
      .map((x) => x.r);
    out.splice(i, j - i, ...seg);
    i = j;
  }
  return out;
}
