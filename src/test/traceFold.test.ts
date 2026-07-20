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

  it('summarizeRun counts the rehydrated slice (`○ N cached`)', () => {
    expect(summarizeRun(fixtureFold('resume-mixed.ndjson'))).toContain('○ 2 cached');
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

describe('workflow_sha256 (the run knows its source · 0.95+)', () => {
  it('rides workflow_started into the fold; absent = no claim', () => {
    const withId = JSON.stringify({
      id: { uuid: 'x' }, timestamp: 1, kind: 'workflow_started', run: null, correlation: null,
      fields: [
        { key: 'workflow', value: 'wf' },
        { key: 'permits', value: 'engine floor (no boundary declared)' },
        { key: 'workflow_sha256', value: 'ab'.repeat(32) },
      ],
    });
    expect(foldTrace(withId).workflowSha256).toBe('ab'.repeat(32));
    const without = withId.replace(/,\{"key":"workflow_sha256"[^}]*\}/, '');
    expect(foldTrace(without).workflowSha256).toBeUndefined();
  });
});

describe('the skip/cancel WHY (0.95+ journals)', () => {
  const ev = (kind: string, fields: Array<{ key: string; value: unknown }>): string =>
    JSON.stringify({ id: { uuid: 'x' }, timestamp: 1, kind, run: null, correlation: null, fields });

  it('when rides skipped · blocked_by rides cancelled · absent = silent', () => {
    const trace = [
      ev('task_skipped', [
        { key: 'task', value: 'gated' },
        { key: 'note', value: 'when: gate closed' },
        { key: 'when', value: "${{ tasks.seed.status == 'failure' }}" },
      ]),
      ev('task_cancelled', [
        { key: 'task', value: 'downstream' },
        { key: 'note', value: 'upstream failed' },
        { key: 'blocked_by', value: 'doomed' },
      ]),
      ev('task_skipped', [
        { key: 'task', value: 'old_style' },
        { key: 'note', value: 'when: gate closed' },
      ]),
    ].join('\n');
    const m = foldTrace(trace);
    expect(m.tasks.get('gated')?.whyWhen).toContain('tasks.seed.status');
    expect(m.tasks.get('downstream')?.blockedBy).toBe('doomed');
    expect(m.tasks.get('old_style')?.whyWhen).toBeUndefined();
  });
});

describe('task_recovered (0.98+ wire · D-2026-07-08-N4)', () => {
  const line = (kind: string, fields: Array<{ key: string; value: unknown }>, ts: number): string =>
    JSON.stringify({ id: 'x', timestamp: { unix_ms: ts }, kind, run: 'run-1', fields });
  const recoveredTrace = [
    line('workflow_started', [{ key: 'workflow', value: 'demo' }], 1000),
    line('task_started', [{ key: 'task', value: 'fragile' }], 1001),
    line('task_recovered', [
      { key: 'task', value: 'fragile' },
      { key: 'code', value: 'NIKA-BUILTIN-READ-001' },
    ], 1002),
    line('task_completed', [
      { key: 'task', value: 'fragile' },
      { key: 'duration_ms', value: 3 },
    ], 1003),
    line('workflow_completed', [], 1004),
  ].join('\n');

  it('normalizeEventLine carries the code the repair absorbed', () => {
    const ev = normalizeEventLine(line('task_recovered', [
      { key: 'task', value: 'fragile' },
      { key: 'code', value: 'NIKA-EXEC-001' },
    ], 5));
    expect(ev).toMatchObject({ kind: 'task_recovered', taskId: 'fragile', code: 'NIKA-EXEC-001' });
  });

  it('a repaired success paints success AND carries recoveredFrom', () => {
    const model = foldTrace(recoveredTrace);
    const t = model.tasks.get('fragile');
    expect(t?.status).toBe('success');
    expect(t?.recoveredFrom).toBe('NIKA-BUILTIN-READ-001');
  });

  it('the editor badge and the run card both say recovered — a repaired success never reads clean', () => {
    const model = foldTrace(recoveredTrace);
    const t = model.tasks.get('fragile');
    expect(t && formatRunBadge(t)).toContain('recovered');
    expect(summarizeRun(model)).toContain('✚ 1 recovered');
  });

  it('a run without the event says nothing about recovery', () => {
    expect(summarizeRun(fixtureFold('sig-run-a.ndjson'))).not.toContain('recovered');
  });

  it('recovered arriving AFTER the terminal line is trace corruption — frozen, ignored', () => {
    const corrupt = [
      line('task_completed', [{ key: 'task', value: 'fragile' }], 1000),
      line('task_recovered', [
        { key: 'task', value: 'fragile' },
        { key: 'code', value: 'NIKA-EXEC-001' },
      ], 1001),
    ].join('\n');
    const t = foldTrace(corrupt).tasks.get('fragile');
    expect(t?.status).toBe('success');
    expect(t?.recoveredFrom).toBeUndefined();
  });
});

describe('task_recovered · the REAL wire (engine-main capture, 2026-07-09)', () => {
  // Captured from a debug build of engine origin/main running an
  // on_error.recover workflow — the exact bytes the emitter writes
  // (emit_task.rs: fields task + code), not a synthesized shape.
  it('the recorded journal folds to a recovered success end-to-end', () => {
    const m = fixtureFold('recovered-run.ndjson');
    expect(m.workflowStatus).toBe('completed');
    const t = m.tasks.get('fragile');
    expect(t?.status).toBe('success');
    expect(t?.recoveredFrom).toBe('NIKA-BUILTIN-READ-001');
    expect(t && formatRunBadge(t)).toContain('recovered');
    expect(summarizeRun(m)).toContain('✚ 1 recovered');
  });
});

describe('the red teaches — the failure story crosses the wire (wave G)', () => {
  it('a failed fold carries preview + whyWhen/blockedBy for the card', () => {
    const kv = (kind: string, fields: Array<{ key: string; value: unknown }>, ts: number): string =>
      JSON.stringify({ id: '0', timestamp: { unix_ms: ts }, kind, run: 'run-1', fields });
    const lines = [
      kv('task_started', [{ key: 'task', value: 'a' }], 1),
      kv('task_failed', [
        { key: 'task', value: 'a' },
        { key: 'detail', value: 'NIKA-AGENT-003 · tool loop exceeded max_turns (2)' },
      ], 2),
      kv('task_skipped', [
        { key: 'task', value: 'b' },
        { key: 'when', value: 'vars.publish' },
      ], 3),
    ].join('\n');
    const model = foldTrace(lines);
    const a = model.tasks.get('a');
    expect(a?.status).toBe('failed');
    expect(a?.preview).toContain('NIKA-AGENT-003');
    const b = model.tasks.get('b');
    expect(b?.whyWhen).toBe('vars.publish');
  });
});

describe('foldTrace · the agent loop\'s inner life (agent_* annotations)', () => {
  // Field shapes: probed live on the engine (tools_selected ·
  // budget_checkpoint · 2026-07-19 trace) + pinned by the engine's own
  // telemetry tests (nudge reason slugs · stalled period/repeats ·
  // compose valid/violations).
  const agentLine = (kind: string, kv: Record<string, unknown>): string =>
    JSON.stringify({
      id: { uuid: '019f0000-0000-0000-0000-000000000000' },
      timestamp: 1784415337953000000,
      kind,
      run: null,
      fields: Object.entries({ task: 'scout', ...kv }).map(([key, value]) => ({ key, value })),
    });

  it('folds the five kinds into facts — annotations, never a status transition', () => {
    const model = foldTrace([
      agentLine('task_started', {}),
      agentLine('agent_tools_selected', { turn: 1, offered: 2, universe: 9, builtin: 2, mcp: 0 }),
      agentLine('agent_budget_checkpoint', { turn: 1, total_tokens: 22, budget: 2000 }),
      agentLine('agent_nudge', { turn: 2, reason: 'repeated_actions' }),
      agentLine('agent_nudge', { turn: 3, reason: 'error_streak' }),
      agentLine('agent_tools_selected', { turn: 3, offered: 4, universe: 9 }),
      agentLine('agent_budget_checkpoint', { turn: 3, total_tokens: 610, budget: 2000 }),
      agentLine('agent_compose_checked', { valid: true, violations: 0 }),
      agentLine('agent_stalled', { period: 1, repeats: 5 }),
    ].join('\n'));
    const t = model.tasks.get('scout');
    expect(t?.status).toBe('running'); // annotations never transition
    expect(t?.agent).toEqual({
      turns: 3,
      offered: 4, // LAST turn's routing wins
      universe: 9,
      nudges: 2,
      lastNudgeReason: 'error_streak',
      stalled: { period: 1, repeats: 5 },
      compose: { checked: 1, valid: 1 },
      budget: { totalTokens: 610, budget: 2000 },
    });
  });

  it('a terminal task stays frozen — late agent lines are corruption, not information', () => {
    const model = foldTrace([
      agentLine('task_started', {}),
      agentLine('task_completed', {}),
      agentLine('agent_nudge', { turn: 9, reason: 'error_streak' }),
    ].join('\n'));
    expect(model.tasks.get('scout')?.agent).toBeUndefined();
  });

  it('the REAL captured line folds (the engine trace shape, byte-faithful fields)', () => {
    const real = '{"chain": "c499caa", "correlation": null, "fields": [{"key": "task", "value": "scout"}, {"key": "turn", "value": 1}, {"key": "offered", "value": 2}, {"key": "universe", "value": 2}, {"key": "builtin", "value": 2}, {"key": "mcp", "value": 0}, {"key": "other", "value": 0}, {"key": "attempt", "value": 1}], "id": {"uuid": "019f7771-3de1-75a2-a2ff-6ea8a22ae1f3"}, "kind": "agent_tools_selected", "run": null, "timestamp": 1784415337953000000}';
    const model = foldTrace([agentLine('task_started', {}), real].join('\n'));
    expect(model.tasks.get('scout')?.agent).toMatchObject({ turns: 1, offered: 2, universe: 2 });
  });
});

describe('foldTrace · live meters (cost_incurred · infer_chunk — contract §3.3)', () => {
  const line = (kind: string, kv: Record<string, unknown>): string =>
    JSON.stringify({
      id: { uuid: '019f0000-0000-0000-0000-000000000001' },
      timestamp: 1784415337953000000,
      kind,
      run: null,
      fields: Object.entries(kv).map(([key, value]) => ({ key, value })),
    });

  it('cost deltas SUM into the ~$ curve — run-level always, task-level when attributed', () => {
    const model = foldTrace([
      line('task_started', { task: 'draft' }),
      line('cost_incurred', { task: 'draft', usd: 0.001, tokens: 40 }),
      line('cost_incurred', { task: 'draft', usd: 0.002, tokens: 60 }),
      line('cost_incurred', { usd: 0.0005 }), // unattributed — run curve only
    ].join('\n'));
    expect(model.liveUsd).toBeCloseTo(0.0035, 6);
    expect(model.liveTokens).toBe(100);
    expect(model.tasks.get('draft')?.liveUsd).toBeCloseTo(0.003, 6);
    expect(model.tasks.get('draft')?.liveTokens).toBe(100);
  });

  it('chunks count the stream; a settled task is frozen against late meters', () => {
    const model = foldTrace([
      line('task_started', { task: 'draft' }),
      line('infer_chunk', { task: 'draft', delta: 'hel' }),
      line('infer_chunk', { task: 'draft', delta: 'lo' }),
      line('task_completed', { task: 'draft' }),
      line('infer_chunk', { task: 'draft', delta: '!' }),
      line('cost_incurred', { task: 'draft', usd: 9 }),
    ].join('\n'));
    expect(model.tasks.get('draft')?.chunks).toBe(2);
    expect(model.tasks.get('draft')?.liveUsd).toBeUndefined();
    // The RUN curve still counts the late delta (run-level truth).
    expect(model.liveUsd).toBe(9);
  });
});

describe('foldTrace · the ADR-099 identity pair (cache proof)', () => {
  it('def/input hashes land on the settled task from its terminal event', () => {
    const line = (kind: string, kv: Record<string, unknown>): string =>
      JSON.stringify({
        id: { uuid: '019f0000-0000-0000-0000-000000000002' },
        timestamp: 1784415337953000000,
        kind,
        run: null,
        fields: Object.entries({ task: 'seed', ...kv }).map(([key, value]) => ({ key, value })),
      });
    const model = foldTrace([
      line('task_started', {}),
      line('task_cache_hit', { def_hash: '15b188d151bf', input_hash: 'c120cc20e271' }),
    ].join('\n'));
    const t = model.tasks.get('seed');
    expect(t?.cached).toBe(true);
    expect(t?.defHash).toBe('15b188d151bf');
    expect(t?.inputHash).toBe('c120cc20e271');
  });
});

describe('formatRunBadge — the marathon vocabulary, one truncated line', () => {
  it('retries and agent turns join the facts', () => {
    const badge = formatRunBadge({
      id: 'x', status: 'success', retries: 2, durationMs: 1200, usd: 0.003,
      agent: { turns: 3 },
    } as never);
    expect(badge).toContain('↻2');
    expect(badge).toContain('t3');
  });

  it('a gated skip stays SHORT inline (the why lives in the hover)', () => {
    const badge = formatRunBadge({
      id: 'x', status: 'skipped', retries: 0, whyWhen: '${{ tasks.a.output == "ship" && vars.deep }}',
    } as never);
    expect(badge).toContain('gated');
    expect(badge).not.toContain('tasks.a.output');
  });

  it('a cascade cancel names its culprit', () => {
    const badge = formatRunBadge({
      id: 'x', status: 'cancelled', retries: 0, blockedBy: 'fetch',
    } as never);
    expect(badge).toContain('blocked by fetch');
  });
});
