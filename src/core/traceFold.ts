// traceFold.ts — fold a flight-recorder NDJSON stream into a run model
// (pure · no vscode). Powers the Runs view, the DAG replay, and the live
// run overlay.
//
// Tolerant by design — it accepts BOTH trace dialects in the wild:
//   · Diamond `nika-event` Event lines (runtime v2's REAL wire — every
//     detail verified against the serde derives + emit sites):
//       { id: {uuid}, timestamp: <i64 UNIX NANOSECONDS · transparent>,
//         kind: "task_started" (snake_case), run: {uuid}|null,
//         correlation: null, fields: [{key, value}] }
//     field keys: `task` (the id) · `duration_ms` (authoritative —
//     clock-derived; ts-derived spans LIE for tasks that ran before
//     their settle slot) · `cost_usd` · `tokens` · `note` · `detail`.
//     Values are serde-untagged plain scalars.
//   · brouillon v0.7x generation traces:
//       { ts?, kind: { type: "...", task_id?, ... } }
// Unknown lines are skipped, never fatal: a replay of a half-written
// trace shows what it can prove and nothing more.
//
// The status vocabulary mirrors the engine's §3.1 state machine:
// `retrying` (the attempt failed · the TASK has not — amber, transient)
// and `cancelled` (a decision, not a defect — dim, NEVER red) are
// first-class, not folded into running/failed.

export type FoldedStatus =
  | 'pending'
  | 'running'
  | 'retrying'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface FoldedTask {
  id: string;
  status: FoldedStatus;
  startMs?: number;
  endMs?: number;
  durationMs?: number;
  /** Per-task spend — rides the terminal event on the v2 wire (`cost_usd`). */
  usd?: number;
  /** First line of the terminal event's `detail` (failure detail — the
   *  NIKA-XXX story) or `note` (the verb·tool descriptor) — hover context.
   *  Truncated to one badge-safe line at fold time. */
  preview?: string;
  /** Resume cache hit (ADR-099): the task was NOT re-executed — its
   *  recorded output was injected from the prior trace. */
  cached?: boolean;
  /** One badge-safe line of the task's recorded `output` (the v0.93 wire
   *  carries it on task_completed AND task_cache_hit). */
  outputPreview?: string;
  retries: number;
}

export interface TimelineEntry {
  atMs: number;
  taskId: string;
  status: FoldedStatus;
  durationMs?: number;
  /** ADR-099 — this transition is a cache-hit rehydration, not a run. */
  cached?: boolean;
}

export interface RunModel {
  workflowStatus: 'unknown' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  tasks: Map<string, FoldedTask>;
  totalUsd?: number;
  /** Σ `tokens` across terminal task events (the v2 wire carries them). */
  totalTokens?: number;
  startMs?: number;
  endMs?: number;
  /** Status transitions in time order — drives the animated replay. */
  timeline: TimelineEntry[];
  /** Lines that parsed as JSON but matched no known shape. */
  unknownLines: number;
}

interface NormalizedEvent {
  kind: string;
  taskId?: string;
  tsMs?: number;
  usd?: number;
  /** Authoritative clock-derived duration (runtime v2 terminal events). */
  durationMs?: number;
  tokens?: number;
  /** `detail` (preferred — failure story) or `note` (verb·tool descriptor). */
  note?: string;
  /** The recorded task output (v0.93 wire · task_completed/cache_hit). */
  output?: string;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) { return v; }
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) { return n; }
  }
  return undefined;
}

/** Unwrap serde-style values: 42 · "x" · {"float":1.2} · {"String":"x"}. */
function unwrapValue(v: unknown): unknown {
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 1) { return entries[0][1]; }
  }
  return v;
}

function fieldsToMap(fields: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (!Array.isArray(fields)) { return map; }
  for (const f of fields) {
    if (typeof f !== 'object' || f === null) { continue; }
    const rec = f as Record<string, unknown>;
    if (typeof rec.key === 'string') {
      map.set(rec.key, unwrapValue(rec.value));
    }
  }
  return map;
}

