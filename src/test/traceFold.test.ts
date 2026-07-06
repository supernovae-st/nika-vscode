import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { foldTrace, formatRunBadge, normalizeEventLine, summarizeRun } from '../core/traceFold';

// Real nika 0.92.0 flight-recorder captures (signature-demo · 4 verbs ·
// mock/echo offline) — the wire as the engine actually writes it.
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const fixtureFold = (name: string): ReturnType<typeof foldTrace> =>
  foldTrace(fs.readFileSync(path.join(FIXTURES, name), 'utf-8'));

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

  it('folds workflow_paused (ADR-099 durable pause) — not running forever', () => {
    // A run paused on `nika:prompt` writes workflow_paused and stops —
    // without a mapping the Runs view shows it as live until deleted.
    const paused = foldTrace([
      diamondLine('workflow_started', { ts: 0 }),
      diamondLine('task_started', { task: 'ask', ts: 10 }),
      diamondLine('workflow_paused', { ts: 500 }),
    ].join('\n'));
    expect(paused.workflowStatus).toBe('paused');
    expect(paused.unknownLines).toBe(0);
    expect(summarizeRun(paused)).toContain('⏸');
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

  it('timeline is sorted by atMs even when concurrent writers interleave', () => {
    // Fan-out: two parallel tasks' events land in the NDJSON out of strict
    // time order (writer b's completion flushes before writer a's start).
    const lines = [
      diamondLine('workflow_started', { ts: 1000 }),
      diamondLine('task_started', { task: 'b', ts: 1400 }),
      diamondLine('task_started', { task: 'a', ts: 1200 }),   // out of order
      diamondLine('task_completed', { task: 'b', ts: 2000 }),
      diamondLine('task_completed', { task: 'a', ts: 1800 }), // out of order
    ].join('\n') + '\n';
    const model = foldTrace(lines);
    const times = model.timeline.map((e) => e.atMs);
    expect(times).toEqual([...times].sort((x, y) => x - y));
    // The scrubber's ascending assumption (frameAt · timelineBounds) holds.
    expect(times[0]).toBeLessThanOrEqual(times[times.length - 1]);
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

// ─── Signature captures · the richest real wire (9 tasks · 4 verbs) ─────────

describe('signature fixtures (real 0.92.0 · agent events on the wire)', () => {
  it('tolerates agent_* observability kinds without polluting tasks', () => {
    // agent_tools_selected / agent_budget_checkpoint CARRY a `task` field
    // but are not status transitions — the fold must skip them as known-
    // shape non-status lines: zero unknownLines, zero phantom tasks.
    const model = fixtureFold('sig-run-a.ndjson');
    expect(model.unknownLines).toBe(0);
    expect(model.tasks.size).toBe(9);
    expect(model.workflowStatus).toBe('completed');
    for (const t of model.tasks.values()) { expect(t.status).toBe('success'); }
  });

  it('captures the settle-line preview: detail on ✗, note elsewhere', () => {
    const model = fixtureFold('sig-run-failed.ndjson');
    expect(model.workflowStatus).toBe('failed');
    // failed publish — detail outranks note (the NIKA-XXX story wins).
    expect(model.tasks.get('publish')?.status).toBe('failed');
    expect(model.tasks.get('publish')?.preview).toMatch(/^NIKA-EXEC-001/);
    // cancelled report — the wire says why: upstream failed.
    expect(model.tasks.get('report')?.status).toBe('cancelled');
    expect(model.tasks.get('report')?.preview).toBe('upstream failed');
    // a green task keeps its verb·tool descriptor note.
    const green = [...model.tasks.values()].find((t) => t.status === 'success');
    expect(green?.preview).toMatch(/·/);
  });
});

// ─── Resume wire (ADR-099 · REAL 0.93.1 capture · resume-after-edit) ────────
// resume-mixed.ndjson: `--resume` after editing `expand` — seed+side
// cache-hit with their recorded output, expand actually re-ran.

describe('resume wire (task_cache_hit + output · real 0.93.1 fixture)', () => {
  it('cache hits paint success, carry cached=true AND the recorded output', () => {
    const model = fixtureFold('resume-mixed.ndjson');
    expect(model.workflowStatus).toBe('completed');
    const seed = model.tasks.get('seed');
    expect(seed?.status).toBe('success');
    expect(seed?.cached).toBe(true);
    expect(seed?.outputPreview).toBeTruthy();
    const side = model.tasks.get('side');
    expect(side?.cached).toBe(true);
  });

  it('a re-executed task is NOT marked cached and carries its fresh output', () => {
    const model = fixtureFold('resume-mixed.ndjson');
    const expand = model.tasks.get('expand');
    expect(expand?.status).toBe('success');
    expect(expand?.cached).toBeUndefined();
    expect(expand?.outputPreview).toBeTruthy();
  });

  it('output preview is one badge-safe line (≤160 chars · no newlines)', () => {
    const model = fixtureFold('resume-mixed.ndjson');
    for (const t of model.tasks.values()) {
      if (t.outputPreview === undefined) { continue; }
      expect(t.outputPreview.length).toBeLessThanOrEqual(160);
      expect(t.outputPreview).not.toMatch(/\n/);
    }
  });

  it('unwraps the double-encoded text output — the text, not its JSON form', () => {
    const model = fixtureFold('resume-mixed.ndjson');
    expect(model.tasks.get('seed')?.outputPreview).toBe('mock(echo) · Name three colors.');
    expect(model.tasks.get('side')?.outputPreview).toBe('side-effect-ran');
    expect(model.tasks.get('expand')?.outputPreview)
      .toBe('mock(echo) · Elaborate on mock(echo) · Name three colors. briefly.');
  });

  it('summarizeRun counts the rehydrated slice (`↻ N cached`)', () => {
    expect(summarizeRun(fixtureFold('resume-mixed.ndjson'))).toContain('↻ 2 cached');
    // A run with zero cache hits keeps its unchanged card line.
    expect(summarizeRun(fixtureFold('sig-run-a.ndjson'))).not.toContain('cached');
  });

  it('the editor badge says cached — never a bare fresh-success glyph', () => {
    const model = fixtureFold('resume-mixed.ndjson');
    const seed = model.tasks.get('seed');
    expect(seed && formatRunBadge(seed)).toBe(' ✓ cached');
    // A re-executed task keeps its clock fact, no cached word.
    const expand = model.tasks.get('expand');
    expect(expand && formatRunBadge(expand)).toBe(' ✓ 13ms');
  });

  it('the fold timeline carries the cached flag (replay honesty)', () => {
    const model = fixtureFold('resume-mixed.ndjson');
    const seedSettle = model.timeline.find((e) => e.taskId === 'seed' && e.status === 'success');
    expect(seedSettle?.cached).toBe(true);
    const expandSettle = model.timeline.find((e) => e.taskId === 'expand' && e.status === 'success');
    expect(expandSettle?.cached).toBeUndefined();
  });
});

describe('workflow_paused (ADR-099 human-gate)', () => {
  it('the fold carries the QUESTION: task · mode · message · choices', () => {
    const ev = JSON.stringify({
      id: { uuid: 'x' }, timestamp: 1, kind: 'workflow_paused', run: null, correlation: null,
      fields: [
        { key: 'workflow', value: 'wf' },
        { key: 'task', value: 'approve' },
        { key: 'mode', value: 'choice' },
        { key: 'message', value: 'Ship it?' },
        { key: 'choices', value: ['now', 'later'] },
      ],
    });
    const model = foldTrace(ev);
    expect(model.workflowStatus).toBe('paused');
    expect(model.paused).toEqual({ task: 'approve', mode: 'choice', message: 'Ship it?', choices: ['now', 'later'] });
  });
});
