// testExplorer.ts — workflows AND their tasks in the native Test
// Explorer (the W-NATIVE steal: VS Code renders gutter run/status
// icons, the Explorer tree and inline failure peeks — zero layout
// fights).
//
// Three honest layers:
// - GOLDEN (workflow-level · tag-gated): `nika test` against
//   `<file>.golden.json` — the assertion contract; the failure peek
//   carries the engine's per-path diff AS a rendered expected/actual
//   pair (core/goldenDrift reconstructs the actual from the engine's
//   own report — never an invention), anchored on the `outputs:` block.
// - RUN (task-level children): every task is a child item with its
//   YAML range — « Run » executes the ENGINE (`run --task <id>` for
//   one task, `run` for the workflow), then the recorded trace folds
//   and each task reports its real verdict (§3.1: skipped/cancelled
//   are decisions, never defects). The failure peek lands ON the
//   task's line, speaking the marathon's one vocabulary.
// - PUBLISH-ONLY (annexe A #13): a run recorded by ANYONE — `nika run`
//   in a terminal, the canvas ▶, CI — lands its verdicts here through
//   a publish-only TestRun when its journal settles. The flight
//   recorder feeds the explorer; the extension never re-executes.
//
// supportsContinuousRun stays un-wired — OWED: the engine's capability
// surface (0.104) exposes no watch door (`nika run --watch` absent);
// continuous runs arrive the day the service can honestly serve them.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { NikaService } from '../nikaService';
import { parseRichWorkflow } from '../workflowParser';
import { foldTrace } from '../core/traceFold';
import { runSummaryLine, taskVerdict } from '../core/testBridge';
import { latestTraceFor } from '../core/tracePersist';
import {
  matchTraceToWorkflow,
  outputsBlockLine,
  parseGoldenDrift,
  reconstructActual,
} from '../core/goldenDrift';
import type { RunModel } from '../core/traceFold';

const goldenOf = (fsPath: string): string => `${fsPath}.golden.json`;

