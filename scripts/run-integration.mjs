// Run the real VS Code integration suites against the exact public engine
// artifact named by ENGINE_PIN. NIKA_BIN from the caller is intentionally
// ignored: PATH and developer overrides are not release evidence.

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installPinnedEngine } from './pinned-engine.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Each suite owns its process group on the supported POSIX release targets.
// Killing only the Node launcher on timeout would leave the editor behind.
export function runSuite(script, env, {
  timeoutMs = 10 * 60_000,
  spawn = spawnSync,
  kill = (pid) => process.kill(pid, 'SIGKILL'),
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('integration timeout must be a positive finite integer');
  }
  const result = spawn(process.execPath, [resolve(root, script)], {
    cwd: root,
    env,
    stdio: 'inherit',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    detached: true,
  });
  // spawnSync has reaped the launcher; terminate its remaining process group too,
  // including helpers left behind by a failing host. ESRCH means it is gone.
  if (result.pid > 0) {
    try { kill(-result.pid); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`integration suite ${script} failed: exit ${result.status}, signal ${result.signal}`);
  }
}

export async function runIntegration({
  firstContactOnly = false,
  installEngine = installPinnedEngine,
  run = runSuite,
  environment = process.env,
  log = console.log,
} = {}) {
  const engine = await installEngine({ rootDir: root });
  try {
    const env = {
      ...environment,
      NIKA_BIN: engine.binaryPath,
      NIKA_ENGINE_VERSION: engine.version,
    };
    log(`integration engine: ${engine.tag} · ${engine.assetName} · sha256 ${engine.sha256}`);
    if (!firstContactOnly) run('out-integration/runTests.js', env);
    run('out-integration/runFirstContact.js', env);
  } finally {
    engine.cleanup();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await runIntegration({ firstContactOnly: process.argv.includes('--first-contact-only') });
  } catch (error) {
    console.error('integration tests failed:', error);
    process.exitCode = 1;
  }
}
