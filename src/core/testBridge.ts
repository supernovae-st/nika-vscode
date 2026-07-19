// testBridge.ts — the fold → Test Explorer bridge (pure · provable).
//
// The native Test Explorer renders what WE decide per task after a
// real engine run: the verdict mapping and the message building live
// here so the law is testable without vscode. The vocabulary is the
// marathon's one voice — the same words the canvas, the Runs view and
// the report speak.

import type { FoldedTask, RunModel } from './traceFold';

export type TaskVerdict =
  | { kind: 'passed'; durationMs?: number }
  | { kind: 'failed'; message: string; durationMs?: number }
  /** Skipped/cancelled — decisions, never defects (§3.1). */
  | { kind: 'skipped' }
  /** The run never reached this task (crash upstream · trace gap). */
  | { kind: 'unknown' };

/** One task's Test Explorer verdict from the settled fold. */
export function taskVerdict(t: FoldedTask | undefined): TaskVerdict {
  if (!t) { return { kind: 'unknown' }; }
  switch (t.status) {
    case 'success':
      return { kind: 'passed', ...(t.durationMs !== undefined ? { durationMs: t.durationMs } : {}) };
    case 'failed': {
      const parts: string[] = [];
      parts.push(t.preview ?? 'failed — no detail recorded');
      if (t.retries > 0) { parts.push(`after ${t.retries + 1} attempts`); }
      if (t.agent?.stalled !== undefined) {
        parts.push(`the agent loop stalled (period ${t.agent.stalled.period} · ×${t.agent.stalled.repeats})`);
      }
      return {
        kind: 'failed',
        message: parts.join(' · '),
        ...(t.durationMs !== undefined ? { durationMs: t.durationMs } : {}),
      };
    }
    case 'skipped':
    case 'cancelled':
      return { kind: 'skipped' };
    default:
      return { kind: 'unknown' };
  }
}

/** The workflow-level line for the run's end (the run card voice). */
export function runSummaryLine(model: RunModel): string {
  const tasks = [...model.tasks.values()];
  const ok = tasks.filter((t) => t.status === 'success').length;
  const bad = tasks.filter((t) => t.status === 'failed').length;
  const rest = tasks.length - ok - bad;
  return `${ok} passed · ${bad} failed${rest > 0 ? ` · ${rest} skipped/other` : ''}`;
}
