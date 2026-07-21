import { describe, expect, it } from 'vitest';
import { RunNarrator, type RunCounts } from '../core/runNarrator';

const counts = (complete: number, running: number, failed = 0, total = 7): RunCounts =>
  ({ total, complete, running, failed });

describe('RunNarrator (the coalesced run voice)', () => {
  it('run start is assertive and counts its tasks', () => {
    const n = new RunNarrator();
    expect(n.runStarted(7, 0)).toEqual({ channel: 'assertive', text: 'Run started, 7 tasks' });
    expect(n.runStarted(1, 0).text).toBe('Run started, 1 task');
    expect(n.isActive).toBe(true);
  });

  it('milestones are polite, throttled and deduplicated — never every tick', () => {
    const n = new RunNarrator(2000);
    n.runStarted(7, 0);
    // Inside the gap: the summary parks, the caller learns the wait.
    const early = n.progress(counts(1, 2), 500);
    expect(early.line).toBeNull();
    expect(early.flushInMs).toBe(1500);
    // The parked line ripens through flush() once the gap has passed.
    expect(n.flush(1999)).toBeNull();
    expect(n.flush(2000)).toEqual({ channel: 'polite', text: '1 of 7 tasks complete, 2 running' });
    // Same census again → silence (dedup), even past the gap.
    expect(n.progress(counts(1, 2), 9000)).toEqual({ line: null, flushInMs: null });
    // A new census past the gap speaks immediately.
    const due = n.progress(counts(3, 1), 12000);
    expect(due.line).toEqual({ channel: 'polite', text: '3 of 7 tasks complete, 1 running' });
    expect(due.flushInMs).toBeNull();
  });

  it('a newer census replaces the parked one — the flush speaks the latest', () => {
    const n = new RunNarrator(2000);
    n.runStarted(7, 0);
    n.progress(counts(1, 2), 100);
    n.progress(counts(2, 2), 900);
    expect(n.flush(2100)?.text).toBe('2 of 7 tasks complete, 2 running');
    expect(n.flush(5000)).toBeNull(); // nothing left parked
  });

  it('failures are assertive, immediate, once per task per run', () => {
    const n = new RunNarrator();
    n.runStarted(3, 0);
    expect(n.taskFailed('digest', 'NIKA-INFER-003 · provider refused'))
      .toEqual({ channel: 'assertive', text: 'Task digest failed: NIKA-INFER-003 · provider refused' });
    expect(n.taskFailed('digest', 'again')).toBeNull(); // dedup
    expect(n.taskFailed('notes', undefined)?.text).toBe('Task notes failed');
    // A fresh run clears the dedup set.
    n.runStarted(3, 50000);
    expect(n.taskFailed('digest', undefined)).not.toBeNull();
  });

  it('outside a live run the narrator stays silent (replay scrubs read on focus)', () => {
    const n = new RunNarrator();
    expect(n.taskFailed('digest', 'x')).toBeNull();
    expect(n.progress(counts(2, 1), 5000)).toEqual({ line: null, flushInMs: null });
    n.runStarted(3, 0);
    n.runStopped();
    expect(n.taskFailed('digest', 'x')).toBeNull();
    expect(n.flush(99999)).toBeNull();
  });

  it('the verdict routes politeness by consequence and closes the run', () => {
    const n = new RunNarrator();
    n.runStarted(3, 0);
    expect(n.verdict('run succeeded · 3 ✓', false)).toEqual({ channel: 'polite', text: 'run succeeded · 3 ✓' });
    expect(n.isActive).toBe(false);
    n.runStarted(3, 0);
    n.progress(counts(1, 1), 100); // parked milestone must die with the close
    expect(n.verdict('run failed · 1 ✗', true).channel).toBe('assertive');
    expect(n.flush(99999)).toBeNull();
  });

  it('failed counts ride the milestone; an empty graph says nothing', () => {
    const n = new RunNarrator(0);
    n.runStarted(7, 0);
    expect(n.progress(counts(3, 1, 1), 10).line?.text)
      .toBe('3 of 7 tasks complete, 1 running, 1 failed');
    expect(n.progress({ total: 0, complete: 0, running: 0, failed: 0 }, 20))
      .toEqual({ line: null, flushInMs: null });
  });
});
