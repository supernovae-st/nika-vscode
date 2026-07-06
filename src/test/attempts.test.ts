import { describe, expect, it } from 'vitest';
import { attemptLadders, renderLadder } from '../core/attempts';

const ev = (kind: string, task: string, detail?: string, ts = 1_000_000_000): string =>
  JSON.stringify({
    id: { uuid: 'x' }, timestamp: ts, kind, run: null, correlation: null,
    fields: [
      { key: 'task', value: task },
      ...(detail !== undefined ? [{ key: 'detail', value: detail }] : []),
    ],
  });

describe('attemptLadders', () => {
  it('builds the per-attempt story: retries then the terminal word', () => {
    const trace = [
      ev('task_started', 'fetch'),
      ev('task_retrying', 'fetch', 'NIKA-NET-020 · connection reset', 2_000_000_000),
      ev('task_retrying', 'fetch', 'NIKA-NET-020 · connection reset', 4_000_000_000),
      ev('task_failed', 'fetch', 'NIKA-NET-021 · gave up after 3 attempts', 9_000_000_000),
    ].join('\n');
    const ladder = attemptLadders(trace).get('fetch')!;
    expect(ladder).toHaveLength(3);
    expect(ladder[0]).toMatchObject({ n: 1, outcome: 'retried', atMs: 1000 });
    expect(ladder[2]).toMatchObject({ n: 3, outcome: 'failed' });
    expect(ladder[2].detail).toContain('gave up');
    const lines = renderLadder(ladder);
    expect(lines[0]).toContain('↻ attempt 1 · 1.0s — NIKA-NET-020');
    expect(lines[2]).toContain('✗ attempt 3');
  });

  it('clean tasks and detail-less lone failures tell no story', () => {
    const trace = [
      ev('task_completed', 'ok_task'),
      ev('task_failed', 'silent_fail'), // no detail — the badge already says failed
      ev('task_failed', 'loud_fail', 'NIKA-SEC-004 · write outside boundary'),
    ].join('\n');
    const ladders = attemptLadders(trace);
    expect(ladders.has('ok_task')).toBe(false);
    expect(ladders.has('silent_fail')).toBe(false);
    expect(ladders.get('loud_fail')![0].detail).toContain('NIKA-SEC-004');
  });

  it('corrupt lines never break the ladder', () => {
    expect(() => attemptLadders('{nope\n' + ev('task_retrying', 'x', 'd'))).not.toThrow();
  });
});
