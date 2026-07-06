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

export interface HistoryRun {
  /** Trace basename (the run's identity in the journal dir). */
  name: string;
  mtimeMs: number;
  model: RunModel;
}

interface TaskHistory {
  id: string;
  /** One cell per run, oldest → newest: ✓ ✗ ↷ ⊘ ⚡(cached) · (absent). */
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

const CELL: Record<string, string> = {
  success: '✓',
  failed: '✗',
  skipped: '↷',
  cancelled: '⊘',
  running: '…',
  retrying: '↻',
  pending: '·',
};

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
      cells.push(t.cached === true ? '⚡' : CELL[t.status] ?? '·');
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
  out.push(`> ${ordered.length} recorded run${ordered.length === 1 ? '' : 's'}, oldest → newest. Every cell is a recorded terminal status (✓ ✗ ↷ skipped · ⊘ cancelled · ⚡ cache-hit · blank = not in that run). Flaky = mixed outcomes inside this window — a fact, not a guess.`);
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
