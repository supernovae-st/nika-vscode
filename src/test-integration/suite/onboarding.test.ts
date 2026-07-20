// onboarding.test.ts — the V2.a onboarding surfaces in the REAL host: the
// door (welcome, no dead-end toast · one gesture) and the demo sandbox
// (one gesture → a runnable file beside the canvas · offline, zero keys).

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const EXT_ID = 'supernovae.nika-lang';

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function hasWebviewTab(): boolean {
  return vscode.window.tabGroups.all.some((g) =>
    g.tabs.some((t) => t.input instanceof vscode.TabInputWebview),
  );
}

suite('nika-lang · onboarding (V2.a · the door + the sandbox)', () => {
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

  test('the door: no workflow in focus opens the welcome, never a dead-end toast', async () => {
    // Nothing active — the porte must PROBE silently (activeNikaDocument),
    // NOT toast « open a .nika.yaml file first » and dead-end.
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(400);

    const win = vscode.window as unknown as { showWarningMessage: (...a: unknown[]) => Thenable<unknown> };
    const orig = win.showWarningMessage;
    const warnings: string[] = [];
    win.showWarningMessage = (msg: unknown, ...rest: unknown[]) => {
      warnings.push(String(msg));
      return Promise.resolve(undefined);
    };
    try {
      // ONE gesture — a bare showDag (no uri), the sidebar/walkthrough path.
      await vscode.commands.executeCommand('nika.showDag');
      await sleep(800);
    } finally {
      win.showWarningMessage = orig;
    }

    assert.ok(
      !warnings.some((w) => /open a \.nika\.yaml file first/i.test(w)),
      `the door must not dead-end with a toast (saw: ${JSON.stringify(warnings)})`,
    );
    assert.ok(hasWebviewTab(), 'the welcome canvas must be up after the bare showDag');
  });

  test('the demo: one gesture writes a runnable file beside the canvas', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'the integration host opens a workspace folder');
    const expected = path.join(folder!.uri.fsPath, 'hello-canvas.nika.yaml');
    // Clean any prior run so we assert the PRIMARY name (not a -N suffix).
    if (fs.existsSync(expected)) { fs.rmSync(expected); }
    // Model the first-run flow: nothing open yet, so the fresh canvas keeps
    // preserveFocus on the editor (a pre-existing panel would reveal-focus).
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(400);

    // ONE gesture — the whole sandbox.
    await vscode.commands.executeCommand('nika.tryDemo');
    await sleep(1000);

    // (a) the runnable file landed at the workspace root
    assert.ok(fs.existsSync(expected), 'hello-canvas.nika.yaml must land at the workspace root');
    const body = fs.readFileSync(expected, 'utf-8');
    assert.ok(body.includes('model: mock/echo'), 'the demo runs offline on mock/echo');
    assert.ok(body.includes('id: hello-canvas'), 'the demo is the hello-canvas workflow');

    // (b) it opened in the editor (the user sees the YAML)
    const active = vscode.window.activeTextEditor;
    assert.ok(active && active.document.uri.fsPath === expected, 'the demo opens in the editor');
    assert.strictEqual(active!.document.languageId, 'nika', 'the demo binds to the nika language');

    // (c) the canvas is up beside it — the ▶ (mock) lives in that toolbar;
    // tryDemo NEVER auto-runs, so nothing spent, no key asked.
    assert.ok(hasWebviewTab(), 'the canvas must be up beside the demo');

    fs.rmSync(expected, { force: true });
  });
});
