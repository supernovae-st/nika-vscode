// rootSearch.test.ts · the root search model contract.
//
// The clock is INJECTED (the runsModel idiom): decay is proven at exact
// half-lives, never flaky. The ranking pins are the annexe-AA laws:
// tiers are strict (prefix < word boundary < subsequence) · frecency
// tie-breaks INSIDE a tier and never crosses one · declaration order
// settles exact ties · a zero-match query still lands somewhere (the
// no-dead-ends law) · the store stays capped (the Memento law) · and
// ranking 500 rows stays under the 5ms pin.

import { describe, it, expect } from 'vitest';
import {
  FRECENCY_CAP,
  SEARCH_COMMAND,
  fallbacksFor,
  frecencyScore,
  matchTier,
  rankSearch,
  visit,
  type FrecencyStore,
  type SearchItem,
} from '../core/rootSearch';

/** 2026-07-21 10:00 UTC · an ordinary morning. */
const NOW = Date.UTC(2026, 6, 21, 10, 0, 0);
const DAY = 86_400_000;

const item = (
  id: string,
  label: string,
  declOrder: number,
  extra: Partial<SearchItem> = {},
): SearchItem => ({
  id,
  family: 'command',
  label,
  declOrder,
  run: { command: id },
  ...extra,
});

const entry = (count: number, lastMs: number): { count: number; lastMs: number } =>
  ({ count, lastMs });

describe('matchTier · the house matcher', () => {
  const wf = item('a', 'Run workflow', 0);

  it('label prefix is tier 0, case-insensitive', () => {
    expect(matchTier('run', wf)).toBe(0);
    expect(matchTier('RUN W', wf)).toBe(0);
    expect(matchTier('  run', wf)).toBe(0);
  });

  it('a non-first word start is tier 1', () => {
    expect(matchTier('work', wf)).toBe(1);
    expect(matchTier('WORK', wf)).toBe(1);
  });

  it('word boundaries include dash, dot, colon, slash and underscore', () => {
    // camelCase interior is NOT a boundary: it falls through to tier 2.
    expect(matchTier('demo', item('b', 'nika.tryDemo', 0))).toBe(2);
    expect(matchTier('trydemo', item('b', 'nika.tryDemo', 0))).toBe(1);
    expect(matchTier('prod', item('c', 'deploy-prod', 0))).toBe(1);
    expect(matchTier('json', item('d', 'convert_json', 0))).toBe(1);
    expect(matchTier('run', item('e', 'nika: run', 0))).toBe(1);
    expect(matchTier('b', item('f', 'a/b', 0))).toBe(1);
  });

  it('an in-order scatter is tier 2, case-insensitive', () => {
    expect(matchTier('rw', wf)).toBe(2);
    expect(matchTier('rnwf', wf)).toBe(2);
    expect(matchTier('RW', wf)).toBe(2);
  });

  it('out-of-order or absent characters do not match', () => {
    expect(matchTier('wr ru', wf)).toBe(undefined);
    expect(matchTier('xyz', wf)).toBe(undefined);
    expect(matchTier('run workflows', wf)).toBe(undefined);
  });

  it('keywords join at tier 1, never tier 0', () => {
    const station = item('s', 'Open station', 0, { keywords: ['runs', 'fleet board'] });
    expect(matchTier('runs', station)).toBe(1);
    expect(matchTier('board', station)).toBe(1);
    expect(matchTier('fbd', station)).toBe(2);
    expect(matchTier('zzz', station)).toBe(undefined);
  });

  it('the empty query matches everything at tier 0 (the resting screen)', () => {
    expect(matchTier('', wf)).toBe(0);
    expect(matchTier('   ', wf)).toBe(0);
  });
});

