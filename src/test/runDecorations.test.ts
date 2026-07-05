// The badge FORMAT — the pure half of runDecorations (the vscode half is
// glue: one decoration type + apply/clear wiring). The status quartet is
// proven on REAL nika 0.92.0 flight-recorder captures; the duration/cost
// ladders on synthetic values the mock fixtures cannot produce (mock runs
// settle in 0-1ms and spend $0).

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  foldTrace,
  formatRunBadge,
  formatUsd,
  humanizeDuration,
  type FoldedTask,
} from '../core/traceFold';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const fixtureFold = (name: string): ReturnType<typeof foldTrace> =>
  foldTrace(fs.readFileSync(path.join(FIXTURES, name), 'utf-8'));

function task(over: Partial<FoldedTask>): FoldedTask {
  return { id: 't', status: 'success', retries: 0, ...over };
}

describe('humanizeDuration', () => {
  it('sub-second stays in ms', () => {
    expect(humanizeDuration(999)).toBe('999ms');
    expect(humanizeDuration(0)).toBe('0ms');
  });

  it('seconds get one decimal', () => {
    expect(humanizeDuration(1000)).toBe('1.0s');
    expect(humanizeDuration(1200)).toBe('1.2s');
    expect(humanizeDuration(59_400)).toBe('59.4s');
  });

  it('minutes read NmSS with zero-padded seconds', () => {
    expect(humanizeDuration(123_000)).toBe('2m03');
    expect(humanizeDuration(60_000)).toBe('1m00');
    // Rounds via total seconds — never the 1m60 artifact.
    expect(humanizeDuration(119_950)).toBe('2m00');
  });
});

describe('formatUsd', () => {
  it('caps at 4 decimals and trims trailing zeros', () => {
    expect(formatUsd(0.003)).toBe('$0.003');
    expect(formatUsd(0.0001235)).toBe('$0.0001');
    expect(formatUsd(1.5)).toBe('$1.5');
    expect(formatUsd(2)).toBe('$2');
    expect(formatUsd(0)).toBe('$0');
  });
});

describe('formatRunBadge', () => {
  it('renders glyph · duration · cost for a settled task', () => {
    expect(formatRunBadge(task({ durationMs: 1200, usd: 0.003 }))).toBe(' ✓ 1.2s · $0.003');
  });

  it('failed keeps the facts it can prove', () => {
    expect(formatRunBadge(task({ status: 'failed', durationMs: 2000 }))).toBe(' ✗ 2.0s');
  });

  it('pending gets NO badge (a task that never moved is noise)', () => {
    expect(formatRunBadge(task({ status: 'pending' }))).toBeUndefined();
  });
});

describe('badges from real flight-recorder captures (nika 0.92.0 wire)', () => {
  it('failed run folds the full quartet: ✓ · ⊘ · ✗ · ◼', () => {
    const model = fixtureFold('fixture-run-failed.ndjson');
    expect(model.workflowStatus).toBe('failed');
    // discover completed (duration_ms: 0 on the wire) — green with a fact.
    expect(formatRunBadge(model.tasks.get('discover')!)).toBe(' ✓ 0ms');
    // process skipped (empty for_each collection) — bare glyph, no facts.
    expect(formatRunBadge(model.tasks.get('process')!)).toBe(' ⊘');
    // survivors failed (jq runtime error) — the red badge.
    expect(formatRunBadge(model.tasks.get('survivors')!)).toBe(' ✗ 0ms');
    // merge cancelled (upstream failed) — §3.1: a decision, never red.
    expect(formatRunBadge(model.tasks.get('merge')!)).toBe(' ◼');
  });

  it('green run badges every task ✓ with its wire duration', () => {
    const model = fixtureFold('fixture-run-a.ndjson');
    expect(model.workflowStatus).toBe('completed');
    expect(model.tasks.size).toBe(4);
    for (const t of model.tasks.values()) {
      expect(formatRunBadge(t)).toMatch(/^ ✓ \dms$/);
    }
    // The v2 wire carries tokens on terminal events — the fold sums them.
    expect(model.totalTokens ?? 0).toBeGreaterThan(0);
  });
});

describe('per-task usd from the wire', () => {
  it('folds terminal cost_usd onto the task (badge shows spend)', () => {
    // Synthetic line in the exact Diamond shape — the mock provider runs
    // free, so no fixture can prove the cost path.
    const line = (kind: string, fields: Array<{ key: string; value: unknown }>): string =>
      JSON.stringify({ timestamp: { unix_ms: 0 }, kind, fields });
    const model = foldTrace([
      line('task_started', [{ key: 'task', value: 'a' }]),
      line('task_completed', [
        { key: 'task', value: 'a' },
        { key: 'duration_ms', value: 1200 },
        { key: 'cost_usd', value: { float: 0.003 } },
      ]),
    ].join('\n'));
    expect(model.tasks.get('a')?.usd).toBeCloseTo(0.003);
    expect(model.totalUsd).toBeCloseTo(0.003);
    expect(formatRunBadge(model.tasks.get('a')!)).toBe(' ✓ 1.2s · $0.003');
  });
});
