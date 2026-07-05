import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { foldTrace } from '../core/traceFold';
import {
  buildTraceTimeline,
  statesAt,
  snapNext,
  snapPrev,
  formatClock,
  type TraceTimeline,
} from '../core/traceTimeline';

// Real nika 0.92.0 flight-recorder captures (signature-demo · 4 verbs ·
// mock/echo offline) — the wire as the engine actually writes it.
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const fixtureTimeline = (name: string): { tl: TraceTimeline; fold: ReturnType<typeof foldTrace> } => {
  const fold = foldTrace(fs.readFileSync(path.join(FIXTURES, name), 'utf-8'));
  const tl = buildTraceTimeline(fold);
  expect(tl).toBeDefined();
  if (!tl) { throw new Error('unreachable'); }
  return { tl, fold };
};

const RANK: Record<string, number> = { pending: 0, running: 1 };
const rankOf = (status: string): number => RANK[status] ?? 2;

describe('buildTraceTimeline', () => {
  it('normalizes the green signature run onto [0, 1]', () => {
    const { tl, fold } = fixtureTimeline('sig-run-a.ndjson');
    expect(tl.totalMs).toBeGreaterThan(0);
    expect(tl.tasks).toHaveLength(fold.tasks.size);
    for (const t of tl.tasks) {
      expect(t.startFrac).toBeGreaterThanOrEqual(0);
      expect(t.endFrac).toBeLessThanOrEqual(1);
      expect(t.startFrac).toBeLessThanOrEqual(t.endFrac);
    }
  });

  it('emits sorted in-range ticks only for tasks that actually started', () => {
    const { tl, fold } = fixtureTimeline('sig-run-a.ndjson');
    const started = [...fold.tasks.values()].filter((t) => t.startMs !== undefined).length;
    expect(tl.ticks.length).toBeGreaterThan(0);
    expect(tl.ticks.length).toBeLessThanOrEqual(started);
    for (let i = 1; i < tl.ticks.length; i++) {
      expect(tl.ticks[i]).toBeGreaterThan(tl.ticks[i - 1]);
    }
    expect(tl.ticks[0]).toBeGreaterThanOrEqual(0);
    expect(tl.ticks[tl.ticks.length - 1]).toBeLessThanOrEqual(1);
  });

  it('carries 0 and 1 as snap boundaries, sorted unique', () => {
    const { tl } = fixtureTimeline('sig-run-failed.ndjson');
    expect(tl.events[0]).toBe(0);
    expect(tl.events[tl.events.length - 1]).toBe(1);
    for (let i = 1; i < tl.events.length; i++) {
      expect(tl.events[i]).toBeGreaterThan(tl.events[i - 1]);
    }
  });

  it('refuses traces with no usable clock', () => {
    expect(buildTraceTimeline(foldTrace(''))).toBeUndefined();
    // Single-instant trace: every event on the same clock → zero span.
    const at = JSON.stringify({
      timestamp: 1_700_000_000_000,
      kind: 'task_started',
      fields: [{ key: 'task', value: 'a' }],
    });
    expect(buildTraceTimeline(foldTrace(at))).toBeUndefined();
  });
});

