// runFirstContact.ts — the first-contact e2e: launch A, the whole
// zero-gesture chain on a REAL VS Code + a REAL released engine.
//
//   launch A · fresh user-data-dir (globalState empty = the virgin
//              machine) + a workspace with no workflows + a REAL engine
//              → activation ALONE must land the demo, open the canvas,
//              run it on mock/echo and reach first green — zero gestures
//              (suite/firstContactA.test.ts asserts each link).
//
// WHY there is no launch B and no persisted-key scan (2026-07-24): the
// test harness's storage is MEMORY-BACKED — the profile's
// globalStorage/state.vscdb is never created, on 1.129.1 and 1.130.0
// alike, through 2-minute windows, with disk headroom, from tmp and
// home-based user-data-dirs. Cross-launch globalState therefore cannot
// be observed (nor inherited: a probe run showed launch B's auto-demo
// re-firing on the shared profile — the burned keys never traveled).
// The one historical green of the two-launch design (#241) never
// reproduced across 7 varied attempts; an unstable observation is not
// a gate. The never-twice side is pinned where it is provable: the
// firstContact decision table and the maybeCelebrateFirstGreen guard
// are unit-tested (src/test/firstContact.test.ts) — this launcher
// proves the WIRING of the first contact, the units prove the memory.
//
// The launcher requires NIKA_BIN + NIKA_ENGINE_VERSION from
// scripts/run-integration.mjs. That parent downloads ENGINE_PIN's public
// release archive, verifies SHA256SUMS and proves the version receipt.
// This child refuses missing or mismatched evidence: no PATH fallback.
//
//   npm run test:e2e:first-contact      (also chained into test:integration)

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

function requirePinnedEngine(): string {
  const engine = process.env.NIKA_BIN;
  const expected = process.env.NIKA_ENGINE_VERSION;
  if (!engine || !path.isAbsolute(engine) || !expected) {
    throw new Error('first-contact e2e requires the verified ENGINE_PIN receipt');
  }
  const output = execFileSync(engine, ['--version'], { timeout: 5000, encoding: 'utf-8' });
  const reported = /^nika\s+(\d+\.\d+\.\d+)(?:\s|$)/m.exec(output)?.[1];
  if (reported !== expected) {
    throw new Error(`first-contact e2e engine mismatch: expected ${expected}, got ${String(reported)}`);
  }
  return engine;
}

/** A test workspace pinned to the real engine (no download in the gate). */
function makeWorkspace(fixture: string, engine: string): string {
  const ws = path.join(fixture, 'workspace');
  fs.mkdirSync(path.join(ws, '.vscode'), { recursive: true });
  fs.writeFileSync(
    path.join(ws, '.vscode', 'settings.json'),
    JSON.stringify({ 'nika.server.path': engine, 'nika.server.autoDownload': false }, null, 2),
  );
  return ws;
}

async function main(): Promise<void> {
  const engine = requirePinnedEngine();
  console.log(`first-contact e2e: verified engine ${engine} (${process.env.NIKA_ENGINE_VERSION})`);

  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  // Short tmp path (the 103-char Unix-socket cap · runTests.ts learned it).
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'nk-fc-'));
  const userDataDir = path.join(fixture, 'user');

  try {
    const wsA = makeWorkspace(fixture, engine);
    // ── Launch A · the virgin first contact ──────────────────────────
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [wsA, `--user-data-dir=${userDataDir}`, '--disable-extensions', '--disable-gpu'],
      extensionTestsEnv: { NIKA_ITEST_SUITE: 'firstContactA' },
    });

    console.log('first-contact e2e: launch A green (zero gestures to first green)');
  } catch (err) {
    console.error('first-contact e2e failed:', err);
    if (process.env.NIKA_FC_DEBUG === '1') {
      console.error(`debug: fixture kept at ${fixture}`);
    }
    process.exitCode = 1;
  } finally {
    if (process.env.NIKA_FC_DEBUG !== '1') {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  }
}

void main().catch((err: unknown) => {
  console.error('first-contact fixture failed:', err);
  process.exitCode = 1;
});