function timestampToMs(ts: unknown): number | undefined {
  if (typeof ts === 'number') {
    // Magnitude ladder — present-era epochs sit ~×1000 apart per unit
    // (1.7e9 s · 1.7e12 ms · 1.7e15 µs · 1.7e18 ns), so midpoint
    // thresholds separate them unambiguously. The runtime's REAL wire
    // is bare i64 NANOSECONDS (Timestamp · serde transparent): under
    // the old `>1e12 ⇒ millis` heuristic a 2-second task read as ~23
    // days (×10⁶) — the ladder is the fix.
    if (ts > 1e17) { return ts / 1e6; } // nanoseconds
    if (ts > 1e14) { return ts / 1e3; } // microseconds
    if (ts > 1e11) { return ts; } //       milliseconds
    return ts * 1000; //                   seconds
  }
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  if (typeof ts === 'object' && ts !== null) {
    const rec = ts as Record<string, unknown>;
    for (const key of ['unix_ns', 'unix_ms', 'ms', 'millis']) {
      const n = asNumber(rec[key]);
      if (n !== undefined) { return key === 'unix_ns' ? n / 1e6 : n; }
    }
    const secs = asNumber(rec.secs ?? rec.seconds);
    if (secs !== undefined) { return secs * 1000; }
  }
  return undefined;
}

/** The wire's `output` is a string for text tasks, structured for JSON
 *  captures — render either as ONE badge-safe line (the preview law). */
function outputToString(v: unknown): string | undefined {
  if (v === undefined || v === null) { return undefined; }
  let s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s === undefined || s.length === 0) { return undefined; }
  // Text outputs arrive double-encoded (`"…"` — the JSON form of the
  // string, the real 0.93.1 wire): unwrap ONE layer so the preview reads
  // as text, not encoding. Structured outputs keep their compact JSON.
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (typeof parsed === 'string') { s = parsed; }
    } catch { /* not a JSON string — keep the raw text */ }
  }
  const oneLine = s.replace(/\s+/g, ' ').trim();
  if (oneLine.length === 0) { return undefined; }
  return oneLine.length > 160 ? `${oneLine.slice(0, 159)}…` : oneLine;
}

function snake(kind: string): string {
  return kind
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

export function normalizeEventLine(line: string): NormalizedEvent | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) { return undefined; }
  const rec = parsed as Record<string, unknown>;

  // Diamond shape — kind is the snake_case slug string.
  if (typeof rec.kind === 'string') {
    const fields = fieldsToMap(rec.fields);
    const taskId = (fields.get('task') ?? fields.get('task_id')) as string | undefined;
    // `detail` outranks `note`: on task_failed the wire puts the whole
    // NIKA-XXX story in detail while note stays the verb·tool descriptor.
    const note = fields.get('detail') ?? fields.get('note');
    return {
      kind: snake(rec.kind),
      taskId: typeof taskId === 'string' ? taskId : undefined,
      tsMs: timestampToMs(rec.timestamp ?? rec.ts),
      // Runtime v2 emits per-task `cost_usd` on terminal events; the
      // older dialect used a bare `usd` on cost_incurred lines.
      usd: asNumber(fields.get('cost_usd') ?? fields.get('usd')),
      durationMs: asNumber(fields.get('duration_ms')),
      tokens: asNumber(fields.get('tokens')),
      note: typeof note === 'string' ? note : undefined,
      output: outputToString(fields.get('output')),
    };
  }

  // brouillon shape — kind is an object with a `type` tag.
  if (typeof rec.kind === 'object' && rec.kind !== null) {
    const k = rec.kind as Record<string, unknown>;
    if (typeof k.type === 'string') {
      const taskId = k.task_id ?? k.taskId ?? k.task;
      return {
        kind: snake(k.type),
        taskId: typeof taskId === 'string' ? taskId : undefined,
        tsMs: timestampToMs(rec.ts ?? rec.timestamp),
        usd: asNumber(k.usd ?? k.cost_usd),
      };
    }
  }

  return undefined;
}

const TASK_STATUS: Record<string, FoldedStatus> = {
  task_scheduled: 'pending',
  task_started: 'running',
  // §3.1: the attempt failed, the TASK has not — amber, not green-running.
  task_retrying: 'retrying',
  task_completed: 'success',
  // ADR-099 resume: not re-executed — the recorded output was injected.
  // Paints as success; `cached` carries the distinction.
  task_cache_hit: 'success',
  task_failed: 'failed',
  // §3.1: a decision, not a defect — dim, NEVER red.
  task_cancelled: 'cancelled',
  task_skipped: 'skipped',
};

const TERMINAL: ReadonlySet<FoldedStatus> = new Set(['success', 'failed', 'skipped', 'cancelled']);

