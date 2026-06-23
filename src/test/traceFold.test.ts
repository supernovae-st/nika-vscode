import { describe, it, expect } from 'vitest';
import { foldTrace, normalizeEventLine, summarizeRun } from '../core/traceFold';

function diamondLine(kind: string, opts: { task?: string; ts?: number; usd?: number } = {}): string {
  const fields: Array<{ key: string; value: unknown }> = [];
  if (opts.task) { fields.push({ key: 'task', value: opts.task }); }
  if (opts.usd !== undefined) { fields.push({ key: 'usd', value: { float: opts.usd } }); }
  return JSON.stringify({
    id: '00000000-0000-0000-0000-000000000000',
    timestamp: { unix_ms: opts.ts ?? 0 },
    kind,
    run: 'run-1',
    fields,
  });
}

describe('normalizeEventLine', () => {
  it('reads the Diamond nika-event shape (kind slug + fields kv)', () => {
    const ev = normalizeEventLine(diamondLine('task_started', { task: 'fetch', ts: 1000 }));
    expect(ev).toMatchObject({ kind: 'task_started', taskId: 'fetch', tsMs: 1000 });
  });

  it('reads the brouillon generation shape (kind.type tag)', () => {
    const ev = normalizeEventLine(JSON.stringify({
      ts: '2026-05-24T16:19:00Z',
      kind: { type: 'TaskCompleted', task_id: 'render' },
    }));
    expect(ev?.kind).toBe('task_completed');
    expect(ev?.taskId).toBe('render');
    expect(ev?.tsMs).toBeGreaterThan(0);
  });

  it('returns undefined on garbage without throwing', () => {
    expect(normalizeEventLine('not json')).toBeUndefined();
    expect(normalizeEventLine('42')).toBeUndefined();
    expect(normalizeEventLine('{"kind": 7}')).toBeUndefined();
  });
});

describe('foldTrace', () => {
  it('folds a full run with durations, retries, cost and terminal status', () => {
    const trace = [
      diamondLine('workflow_started', { ts: 0 }),
      diamondLine('task_scheduled', { task: 'a', ts: 1 }),
      diamondLine('task_started', { task: 'a', ts: 10 }),
      diamondLine('cost_incurred', { usd: 0.02, ts: 500 }),
      diamondLine('task_retrying', { task: 'a', ts: 600 }),
      diamondLine('task_completed', { task: 'a', ts: 1510 }),
      diamondLine('task_started', { task: 'b', ts: 1520 }),
      diamondLine('task_failed', { task: 'b', ts: 2020 }),
      diamondLine('task_skipped', { task: 'c', ts: 2021 }),
      diamondLine('workflow_failed', { ts: 2030 }),
    ].join('\n');

    const model = foldTrace(trace);
    expect(model.workflowStatus).toBe('failed');
    expect(model.tasks.size).toBe(3);
    expect(model.tasks.get('a')).toMatchObject({ status: 'success', retries: 1, durationMs: 1500 });
    expect(model.tasks.get('b')?.status).toBe('failed');
    expect(model.tasks.get('c')?.status).toBe('skipped');
    expect(model.totalUsd).toBeCloseTo(0.02);
    expect(model.startMs).toBe(0);
    expect(model.endMs).toBe(2030);
    expect(model.unknownLines).toBe(0);
    // Timeline drives replay: status transitions in order.
    expect(model.timeline[0]).toMatchObject({ taskId: 'a', status: 'pending' });
    expect(model.timeline.at(-1)).toMatchObject({ taskId: 'c', status: 'skipped' });
  });

  it('counts unknown lines instead of failing (half-written traces replay)', () => {
    const model = foldTrace('garbage\n' + diamondLine('task_started', { task: 'x', ts: 5 }) + '\n{"odd": true}');
    expect(model.unknownLines).toBe(2);
    expect(model.tasks.get('x')?.status).toBe('running');
    expect(model.workflowStatus).toBe('running');
  });

  it('never resurrects a terminal task from a late retry/schedule line', () => {
    const model = foldTrace([
      diamondLine('task_started', { task: 'a', ts: 0 }),
      diamondLine('task_completed', { task: 'a', ts: 100 }),
      diamondLine('task_retrying', { task: 'a', ts: 150 }),  // out-of-order tail
      diamondLine('task_scheduled', { task: 'a', ts: 160 }),
    ].join('\n'));
    expect(model.tasks.get('a')?.status).toBe('success');
    expect(model.tasks.get('a')?.retries).toBe(0); // the late retry never counted
  });

  it('keeps real-clock spans clean when some lines lack timestamps', () => {
    const noTs = JSON.stringify({ id: 'x', kind: 'workflow_started', fields: [] });
    const model = foldTrace([
      noTs, // no timestamp — must not pollute startMs with a synthetic 1
      diamondLine('task_started', { task: 'a', ts: 1_000_000 }),
      diamondLine('task_completed', { task: 'a', ts: 1_002_300 }),
      diamondLine('workflow_completed', { ts: 1_002_300 }),
    ].join('\n'));
    expect(model.startMs).toBe(1_000_000);
    expect(model.endMs).toBe(1_002_300);
    expect(summarizeRun(model)).toContain('2.3s');
  });

  it('summarizes a run card honestly (only provable facts)', () => {
    const done = foldTrace([
      diamondLine('workflow_started', { ts: 0 }),
      diamondLine('task_started', { task: 'a', ts: 0 }),
      diamondLine('task_completed', { task: 'a', ts: 2300 }),
      diamondLine('workflow_completed', { ts: 2300 }),
    ].join('\n'));
    const card = summarizeRun(done);
    expect(card).toContain('✓ 1 task');
    expect(card).toContain('2.3s');
    expect(card).not.toContain('$');
  });
});

