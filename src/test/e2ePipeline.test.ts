// Deep end-to-end: traces written by the ENGINE'S OWN TraceFileSink
// (feat/b1-trace-writer · .nika/traces/ · no shell redirection) driven
// through the extension's ENTIRE data pipeline — fold → timeline →
// scrub states → run-diff. This is the demo-60s data chain proven on
// real artifacts: if the engine's wire and the extension's readers ever
// drift, THIS is the test that goes red.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { diffRuns, summarizeDiff } from '../core/runDiff';
import { foldTrace, summarizeRun, type RunModel } from '../core/traceFold';
import { buildTraceTimeline, statesAt } from '../core/traceTimeline';

const DIR = join(__dirname, 'fixtures', 'b1-writer');

const models = new Map<string, RunModel>();
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.ndjson')).sort()) {
  models.set(f, foldTrace(readFileSync(join(DIR, f), 'utf8')));
}
const greens = [...models.values()].filter((m) => m.workflowStatus === 'completed');
const fails = [...models.values()].filter((m) => m.workflowStatus === 'failed');

describe('b1 writer → extension fold (the wire holds)', () => {
  it('folded all three writer-born traces with zero unknown lines', () => {
    expect(models.size).toBe(3);
    expect(greens.length).toBe(2);
    expect(fails.length).toBe(1);
    for (const m of models.values()) {
      // Every line the engine writes must be a shape the extension knows —
      // one unknown line means the wire and the reader have diverged.
      expect(m.unknownLines).toBe(0);
      expect(m.tasks.size).toBe(9);
    }
  });

  it('green runs carry coherent clocks on every task', () => {
    for (const m of greens) {
      expect(m.startMs).toBeDefined();
      expect(m.endMs).toBeGreaterThanOrEqual(m.startMs ?? 0);
      for (const t of m.tasks.values()) {
        expect(t.status).toBe('success');
        expect(t.durationMs).toBeGreaterThanOrEqual(0);
        if (t.startMs !== undefined && t.endMs !== undefined) {
          expect(t.endMs).toBeGreaterThanOrEqual(t.startMs);
        }
      }
    }
  });

  it('the failed run tells the whole story (failed + cancelled downstream)', () => {
    const m = fails[0];
    const statuses = [...m.tasks.values()].map((t) => t.status);
    expect(statuses).toContain('failed');
    expect(statuses).toContain('cancelled');
    const failed = [...m.tasks.values()].find((t) => t.status === 'failed');
    // The NIKA-XXX story rides the wire into the hover preview.
    expect(failed?.preview).toBeTruthy();
  });
});

describe('writer traces → the platine (timeline + scrub states)', () => {
  it('builds a monotone timeline with real-event ticks', () => {
    const tl = buildTraceTimeline(greens[0]);
    expect(tl).toBeDefined();
    if (!tl) { return; }
    expect(tl.totalMs).toBeGreaterThan(0);
    expect(tl.ticks.length).toBeGreaterThan(0);
    const sorted = [...tl.ticks].sort((a, b) => a - b);
    expect(tl.ticks).toEqual(sorted);
    for (const tick of tl.ticks) {
      expect(tick).toBeGreaterThanOrEqual(0);
      expect(tick).toBeLessThanOrEqual(1);
    }
  });

  it('scrubbing p through [0..1] is monotone per task (pending→running→terminal)', () => {
    const tl = buildTraceTimeline(greens[0]);
    if (!tl) { return; }
    const RANK: Record<string, number> = { pending: 0, running: 1, success: 2, failed: 2, skipped: 2, cancelled: 2 };
    const last = new Map<string, number>();
    for (let step = 0; step <= 20; step++) {
      const states = statesAt(tl, step / 20);
      for (const [id, st] of states) {
        const rank = RANK[st.status] ?? 0;
        expect(rank).toBeGreaterThanOrEqual(last.get(id) ?? 0);
        last.set(id, rank);
      }
    }
    // At p=1 every task has reached its terminal state.
    const final = statesAt(tl, 1);
    for (const [, st] of final) { expect(RANK[st.status]).toBe(2); }
  });
});

describe('writer traces → run-diff (the differentiator on real wire)', () => {
  it('green vs green: only timing verdicts, never phantom adds/removes', () => {
    const diff = diffRuns(greens[0], greens[1]);
    expect(diff.tasks).toHaveLength(9);
    expect(diff.counts.added + diff.counts.removed + diff.counts.statusChanged).toBe(0);
  });

  it('green vs failed: the regression story leads with status flips', () => {
    const diff = diffRuns(greens[0], fails[0]);
    expect(diff.counts.statusChanged).toBeGreaterThan(0);
    expect(diff.tasks[0].kind).toBe('status-changed');
    expect(summarizeDiff(diff)).toMatch(/status/);
  });
});

// ─── A REAL LOCAL RUN (ollama/qwen3.5:4b · release binary 0.95.0) ────────────
// The mock fixtures above prove the wire's SHAPE; this one pins the wire's
// LOCAL truth — recorded 2026-07-06 from `nika run` (release 0.95.0) against
// a live Ollama serving qwen3.5:4b: 1149 real tokens, an 82.9s infer (the
// thinking-model class the 180s provider deadline exists for), and NO
// cost_usd anywhere — a sovereign model is « unpriced », never « $0.00 paid ».
// If the reader ever misreads absent-cost as zero-cost (or chokes on a
// minute-long duration), THIS goes red.
describe('a real local run → the fold (sovereign wire truth)', () => {
  const model = foldTrace(
    readFileSync(join(__dirname, 'fixtures', 'local-real', 'chain-ollama-qwen35-4b.ndjson'), 'utf8'),
  );

  it('folds clean: completed, 3 tasks, zero unknown lines', () => {
    expect(model.workflowStatus).toBe('completed');
    expect(model.tasks.size).toBe(3);
    expect(model.unknownLines).toBe(0);
  });

  it('carries the real token count but NO dollar figure — local is unpriced', () => {
    expect(model.totalTokens).toBeGreaterThan(1000);
    expect(model.totalUsd).toBeUndefined();
    const card = summarizeRun(model);
    expect(card).toContain('tok');
    expect(card).not.toContain('$');
  });

  it('survives a minute-scale infer duration (the local thinking-model class)', () => {
    const think = model.tasks.get('think');
    expect(think?.status).toBe('success');
    expect(think?.durationMs).toBeGreaterThan(60_000);
    expect(summarizeRun(model)).toContain('83.0s');
  });
});
