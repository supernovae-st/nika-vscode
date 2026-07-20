// runHistory.ts — the cross-run story (pure · no vscode).
//
// The Airflow-grid steal, local-first: rows = tasks, columns = the last
// N recorded runs (oldest → newest), cells = the terminal status — the
// « did this step start flaking on Tuesday? » answer computed from the
// journal directory alone. Flakiness is a FACT here (mixed outcomes in
// the window), never a model's opinion; duration trends compare the
// newest run against the window median.

import type { RunModel } from './traceFold';
import { humanizeDuration } from './traceFold';
import { STATUS_CHAR } from './glyphRegistry';

export interface HistoryRun {
  /** Trace basename (the run's identity in the journal dir). */
  name: string;
  mtimeMs: number;
  model: RunModel;
  /** Absolute journal path — the tree's replay handle (V-SOTA.B B2).
   *  Additive: the document renderer never reads it, so the exported
   *  grid is byte-identical with or without it. */
  fsPath?: string;
}

interface TaskHistory {
  id: string;
  /** One cell per run, oldest → newest: ✓ ✗ ↷ ⊘ ○(cached) · (absent). */
  cells: string[];
  runs: number;
  failures: number;
  /** Mixed success/failure inside the window — the flake signal. */
  flaky: boolean;
  medianMs?: number;
  lastMs?: number;
  /** Signed % of the newest duration vs the window median (± noise floor). */
  trendPct?: number;
}

// The one status vocabulary (glyphRegistry) — a cell dialect is
// unrepresentable by construction.
const CELL: Record<string, string> = STATUS_CHAR;

const TREND_NOISE_PCT = 15;

function median(values: number[]): number | undefined {
  if (values.length === 0) { return undefined; }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Fold N runs (chronological) into per-task histories. */
export function buildHistory(runs: HistoryRun[]): TaskHistory[] {
  const ordered = [...runs].sort((a, b) => a.mtimeMs - b.mtimeMs);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const run of ordered) {
    for (const id of run.model.tasks.keys()) {
      if (!seen.has(id)) { seen.add(id); ids.push(id); }
    }
  }
  return ids.map((id) => {
    const cells: string[] = [];
    const durations: number[] = [];
    let failures = 0;
    let successes = 0;
    let lastMs: number | undefined;
    for (const run of ordered) {
      const t = run.model.tasks.get(id);
      if (!t) { cells.push(' '); continue; }
      cells.push(t.cached === true ? STATUS_CHAR.cached : CELL[t.status] ?? STATUS_CHAR.pending);
      if (t.status === 'failed') { failures += 1; }
      if (t.status === 'success') {
        successes += 1;
        if (t.durationMs !== undefined && t.cached !== true) {
          durations.push(t.durationMs);
          lastMs = t.durationMs;
        }
      }
    }
    const med = median(durations);
    let trendPct: number | undefined;
    if (med !== undefined && med > 0 && lastMs !== undefined && durations.length >= 3) {
      const pct = ((lastMs - med) / med) * 100;
      trendPct = Math.abs(pct) >= TREND_NOISE_PCT ? pct : undefined;
    }
    return {
      id,
      cells,
      runs: cells.filter((c) => c !== ' ').length,
      failures,
      flaky: failures > 0 && successes > 0,
      medianMs: med,
      lastMs,
      trendPct,
    };
  });
}

