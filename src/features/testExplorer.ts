// testExplorer.ts — `nika test` in the native Test Explorer.
//
// One test item per workflow that HAS a golden beside it
// (`<file>.golden.json` — the engine's own convention); Run executes
// the engine harness (mock/echo · offline · deterministic) and the
// failure message IS the engine's readable per-path diff. A second
// profile re-pins the golden — an explicit gesture, never silent.
// Discovery is golden-backed only: a workflow without a golden has no
// assertion contract yet, so it has nothing honest to report here.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { NikaService } from '../nikaService';

const goldenOf = (fsPath: string): string => `${fsPath}.golden.json`;

export function registerTestExplorer(
  context: vscode.ExtensionContext,
  service: NikaService,
): vscode.TestController {
  const ctrl = vscode.tests.createTestController('nika', 'Nika Workflows');
  context.subscriptions.push(ctrl);

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
      if (!hasGolden) { continue; }
      seen.add(uri.toString());
      if (!ctrl.items.get(uri.toString())) {
        ctrl.items.add(
          ctrl.createTestItem(uri.toString(), vscode.workspace.asRelativePath(uri), uri),
        );
      }
    }
    const stale: string[] = [];
    ctrl.items.forEach((item) => {
      if (!seen.has(item.id)) { stale.push(item.id); }
    });
    for (const id of stale) { ctrl.items.delete(id); }
  };
  ctrl.resolveHandler = async () => { await discover(); };

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
  ctrl.createRunProfile('Run', vscode.TestRunProfileKind.Run, runProfile(false), true);
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
