// runNarrator.ts — the run's voice, coalesced (one narrator per canvas).
//
// Screen-reader strategy for live runs: ONE live region narrates the
// whole canvas — never a region per node (fifty live nodes would be
// chaos). Politeness is split by consequence:
//   - run start        → assertive ("Run started, N tasks" — a context
//                        switch the reader should not sit on);
//   - lifecycle        → polite MILESTONES, throttled (≥ minGapMs
//                        between flushes) and deduplicated — "3 of 7
//                        tasks complete, 2 running", never every tick;
//   - task failures    → assertive, immediately, once per task per run;
//   - the close        → the verdict banner's own line (polite when the
//                        run settled green or was cancelled; assertive
//                        when it failed or paused — a blocking state).
//
// Pure module: the caller owns the clock (performance.now()) and the
// flush timer. This class only decides WHAT to say and WHEN it is due,
// so the coalescing contract is testable without a DOM.

export type NarratorChannel = 'polite' | 'assertive';

export interface NarratorLine {
  channel: NarratorChannel;
  text: string;
}

/** Live status census over the graph — the milestone's raw material. */
export interface RunCounts {
  total: number;
  complete: number;
  running: number;
  failed: number;
}

export class RunNarrator {
  private active = false;
  private lastFlushAt = Number.NEGATIVE_INFINITY;
  private lastSpoken = '';
  private pending: string | null = null;
  private readonly failedSpoken = new Set<string>();

  constructor(private readonly minGapMs = 2000) {}

  get isActive(): boolean {
    return this.active;
  }

  /** Run start — assertive context switch; every counter resets. The
   *  polite clock starts NOW so the first milestone leaves the start
   *  line a full gap of air. */
  runStarted(taskCount: number, now: number): NarratorLine {
    this.active = true;
    this.failedSpoken.clear();
    this.pending = null;
    this.lastSpoken = '';
    this.lastFlushAt = now;
    return {
      channel: 'assertive',
      text: `Run started, ${taskCount} task${taskCount === 1 ? '' : 's'}`,
    };
  }

  /** The extension said the run is no longer live — parked milestones
   *  drop (the verdict line is the close, not a stale count). */
  runStopped(): void {
    this.active = false;
    this.pending = null;
  }

  /** A task flipped to failed — assertive, once per task per run.
   *  Outside a live run (replay scrubs, trace loads) the narrator
   *  stays silent: recorded history is read on focus, not announced. */
  taskFailed(taskId: string, preview: string | undefined): NarratorLine | null {
    if (!this.active || this.failedSpoken.has(taskId)) {
      return null;
    }
    this.failedSpoken.add(taskId);
    return {
      channel: 'assertive',
      text: `Task ${taskId} failed${preview ? `: ${preview}` : ''}`,
    };
  }

  /** Lifecycle tick. Returns the line when a flush is due; otherwise
   *  parks the summary and answers how long until it ripens (the
   *  caller schedules ONE timer and calls flush()). */
  progress(counts: RunCounts, now: number): { line: NarratorLine | null; flushInMs: number | null } {
    if (!this.active) {
      return { line: null, flushInMs: null };
    }
    const text = summarize(counts);
    if (text === null || text === this.lastSpoken) {
      this.pending = null;
      return { line: null, flushInMs: null };
    }
    const wait = this.minGapMs - (now - this.lastFlushAt);
    if (wait > 0) {
      this.pending = text;
      return { line: null, flushInMs: wait };
    }
    this.lastFlushAt = now;
    this.lastSpoken = text;
    this.pending = null;
    return { line: { channel: 'polite', text }, flushInMs: null };
  }

  /** The parked milestone, if one is still due (the caller's timer). */
  flush(now: number): NarratorLine | null {
    if (!this.active || this.pending === null || now - this.lastFlushAt < this.minGapMs) {
      return null;
    }
    const text = this.pending;
    this.pending = null;
    this.lastFlushAt = now;
    this.lastSpoken = text;
    return { channel: 'polite', text };
  }

  /** The run's close — the verdict banner travels as-is (one voice with
   *  the visible banner). Blocking closes (failed · paused) speak
   *  assertive; green and cancelled stay polite. */
  verdict(text: string, blocking: boolean): NarratorLine {
    this.active = false;
    this.pending = null;
    return { channel: blocking ? 'assertive' : 'polite', text };
  }
}

function summarize(c: RunCounts): string | null {
  if (c.total === 0) {
    return null;
  }
  const parts = [`${c.complete} of ${c.total} tasks complete`];
  if (c.running > 0) {
    parts.push(`${c.running} running`);
  }
  if (c.failed > 0) {
    parts.push(`${c.failed} failed`);
  }
  return parts.join(', ');
}
