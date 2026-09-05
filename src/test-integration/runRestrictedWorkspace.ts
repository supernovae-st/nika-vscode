// A real Restricted Mode host. runTests() is deliberately not used: that
// helper injects --disable-workspace-trust and cannot prove this boundary.
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';

async function main(): Promise<void> {
  const executable = await downloadAndUnzipVSCode();
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'nk-trust-'));
  try {
    const root = path.resolve(__dirname, '..');
    const user = path.join(fixture, 'user');
    const folder = path.join(fixture, 'workspace');
    const probe = path.join(fixture, 'engine-probed');
    const binary = path.join(fixture, 'nika-probe');
    fs.mkdirSync(path.join(user, 'User'), { recursive: true });
    fs.mkdirSync(folder);
    // A user-level explicit binary is reachable even when workspace settings
    // are restricted. Any version probe or execution leaves an observable.
    fs.writeFileSync(binary, `#!/bin/sh\nprintf 'unexpected engine invocation\\n' >> '${probe}'\nexit 73\n`, { mode: 0o700 });
    fs.writeFileSync(path.join(user, 'User', 'settings.json'), JSON.stringify({
      'nika.server.path': binary,
      'nika.server.autoDownload': false,
      'security.workspace.trust.enabled': true,
      'security.workspace.trust.startupPrompt': 'never',
      'workbench.startupEditor': 'none',
      'chat.disableAIFeatures': true,
    }));
    const env: NodeJS.ProcessEnv = {};
    for (const key of ['HOME', 'USER', 'LOGNAME', 'TMPDIR', 'PATH', 'LANG', 'DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR']) {
      if (process.env[key]) { env[key] = process.env[key]; }
    }
    env.NIKA_ITEST_SUITE = 'firstContactRestricted';
    env.NIKA_TRUST_PROBE = probe;
    // Match a CLI launch without sourcing the operator's interactive shell
    // (which can reintroduce credentials into this isolated environment).
    env.VSCODE_CLI = '1';
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, [
        folder, `--user-data-dir=${user}`, `--extensions-dir=${path.join(fixture, 'extensions')}`,
        `--shared-data-dir=${path.join(fixture, 'shared')}`,
        `--agents-user-data-dir=${path.join(fixture, 'agents')}`,
        `--extensionDevelopmentPath=${root}`,
        `--extensionTestsPath=${path.join(__dirname, 'suite', 'index')}`,
        '--disable-extensions', '--disable-gpu', '--skip-welcome', '--skip-release-notes',
      ], { env, stdio: ['ignore', 'inherit', 'inherit'] });
      let timedOut = false;
      const deadline = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 90000);
      child.once('error', (error) => { clearTimeout(deadline); reject(error); });
      child.once('close', (code, signal) => {
        clearTimeout(deadline);
        if (!timedOut && code === 0) { resolve(); }
        else { reject(new Error(`restricted host failed: exit=${code}, signal=${signal}, timeout=${timedOut}`)); }
      });
    });
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  console.error('restricted workspace test failed:', error);
  process.exitCode = 1;
});
