// runsModel.test.ts — the Runs grouping contract.
//
// The clock is INJECTED (the stationModel idiom): midnight is provable,
// not flaky. Facts are built with local-time Date constructors so the
// day boundaries hold in any timezone the suite runs in.

import { describe, it, expect } from 'vitest';
import {
  bucketOf,
  groupRuns,
  unreadableSection,
  UNREADABLE_DESCRIPTION,
  type RunBucket,
  type RunRowFacts,
  type RunStatus,
} from '../core/runsModel';

/** 2026-07-20 14:00 local — an ordinary afternoon. */
const NOW = new Date(2026, 6, 20, 14, 0, 0).getTime();

const at = (y: number, mo: number, d: number, h: number, mi: number): number =>
  new Date(y, mo, d, h, mi, 0).getTime();

const fact = (status: RunStatus, mtimeMs: number, fsPath = `/t/${status}-${mtimeMs}.ndjson`): RunRowFacts =>
  ({ fsPath, mtimeMs, status });

describe('bucketOf — the total partition', () => {
  it('splits today from yesterday at local midnight (23:59 vs 00:01)', () => {
    expect(bucketOf(fact('completed', at(2026, 6, 20, 0, 1)), NOW)).toBe('today');
    expect(bucketOf(fact('completed', at(2026, 6, 19, 23, 59)), NOW)).toBe('yesterday');
    expect(bucketOf(fact('completed', at(2026, 6, 19, 0, 1)), NOW)).toBe('yesterday');
    expect(bucketOf(fact('completed', at(2026, 6, 18, 23, 59)), NOW)).toBe('earlier');
  });

  it('running and paused pin to Now WHATEVER the mtime', () => {
    const lastWeek = at(2026, 6, 12, 9, 0);
    expect(bucketOf(fact('running', lastWeek), NOW)).toBe('now');
    expect(bucketOf(fact('paused', lastWeek), NOW)).toBe('now');
    expect(bucketOf(fact('paused', 0), NOW)).toBe('now');
  });

  it('unknown status is calendar, never Now', () => {
    expect(bucketOf(fact('unknown', at(2026, 6, 20, 9, 0)), NOW)).toBe('today');
    expect(bucketOf(fact('unknown', at(2026, 6, 19, 9, 0)), NOW)).toBe('yesterday');
  });

  it('every fact lands in exactly ONE bucket — future, zero and negative mtimes included', () => {
    const statuses: RunStatus[] = ['unknown', 'running', 'completed', 'failed', 'cancelled', 'paused'];
    const mtimes = [
      at(2026, 6, 21, 3, 0), // the future (clock skew)
      NOW,
      at(2026, 6, 20, 0, 0), // exactly midnight
      at(2026, 6, 19, 23, 59),
      at(2026, 6, 19, 0, 0), // exactly yesterday's floor
      at(2020, 0, 1, 12, 0),
      0,
      -86400000,
      Number.NaN, // a corrupt stat still buckets (earlier), never crashes
    ];
    const buckets: RunBucket[] = ['now', 'today', 'yesterday', 'earlier'];
    for (const status of statuses) {
      for (const mtimeMs of mtimes) {
        const b = bucketOf(fact(status, mtimeMs), NOW);
        expect(buckets.filter((x) => x === b)).toHaveLength(1);
      }
    }
    expect(bucketOf(fact('completed', at(2026, 6, 21, 3, 0)), NOW)).toBe('today');
    expect(bucketOf(fact('completed', 0), NOW)).toBe('earlier');
    expect(bucketOf(fact('completed', -86400000), NOW)).toBe('earlier');
  });
});

