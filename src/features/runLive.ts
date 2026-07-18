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
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { maybeAskCommunity } from './communityAsk';
import { saveRunHashes } from '../core/canvasState';
import { taskFingerprints } from '../core/dirtyNodes';
import { foldTrace, summarizeRun, type FoldedStatus } from '../core/traceFold';
import { persistTrace, pruneTraces } from '../core/tracePersist';
import { traceStore } from '../core/traceStore';
import type { DagPanel, TaskStatus } from '../dagPanel';
import type { NikaService } from '../nikaService';
import { cancelActiveReplay } from './runsView';

/** Min gap between intermediate store publishes — editor surfaces
 *  (badges · hover) don't need chunk-rate redraws; the DAG does. */
const STORE_THROTTLE_MS = 500;

/** A live run handle — cancellable, one at a time per panel. */
let activeRun: { kill: () => void } | undefined;

/** workflow fsPath → the journal the engine last announced on stderr —
 *  the exact file a paused run must be resumed FROM. */
export const lastTracePathByWorkflow = new Map<string, string>();
/** The run's printed anchor (`N events · chain <head32>`) per workflow. */
const lastAnchorByWorkflow = new Map<string, string>();

/** True while a spawned `nika run` drives the DAG (liveDag suspends). */
export function isRunActive(): boolean {
  return activeRun !== undefined;
}

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
 *
 * `opts.extraArgs` rides extra engine flags (the canvas preview run
 * passes `--model mock/echo` — zero keys, zero network).
 */
