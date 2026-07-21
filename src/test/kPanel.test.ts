// kPanel.test.ts — the K panel's pure brain (RC-2b pins).
//
// The filter speaks rootSearch's matching grammar (one matcher, two
// surfaces) and the habit order holds its three fences: within-group
// only · never past a greyed row · never onto the pinned primary.

import { describe, expect, it } from 'vitest';
import { kRowMatches, orderKRows, type KRowSpec } from '../core/kPanel';
import { visit, type FrecencyStore } from '../core/rootSearch';

const T0 = 1_700_000_000_000;

describe('kRowMatches (the house matcher, K-side)', () => {
  it('the empty query keeps every row (the resting screen)', () => {
    expect(kRowMatches('', '▶ Run from here')).toBe(true);
    expect(kRowMatches('', '❏ Duplicate')).toBe(true);
  });

  it('matches through the glyph prefix (word boundary, case folded)', () => {
    expect(kRowMatches('run', '▶ Run from here')).toBe(true);
    expect(kRowMatches('run', '◉ Peek the run story')).toBe(true);
    expect(kRowMatches('YAML', '✎ Open in the YAML')).toBe(true);
  });

  it('the subsequence tier forgives sparse typing', () => {
    expect(kRowMatches('oyml', '✎ Open in the YAML')).toBe(true);
    expect(kRowMatches('rfh', '▶ Run from here')).toBe(true);
  });

  it('an honest zero: no invention past the label', () => {
    expect(kRowMatches('zzz', '▶ Run from here')).toBe(false);
    expect(kRowMatches('runx', '◉ Peek the run story')).toBe(false);
  });
});

describe('orderKRows (habits rise · the three fences hold)', () => {
  const panel: KRowSpec[] = [
    { id: 'run-from-here', group: 0, pinned: true },
    { id: 'what-if', group: 0 },
    { id: 'fork-failure', group: 0 },
    { id: 'peek', group: 1 },
    { id: 'card-mode', group: 1 },
    { id: 'open-yaml', group: 1 },
    { id: 'duplicate', group: 1 },
  ];
  const ids = (rows: readonly KRowSpec[]): string[] => rows.map((r) => r.id);

  it('no habits = declaration order, byte-identical', () => {
    expect(ids(orderKRows(panel, {}, T0))).toEqual(ids(panel));
  });

  it('a visited row rises WITHIN its group', () => {
    let f: FrecencyStore = {};
    f = visit(f, 'card-mode', T0);
    f = visit(f, 'card-mode', T0 + 1_000);
    expect(ids(orderKRows(panel, f, T0 + 2_000))).toEqual([
      'run-from-here', 'what-if', 'fork-failure',
      'card-mode', 'peek', 'open-yaml', 'duplicate',
    ]);
  });

  it('a habit never crosses the separator (the group fence)', () => {
    let f: FrecencyStore = {};
    for (let i = 0; i < 10; i += 1) { f = visit(f, 'peek', T0 + i); }
    const out = ids(orderKRows(panel, f, T0 + 100));
    expect(out.slice(0, 3)).toEqual(['run-from-here', 'what-if', 'fork-failure']);
    expect(out[3]).toBe('peek');
  });

  it('the pinned primary is immovable (Enter-on-open never changes hands)', () => {
    let f: FrecencyStore = {};
    for (let i = 0; i < 10; i += 1) { f = visit(f, 'what-if', T0 + i); }
    const out = ids(orderKRows(panel, f, T0 + 100));
    expect(out[0]).toBe('run-from-here');
    expect(out[1]).toBe('what-if');
  });

  it('a greyed row is a fence: habits reorder only between the bars', () => {
    const withLock: KRowSpec[] = [
      { id: 'a', group: 0, pinned: true },
      { id: 'b', group: 0 },
      { id: 'c', group: 0, locked: true },
      { id: 'd', group: 0 },
      { id: 'e', group: 0 },
    ];
    let f: FrecencyStore = {};
    for (let i = 0; i < 5; i += 1) { f = visit(f, 'e', T0 + i); }
    // e outranks everything movable, but it never jumps the locked c:
    // it leads only its own segment (d · e).
    expect(ids(orderKRows(withLock, f, T0 + 100))).toEqual(['a', 'b', 'c', 'e', 'd']);
  });

  it('the fresher equal-count habit leads (decay is live in the order)', () => {
    let f: FrecencyStore = {};
    f = visit(f, 'open-yaml', T0 - 30 * 86_400_000);
    f = visit(f, 'duplicate', T0);
    const out = ids(orderKRows(panel, f, T0 + 1_000));
    expect(out.indexOf('duplicate')).toBeLessThan(out.indexOf('open-yaml'));
  });
});
