// runLive.ts — stream `nika run --json` into the DAG panel, live.
//
// The capability gate lit `run` the day nika-runtime reached L3; this
// is what the live overlay was built for all along. `run --json`
// emits the SAME canonical NDJSON the flight-recorder writes, so the
// tested reducer is reused incrementally. Complete lines are admitted once,
// detached snapshots paint the present, and raw capture has a hard byte cap.
// Losing observation never becomes a successful run or a complete journal.

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { maybeAskCommunity } from './communityAsk';
import { maybeCelebrateFirstGreen } from './firstGreen';
import { saveRunHashes } from '../core/canvasState';
import { taskFingerprints } from '../core/dirtyNodes';
import { STATUS_CHAR } from '../core/glyphRegistry';
import { summarizeRun, type FoldedStatus, type RunModel } from '../core/traceFold';
import { TraceStream } from '../core/traceStream';
import { persistTrace, pruneTraces } from '../core/tracePersist';
import { traceStore } from '../core/traceStore';
import { runAnnouncementStream } from '../core/runAnnouncement';
import type { DagPanel, TaskStatus } from '../dagPanel';
import type { NikaService } from '../nikaService';
import { cancelActiveReplay } from './runsView';

/** Store readers update twice a second; canvas paints coalesce separately. */
const STORE_THROTTLE_MS = 500;
const PAINT_THROTTLE_MS = 50;

/** One process owner. Sending a signal is not process settlement. */
interface LiveRun { kill(): void; superseded: boolean }
let activeRun: LiveRun | undefined;
let presentationOwner: LiveRun | undefined;
/** At most one pending intent; a newer request replaces it, never queues work. */
let pendingRun: (() => void) | undefined;
const STOP_ESCALATION_MS = 5000;

/** workflow fsPath → the journal the engine last announced on stderr —
 *  the exact file a paused run must be resumed FROM. */
export const lastTracePathByWorkflow = new Map<string, string>();
/** The run's printed complete chain head per workflow, not a verified seal. */
const lastAnchorByWorkflow = new Map<string, string>();

/** True while a spawned `nika run` drives the DAG (liveDag suspends). */
export function isRunActive(): boolean {
  return activeRun !== undefined;
}

// Run lifecycle as an event — the status pill's spin (and any other
// listener) follows spawn/close without threading a handle through
// every runWorkflowLive call site.
const runActiveEmitter = new vscode.EventEmitter<boolean>();
export const onDidChangeRunActive: vscode.Event<boolean> = runActiveEmitter.event;

function setRunActive(handle: LiveRun | undefined): void {
  const was = activeRun !== undefined;
  activeRun = handle;
  const is = activeRun !== undefined;
  if (was !== is) { runActiveEmitter.fire(is); }
}

/** Discard pending work and request stop; ownership lasts until child close. */
export function cancelActiveRun(): void {
  pendingRun = undefined;
  activeRun?.kill();
}

// Walkthrough completionEvent producers — one-way session latches. Every
// run path funnels through runWorkflowLive (▶ · ▶ mock · palette · resume
// · fork · task-scoped), so setting the keys HERE is what lets the
// walkthrough's run/break steps check themselves off no matter which
// surface started the run (the canvas hole the onCommand events missed).
let everRanLatched = false;
let sawFailureLatched = false;