export function foldTrace(ndjson: string): RunModel {
  const model: RunModel = {
    workflowStatus: 'unknown',
    tasks: new Map(),
    timeline: [],
    unknownLines: 0,
  };

  let synthetic = 0; // ordering fallback when lines carry no timestamp
  let lastRealTs: number | undefined;
  for (const raw of ndjson.split('\n')) {
    const line = raw.trim();
    if (line.length === 0) { continue; }
    const ev = normalizeEventLine(line);
    if (!ev) {
      model.unknownLines += 1;
      continue;
    }
    synthetic += 1;
    // Timeline ordering may fall back to the last real timestamp (or a
    // synthetic counter) — but startMs/endMs are REAL-clock facts only:
    // mixing a synthetic `1` with unix-millis would report absurd spans.
    const at = ev.tsMs ?? lastRealTs ?? synthetic;
    if (ev.tsMs !== undefined) {
      lastRealTs = ev.tsMs;
      if (model.startMs === undefined || ev.tsMs < model.startMs) { model.startMs = ev.tsMs; }
      if (model.endMs === undefined || ev.tsMs > model.endMs) { model.endMs = ev.tsMs; }
    }

    switch (ev.kind) {
      case 'workflow_started':
        model.workflowStatus = 'running';
        continue;
      case 'workflow_completed':
        model.workflowStatus = 'completed';
        continue;
      case 'workflow_failed':
        model.workflowStatus = 'failed';
        continue;
      case 'workflow_cancelled':
        model.workflowStatus = 'cancelled';
        continue;
      // ADR-099 durable pause (`nika:prompt` awaiting an answer) — the
      // process stopped; without a mapping the Runs view reads the run
      // as live forever.
      case 'workflow_paused':
        model.workflowStatus = 'paused';
        continue;
      case 'cost_incurred':
        if (ev.usd !== undefined) {
          model.totalUsd = (model.totalUsd ?? 0) + ev.usd;
        }
        continue;
      default:
        break;
    }

    const status = TASK_STATUS[ev.kind];
    if (!status || !ev.taskId) { continue; }

    const task: FoldedTask = model.tasks.get(ev.taskId) ?? {
      id: ev.taskId,
      status: 'pending',
      retries: 0,
    };

    // A terminal verdict is FINAL — frozen against late non-terminal
    // lines (resurrection) AND duplicate terminal lines (a re-appended
    // or crash-doubled trace would re-add cost_usd/tokens and could
    // flip the verdict). The §3.1 machine has no terminal→terminal
    // transition; the engine settles exactly once — a second terminal
    // line is always trace corruption, never information.
    const alreadyTerminal = TERMINAL.has(task.status);
    const incomingTerminal = TERMINAL.has(status);
    if (alreadyTerminal) { continue; }

    if (ev.kind === 'task_retrying') { task.retries += 1; }
    if (ev.kind === 'task_cache_hit') { task.cached = true; }
    if (ev.output !== undefined && TERMINAL.has(status)) {
      task.outputPreview = ev.output;
    }
    if (ev.kind === 'task_started' && task.startMs === undefined && ev.tsMs !== undefined) {
      task.startMs = ev.tsMs;
    }
    if (incomingTerminal) {
      if (ev.tsMs !== undefined) { task.endMs = ev.tsMs; }
      // The runtime's clock-derived duration_ms is AUTHORITATIVE — a
      // ts-derived span lies for a task that ran before its settle slot
      // (settlement stamps, the clock measured). Fall back to span math
      // only when the wire carries no duration.
      if (ev.durationMs !== undefined) {
        task.durationMs = ev.durationMs;
      } else if (
        task.startMs !== undefined &&
        task.endMs !== undefined &&
        task.endMs >= task.startMs
      ) {
        task.durationMs = task.endMs - task.startMs;
      }
      // Per-task spend rides terminal events on the v2 wire. The task
      // settles exactly once (frozen above), so assign — never sum.
      if (ev.usd !== undefined) {
        task.usd = ev.usd;
        model.totalUsd = (model.totalUsd ?? 0) + ev.usd;
      }
      // The settle line's story, one hover-safe line of it.
      if (ev.note !== undefined) {
        const firstLine = ev.note.split('\n')[0].trim();
        task.preview = firstLine.length > 160 ? `${firstLine.slice(0, 159)}…` : firstLine;
      }
      if (ev.tokens !== undefined) {
        model.totalTokens = (model.totalTokens ?? 0) + ev.tokens;
      }
    }
    task.status = status;
    model.tasks.set(ev.taskId, task);
    model.timeline.push({ atMs: at, taskId: ev.taskId, status, durationMs: task.durationMs, cached: task.cached });
  }

  // A trace that never reached a terminal workflow event but has terminal
  // tasks everywhere reads as completed-in-substance; stay honest and only
  // upgrade unknown → running when task activity exists.
  if (model.workflowStatus === 'unknown' && model.tasks.size > 0) {
    model.workflowStatus = 'running';
  }

  // The scrubber (frameAt · timelineBounds) assumes ascending atMs; a
  // fan-out trace's NDJSON can interleave concurrent writers out of
  // strict time order. Array.prototype.sort is stable, so same-timestamp
  // entries keep line order (last-write-wins per frameAt's contract).
  model.timeline.sort((a, b) => a.atMs - b.atMs);

  return model;
}

