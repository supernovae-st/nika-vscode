// Run the real VS Code integration suites against the exact public engine
// artifact named by ENGINE_PIN. NIKA_BIN from the caller is intentionally
// ignored: PATH and developer overrides are not release evidence.

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPinnedEngine } from './pinned-engine.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const firstContactOnly = process.argv.includes('--first-contact-only');

function run(script, env) {
  const result = spawnSync(process.execPath, [resolve(root, script)], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const engine = await installPinnedEngine({ rootDir: root });
const env = {
  ...process.env,
  NIKA_BIN: engine.binaryPath,
  NIKA_ENGINE_VERSION: engine.version,
};

console.log(
  `integration engine: ${engine.tag} · ${engine.assetName} · sha256 ${engine.sha256}`,
);

try {
  if (!firstContactOnly) run('out-integration/runTests.js', env);
  run('out-integration/runFirstContact.js', env);
} finally {
  engine.cleanup();
}