// ─── The runtime-v2 REAL wire (§3.1 state machine · verified serde) ─────────
// Shape verified field-by-field against the engine derives + emit sites:
// id/run = {uuid} structs · timestamp = bare i64 UNIX NANOSECONDS
// (Timestamp · serde transparent) · kind = snake_case string · fields =
// [{key, value}] untagged scalars · keys: task · duration_ms (clock-
// derived AUTHORITY) · cost_usd · tokens · note.

const NS = 1_718_193_600_000_000_000; // 2024-06-12T12:00:00Z in nanos

function v2Line(
  kind: string,
  opts: { task?: string; ns?: number; fields?: Array<{ key: string; value: unknown }> } = {},
): string {
  const fields = [
    ...(opts.task ? [{ key: 'task', value: opts.task }] : []),
    ...(opts.fields ?? []),
  ];
  return JSON.stringify({
    id: { uuid: '018f6b2a-0000-7000-8000-000000000001' },
    timestamp: opts.ns ?? NS,
    kind,
    run: { uuid: '018f6b2a-0000-7000-8000-00000000000a' },
    correlation: null,
    fields,
  });
}

describe('runtime-v2 wire (the §3.1 state machine · real shapes)', () => {
  it('reads bare-nanosecond timestamps as real clock (not ×10⁶ inflation)', () => {
    const model = foldTrace([
      v2Line('workflow_started', { ns: NS }),
      v2Line('task_started', { task: 'a', ns: NS }),
      v2Line('task_completed', { task: 'a', ns: NS + 2_300_000_000 }), // +2.3s
      v2Line('workflow_completed', { ns: NS + 2_300_000_000 }),
    ].join('\n'));
    expect(model.startMs).toBe(NS / 1e6);
    expect(model.endMs).toBe(NS / 1e6 + 2300);
    expect(summarizeRun(model)).toContain('2.3s');
  });

  it('prefers the clock-derived duration_ms over ts-derived spans', () => {
    // Settlement stamps the terminal event LATE — the ts span would lie
    // (say 5s); the wire's duration_ms carries the truth (2.15s).
    const model = foldTrace([
      v2Line('task_started', { task: 'a', ns: NS }),
      v2Line('task_completed', {
        task: 'a',
        ns: NS + 5_000_000_000,
        fields: [{ key: 'duration_ms', value: 2150 }],
      }),
    ].join('\n'));
    expect(model.tasks.get('a')?.durationMs).toBe(2150);
  });

  it('folds per-task cost_usd and tokens from terminal events', () => {
    const model = foldTrace([
      v2Line('task_completed', {
        task: 'a',
        ns: NS,
        fields: [
          { key: 'duration_ms', value: 10 },
          { key: 'cost_usd', value: 0.004 },
          { key: 'tokens', value: 512 },
        ],
      }),
      v2Line('task_completed', {
        task: 'b',
        ns: NS,
        fields: [
          { key: 'duration_ms', value: 20 },
          { key: 'cost_usd', value: 0.006 },
          { key: 'tokens', value: 256 },
        ],
      }),
    ].join('\n'));
    expect(model.totalUsd).toBeCloseTo(0.01, 10);
    expect(model.totalTokens).toBe(768);
    expect(summarizeRun(model)).toContain('768 tok');
  });

  it('cancelled is a first-class decision, never failed (§3.1)', () => {
    const model = foldTrace([
      v2Line('task_started', { task: 'a', ns: NS }),
      v2Line('task_failed', { task: 'a', ns: NS + 1_000_000 }),
      v2Line('task_cancelled', {
        task: 'b',
        ns: NS + 1_000_000,
        fields: [{ key: 'note', value: 'workflow failure gate' }],
      }),
      v2Line('workflow_failed', { ns: NS + 2_000_000 }),
    ].join('\n'));
    expect(model.tasks.get('b')?.status).toBe('cancelled');
    expect(model.tasks.get('a')?.status).toBe('failed');
    // Cancelled is terminal: a late retry line must not resurrect it.
    const resurrect = foldTrace([
      v2Line('task_cancelled', { task: 'b', ns: NS }),
      v2Line('task_retrying', { task: 'b', ns: NS + 1 }),
    ].join('\n'));
    expect(resurrect.tasks.get('b')?.status).toBe('cancelled');
  });

  it('retrying is its own transient state with a counted attempt', () => {
    const model = foldTrace([
      v2Line('task_started', { task: 'a', ns: NS }),
      v2Line('task_retrying', {
        task: 'a',
        ns: NS + 1_000_000_000,
        fields: [{ key: 'note', value: 'NIKA-INFER-001 transient' }],
      }),
      v2Line('task_retrying', { task: 'a', ns: NS + 2_000_000_000 }),
    ].join('\n'));
    const a = model.tasks.get('a');
    expect(a?.status).toBe('retrying');
    expect(a?.retries).toBe(2);
  });
});