describe('groupRuns — sections are answers', () => {
  it('orders Now · Today · Yesterday · Earlier and hides empty sections', () => {
    const facts = [
      fact('completed', at(2026, 6, 20, 9, 0), '/t/a.ndjson'),
      fact('running', at(2026, 6, 20, 13, 0), '/t/b.ndjson'),
      fact('failed', at(2026, 6, 18, 9, 0), '/t/c.ndjson'),
    ];
    const sections = groupRuns(facts, NOW);
    expect(sections.map((s) => s.bucket)).toEqual(['now', 'today', 'earlier']);
    expect(sections.map((s) => s.label)).toEqual(['Now — 1', 'Today — 1', 'Earlier — 1']);
    expect(sections.map((s) => s.id)).toEqual([
      'runs.section.now', 'runs.section.today', 'runs.section.earlier',
    ]);
  });

  it('never loses nor duplicates a fact across sections', () => {
    const facts = [
      fact('running', at(2026, 6, 12, 9, 0), '/t/1'),
      fact('paused', -5, '/t/2'),
      fact('completed', at(2026, 6, 21, 1, 0), '/t/3'), // future
      fact('failed', 0, '/t/4'),
      fact('unknown', Number.NaN, '/t/5'),
      fact('cancelled', at(2026, 6, 19, 12, 0), '/t/6'),
    ];
    const sections = groupRuns(facts, NOW);
    const seen = sections.flatMap((s) => s.facts.map((f) => f.fsPath));
    expect(seen.sort()).toEqual(facts.map((f) => f.fsPath).sort());
    expect(seen).toHaveLength(facts.length);
  });

  it('pins paused BEFORE running inside Now — needs-you outranks working', () => {
    const oldPaused = fact('paused', at(2026, 6, 10, 9, 0), '/t/paused-old');
    const freshRunning = fact('running', at(2026, 6, 20, 13, 59), '/t/running-fresh');
    const sections = groupRuns([freshRunning, oldPaused], NOW);
    expect(sections).toHaveLength(1);
    expect(sections[0].bucket).toBe('now');
    expect(sections[0].facts.map((f) => f.fsPath)).toEqual(['/t/paused-old', '/t/running-fresh']);
  });

  it('a non-empty Now ALWAYS keeps its header, even alone', () => {
    const sections = groupRuns([fact('running', NOW, '/t/r')], NOW);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe('Now — 1');
  });

  it('a lone calendar section dissolves — the view renders flat', () => {
    expect(groupRuns([
      fact('completed', at(2026, 6, 20, 9, 0)),
      fact('failed', at(2026, 6, 20, 10, 0), '/t/x'),
    ], NOW)).toEqual([]);
    expect(groupRuns([fact('failed', at(2026, 6, 12, 9, 0))], NOW)).toEqual([]);
  });

  it('two calendar sections keep their headers', () => {
    const sections = groupRuns([
      fact('completed', at(2026, 6, 20, 9, 0), '/t/a'),
      fact('completed', at(2026, 6, 19, 9, 0), '/t/b'),
    ], NOW);
    expect(sections.map((s) => s.label)).toEqual(['Today — 1', 'Yesterday — 1']);
  });

  it('no facts → no sections', () => {
    expect(groupRuns([], NOW)).toEqual([]);
  });

  it('sorts newest first inside calendar sections', () => {
    const sections = groupRuns([
      fact('completed', at(2026, 6, 20, 8, 0), '/t/older'),
      fact('completed', at(2026, 6, 20, 12, 0), '/t/newer'),
      fact('running', NOW, '/t/live'),
    ], NOW);
    const today = sections.find((s) => s.bucket === 'today');
    expect(today?.facts.map((f) => f.fsPath)).toEqual(['/t/newer', '/t/older']);
  });
});

describe('unreadableSection — the counted catch', () => {
  it('absent at zero, counted when journals broke', () => {
    expect(unreadableSection(0)).toBeUndefined();
    expect(unreadableSection(3)).toEqual({
      id: 'runs.section.unreadable',
      label: 'Unreadable — 3',
    });
  });

  it('speaks the toast vocabulary verbatim — one voice across surfaces', () => {
    expect(UNREADABLE_DESCRIPTION).toBe(
      'truncated (a killed run) or from another engine generation',
    );
  });
});
