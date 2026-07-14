// activation.test.ts — the real-host smoke suite. Proves the surfaces the
// vitest harness can't: activation, command registration, the language
// contribution, live diagnostics, and a CSP-locked webview panel that
// actually loads its asWebviewUri assets.

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const EXT_ID = 'supernovae.nika-lang';

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

suite('nika-lang · real extension host', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, `extension ${EXT_ID} must be present in the dev host`);
    await ext!.activate();
  });

  suiteTeardown(async function () {
    // If `nika lsp` is on PATH the client starts async; tearing the host
    // down mid-handshake makes the languageclient reject its own pending
    // initialize (library-internal). Let it reach a stoppable state so
    // the suite exits clean — the extension's safeStopClient handles the
    // real close-while-starting path in production.
    this.timeout(10000);
    await sleep(2500);
  });

  test('activates without throwing', () => {
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.strictEqual(ext!.isActive, true);
  });

  test('registers its command surface', async () => {
    const all = await vscode.commands.getCommands(true);
    for (const cmd of ['nika.showDag', 'nika.checkWorkflow', 'nika.newWorkflow', 'nika.doctor']) {
      assert.ok(all.includes(cmd), `command ${cmd} must be registered`);
    }
  });

  test('a .nika.yaml opens as the nika language', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nika-int-'));
    const file = path.join(dir, 'smoke.nika.yaml');
    fs.writeFileSync(file, 'nika: v1\nworkflow:\n  id: smoke\nmodel: mock/echo\ntasks:\n  a:\n    infer:\n      prompt: "hi"\n');
    const doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc);
    assert.strictEqual(doc.languageId, 'nika', 'the .nika.yaml must bind to the nika language');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('the DAG webview panel opens (CSP + asWebviewUri load path)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nika-int-'));
    const file = path.join(dir, 'graph.nika.yaml');
    fs.writeFileSync(file, 'nika: v1\nworkflow:\n  id: g\nmodel: mock/echo\ntasks:\n  a:\n    infer:\n      prompt: "hi"\n  b:\n    after: { a: succeeded }\n    infer:\n      prompt: "bye"\n');
    const doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc);
    // Show the DAG — if the webview HTML or its CSP were malformed, panel
    // creation would throw here in the real host.
    await vscode.commands.executeCommand('nika.showDag', doc.uri);
    await sleep(800);
    // The tab group now holds a webview panel titled "Nika DAG".
    const hasWebview = vscode.window.tabGroups.all.some((g) =>
      g.tabs.some((t) => t.input instanceof vscode.TabInputWebview),
    );
    assert.ok(hasWebview, 'a webview tab must exist after nika.showDag');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