/** The markdown document — grid + callouts, every cell a recorded event. */
export function renderHistory(workflowName: string, runs: HistoryRun[]): string {
  const ordered = [...runs].sort((a, b) => a.mtimeMs - b.mtimeMs);
  const history = buildHistory(ordered);
  const out: string[] = [];
  out.push(`# Run history — ${workflowName}`);
  out.push('');
  out.push(`> ${ordered.length} recorded run${ordered.length === 1 ? '' : 's'}, oldest → newest. Every cell is a recorded terminal status (✓ ✗ ↷ skipped · ⊘ cancelled · ○ cache-hit · blank = not in that run). Flaky = mixed outcomes inside this window — a fact, not a guess.`);
  out.push('');

  if (ordered.length === 0) {
    out.push('No recorded runs match this workflow yet.');
    return out.join('\n');
  }

  out.push('| task | runs | ' + ordered.map((_, i) => `${i + 1}`).join(' ') + ' | median | trend |');
  out.push('|---|---|' + ordered.map(() => ':-:').join('') + '|---|---|');
  for (const t of history) {
    const trend = t.trendPct !== undefined
      ? `${t.trendPct > 0 ? '▲ +' : '▼ '}${Math.round(t.trendPct)}% vs median`
      : '';
    out.push(`| \`${t.id}\`${t.flaky ? ' ⚠' : ''} | ${t.runs} | ${t.cells.join(' ')} | ${t.medianMs !== undefined ? humanizeDuration(t.medianMs) : '—'} | ${trend} |`);
  }
  out.push('');

  const flaky = history.filter((t) => t.flaky);
  if (flaky.length > 0) {
    out.push('## Flaky tasks (mixed outcomes in this window)');
    out.push('');
    for (const t of flaky) {
      out.push(`- \`${t.id}\` — failed ${t.failures}/${t.runs} runs`);
    }
    out.push('');
  }

  const trending = history.filter((t) => t.trendPct !== undefined && t.trendPct > 0);
  if (trending.length > 0) {
    out.push('## Slowing down (newest vs window median)');
    out.push('');
    for (const t of trending.sort((a, b) => (b.trendPct ?? 0) - (a.trendPct ?? 0))) {
      out.push(`- \`${t.id}\` — ${t.lastMs !== undefined ? humanizeDuration(t.lastMs) : '?'} vs median ${t.medianMs !== undefined ? humanizeDuration(t.medianMs) : '?'} (▲ +${Math.round(t.trendPct ?? 0)}%)`);
    }
    out.push('');
  }

  out.push('_Columns map to journal files, oldest → newest. Diff any two runs with `Nika: Diff Two Runs on the DAG`; fork from a step with `Nika: Fork From Task`._');
  return out.join('\n');
}

// ─── The tree derivation (V-SOTA.B B2) ───────────────────────────────────────
//
// The markdown grid's command: links are dead in the preview at all three
// runtime stages (annexe R R13) — so the History SURFACE is a native tree
// and the document above becomes its export. Same facts, partitioned by
// attention (the Station's IA law): sections are answers, a blank cell is
// the absence of a recorded fact, and `run #k` is the exported grid's
// column number — the cell↔child mapping stays explicit.

