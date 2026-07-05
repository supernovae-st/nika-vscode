import { describe, expect, it } from 'vitest';
import { frameAt, timelineBounds } from '../core/replayFrame';
import type { TimelineEntry } from '../core/traceFold';

const TL: TimelineEntry[] = [
  { atMs: 0, taskId: 'a', status: 'running' },
  { atMs: 10, taskId: 'a', status: 'success', durationMs: 10 },
  { atMs: 10, taskId: 'b', status: 'running' },
  { atMs: 25, taskId: 'b', status: 'failed', durationMs: 15 },
  { atMs: 25, taskId: 'c', status: 'skipped' },
];
const IDS = ['a', 'b', 'c'];

function statusAt(t: number): Record<string, string> {
  return Object.fromEntries(frameAt(TL, t, IDS).map((f) => [f.taskId, f.status]));
}

describe('frameAt (DAG state at an instant)', () => {
  it('at t0 everything before-or-at fires; the rest is pending', () => {
    expect(statusAt(0)).toEqual({ a: 'running', b: 'pending', c: 'pending' });
  });

  it('mid-run reflects the last transition ≤ T per task', () => {
    expect(statusAt(10)).toEqual({ a: 'success', b: 'running', c: 'pending' });
    expect(statusAt(24)).toEqual({ a: 'success', b: 'running', c: 'pending' });
  });

  it('at the end every terminal state is settled', () => {
    expect(statusAt(25)).toEqual({ a: 'success', b: 'failed', c: 'skipped' });
    expect(statusAt(9999)).toEqual({ a: 'success', b: 'failed', c: 'skipped' });
  });

  it('scrubbing BACK to before t0 resets the whole graph to pending', () => {
    expect(statusAt(-1)).toEqual({ a: 'pending', b: 'pending', c: 'pending' });
  });

  it('carries the duration of the winning transition', () => {
    const a = frameAt(TL, 30, IDS).find((f) => f.taskId === 'a');
    expect(a?.durationMs).toBe(10);
    const c = frameAt(TL, 30, IDS).find((f) => f.taskId === 'c');
    expect(c?.durationMs).toBeUndefined();
  });

  it('seeds ids absent from the timeline as pending (complete frame)', () => {
    expect(statusAt(30)).toHaveProperty('c');
    const withExtra = frameAt(TL, 30, ['a', 'b', 'c', 'never_ran']);
    expect(withExtra.find((f) => f.taskId === 'never_ran')?.status).toBe('pending');
  });
});

describe('timelineBounds', () => {
  it('spans first to last entry', () => {
    expect(timelineBounds(TL)).toEqual({ startMs: 0, endMs: 25 });
  });
  it('is zero-width on an empty timeline', () => {
    expect(timelineBounds([])).toEqual({ startMs: 0, endMs: 0 });
  });
});