function latchContext(key: 'nika.everRan' | 'nika.sawFailure'): void {
  void vscode.commands.executeCommand('setContext', key, true);
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
    if (service.supportError) {
      void vscode.window.showWarningMessage(`Nika: ${service.supportError}`);
      return;
    }
    void vscode.window
      .showWarningMessage('Nika: running needs the engine binary — it is not on this machine yet.', 'Finish setup')
      .then((pick) => {
        if (pick === 'Finish setup') { void vscode.commands.executeCommand('nika.finishSetup'); }
      });
    return;
  }

  if (activeRun) {
    // Fence the old child's UI immediately, but do not spawn over it. The
    // close handler starts only the latest intent after all stdio settles.
    const nextOpts = opts ? { ...opts, extraArgs: opts.extraArgs?.slice() } : undefined;
    pendingRun = () => runWorkflowLive(service, dagPanel, fsPath, log, onlyTask, nextOpts);
    activeRun.superseded = true;
    activeRun.kill();
    return;
  }
  // The newly owned live present supersedes replay transport.
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
  if (!everRanLatched) {
    everRanLatched = true;
    latchContext('nika.everRan');
  }

  // Fingerprints of what actually RUNS, captured at spawn: an edit made
  // mid-run must not be labeled "successfully ran" (dirty-nodes law). voice-ok
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
  lastTracePathByWorkflow.delete(fsPath);
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
  let stopRequested = false;
  let spawnFailed = false;
  let escalation: ReturnType<typeof setTimeout> | undefined;
  const handle: LiveRun = {
    superseded: false,
    kill: () => {
      if (stopRequested) { return; }
      stopRequested = true;
      escalation = setTimeout(() => {
        if (activeRun !== handle) { return; }
        log('WARN', 'nika run has not closed after stop; sending SIGKILL and still awaiting close');
        child.kill('SIGKILL');
      }, STOP_ESCALATION_MS);
      escalation.unref();
      child.kill();
    },
  };
  presentationOwner = handle;
  setRunActive(handle);
  const ownsPresentation = (): boolean => activeRun === handle && !handle.superseded;
  const announcement = runAnnouncementStream(({ path: journal, events, head }) => {
    lastTracePathByWorkflow.set(fsPath, path.resolve(path.dirname(fsPath), journal));
    lastAnchorByWorkflow.set(fsPath, `${events} events · chain ${head}`);
  });

  const stream = new TraceStream();
  let observationLost = false;
  let paintTimer: ReturnType<typeof setTimeout> | undefined;
  // Rolling stderr tail — the refused-run branch in `close` greps it for
  // the NIKA codes a pre-flight check named (bounded · refusals are short).
  let stderrTail = '';
  const lastPainted = new Set<string>();
  let lastStorePublish = 0;
  let lastProgress = '';
  const paint = (model: RunModel | undefined = stream.snapshot()): void => {
    if (!ownsPresentation()) { return; }
    if (!model || model.tasks.size === 0) { return; }
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
        agent: t.agent,
        liveUsd: t.liveUsd,
        chunks: t.chunks,
        defHash: t.defHash,
        inputHash: t.inputHash,
        pausedQuestion: model.paused?.task === t.id ? (model.paused.message ?? 'awaiting an answer') : undefined,
      })),
    );
    // Narrate only NEW terminal transitions (the feed is a story, not
    // a redraw log) — keyed on the id+status set painted so far.
    for (const t of model.tasks.values()) {
      const key = `${t.id}:${t.status}`;
      if (TERMINAL.has(t.status) && !lastPainted.has(key)) {
        lastPainted.add(key);
        if (t.cached === true) {
          // ADR-099 rehydration — the story must never read as if the
          // task re-executed; ○ + "cached", not a plain green success.
          dagPanel.note(STATUS_CHAR.cached, `${t.id} cached · recorded output reused`, t.id, 'st-success');
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
    if (!ownsPresentation()) { return; }
    if (!stream.push(chunk)) {
      if (stream.limited && !observationLost) {
        observationLost = true;
        if (paintTimer) { clearTimeout(paintTimer); paintTimer = undefined; }
        traceStore.clear(fsPath);
        dagPanel.note('…', 'live preview limit reached (16 MiB) · engine still owns the run', undefined, 'st-retrying');
      }
      return; // Keep draining stdout; the engine's journal is independent.
    }
    if (!paintTimer && chunk.length > 0) {
      paintTimer = setTimeout(() => { paintTimer = undefined; paint(); }, PAINT_THROTTLE_MS);
      paintTimer.unref();
    }
  });
  child.stderr.setEncoding('utf-8');
  child.stderr.on('data', (chunk: string) => {
    if (!ownsPresentation()) { return; }
    stderrTail = (stderrTail + chunk).slice(-4096);
    announcement.push(chunk);
    log('WARN', `nika run: ${chunk.trim()}`);
  });

  child.on('error', (err) => {
    spawnFailed = child.pid === undefined;
    if (!ownsPresentation()) { return; }
    if (!spawnFailed) {
      log('WARN', `nika run process error: ${err.message}`);
      void vscode.window.showWarningMessage(`Nika: run process error — ${err.message}`);
      return;
    }
    // A spawn error is a SETUP state (the classic: a cached path whose
    // file vanished — ENOENT). Offer the door and clear the dead path so
    // every surface re-probes instead of replaying the same failure.
    void vscode.window
      .showWarningMessage(`Nika: run failed to start — ${err.message}`, 'Finish setup')
      .then((pick) => {
        if (pick === 'Finish setup') { void vscode.commands.executeCommand('nika.finishSetup'); }
      });
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' && service.binaryPath === binary) {
      void service.setBinary(undefined);
    }
  });
  child.once('close', (code) => {
    if (escalation) { clearTimeout(escalation); }
    if (paintTimer) { clearTimeout(paintTimer); paintTimer = undefined; }
    if (activeRun !== handle) { return; }
    try {
      if (!ownsPresentation() || spawnFailed) { return; }
      announcement.finish();
      stream.finish();
      const model = stream.snapshot();
      const buffer = stream.text();
      if (!model || buffer === undefined) {
        const journal = lastTracePathByWorkflow.get(fsPath);
        const story = `live preview incomplete · process closed${code === null ? '' : ` (exit ${code})`}`
          + (journal ? ` · inspect ${journal}` : ' · inspect the engine journal');
        dagPanel.note('…', story, undefined, 'st-retrying');
        dagPanel.runVerdict('…', story, 'st-retrying');
        opts?.onClose?.();
        return; // No prefix persistence, success fingerprints or celebration.
      }
      paint(model); // Complete the final cards before releasing process ownership.
      // Final fold ALWAYS lands in the store (the throttle above may have
      // swallowed the last intermediate) — the badges' resting truth.
      if (model.tasks.size > 0) { traceStore.set(fsPath, model); }
      const verdict = model.workflowStatus;
      if (verdict === 'failed' && !sawFailureLatched) {
        // The break-it-on-purpose step checks itself on the FIRST failed
        // verdict — the red taught, whoever started the run.
        sawFailureLatched = true;
        latchContext('nika.sawFailure');
      }
      // ADR-099: paused is a QUESTION, not a failure — amber, the message
      // itself, and the answer flow one click away (exit 4 · human-gate).
      const icon = verdict === 'completed' ? '✓'
        : verdict === 'cancelled' ? '⊘'
        : verdict === 'paused' ? '⏸' : '✗';
      const cls = verdict === 'completed' ? 'st-success'
        : verdict === 'cancelled' ? 'st-cancelled'
        : verdict === 'paused' ? 'st-retrying' : 'st-failed';
      if (code !== 0 && code !== null && model.tasks.size === 0) {
        // The refused run SPEAKS (operator F5 · 2026-07-28): exit 2 with an
        // empty journal is the pre-flight check saying no BEFORE the first
        // wave — the old fold rendered it « ✗ run unknown · ▶ 0 tasks »,
        // which told the operator nothing (the demo's own permits gap died
        // exactly here). Name the refusal, surface its NIKA codes (stdout
        // JSON or stderr both carry them), and hand the first one to the
        // verdict banner so the Explain door rides it.
        const codes = [...new Set(`${buffer}\n${stderrTail}`.match(/NIKA-[A-Z]+-\d+/g) ?? [])];
        const named = codes.slice(0, 3).join(' · ');
        // clap ALSO exits 2 on unknown argv (an older engine meeting
        // --resume/--from) — that story is «update the engine», never
        // «fix the finding» (the check-refusal words would gaslight).
        const argvMiss = /unexpected argument|unrecognized subcommand/i.exec(stderrTail)
          ? stderrTail.match(/(?:unexpected argument|unrecognized subcommand) '([^']+)'/i)?.[1]
          : undefined;
        const story = argvMiss
          ? `this engine does not know ${argvMiss} — update nika (brew upgrade nika)`
          : code === 2
          ? `check refused the run${named ? ` · ${named}` : ''} — fix the finding, then ▶`
          : `run died before its first event (exit ${code})${named ? ` · ${named}` : ''}`;
        dagPanel.note('✗', story, undefined, 'st-failed');
        dagPanel.runVerdict('✗', story, 'st-failed', undefined, codes[0]);
      } else if (verdict === 'paused' && model.paused) {
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
        // A failure hands the banner its FIRST failed task + the NIKA code
        // its story named (when it did) — the Explain/Fork doors ride them.
        const firstFailed = verdict === 'failed'
          ? [...model.tasks.values()].find((t) => t.status === 'failed')
          : undefined;
        const failedCode = firstFailed?.preview?.match(/NIKA-[A-Z]+-\d+/)?.[0];
        // The HUMAN verdict (the hero speaks a sentence · the provable
        // facts trail quiet): « every task landed » beats « run
        // completed » — and a failure NAMES its task before the facts.
        const total = model.tasks.size;
        const settled = [...model.tasks.values()].filter((t) => t.status === 'success').length;
        const human = verdict === 'completed'
          ? (settled === total ? 'every task landed' : `${settled} of ${total} landed`)
          : verdict === 'cancelled'
          ? 'run cancelled · earlier effects may remain'
          : firstFailed
          ? `${firstFailed.id} broke the run · ${settled} landed before it`
          : 'the run broke before its first task';
        dagPanel.runVerdict(
          icon,
          `${human} · ${summarizeRun(model).replace(/^[✓✗⊘↷…] /, '')}${suffix}`,
          cls,
          firstFailed?.id,
          failedCode,
        );
        // The peak (peak-end): the FIRST green verdict ever gets the one
        // confetti — the mock demo counts, the sandbox IS the aha. On a
        // fresh machine the auto-demo's close lands here, so the fall
        // happens DURING the zero-gesture first run: the peak sits at
        // the end, by construction.
        const celebrated = maybeCelebrateFirstGreen(verdict, dagPanel);
        // The one earned ask, ever — fires on the FIRST completed run only
        // (communityAsk owns the flag; a dismissal counts as answered).
        // When the confetti flies, the toast waits out the fall (~1.5s)
        // so the one celebration is never covered by a notification.
        if (celebrated) {
          setTimeout(() => {
            if (!activeRun && presentationOwner === handle && !handle.superseded) {
              maybeAskCommunity(verdict);
            }
          }, 1500);
        } else {
          maybeAskCommunity(verdict);
        }
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
    } finally {
      // Never release on error, signal, exit, or a timer: close is the one
      // settlement point, and even a throwing UI consumer cannot strand it.
      const next = pendingRun;
      pendingRun = undefined;
      try {
        dagPanel.setRunState(false);
      } finally {
        setRunActive(undefined);
        next?.();
      }
    }
  });
}

const TERMINAL: ReadonlySet<FoldedStatus> = new Set(['success', 'failed', 'skipped', 'cancelled']);

// The terminal quartet from the one vocabulary (glyphRegistry) — the
// feed's skipped/cancelled dialect died by construction.
const FEED_ICON: Record<string, string> = {
  success: STATUS_CHAR.success,
  failed: STATUS_CHAR.failed,
  skipped: STATUS_CHAR.skipped,
  cancelled: STATUS_CHAR.cancelled,
};
