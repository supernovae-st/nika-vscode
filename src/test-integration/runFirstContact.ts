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
// Self-skips (exit 0) without a released engine binary — the runWire
// law. Prefers Cellar over bare PATH: a sister session routinely swaps
// /opt/homebrew/bin/nika for an in-flight build (journeyReal's law).
//
//   npm run test:e2e:first-contact      (also chained into test:integration)

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

function probe(bin: string): boolean {
  try {
    const help = execFileSync(bin, ['run', '--help'], { timeout: 5000, encoding: 'utf-8' });
    return help.includes('--resume') && help.includes('--from');
  } catch {
    return false;
  }
}

/** A RELEASED engine, absolute (the workspace setting wants a path):
 *  env pin → newest Cellar → the brew/usr symlinks. */
function resolveEngine(): string | undefined {
  const cellar = (() => {
    try {
      const base = '/opt/homebrew/Cellar/nika';
      const versions = fs.readdirSync(base).sort();
      return versions.length
        ? path.join(base, versions[versions.length - 1], 'bin', 'nika')
        : undefined;
    } catch {
      return undefined;
    }
  })();
  return [process.env.NIKA_BIN, cellar, '/opt/homebrew/bin/nika', '/usr/local/bin/nika']
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .find(probe);
}

/** A test workspace pinned to the real engine (no download in the gate). */
function makeWorkspace(tag: string, engine: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `nk-fc-${tag}-`));
  fs.mkdirSync(path.join(ws, '.vscode'), { recursive: true });
  fs.writeFileSync(
    path.join(ws, '.vscode', 'settings.json'),
    JSON.stringify({ 'nika.server.path': engine, 'nika.server.autoDownload': false }, null, 2),
  );
  return ws;
}

async function main(): Promise<void> {
  const engine = resolveEngine();
  if (!engine) {
    console.log('first-contact e2e: no released engine (NIKA_BIN · Cellar · brew) — skipped');
    return;
  }
  console.log(`first-contact e2e: engine ${engine}`);

  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  // Short tmp path (the 103-char Unix-socket cap · runTests.ts learned it).
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nk-fc-ud-'));
  const wsA = makeWorkspace('a', engine);

  try {
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
      console.error(`debug: profile kept at ${userDataDir} · workspace ${wsA}`);
    }
    process.exit(1);
  } finally {
    if (process.env.NIKA_FC_DEBUG !== '1') {
      for (const dir of [userDataDir, wsA]) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    }
  }
}

void main();