/** `999ms` · `1.2s` · `2m03` — badge-terse duration ladder. Minute spans
 *  round via total seconds so 119 950ms reads `2m00`, never `1m60`. */
export function humanizeDuration(ms: number): string {
  if (ms < 1000) { return `${Math.round(ms)}ms`; }
  if (ms < 60_000) { return `${(ms / 1000).toFixed(1)}s`; }
  const totalS = Math.round(ms / 1000);
  return `${Math.floor(totalS / 60)}m${String(totalS % 60).padStart(2, '0')}`;
}

/** `$0.003` — ≤4 decimals, trailing zeros trimmed (a badge, not an invoice). */
export function formatUsd(usd: number): string {
  const trimmed = usd.toFixed(4).replace(/\.?0+$/, '');
  return `$${trimmed}`;
}

// Status → badge glyph. §3.1 vocabulary honored: cancelled is a decision
// (◼ dim, never red) · retrying is the attempt failing, not the task.
const BADGE_ICON: Partial<Record<FoldedStatus, string>> = {
  success: '✓',
  failed: '✗',
  skipped: '⊘',
  cancelled: '◼',
  retrying: '↻',
  running: '…',
};

/**
 * End-of-line editor badge for one folded task: ` ✓ 1.2s · $0.003` —
 * glyph, then only the PROVABLE facts (duration · spend). `pending` gets
 * no badge (a task that never moved is noise, not signal). The leading
 * space is part of the contract — it pads the badge off the line's text.
 */
export function formatRunBadge(task: FoldedTask): string | undefined {
  const icon = BADGE_ICON[task.status];
  if (!icon) { return undefined; }
  const facts: string[] = [];
  // ADR-099 rehydration — the ✓ stays (the task IS settled-success) but
  // the badge must never read as a fresh execution ("cached", no clock).
  if (task.cached === true) { facts.push('cached'); }
  if (task.durationMs !== undefined) { facts.push(humanizeDuration(task.durationMs)); }
  if (task.usd !== undefined) { facts.push(formatUsd(task.usd)); }
  return facts.length > 0 ? ` ${icon} ${facts.join(' · ')}` : ` ${icon}`;
}

/** Human card line: `✓ 5 tasks · 2.3s · $0.04` (whatever is provable). */
export function summarizeRun(model: RunModel): string {
  const icon =
    model.workflowStatus === 'completed' ? '✓'
    : model.workflowStatus === 'failed' ? '✗'
    : model.workflowStatus === 'cancelled' ? '◼'
    : model.workflowStatus === 'paused' ? '⏸'
    : '…';
  const parts = [`${icon} ${model.tasks.size} task${model.tasks.size === 1 ? '' : 's'}`];
  // A resumed run's card says how much of it was rehydrated (ADR-099) —
  // `✓ 3 tasks · ↻ 2 cached · …` reads at a glance in the Runs view.
  let cachedCount = 0;
  for (const t of model.tasks.values()) {
    if (t.cached === true) { cachedCount += 1; }
  }
  if (cachedCount > 0) {
    parts.push(`↻ ${cachedCount} cached`);
  }
  if (model.startMs !== undefined && model.endMs !== undefined && model.endMs > model.startMs) {
    parts.push(`${((model.endMs - model.startMs) / 1000).toFixed(1)}s`);
  }
  if (model.totalUsd !== undefined) {
    parts.push(`$${model.totalUsd.toFixed(model.totalUsd < 0.1 ? 4 : 2)}`);
  }
  if (model.totalTokens !== undefined && model.totalTokens > 0) {
    parts.push(`${model.totalTokens} tok`);
  }
  return parts.join(' · ');
}