describe('statesAt', () => {
  it('p=0 shows the pre-run world: everything pending', () => {
    const { tl } = fixtureTimeline('sig-run-a.ndjson');
    for (const [, s] of statesAt(tl, 0)) {
      expect(s.status).toBe('pending');
      expect(s.durationMs).toBeUndefined();
    }
  });

  it('p=1 replays the fold verdict exactly, durations attached', () => {
    const { tl, fold } = fixtureTimeline('sig-run-a.ndjson');
    const states = statesAt(tl, 1);
    for (const task of fold.tasks.values()) {
      const s = states.get(task.id);
      expect(s?.status).toBe(task.status);
      expect(s?.durationMs).toBe(task.durationMs);
    }
  });

  it('p=1 on the failed run surfaces failed AND cancelled verdicts', () => {
    const { tl, fold } = fixtureTimeline('sig-run-failed.ndjson');
    const states = statesAt(tl, 1);
    const statuses = [...states.values()].map((s) => s.status);
    expect(statuses).toContain('failed');
    expect(statuses).toContain('cancelled');
    for (const task of fold.tasks.values()) {
      expect(states.get(task.id)?.status).toBe(task.status);
    }
  });

  it('clamps out-of-range p to the boundary states', () => {
    const { tl } = fixtureTimeline('sig-run-a.ndjson');
    expect([...statesAt(tl, -0.5).values()].every((s) => s.status === 'pending')).toBe(true);
    const past = statesAt(tl, 1.5);
    const at1 = statesAt(tl, 1);
    for (const [id, s] of past) { expect(s.status).toBe(at1.get(id)?.status); }
  });

  it('every task advances monotonically pending → running → final as p grows', () => {
    for (const name of ['sig-run-a.ndjson', 'sig-run-failed.ndjson']) {
      const { tl } = fixtureTimeline(name);
      const last = new Map<string, number>();
      for (let i = 0; i <= 200; i++) {
        const states = statesAt(tl, i / 200);
        for (const [id, s] of states) {
          const rank = rankOf(s.status);
          expect(rank).toBeGreaterThanOrEqual(last.get(id) ?? 0);
          last.set(id, rank);
        }
      }
      // ... and the sweep ends with every task at its terminal rank.
      for (const t of tl.tasks) {
        expect(rankOf(statesAt(tl, 1).get(t.id)?.status ?? 'pending'))
          .toBe(t.status === 'pending' ? 0 : 2);
      }
    }
  });

  it('a running snapshot never leaks a duration badge', () => {
    const { tl } = fixtureTimeline('sig-run-a.ndjson');
    for (let i = 1; i < 200; i++) {
      for (const [, s] of statesAt(tl, i / 200)) {
        if (s.status === 'running') { expect(s.durationMs).toBeUndefined(); }
      }
    }
  });
});

describe('snap', () => {
  it('bounds: next at 1 stays 1 · prev at 0 stays 0', () => {
    const { tl } = fixtureTimeline('sig-run-a.ndjson');
    expect(snapNext(tl.events, 1)).toBe(1);
    expect(snapPrev(tl.events, 0)).toBe(0);
  });

  it('walks strictly forward/backward through the boundaries', () => {
    const { tl } = fixtureTimeline('sig-run-a.ndjson');
    let p = 0;
    const seen: number[] = [p];
    for (let guard = 0; guard < 1000 && p < 1; guard++) {
      const next = snapNext(tl.events, p);
      expect(next).toBeGreaterThan(p);
      seen.push(next);
      p = next;
    }
    expect(p).toBe(1);
    expect(seen).toEqual(tl.events);
    // ... and back down.
    for (let i = seen.length - 1; i > 0; i--) {
      expect(snapPrev(tl.events, seen[i])).toBeCloseTo(seen[i - 1], 12);
    }
  });
});

describe('formatClock', () => {
  it('reads m:ss.tenth on second-scale runs', () => {
    expect(formatClock(3200, 12800)).toBe('0:03.2');
    expect(formatClock(12800, 12800)).toBe('0:12.8');
    expect(formatClock(65000, 65000)).toBe('1:05.0');
    expect(formatClock(0, 12800)).toBe('0:00.0');
  });

  it('reads raw milliseconds on sub-second runs (mock traces)', () => {
    expect(formatClock(4, 7)).toBe('4ms');
    expect(formatClock(0, 7)).toBe('0ms');
  });
});

// ─── Resume replay (ADR-099 · the ↻ survives the platine) ───────────────────

describe('resume timeline (real 0.93.1 resume-mixed fixture)', () => {
  it('statesAt(1) hands the cached flag with the settled state', () => {
    const { tl } = fixtureTimeline('resume-mixed.ndjson');
    const end = statesAt(tl, 1);
    expect(end.get('seed')).toMatchObject({ status: 'success', cached: true });
    expect(end.get('side')).toMatchObject({ status: 'success', cached: true });
    // The re-executed task scrubs back to a plain success — no ↻.
    expect(end.get('expand')?.status).toBe('success');
    expect(end.get('expand')?.cached).toBeUndefined();
  });
});
