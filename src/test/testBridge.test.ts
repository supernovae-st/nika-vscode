// testBridge.test.ts — the fold → Test Explorer law (W-NATIVE).
//
// §3.1 held: skipped and cancelled are DECISIONS, never defects — they
// map to skipped, never failed. A failure's message speaks the one
// vocabulary (preview · attempts · stall evidence).

import { describe, it, expect } from 'vitest';
import { runSummaryLine, taskVerdict } from '../core/testBridge';

describe('taskVerdict — §3.1 into the Test Explorer', () => {
  it('success passes with its real clock', () => {
    expect(taskVerdict({ id: 'a', status: 'success', retries: 0, durationMs: 1200 } as never))
      .toEqual({ kind: 'passed', durationMs: 1200 });
  });

  it('a failure narrates: preview · attempts · stall evidence', () => {
    const v = taskVerdict({
      id: 'a', status: 'failed', retries: 2, durationMs: 900,
      preview: 'NIKA-INFER-003 · provider refused',
      agent: { stalled: { period: 1, repeats: 5 } },
    } as never);
    expect(v.kind).toBe('failed');
    if (v.kind === 'failed') {
      expect(v.message).toContain('NIKA-INFER-003');
      expect(v.message).toContain('after 3 attempts');
      expect(v.message).toContain('stalled (period 1 · ×5)');
    }
  });

  it('skipped and cancelled are decisions — never failures', () => {
    expect(taskVerdict({ id: 'a', status: 'skipped', retries: 0 } as never).kind).toBe('skipped');
    expect(taskVerdict({ id: 'a', status: 'cancelled', retries: 0 } as never).kind).toBe('skipped');
  });

  it('an absent task is unknown — the run never reached it', () => {
    expect(taskVerdict(undefined).kind).toBe('unknown');
  });
});

describe('runSummaryLine', () => {
  it('speaks the run card voice', () => {
    const model = {
      tasks: new Map([
        ['a', { id: 'a', status: 'success', retries: 0 }],
        ['b', { id: 'b', status: 'failed', retries: 0 }],
        ['c', { id: 'c', status: 'skipped', retries: 0 }],
      ]),
    } as never;
    expect(runSummaryLine(model)).toBe('1 passed · 1 failed · 1 skipped/other');
  });
});