export function runWorkflowLive(
  service: NikaService,
  dagPanel: DagPanel,
  fsPath: string,
  log: (level: string, msg: string) => void,
  /** Scope the run to ONE task + its upstream cone (`--task` · the
   *  regenerate-one-block lens). Whole-workflow when absent. */
  onlyTask?: string,
  opts?: {
    extraArgs?: string[];
    onClose?: () => void;
    /** The run hit an ADR-099 human-gate — the caller owns the answer UX. */
    onPaused?: (paused: { task: string; mode: string; message?: string; choices?: string[]; tracePath?: string }) => void;
  },
): void {
  const binary = service.binaryPath;
  if (!binary) {
    void vscode.window
      .showWarningMessage('Nika: running needs the engine binary — it is not on this machine yet.', 'Finish setup')
      .then((pick) => {
        if (pick === 'Finish setup') { void vscode.commands.executeCommand('nika.finishSetup'); }
      });
    return;
  }

  // A fresh run supersedes any prior run AND any replay transport —
  // the live present wins.
  cancelActiveRun();
  dagPanel.clearTransport();
  cancelActiveReplay();
  const preview = opts?.extraArgs?.includes('mock/echo') === true;
  dagPanel.note(
    '▶',
    `run started${preview ? ' · preview (mock/echo)' : ''} · ${fsPath.split('/').pop() ?? fsPath}${onlyTask ? ` · --task ${onlyTask}` : ''}`,
    onlyTask,
    'st-running',
  );
  dagPanel.setRunState(true);

  // Fingerprints of what actually RUNS, captured at spawn: an edit made
  // mid-run must not be labeled "successfully ran" (dirty-nodes law).
  let spawnFingerprints: Map<string, string> | undefined;
  try {
    spawnFingerprints = taskFingerprints(fs.readFileSync(fsPath, 'utf-8'));
  } catch {
    spawnFingerprints = undefined;
  }

  {
    const keep = vscode.workspace.getConfiguration('nika').get<number>('traces.keep', 200);
    const extra = opts?.extraArgs ?? [];
    const ri = extra.indexOf('--resume');
    // Protect the imminent spawn's own --resume target; paused journals
    // are protected inside the pruner (both were the 0.97.0 CRITICAL).
    pruneTraces(path.dirname(fsPath), keep, ri >= 0 ? extra[ri + 1] : undefined);
  }
  // The anchor only prints at run END: a run that dies without printing
  // it (Stop = SIGTERM · crash · sink failure · older engine) must NOT
  // wear the PREVIOUS run's head on its verdict banner — the map is
  // cleared at spawn so a missing anchor stays missing (the trust
  // surface never shows a head that belongs to another journal).
  lastAnchorByWorkflow.delete(fsPath);
  const child = spawn(
    binary,
    ['run', fsPath, '--json', '--color', 'never', ...(onlyTask ? ['--task', onlyTask] : []), ...(opts?.extraArgs ?? [])],
    {
      // The engine writes its journal (`.nika/traces/`) and resolves
      // relative paths against the process CWD (empirical law — the
      // journey e2e pins it). A host launched from the Dock has cwd `/`:
      // without this, editor runs would leave NO journal anywhere the
      // Runs view looks. The workflow's own directory is the contract.
      cwd: path.dirname(fsPath),
      env: { ...process.env, NO_COLOR: '1' },
    },
  );
  activeRun = { kill: () => child.kill() };

  let buffer = '';
  let lastPainted = '';
  let lastStorePublish = 0;
  let lastProgress = '';
  const paint = (): void => {
    const model = foldTrace(buffer);
    if (model.tasks.size === 0) { return; }
    // The stop button's heartbeat: `■ 3/7` — settled over scheduled.
    // Posted only on change (settling is the only thing that moves it).
    let settled = 0;
    for (const t of model.tasks.values()) {
      if (TERMINAL.has(t.status)) { settled += 1; }
    }
    const progressKey = `${settled}/${model.tasks.size}`;
    if (progressKey !== lastProgress) {
      lastProgress = progressKey;
      dagPanel.runProgress(settled, model.tasks.size);
    }
    // Editor surfaces read the SAME fold through the store — throttled
    // here (the close handler publishes the exact final unconditionally).
    const now = Date.now();
    if (now - lastStorePublish >= STORE_THROTTLE_MS) {
      lastStorePublish = now;
      traceStore.set(fsPath, model);
    }
    dagPanel.batchUpdateStatus(
      [...model.tasks.values()].map((t) => ({
        taskId: t.id,
        status: t.status as TaskStatus,
        durationMs: t.durationMs,
        cached: t.cached,
        recoveredFrom: t.recoveredFrom,
        usd: t.usd,
        outputPreview: t.outputPreview,
        // The red teaches (wave G): the failure story + the didn't-run
        // reasons finally CROSS the wire — the card can speak them.
        failPreview: t.status === 'failed' ? t.preview : undefined,
        whyWhen: t.whyWhen,
        blockedBy: t.blockedBy,
        pausedQuestion: model.paused?.task === t.id ? (model.paused.message ?? 'awaiting an answer') : undefined,
      })),
    );
    // Narrate only NEW terminal transitions (the feed is a story, not
    // a redraw log) — keyed on the id+status set painted so far.
    for (const t of model.tasks.values()) {
      const key = `${t.id}:${t.status}`;
      if (TERMINAL.has(t.status) && !lastPainted.includes(`|${key}|`)) {
        lastPainted += `|${key}|`;
        if (t.cached === true) {
          // ADR-099 rehydration — the story must never read as if the
          // task re-executed; ↻ + "cached", not a plain green success.
          dagPanel.note('↻', `${t.id} cached · recorded output reused`, t.id, 'st-success');
        } else {
          dagPanel.note(FEED_ICON[t.status] ?? '·', `${t.id} ${t.status}`, t.id, `st-${t.status}`);
        }
        if (t.recoveredFrom !== undefined) {
          // D-2026-07-08-N4 — a repaired success says what it absorbed.
          dagPanel.note('✚', `${t.id} recovered${t.recoveredFrom ? ` from ${t.recoveredFrom}` : ''} · on_error.recover absorbed the failure`, t.id, 'st-success');
        }
      }
    }
  };

  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    paint();
  });
  child.stderr.setEncoding('utf-8');
  child.stderr.on('data', (chunk: string) => {
    const m = chunk.match(/trace: (\S+\.ndjson)/);
    if (m) { lastTracePathByWorkflow.set(fsPath, path.resolve(path.dirname(fsPath), m[1])); }
    // The anchor (0.97+): the engine prints `· N events · chain <head32>`
    // on the trace line — hold it so the close toast can carry the
    // proof identity (scrollback ↔ toast ↔ tooltip, one head). Full
    // 32 hex: the engine's writer-side review (M4) rejected 16 as a
    // forgeable width — truncating here would undo that on the banner.
    const anchor = chunk.match(/(\d+) events · chain ([0-9a-f]{32})/);
    if (anchor) { lastAnchorByWorkflow.set(fsPath, `${anchor[1]} events · chain ${anchor[2]}`); }
    log('WARN', `nika run: ${chunk.trim()}`);
  });

  child.on('error', (err) => {
    activeRun = undefined;
    dagPanel.setRunState(false);
    void vscode.window.showWarningMessage(`Nika: run failed to start — ${err.message}`);
  });
  child.on('close', (code) => {
    activeRun = undefined;
    paint(); // final flush FIRST — the buffer now holds every complete
             // line; the last card must reach its terminal status before
             // the pill flips to idle (else Run re-enables mid-glow).
    dagPanel.setRunState(false);
    const model = foldTrace(buffer);
    // Final fold ALWAYS lands in the store (the throttle above may have
    // swallowed the last intermediate) — the badges' resting truth.
    if (model.tasks.size > 0) { traceStore.set(fsPath, model); }
    const verdict = model.workflowStatus;
    // ADR-099: paused is a QUESTION, not a failure — amber, the message
    // itself, and the answer flow one click away (exit 4 · human-gate).
    const icon = verdict === 'completed' ? '✓'
      : verdict === 'cancelled' ? '⊘'
      : verdict === 'paused' ? '⏸' : '✗';
    const cls = verdict === 'completed' ? 'st-success'
      : verdict === 'cancelled' ? 'st-cancelled'
      : verdict === 'paused' ? 'st-retrying' : 'st-failed';
    if (verdict === 'paused' && model.paused) {
      const q = model.paused.message ?? `task \`${model.paused.task}\` awaits an answer`;
      dagPanel.note('⏸', `paused · ${model.paused.task} asks: ${q}`, model.paused.task, cls);
      dagPanel.runVerdict('⏸', `paused — ${q}`, cls);
      // The paused record carries ITS OWN journal (captured now, while
      // this child's announce is provably the map's value) — an answer
      // clicked hours later must never resume whatever ran since.
      opts?.onPaused?.({ ...model.paused, tracePath: lastTracePathByWorkflow.get(fsPath) });
    } else {
      // The anchor rides the verdict (0.97+ engines print it): the DAG
      // banner shows the SAME head the scrollback and tooltip hold.
      const anchor = lastAnchorByWorkflow.get(fsPath);
      const suffix = anchor ? ` · ${anchor}` : '';
      dagPanel.note(icon, `run ${verdict} · ${summarizeRun(model)}${suffix}`, undefined, cls);
      // The verdict banner — the same summary, visible WITHOUT opening the
      // feed (summarizeRun leads with its own icon; the banner owns it).
      dagPanel.runVerdict(icon, `run ${verdict} · ${summarizeRun(model).replace(/^[✓✗⊘↷…] /, '')}${suffix}`, cls);
      // The one earned ask, ever — fires on the FIRST completed run only
      // (communityAsk owns the flag; a dismissal counts as answered).
      maybeAskCommunity(verdict);
    }
    // Only meaningful runs land (≥1 task event) — a spawn that died
    // before any task event has nothing worth resuming from.
    if (model.tasks.size > 0 && buffer.length > 0) {
      persistTrace(fsPath, buffer);
    }
    if (code !== 0 && code !== null && verdict !== 'failed' && verdict !== 'cancelled') {
      // Exited non-zero but the stream did not explain why (crash before
      // a workflow_failed event) — say so rather than imply success.
      log('WARN', `nika run exited ${code} without a terminal workflow event`);
    }
    // Record the spawn-time fingerprints of every task that SUCCEEDED —
    // per-task, so a partially failing run still clears its clean part.
    // Preview runs count: mock/echo executed the same substance.
    if (spawnFingerprints) {
      const succeeded = new Map<string, string>();
      for (const t of model.tasks.values()) {
        const hash = spawnFingerprints.get(t.id);
        if (t.status === 'success' && hash !== undefined) { succeeded.set(t.id, hash); }
      }
      saveRunHashes(fsPath, succeeded);
    }
    opts?.onClose?.();
  });
}

const TERMINAL: ReadonlySet<FoldedStatus> = new Set(['success', 'failed', 'skipped', 'cancelled']);

const FEED_ICON: Record<string, string> = {
  success: '✓',
  failed: '✗',
  skipped: '⤼',
  cancelled: '⊘',
};