export function registerTestExplorer(
  context: vscode.ExtensionContext,
  service: NikaService,
): vscode.TestController {
  const ctrl = vscode.tests.createTestController('nika', 'Nika Workflows');
  context.subscriptions.push(ctrl);

  // The tag gate (annexe A #13): golden profiles only ever OFFER
  // workflow items — a task child has no golden of its own, so the tag
  // replaces the old run-then-skip hack.
  const goldenTag = new vscode.TestTag('golden');

  /** Task children — every task is an item AT ITS RANGE (the gutter
   *  icon lands on the task's line; the failure peek opens there). */
  const refreshTasks = async (item: vscode.TestItem): Promise<void> => {
    if (!item.uri) { return; }
    let text: string;
    try {
      text = (await vscode.workspace.openTextDocument(item.uri)).getText();
    } catch {
      return;
    }
    const wf = parseRichWorkflow(text);
    const seen = new Set<string>();
    for (const task of wf.tasks) {
      const id = `${item.id}#${task.id}`;
      seen.add(id);
      let child = item.children.get(id);
      if (!child) {
        child = ctrl.createTestItem(id, task.id, item.uri);
        item.children.add(child);
      }
      child.range = new vscode.Range(task.line, 0, task.line, 200);
    }
    const stale: string[] = [];
    item.children.forEach((c) => { if (!seen.has(c.id)) { stale.push(c.id); } });
    for (const id of stale) { item.children.delete(id); }
  };

  const discover = async (): Promise<void> => {
    let files: vscode.Uri[];
    try {
      files = await vscode.workspace.findFiles('**/*.nika.yaml', '**/node_modules/**', 200);
    } catch {
      return;
    }
    const seen = new Set<string>();
    for (const uri of files) {
      let hasGolden: boolean;
      try {
        hasGolden = fs.existsSync(goldenOf(uri.fsPath));
      } catch {
        hasGolden = false;
      }
      seen.add(uri.toString());
      let item = ctrl.items.get(uri.toString());
      if (!item) {
        item = ctrl.createTestItem(uri.toString(), vscode.workspace.asRelativePath(uri), uri);
        item.canResolveChildren = true;
        item.tags = [goldenTag];
        ctrl.items.add(item);
      }
      // The contract badge: a golden-backed workflow SAYS it has an
      // assertion contract; a bare one runs, it just asserts nothing.
      item.description = hasGolden ? 'golden' : undefined;
    }
    const stale: string[] = [];
    ctrl.items.forEach((item) => {
      if (!seen.has(item.id)) { stale.push(item.id); }
    });
    for (const id of stale) { ctrl.items.delete(id); }
  };
  ctrl.resolveHandler = async (item) => {
    if (item) { await refreshTasks(item); } else { await discover(); }
  };

  /** Report a folded model's verdicts onto a workflow item + children —
   *  shared by the engine profile and the publish-only ingest lane. */
  const reportModel = (run: vscode.TestRun, item: vscode.TestItem, model: RunModel): void => {
    const report = (target: vscode.TestItem, tid: string): void => {
      const v = taskVerdict(model.tasks.get(tid));
      if (v.kind === 'passed') { run.passed(target, v.durationMs); }
      else if (v.kind === 'failed') {
        run.failed(target, new vscode.TestMessage(v.message), v.durationMs);
      } else if (v.kind === 'skipped') { run.skipped(target); }
      // unknown: say nothing — the run never reached it.
    };
    item.children.forEach((child) => {
      const tid = child.id.split('#').pop();
      if (tid !== undefined) { report(child, tid); }
    });
    const failed = [...model.tasks.values()].some((t) => t.status === 'failed');
    const dur = model.startMs !== undefined && model.endMs !== undefined && model.endMs > model.startMs
      ? model.endMs - model.startMs
      : undefined;
    if (model.workflowStatus === 'completed' && !failed) { run.passed(item, dur); }
    else if (model.workflowStatus === 'failed' || failed) {
      run.failed(item, new vscode.TestMessage(runSummaryLine(model)), dur);
    } else { run.skipped(item); }
  };

  // While OUR profiles run the engine, the journal they write must not
  // double-report through the publish-only watcher.
  let explorerRunsInFlight = 0;

  /** RUN profile — the ENGINE executes (run --task for a child · run
   *  for a workflow), the recorded trace folds, every task reports its
   *  real verdict at its own line. Nothing is asserted beyond what a
   *  run observably did — that is the run's honest contract. */
  const engineRunProfile = async (request: vscode.TestRunRequest, token: vscode.CancellationToken): Promise<void> => {
    explorerRunsInFlight += 1;
    const run = ctrl.createTestRun(request);
    try {
      const queue: vscode.TestItem[] = [];
      if (request.include) { request.include.forEach((i) => queue.push(i)); }
      else { ctrl.items.forEach((i) => queue.push(i)); }
      for (const item of queue) {
        if (token.isCancellationRequested) { run.skipped(item); continue; }
        if (!item.uri) { continue; }
        if (!service.caps.run) {
          run.errored(item, new vscode.TestMessage('This engine has no `run` — running ships with the engine runtime.'));
          continue;
        }
        const isTask = item.id.includes('#');
        const taskId = isTask ? item.id.split('#').pop() : undefined;
        // Children verdicts land on the WORKFLOW's tasks — make sure the
        // tree knows them before the run reports (fresh files).
        if (!isTask && item.children.size === 0) { await refreshTasks(item); }
        run.started(item);
        const started = Date.now();
        try {
          const args = ['run', item.uri.fsPath, '--no-progress', ...(taskId !== undefined ? ['--task', taskId] : [])];
          const res = await service.runCli(args, 300000, undefined, path.dirname(item.uri.fsPath));
          const dur = Date.now() - started;
          // The verdicts come from the RECORDED trace, not the exit code
          // alone — the fold is the same truth every other surface reads.
          const tracePath = latestTraceFor(item.uri.fsPath);
          const model = tracePath !== undefined ? foldTrace(fs.readFileSync(tracePath, 'utf-8')) : undefined;
          if (!model) {
            if (res.code === 0) { run.passed(item, dur); }
            else { run.failed(item, new vscode.TestMessage([res.stdout.trim(), res.stderr.trim()].filter(Boolean).join('\n') || `nika run exited ${res.code}`), dur); }
            continue;
          }
          const report = (target: vscode.TestItem, tid: string): void => {
            const v = taskVerdict(model.tasks.get(tid));
            if (v.kind === 'passed') { run.passed(target, v.durationMs); }
            else if (v.kind === 'failed') {
              const msg = new vscode.TestMessage(v.message);
              run.failed(target, msg, v.durationMs);
            } else if (v.kind === 'skipped') { run.skipped(target); }
            // unknown: say nothing — the run never reached it.
          };
          if (isTask && taskId !== undefined) {
            report(item, taskId);
          } else {
            item.children.forEach((child) => {
              const tid = child.id.split('#').pop();
              if (tid !== undefined) { report(child, tid); }
            });
            if (res.code === 0) { run.passed(item, dur); }
            else { run.failed(item, new vscode.TestMessage(runSummaryLine(model)), dur); }
          }
        } catch (e) {
          run.errored(item, new vscode.TestMessage(String(e)));
        }
      }
    } finally {
      run.end();
      explorerRunsInFlight = Math.max(0, explorerRunsInFlight - 1);
    }
  };

  /** The golden failure peek: the engine's drift report rendered as a
   *  true expected/actual diff, anchored at the `outputs:` block. The
   *  verbatim engine text stays the message either way. */
  const goldenMessage = (item: vscode.TestItem, detail: string): vscode.TestMessage => {
    let msg = new vscode.TestMessage(detail);
    try {
      if (item.uri) {
        const goldenRaw = fs.readFileSync(goldenOf(item.uri.fsPath), 'utf-8');
        const drift = parseGoldenDrift(detail);
        if (drift !== undefined) {
          const golden: unknown = JSON.parse(goldenRaw);
          const actual = reconstructActual(golden, drift);
          if (actual !== undefined) {
            msg = vscode.TestMessage.diff(
              detail,
              JSON.stringify(golden, null, 2),
              JSON.stringify(actual, null, 2),
            );
          }
        }
        const line = outputsBlockLine(fs.readFileSync(item.uri.fsPath, 'utf-8'));
        if (line !== undefined) {
          msg.location = new vscode.Location(item.uri, new vscode.Range(line, 0, line, 200));
        }
      }
    } catch {
      // Unreadable golden/YAML — the verbatim message stands alone.
    }
    return msg;
  };

  const runProfile = (update: boolean) =>
    async (request: vscode.TestRunRequest, token: vscode.CancellationToken): Promise<void> => {
      explorerRunsInFlight += 1;
      const run = ctrl.createTestRun(request);
      try {
        const queue: vscode.TestItem[] = [];
        if (request.include) {
          request.include.forEach((i) => queue.push(i));
        } else {
          ctrl.items.forEach((i) => queue.push(i));
        }
        for (const item of queue) {
          if (token.isCancellationRequested) { run.skipped(item); continue; }
          if (!item.uri) { continue; }
          // Golden profiles act on WORKFLOW items (the tag already gates
          // the picker; a direct request with a child routes nowhere).
          if (item.id.includes('#')) { run.skipped(item); continue; }
          // « Update » may RECORD the first golden (that is its job);
          // plain « Golden test » without a pin has nothing to compare.
          if (!update && !fs.existsSync(goldenOf(item.uri.fsPath))) {
            run.errored(item, new vscode.TestMessage(
              'No golden beside this workflow yet — « Update golden (re-pin) » records the first one (an explicit gesture, never silent).',
            ));
            continue;
          }
          if (!service.caps.test) {
            run.errored(item, new vscode.TestMessage(
              'This engine has no `test` subcommand — golden testing ships with the 0.94 line.',
            ));
            continue;
          }
          run.started(item);
          const started = Date.now();
          const args = update
            ? ['test', '--update', item.uri.fsPath]
            : ['test', item.uri.fsPath];
          try {
            // The engine resolves relative paths and writes its journal
            // against the CWD (journey-e2e law) — the workflow's own
            // directory is the test's world.
            const res = await service.runCli(args, 60000, undefined, path.dirname(item.uri.fsPath));
            const dur = Date.now() - started;
            if (res.code === 0) {
              run.passed(item, dur);
            } else {
              // The engine's stdout carries the per-path golden diff —
              // rendered as expected/actual when it parses (never
              // re-narrated), the verbatim text as the message.
              const detail = [res.stdout.trim(), res.stderr.trim()].filter(Boolean).join('\n');
              run.failed(
                item,
                detail.length > 0 ? goldenMessage(item, detail) : new vscode.TestMessage(`nika test exited ${res.code}`),
                dur,
              );
            }
          } catch (e) {
            run.errored(item, new vscode.TestMessage(String(e)));
          }
        }
      } finally {
        run.end();
        explorerRunsInFlight = Math.max(0, explorerRunsInFlight - 1);
      }
    };
  ctrl.createRunProfile('Run (engine)', vscode.TestRunProfileKind.Run, engineRunProfile, true);
  ctrl.createRunProfile('Golden test', vscode.TestRunProfileKind.Run, runProfile(false), false, goldenTag);
  ctrl.createRunProfile('Update golden (re-pin)', vscode.TestRunProfileKind.Run, runProfile(true), false, goldenTag);

  // ── Publish-only ingest (annexe A #13) — the flight recorder feeds
  // the explorer. A journal that settles terminal (completed · failed ·
  // cancelled) publishes its verdicts as a non-persisted TestRun; the
  // extension re-executes NOTHING. Sovereign fit: `nika run` in any
  // terminal, CI replays, the canvas ▶ — one truth surface.
  const publishedTraces = new Map<string, number>();
  const publishTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const publishTrace = (uri: vscode.Uri): void => {
    try {
      // Our own profiles already reported this journal's verdicts.
      if (explorerRunsInFlight > 0) { return; }
      const stat = fs.statSync(uri.fsPath);
      if (publishedTraces.get(uri.fsPath) === stat.size) { return; }
      const model = foldTrace(fs.readFileSync(uri.fsPath, 'utf-8'));
      if (model.tasks.size === 0) { return; }
      // A growing journal publishes at its terminal write only.
      if (!['completed', 'failed', 'cancelled'].includes(model.workflowStatus)) { return; }
      // The journal lives at <workflow dir>/.nika/traces/ — candidates
      // are the discovered workflows of THAT directory (engine cwd law).
      const runDir = path.resolve(path.dirname(uri.fsPath), '..', '..');
      const candidates: Array<{ fsPath: string; taskIds: string[]; item: vscode.TestItem }> = [];
      ctrl.items.forEach((item) => {
        if (!item.uri || path.dirname(item.uri.fsPath) !== runDir) { return; }
        try {
          const wf = parseRichWorkflow(fs.readFileSync(item.uri.fsPath, 'utf-8'));
          candidates.push({ fsPath: item.uri.fsPath, taskIds: wf.tasks.map((t) => t.id), item });
        } catch {
          // unreadable candidate — skip
        }
      });
      const matched = matchTraceToWorkflow([...model.tasks.keys()], candidates);
      const host = candidates.find((c) => c.fsPath === matched);
      if (!host) { return; }
      publishedTraces.set(uri.fsPath, stat.size);
      // Bounded: the newest 40 journals' sizes are plenty of dedup.
      if (publishedTraces.size > 40) {
        const oldest = publishedTraces.keys().next().value;
        if (oldest !== undefined) { publishedTraces.delete(oldest); }
      }
      void (async () => {
        if (host.item.children.size === 0) { await refreshTasks(host.item); }
        const run = ctrl.createTestRun(
          new vscode.TestRunRequest(),
          `nika run (recorded) — ${path.basename(uri.fsPath)}`,
          false,
        );
        reportModel(run, host.item, model);
        run.end();
      })();
    } catch {
      // A torn read mid-write — the next event re-tries.
    }
  };
  const traceGlob = vscode.workspace.getConfiguration('nika').get<string>('traces.glob', '**/.nika/traces/*.ndjson');
  const traceWatcher = vscode.workspace.createFileSystemWatcher(traceGlob);
  const onTrace = (uri: vscode.Uri): void => {
    const pending = publishTimers.get(uri.fsPath);
    if (pending) { clearTimeout(pending); }
    publishTimers.set(uri.fsPath, setTimeout(() => {
      publishTimers.delete(uri.fsPath);
      publishTrace(uri);
    }, 600));
  };
  context.subscriptions.push(
    traceWatcher,
    traceWatcher.onDidCreate(onTrace),
    traceWatcher.onDidChange(onTrace),
    { dispose: () => { for (const t of publishTimers.values()) { clearTimeout(t); } } },
  );

  // Workflows and goldens appear/vanish — re-discover (covers both:
  // the glob suffix matches `.nika.yaml` and `.nika.yaml.golden.json`).
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.nika.yaml*');
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(() => { void discover(); }),
    watcher.onDidDelete(() => { void discover(); }),
  );

  return ctrl;
}
