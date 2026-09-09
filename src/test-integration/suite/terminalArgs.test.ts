// Exercise the production adapter against a native VS Code task terminal.
// This proves transport, not Nika engine admission or workflow semantics.
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildSync } from 'esbuild';
import * as vscode from 'vscode';

suite('literal native terminal argv', () => {
  test('preserves literal interactive argv in a folder; refuses an empty window without spawning', async function () {
    this.timeout(30000);
    const node = process.env.NIKA_TEST_NODE;
    assert.ok(node && path.isAbsolute(node), 'launcher must supply its exact Node executable');
    if (process.env.NIKA_TERMINAL_EMPTY === '1') { assert.equal(vscode.workspace.workspaceFolders, undefined); }
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'nk-argv-'));
    const before = new Set(vscode.window.terminals);
    const terminals = new Set<vscode.Terminal>();
    const opened = vscode.window.onDidOpenTerminal((terminal) => { terminals.add(terminal); });
    let exited = false;
    let exitCode: number | undefined;
    const ended = vscode.tasks.onDidEndTaskProcess((event) => {
      if (event.execution.task.name.startsWith('Nika: ')) {
        exited = true;
        exitCode = event.exitCode;
        console.log(`argv probe process exit: ${String(exitCode)}`);
      }
    });
    try {
      const bundle = path.join(fixture, 'adapter.cjs');
      buildSync({ entryPoints: [path.resolve(__dirname, '../../src/nikaTerminal.ts')], outfile: bundle, platform: 'node', format: 'cjs', bundle: true, external: ['vscode'] });
      const { runNikaCommand } = require(bundle) as { runNikaCommand(binary: string, args: readonly string[], file: string): Promise<boolean> };
      const cwd = path.join(fixture, 'folder with spaces');
      fs.mkdirSync(cwd);
      const file = path.join(cwd, 'one $value.nika.yaml');
      const receipt = path.join(fixture, 'argv.json');
      const values = ['a b', '"quoted"', "'single'", '$(not-a-command)', '`not-a-command`', 'a;b|c&d', 'line\nnext', '🦋', ''];
      const script = path.join(fixture, 'argv-probe.cjs');
      fs.writeFileSync(script, 'require("node:fs").writeFileSync(process.argv[2],JSON.stringify({args:process.argv.slice(3),cwd:process.cwd(),tty:!!process.stdin.isTTY}));');
      const submitted = await runNikaCommand(node, [script, receipt, ...values], file);
      if (process.env.NIKA_TERMINAL_EMPTY === '1') {
        assert.equal(submitted, false);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        assert.equal(terminals.size, 0, 'refusal must not create a terminal');
        assert.equal(exited, false, 'refusal must not submit a task');
        assert.equal(fs.existsSync(receipt), false, 'refusal must not invoke the process');
        return;
      }
      assert.equal(submitted, true);
      const deadline = Date.now() + 20000;
      while ((!fs.existsSync(receipt) || !exited) && Date.now() < deadline) { await new Promise((resolve) => setTimeout(resolve, 50)); }
      assert.ok(exited, 'native task process must exit');
      assert.equal(exitCode, 0, 'native task process must succeed');
      const got = JSON.parse(fs.readFileSync(receipt, 'utf8')) as { args: string[]; cwd: string; tty: boolean };
      assert.deepEqual(got.args, [...values, file]);
      assert.equal(fs.realpathSync(got.cwd), fs.realpathSync(cwd));
      assert.equal(got.tty, true, 'guided commands require native terminal input');
      assert.ok([...terminals].some((terminal) => vscode.window.terminals.includes(terminal)), 'completed output must remain in a terminal');
    } finally {
      opened.dispose();
      ended.dispose();
      for (const terminal of terminals) { if (!before.has(terminal)) { terminal.dispose(); } }
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });
});