describe('tier -1 · the assigned alias (strict, never fuzzy)', () => {
  const aliased = item('nika.runWorkflow', 'Zeta board', 0, { aliases: ['rw'] });

  it('the exact alias is tier -1, case-insensitive, whitespace-trimmed', () => {
    expect(matchTier('rw', aliased)).toBe(-1);
    expect(matchTier('RW', aliased)).toBe(-1);
    expect(matchTier('  rw ', aliased)).toBe(-1);
  });

  it('an alias never matches partially: rw does not answer r, nor rwx', () => {
    // The label carries no r and no w: only the alias could answer,
    // and a strict alias stays silent on anything but full equality.
    const bare = item('x', 'zeta', 0, { aliases: ['rw'] });
    expect(matchTier('r', bare)).toBe(undefined);
    expect(matchTier('rwx', bare)).toBe(undefined);
  });

  it('the alias string joins no other tier (no prefix, no subsequence)', () => {
    // `w` is a subsequence of the alias `rw` but of nothing else: silence.
    expect(matchTier('w', item('x', 'zeta', 0, { aliases: ['rw'] }))).toBe(undefined);
  });

  it('the empty query stays the resting screen, never the alias tier', () => {
    expect(matchTier('', aliased)).toBe(0);
  });

  it('label and keywords still match an aliased item at their own tiers', () => {
    expect(matchTier('zeta', aliased)).toBe(0);
    expect(matchTier('board', aliased)).toBe(1);
  });

  it('every assigned alias of a row answers', () => {
    const two = item('a', 'zeta', 0, { aliases: ['rw', 'r2'] });
    expect(matchTier('rw', two)).toBe(-1);
    expect(matchTier('r2', two)).toBe(-1);
  });

  it('the assigned alias beats a literal prefix hit riding enormous frecency', () => {
    const prefix = item('prefix', 'rw exact prefix', 0);
    const habit: FrecencyStore = { prefix: entry(1_000_000, NOW) };
    const out = rankSearch('rw', [prefix, aliased], habit, NOW);
    expect(out.map((x) => x.id)).toEqual(['nika.runWorkflow', 'prefix']);
  });

  it('frecency still never crosses INTO the alias tier', () => {
    // A subsequence hit with a giant habit stays under the alias row.
    const scatter = item('scatter', 'r and w', 0);
    const out = rankSearch('rw', [scatter, aliased], { scatter: entry(9_999, NOW) }, NOW);
    expect(out.map((x) => x.id)).toEqual(['nika.runWorkflow', 'scatter']);
  });
});

