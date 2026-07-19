// testExplorer.ts — workflows AND their tasks in the native Test
// Explorer (the W-NATIVE steal: VS Code renders gutter run/status
// icons, the Explorer tree and inline failure peeks — zero layout
// fights).
//
// Two honest layers:
// - GOLDEN (workflow-level): `nika test` against `<file>.golden.json`
//   — the assertion contract; the failure message IS the engine's
//   per-path diff. Update re-pins explicitly, never silently.
// - RUN (task-level children): every task is a child item with its
//   YAML range — « Run » executes the ENGINE (`run --task <id>` for
//   one task, `run` for the workflow), then the recorded trace folds
//   and each task reports its real verdict (§3.1: skipped/cancelled
//   are decisions, never defects). The failure peek lands ON the
//   task's line, speaking the marathon's one vocabulary.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { NikaService } from '../nikaService';
import { parseRichWorkflow } from '../workflowParser';
import { foldTrace } from '../core/traceFold';
import { runSummaryLine, taskVerdict } from '../core/testBridge';
import { latestTraceFor } from '../core/tracePersist';

const goldenOf = (fsPath: string): string => `${fsPath}.golden.json`;

export function registerTestExplorer(
  context: vscode.ExtensionContext,
  service: NikaService,
): vscode.TestController {
  const ctrl = vscode.tests.createTestController('nika', 'Nika Workflows');
  context.subscriptions.push(ctrl);

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

  /** RUN profile — the ENGINE executes (run --task for a child · run
   *  for a workflow), the recorded trace folds, every task reports its
   *  real verdict at its own line. Nothing is asserted beyond what a
   *  run observably did — that is the run's honest contract. */
  const engineRunProfile = async (request: vscode.TestRunRequest, token: vscode.CancellationToken): Promise<void> => {
    const run = ctrl.createTestRun(request);
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
    run.end();
  };

  const runProfile = (update: boolean) =>
    async (request: vscode.TestRunRequest, token: vscode.CancellationToken): Promise<void> => {
      const run = ctrl.createTestRun(request);
      const queue: vscode.TestItem[] = [];
      if (request.include) {
        request.include.forEach((i) => queue.push(i));
      } else {
        ctrl.items.forEach((i) => queue.push(i));
      }
      for (const item of queue) {
        if (token.isCancellationRequested) { run.skipped(item); continue; }
        if (!item.uri) { continue; }
        // Golden profiles act on WORKFLOW items only (a task child has
        // no golden of its own — route to the parent's contract).
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
            // The engine's stdout carries the per-path golden diff (capped)
            // — that IS the test message, no re-narration.
            const detail = [res.stdout.trim(), res.stderr.trim()].filter(Boolean).join('\n');
            run.failed(
              item,
              new vscode.TestMessage(detail.length > 0 ? detail : `nika test exited ${res.code}`),
              dur,
            );
          }
        } catch (e) {
          run.errored(item, new vscode.TestMessage(String(e)));
        }
      }
      run.end();
    };
  ctrl.createRunProfile('Run (engine)', vscode.TestRunProfileKind.Run, engineRunProfile, true);
  ctrl.createRunProfile('Golden test', vscode.TestRunProfileKind.Run, runProfile(false), false);
  ctrl.createRunProfile('Update golden (re-pin)', vscode.TestRunProfileKind.Run, runProfile(true), false);

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
