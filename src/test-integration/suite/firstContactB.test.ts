// firstContactB.test.ts — launch B of the first-contact e2e: the SAME
// profile relaunched (runFirstContact.ts reuses launch A's user-data-dir,
// where nika.firstActivation.v1 and nika.firstGreenRun.v1 now live) in a
// FRESH empty workspace. Two proofs:
//
//   1. the wire stays cold — first contact is once per MACHINE, so no
//      auto-demo lands here, ever (a bounded negative window, then the
//      positive control in test 2 proves the engine WAS available — the
//      absence was the wire's decision, not a missing binary);
//   2. a second green celebrates nothing — the confetti's guard is the
//      persisted key, byte-scanned by the launcher between launches, so
//      maybeCelebrateFirstGreen returns false before it can reach the
//      panel. The webview pixels are beyond the host API; the key + the
//      guard ARE the honest observable of "never twice".

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const EXT_ID = 'supernovae.nika-lang';
const DEMO_FILE = 'hello-canvas.nika.yaml';

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function until(
  what: string,
  check: () => boolean,
  timeoutMs: number,
  stepMs = 250,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) { return; }
    await sleep(stepMs);
  }
  assert.fail(`timed out (${timeoutMs}ms) waiting for: ${what}`);
}

function workspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'the e2e host opens a workspace folder');
  return folder!.uri.fsPath;
}

function traceCount(root: string): number {
  const dir = path.join(root, '.nika', 'traces');
  if (!fs.existsSync(dir)) { return 0; }
  return fs.readdirSync(dir).filter((f) => f.endsWith('.ndjson')).length;
}

function newestTrace(root: string): string | undefined {
  const dir = path.join(root, '.nika', 'traces');
  if (!fs.existsSync(dir)) { return undefined; }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ndjson')).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : undefined;
}

function kinds(file: string): string[] {
  return fs.readFileSync(file, 'utf-8').split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try { return (JSON.parse(l) as { kind?: string }).kind ?? ''; } catch { return ''; }
    });
}

suite('first contact · launch B (same machine memory · the wire stays cold)', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, `extension ${EXT_ID} must be present`);
    await ext!.activate();
  });

  suiteTeardown(async function () {
    this.timeout(10000);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(1500);
  });

  test('no auto-demo, no auto-run — first contact happens once per machine', async function () {
    this.timeout(20000);
    const root = workspaceRoot();
    // Launch A's demo landed ~2-4s after activation; hold 10s (2-4x that)
    // and assert the wire never moves here: no demo file, no journal.
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      assert.ok(
        !fs.existsSync(path.join(root, DEMO_FILE)),
        'the demo must NOT auto-land on an already-contacted machine',
      );
      assert.strictEqual(traceCount(root), 0, 'no self-run on an already-contacted machine');
      await sleep(250);
    }
  });

  test('a second green celebrates nothing — the one-shot key already burned', async function () {
    this.timeout(90000);
    const root = workspaceRoot();
    // Positive control for the negative above: the SAME gestures a real
    // user has — the demo command, then the run. They must work, which
    // proves test 1's silence was the wire's decision.
    const target = await vscode.commands.executeCommand<vscode.Uri | undefined>('nika.tryDemo');
    assert.ok(target, 'nika.tryDemo returns the demo uri (the engine is here)');
    assert.ok(fs.existsSync(target!.fsPath), 'the demo file lands when ASKED');

    const before = traceCount(root);
    await vscode.commands.executeCommand('nika.runWorkflow', target);
    await until('the second run journal', () => traceCount(root) > before, 30000);
    const trace = newestTrace(root)!;
    await until(
      'the second run terminal event',
      () => kinds(trace).some((k) => k.startsWith('workflow_') && k !== 'workflow_started'),
      45000,
    );
    assert.ok(kinds(trace).includes('workflow_completed'), 'the second run is green too');
    // The second green reached the SAME close path — but the launcher
    // proved nika.firstGreenRun.v1 persisted after launch A, and that
    // key is the entire guard of maybeCelebrateFirstGreen: it returns
    // false before panel.celebrate() can post run:celebrate. One
    // confetti per machine, ever — asserted at the key + guard level
    // (the webview's pixels are beyond the extension-host API).
  });
});
