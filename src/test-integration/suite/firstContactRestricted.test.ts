import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';

suite('Restricted Mode · native host with workspace trust enabled', () => {
  test('keeps static language support without probes, commands, or workspace writes', async function () {
    this.timeout(30000);
    assert.equal(vscode.workspace.isTrusted, false, 'the fixture must actually be untrusted');
    const ext = vscode.extensions.getExtension('supernovae.nika-lang');
    assert.ok(ext);
    await ext.activate();
    assert.ok(ext.isActive, 'the trust-waiting extension activates');
    assert.ok((await vscode.languages.getLanguages()).includes('nika'), 'declarative language remains');
    const registered = await vscode.commands.getCommands(true);
    for (const command of ['nika.tryDemo', 'nika.runWorkflow', 'nika.finishSetup', 'nika.initProject',
      'nika.setupMcp', 'nika.restartServer', 'nika.testUpdate', 'nika.generateWorkflow']) {
      assert.ok(!registered.includes(command), `${command} must not have an executable handler`);
      await assert.rejects(async () => { await vscode.commands.executeCommand(command); }, /not found/);
    }
    // An explicit negative observation window also covers the historical
    // asynchronous activation -> discovery -> auto-demo path.
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const probe = process.env.NIKA_TRUST_PROBE;
    assert.ok(root && probe);
    assert.deepEqual(fs.readdirSync(root), [], 'no demo, trace, config, or other file was written');
    assert.equal(fs.existsSync(probe), false, 'even a version probe must wait for trust');
    assert.equal(vscode.workspace.isTrusted, false, 'the extension never grants itself trust');
  });
});