export interface HistoryRow {
  kind: 'section' | 'task' | 'cell';
  /** Stable — expansion state survives refreshes. */
  id: string;
  label: string;
  description?: string;
  /** Sections only — Steady starts folded (healthy is context, not news). */
  collapsed?: boolean;
  /** Task rows — the DAG focus target (the view adds its workflow Uri). */
  taskId?: string;
  /** Cell rows — the replay handle; absent when the run carried no path. */
  traceFsPath?: string;
  children?: HistoryRow[];
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local-calendar distance in words — today · yesterday · `Nd ago`
 *  (the Runs sections' own vocabulary). Future mtimes read `today`:
 *  clock skew is a fact, not a crash. Math.round absorbs the ±1h a
 *  DST boundary puts between two local day floors. */
function relativeDay(ms: number, nowMs: number): string {
  const days = Math.round((startOfLocalDay(nowMs) - startOfLocalDay(ms)) / 86_400_000);
  if (days <= 0) { return 'today'; }
  if (days === 1) { return 'yesterday'; }
  return `${days}d ago`;
}

/**
 * Fold N runs into the History tree rows — pure, clock injected.
 *
 * Partition is TOTAL and disjoint: Flaky (the grid's ⚠ · mixed outcomes)
 * outranks Slowing (trend above the noise floor), Steady is the rest and
 * starts folded. Empty sections hide; a lone STEADY section dissolves to
 * flat task rows (a single healthy answer needs no headline) — a lone
 * Flaky or Slowing section KEEPS its header, the alarm needs its name
 * (the Now-pin precedent in runsModel).
 *
 * Cell children are NEWEST first; `run #k` is the chronological index =
 * the exported grid's column number. A column where the task never ran
 * has no child: a blank cell is the absence of a recorded fact, never
 * an invented row.
 */
export function buildHistoryRows(runs: HistoryRun[], nowMs: number): HistoryRow[] {
  const ordered = [...runs].sort((a, b) => a.mtimeMs - b.mtimeMs);
  const history = buildHistory(ordered);

  const taskRow = (t: TaskHistory): HistoryRow => {
    const children: HistoryRow[] = [];
    ordered.forEach((run, i) => {
      const cell = run.model.tasks.get(t.id);
      if (!cell) { return; } // blank column — no recorded fact, no row
      const k = i + 1; // the doc grid's column number (oldest → newest)
      const glyph = cell.cached === true ? STATUS_CHAR.cached : CELL[cell.status] ?? STATUS_CHAR.pending;
      const word = cell.cached === true ? 'cache-hit' : cell.status;
      children.push({
        kind: 'cell',
        id: `history.cell.${t.id}.${k}`,
        label: `run #${k} · ${glyph} ${word}`,
        description: [
          cell.durationMs !== undefined ? humanizeDuration(cell.durationMs) : undefined,
          relativeDay(run.mtimeMs, nowMs),
        ].filter(Boolean).join(' · '),
        ...(run.fsPath !== undefined ? { traceFsPath: run.fsPath } : {}),
      });
    });
    children.reverse(); // NEWEST first — the freshest evidence leads
    const trend = t.trendPct !== undefined
      ? `${t.trendPct > 0 ? '▲ +' : '▼ '}${Math.round(t.trendPct)}% vs median`
      : undefined;
    return {
      kind: 'task',
      id: `history.task.${t.id}`,
      label: t.id,
      description: [
        t.cells.join(' '),
        t.medianMs !== undefined ? `median ${humanizeDuration(t.medianMs)}` : undefined,
        trend,
      ].filter(Boolean).join(' · '),
      taskId: t.id,
      children,
    };
  };

  // Total partition — flaky outranks slowing; steady is the rest.
  const slowing = (t: TaskHistory): boolean => t.trendPct !== undefined && t.trendPct > 0;
  const classes: Array<{ key: 'flaky' | 'slowing' | 'steady'; title: string; tasks: TaskHistory[]; collapsed: boolean }> = [
    { key: 'flaky', title: 'Flaky', tasks: history.filter((t) => t.flaky), collapsed: false },
    { key: 'slowing', title: 'Slowing', tasks: history.filter((t) => !t.flaky && slowing(t)), collapsed: false },
    { key: 'steady', title: 'Steady', tasks: history.filter((t) => !t.flaky && !slowing(t)), collapsed: true },
  ];
  const sections = classes
    .filter((s) => s.tasks.length > 0)
    .map((s): HistoryRow => ({
      kind: 'section',
      id: `history.section.${s.key}`,
      label: `${s.title} — ${s.tasks.length}`,
      collapsed: s.collapsed,
      children: s.tasks.map(taskRow),
    }));

  if (sections.length === 1 && sections[0].id === 'history.section.steady') {
    return sections[0].children ?? []; // the lone healthy pile dissolves to flat
  }
  return sections;
}

/**
 * Whether a folded trace belongs to `docName`'s history — EXACT workflow
 * name when both sides carry one (every engine journal stamps `workflow`
 * on workflow_started; template-derived siblings sharing ≥60% task ids
 * can no longer contaminate each other's grid — the 0.97.0 review's
 * finding), majority-overlap heuristic ONLY when a name is missing
 * (a truncated journal · a nameless fold).
 */
export function traceBelongsTo(
  traceName: string | undefined,
  docName: string | undefined,
  traceTaskIds: readonly string[],
  docTaskIds: ReadonlySet<string>,
  threshold = 0.6,
): boolean {
  if (traceName !== undefined && docName !== undefined) {
    return traceName === docName;
  }
  if (traceTaskIds.length === 0) { return false; }
  const overlap = traceTaskIds.filter((id) => docTaskIds.has(id)).length / traceTaskIds.length;
  return overlap >= threshold;
}