describe('rankSearch · tiers are strict, frecency never crosses one', () => {
  it('prefix beats word boundary beats subsequence, whatever the habits', () => {
    const boundary = item('boundary', 'workflow run', 0);
    const prefix = item('prefix', 'run demo', 1);
    const scatter = item('scatter', 'r and u and n', 2);
    const frec: FrecencyStore = {
      boundary: entry(100, NOW),
      scatter: entry(1_000_000, NOW),
    };
    const out = rankSearch('run', [boundary, prefix, scatter], frec, NOW);
    expect(out.map((x) => x.id)).toEqual(['prefix', 'boundary', 'scatter']);
  });

  it('frecency tie-breaks INSIDE a tier', () => {
    const a = item('a', 'run alpha', 0);
    const b = item('b', 'run beta', 1);
    const out = rankSearch('run', [a, b], { b: entry(3, NOW) }, NOW);
    expect(out.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('declaration order settles exact ties, whatever the input order', () => {
    const first = item('first', 'run one', 0);
    const second = item('second', 'run two', 1);
    const out = rankSearch('run', [second, first], {}, NOW);
    expect(out.map((x) => x.id)).toEqual(['first', 'second']);
  });

  it('a decayed habit loses to a fresh one inside the tier', () => {
    const stale = item('stale', 'run stale', 0);
    const fresh = item('fresh', 'run fresh', 1);
    const frec: FrecencyStore = {
      stale: entry(4, NOW - 21 * DAY),
      fresh: entry(1, NOW),
    };
    const out = rankSearch('run', [stale, fresh], frec, NOW);
    expect(out.map((x) => x.id)).toEqual(['fresh', 'stale']);
  });

  it('the empty query returns every item, habits leading (the resting screen)', () => {
    const a = item('a', 'alpha', 0);
    const b = item('b', 'beta', 1);
    const c = item('c', 'gamma', 2);
    const frec: FrecencyStore = { b: entry(9, NOW), c: entry(2, NOW) };
    expect(rankSearch('', [a, b, c], frec, NOW).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(rankSearch('', [a, b, c], {}, NOW).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('non-matches drop from the list', () => {
    const a = item('a', 'run demo', 0);
    const b = item('b', 'open station', 1);
    expect(rankSearch('demo', [a, b], {}, NOW).map((x) => x.id)).toEqual(['a']);
    expect(rankSearch('qqq', [a, b], {}, NOW)).toEqual([]);
  });
});

describe('frecencyScore · the 7-day half-life', () => {
  it('halves at exactly one half-life and quarters at two', () => {
    expect(frecencyScore(entry(8, NOW - 7 * DAY), NOW)).toBeCloseTo(4, 10);
    expect(frecencyScore(entry(8, NOW - 14 * DAY), NOW)).toBeCloseTo(2, 10);
  });

  it('a fresh visit scores its full count', () => {
    expect(frecencyScore(entry(5, NOW), NOW)).toBe(5);
  });

  it('a future lastMs (clock skew) clamps to age zero, a fact not a crash', () => {
    expect(frecencyScore(entry(5, NOW + DAY), NOW)).toBe(5);
  });

  it('corrupt entries score zero instead of poisoning the sort', () => {
    expect(frecencyScore(entry(Number.NaN, NOW), NOW)).toBe(0);
    expect(frecencyScore(entry(3, Number.NaN), NOW)).toBe(0);
    expect(frecencyScore(entry(Number.POSITIVE_INFINITY, NOW), NOW)).toBe(0);
  });
});

describe('fallbacksFor · no dead ends', () => {
  it('is never empty: the empty query still offers generate and new', () => {
    const rows = fallbacksFor('', []);
    expect(rows.map((r) => r.id)).toEqual(['fallback.generate', 'fallback.new']);
    expect(rows[0].run).toEqual({ command: 'nika.generateWorkflow' });
    expect(rows[1].run).toEqual({ command: 'nika.newWorkflow' });
  });

  it('a query without a close id gets the four ranked rows, query as argument', () => {
    const rows = fallbacksFor('daily digest', []);
    expect(rows.map((r) => r.id)).toEqual([
      'fallback.generate',
      'fallback.new',
      'fallback.history',
      'fallback.vscode',
    ]);
    expect(rows.map((r) => r.declOrder)).toEqual([0, 1, 2, 3]);
    expect(rows[0].label).toBe('Generate workflow "daily digest"');
    expect(rows[0].run).toEqual({ command: 'nika.generateWorkflow', args: ['daily digest'] });
    expect(rows[1].label).toBe('New workflow "daily digest"');
    expect(rows[1].run).toEqual({ command: 'nika.newWorkflow', args: ['daily-digest'] });
    expect(rows[2].run).toEqual({ command: 'nika.runHistory', args: ['daily digest'] });
    expect(rows[3].run).toEqual({
      command: 'workbench.action.quickOpen',
      args: ['>daily digest'],
    });
  });

  it('did-you-mean leads on a typo within distance 2 and re-enters the door', () => {
    const rows = fallbacksFor('depoly', ['deploy', 'audit']);
    expect(rows[0].id).toBe('fallback.didYouMean');
    expect(rows[0].label).toBe('Did you mean "deploy"?');
    expect(rows[0].run).toEqual({ command: SEARCH_COMMAND, args: ['deploy'] });
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.declOrder)).toEqual([0, 1, 2, 3, 4]);
  });

  it('a single adjacent transposition is distance 1 (the damerau grammar)', () => {
    const rows = fallbacksFor('auidt', ['audit']);
    expect(rows[0].label).toBe('Did you mean "audit"?');
  });

  it('did-you-mean stays absent past distance 2 and on an exact hit', () => {
    expect(fallbacksFor('zzzzzz', ['deploy']).map((r) => r.id)).not.toContain(
      'fallback.didYouMean',
    );
    expect(fallbacksFor('deploy', ['deploy']).map((r) => r.id)).not.toContain(
      'fallback.didYouMean',
    );
  });

  it('the slug strips what a filename cannot carry', () => {
    const rows = fallbacksFor('Deploy Prod!', []);
    expect(rows[1].label).toBe('New workflow "Deploy Prod!"');
    expect(rows[1].run).toEqual({ command: 'nika.newWorkflow', args: ['deploy-prod'] });
  });
});

describe('visit · the Memento law', () => {
  it('records count+1 and lastMs=now without mutating the input', () => {
    const before: FrecencyStore = { a: entry(1, NOW - DAY) };
    const snapshot = JSON.stringify(before);
    const after = visit(before, 'a', NOW);
    expect(after.a).toEqual(entry(2, NOW));
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(after).not.toBe(before);
  });

  it('a first visit starts at count 1 and a corrupt entry heals to 1', () => {
    expect(visit({}, 'a', NOW).a).toEqual(entry(1, NOW));
    const healed = visit({ a: entry(Number.NaN, NOW - DAY) }, 'a', NOW);
    expect(healed.a).toEqual(entry(1, NOW));
  });

  it('caps the store at FRECENCY_CAP by evicting the weakest score', () => {
    let store: FrecencyStore = {};
    for (let i = 0; i < FRECENCY_CAP; i++) {
      store = { ...store, [`k${i}`]: entry(i + 1, NOW) };
    }
    const after = visit(store, 'newcomer', NOW);
    expect(Object.keys(after)).toHaveLength(FRECENCY_CAP);
    expect(after.k0).toBeUndefined();
    expect(after.k1).toEqual(entry(2, NOW));
    expect(after.newcomer).toEqual(entry(1, NOW));
  });

  it('never evicts the id just visited, even as the weakest', () => {
    let store: FrecencyStore = {};
    for (let i = 0; i < FRECENCY_CAP; i++) {
      store = { ...store, [`k${i}`]: entry(1000, NOW) };
    }
    const after = visit(store, 'newbie', NOW);
    expect(after.newbie).toEqual(entry(1, NOW));
    expect(Object.keys(after)).toHaveLength(FRECENCY_CAP);
  });

  it('stays put under the cap: no eviction on a re-visit', () => {
    let store: FrecencyStore = {};
    for (let i = 0; i < FRECENCY_CAP; i++) {
      store = { ...store, [`k${i}`]: entry(i + 1, NOW) };
    }
    const after = visit(store, 'k0', NOW);
    expect(Object.keys(after)).toHaveLength(FRECENCY_CAP);
    expect(after.k0).toEqual(entry(2, NOW));
  });
});

describe('the perf pin · rank 500 rows under 5ms', () => {
  it('averages under 5ms across 20 runs', () => {
    const words = ['run', 'workflow', 'demo', 'station', 'history', 'audit', 'canvas', 'report'];
    const items: SearchItem[] = Array.from({ length: 500 }, (_, i) =>
      item(
        `cmd.${i}`,
        `${words[i % 8]} ${words[(i * 3 + 1) % 8]} ${i}`,
        i,
        { keywords: [words[(i * 5 + 2) % 8]] },
      ));
    let frec: FrecencyStore = {};
    for (let i = 0; i < 100; i++) {
      frec = visit(frec, `cmd.${i * 5}`, NOW - (i % 14) * DAY);
    }
    rankSearch('rn', items, frec, NOW);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      rankSearch('rn', items, frec, NOW);
    }
    const mean = (performance.now() - t0) / 20;
    expect(mean).toBeLessThan(5);
  });
});
