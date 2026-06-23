// runLive.ts — stream `nika run --json` into the DAG panel, live.
//
// The capability gate lit `run` the day nika-runtime reached L3; this
// is what the live overlay was built for all along. `run --json`
// emits the SAME canonical NDJSON the flight-recorder writes, so the
// whole tested fold path is reused verbatim — accumulate stdout, re-
// fold the buffer on each flush, paint the folded statuses. No second
// parser (own-corpus law applied to the run wire), no animation: the
// stream IS the present.
//
// Re-folding the whole buffer each flush (vs incremental model
// mutation) is deliberate: a partial trailing line simply fails to
// parse and is ignored until the next chunk completes it, so the
// painted state is always derived from whole events and the FINAL
// state is exact regardless of chunk boundaries.

import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { foldTrace, summarizeRun, type FoldedStatus } from '../core/traceFold';
import type { DagPanel, TaskStatus } from '../dagPanel';
import type { NikaService } from '../nikaService';
import { cancelActiveReplay } from './runsView';

/** A live run handle — cancellable, one at a time per panel. */
let activeRun: { kill: () => void } | undefined;

/** Stop any live run in flight (a new run, or panel dispose). */
export function cancelActiveRun(): void {
  activeRun?.kill();
  activeRun = undefined;
}

/**
 * Spawn `nika run --json <file>` and paint its event stream onto the
 * DAG live. The graph must already be loaded (the caller shows it for
 * the active document first) so the painted statuses land on real
 * nodes. Verdict + cost land in the activity feed on close.
 */
export function runWorkflowLive(
  service: NikaService,
  dagPanel: DagPanel,
  fsPath: string,
  log: (level: string, msg: string) => void,
): void {
  const binary = service.binaryPath;
  if (!binary) {
    void vscode.window.showWarningMessage('Nika: no binary resolved — cannot run.');
    return;
  }

  // A fresh run supersedes any prior run AND any replay animation —
  // the live present wins.
  cancelActiveRun();
  cancelActiveReplay();
  dagPanel.note('▶', `run started · ${fsPath.split('/').pop() ?? fsPath}`, undefined, 'st-running');

  const child = spawn(binary, ['run', fsPath, '--json', '--no-color'], {
    env: { ...process.env, NO_COLOR: '1' },
  });
  activeRun = { kill: () => child.kill() };

  let buffer = '';
  let lastPainted = '';
  const paint = (): void => {
    const model = foldTrace(buffer);
    if (model.tasks.size === 0) { return; }
    dagPanel.batchUpdateStatus(
      [...model.tasks.values()].map((t) => ({
        taskId: t.id,
        status: t.status as TaskStatus,
        durationMs: t.durationMs,
      })),
    );
    // Narrate only NEW terminal transitions (the feed is a story, not
    // a redraw log) — keyed on the id+status set painted so far.
    for (const t of model.tasks.values()) {
      const key = `${t.id}:${t.status}`;
      if (TERMINAL.has(t.status) && !lastPainted.includes(`|${key}|`)) {
        lastPainted += `|${key}|`;
        dagPanel.note(FEED_ICON[t.status] ?? '·', `${t.id} ${t.status}`, t.id, `st-${t.status}`);
      }
    }
  };

  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    paint();
  });
  child.stderr.setEncoding('utf-8');
  child.stderr.on('data', (chunk: string) => log('WARN', `nika run: ${chunk.trim()}`));

  child.on('error', (err) => {
    activeRun = undefined;
    void vscode.window.showWarningMessage(`Nika: run failed to start — ${err.message}`);
  });
  child.on('close', (code) => {
    activeRun = undefined;
    paint(); // final flush — the buffer now holds every complete line
    const model = foldTrace(buffer);
    const verdict = model.workflowStatus;
    const icon = verdict === 'completed' ? '✓' : verdict === 'cancelled' ? '◼' : '✗';
    const cls = verdict === 'completed' ? 'st-success' : verdict === 'cancelled' ? 'st-cancelled' : 'st-failed';
    dagPanel.note(icon, `run ${verdict} · ${summarizeRun(model)}`, undefined, cls);
    if (code !== 0 && code !== null && verdict !== 'failed' && verdict !== 'cancelled') {
      // Exited non-zero but the stream did not explain why (crash before
      // a workflow_failed event) — say so rather than imply success.
      log('WARN', `nika run exited ${code} without a terminal workflow event`);
    }
  });
}

const TERMINAL: ReadonlySet<FoldedStatus> = new Set(['success', 'failed', 'skipped', 'cancelled']);

const FEED_ICON: Record<string, string> = {
  success: '✓',
  failed: '✗',
  skipped: '⤼',
  cancelled: '◼',
};