describe('terminal freeze (corrupted/duplicated traces)', () => {
  it('a duplicate terminal line never double-counts cost or flips status', () => {
    // A re-appended or crash-doubled trace duplicates terminal lines —
    // the engine settles exactly once, so a second terminal is always
    // corruption: frozen out, cost counted once, verdict unchanged.
    const model = foldTrace([
      v2Line('task_failed', {
        task: 'a',
        ns: NS,
        fields: [{ key: 'duration_ms', value: 5 }],
      }),
      v2Line('task_completed', {
        task: 'a',
        ns: NS + 1,
        fields: [{ key: 'cost_usd', value: 0.5 }],
      }),
      v2Line('task_completed', {
        task: 'b',
        ns: NS,
        fields: [{ key: 'cost_usd', value: 0.01 }],
      }),
      v2Line('task_completed', {
        task: 'b',
        ns: NS + 1,
        fields: [{ key: 'cost_usd', value: 0.01 }],
      }),
    ].join('\n'));
    expect(model.tasks.get('a')?.status).toBe('failed'); // verdict frozen
    expect(model.totalUsd).toBeCloseTo(0.01, 10); // b counted ONCE, a's fake completed ignored
  });
});

describe('streaming fold (the run --json live path)', () => {
  // The live runner accumulates stdout and re-folds the whole buffer on
  // each chunk. These pin the property the runner relies on: the painted
  // state is chunk-boundary-independent — a flush mid-line ignores the
  // partial until it completes, and the final fold is exact.
  const stream = (lines: string[]) => lines.map((l) => l + '\n');

  it('re-folding a growing buffer converges to the same model as one shot', () => {
    const lines = stream([
      v2Line('workflow_started', { ns: NS }),
      v2Line('task_started', { task: 'a', ns: NS }),
      v2Line('task_completed', { task: 'a', ns: NS + 1, fields: [{ key: 'duration_ms', value: 5 }] }),
      v2Line('task_started', { task: 'b', ns: NS + 1 }),
      v2Line('task_completed', { task: 'b', ns: NS + 2, fields: [{ key: 'duration_ms', value: 7 }] }),
      v2Line('workflow_completed', { ns: NS + 2 }),
    ]);
    // Incremental: fold after each appended line.
    let buf = '';
    let last;
    for (const l of lines) { buf += l; last = foldTrace(buf); }
    const oneShot = foldTrace(lines.join(''));
    expect(last!.workflowStatus).toBe(oneShot.workflowStatus);
    expect(last!.tasks.get('a')?.durationMs).toBe(5);
    expect(last!.tasks.get('b')?.status).toBe('success');
  });

  it('a partial trailing line is ignored until the chunk completing it arrives', () => {
    const full = v2Line('task_completed', { task: 'a', ns: NS, fields: [{ key: 'duration_ms', value: 9 }] });
    const cut = Math.floor(full.length / 2);
    // Buffer holds only the first half of a line — no task yet.
    const partial = foldTrace(full.slice(0, cut));
    expect(partial.tasks.size).toBe(0);
    // The completing chunk arrives — the whole line now folds.
    const complete = foldTrace(full);
    expect(complete.tasks.get('a')?.durationMs).toBe(9);
  });
});
