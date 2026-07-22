// runFirstContact.ts — the first-contact e2e, whole (§14 · the owed).
//
// One concatenated proof across TWO launches of a REAL VS Code sharing
// ONE virgin profile:
//
//   launch A · fresh user-data-dir (globalState empty = the virgin
//              machine) + a workspace with no workflows + a REAL engine
//              → activation ALONE must land the demo, open the canvas,
//              run it on mock/echo and reach first green — zero gestures
//              (suite/firstContactA.test.ts asserts each link).
//   between  · the burned one-shot keys must have PERSISTED to the
//              profile (globalStorage state.vscdb) — the confetti's
//              never-again guard is a disk fact, not a session latch.
//   launch B · the SAME profile, a fresh territory → the wire must stay
//              cold (no auto-demo · no auto-run), and a MANUAL second
//              green must celebrate nothing (firstContactB.test.ts).
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
  // ONE profile for BOTH launches — the point of the whole exercise:
  // the one-shot keys live in this profile's globalState. Short tmp
  // path (the 103-char Unix-socket cap · runTests.ts learned it).
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nk-fc-ud-'));
  const wsA = makeWorkspace('a', engine);
  const wsB = makeWorkspace('b', engine);

  try {
    // ── Launch A · the virgin first contact ──────────────────────────
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [wsA, `--user-data-dir=${userDataDir}`, '--disable-extensions', '--disable-gpu'],
      extensionTestsEnv: { NIKA_ITEST_SUITE: 'firstContactA' },
    });

    // ── Between launches · the keys reached the DISK ─────────────────
    // The never-again guards (first activation · first green) persist in
    // the profile's globalStorage SQLite. A byte-scan for the literal
    // key strings is enough to prove the PERSISTED one-shot — parsing
    // SQLite would prove no more. (-wal rides along: the store may not
    // have checkpointed.) POLLED: runTests() resolves when the suite
    // reports, but Electron flushes storage on its own shutdown a beat
    // later — read until the flush lands.
    const stateDb = path.join(userDataDir, 'User', 'globalStorage', 'state.vscdb');
    const keys = ['nika.firstActivation.v1', 'nika.firstGreenRun.v1'];
    const persisted = (): boolean => {
      const bytes = [stateDb, `${stateDb}-wal`]
        .filter((f) => fs.existsSync(f))
        .map((f) => fs.readFileSync(f).toString('latin1'))
        .join('');
      return keys.every((k) => bytes.includes(k));
    };
    const deadline = Date.now() + 20000;
    while (!persisted() && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!persisted()) {
      throw new Error(`first-contact e2e: ${keys.join(' + ')} did not persist to the profile after launch A`);
    }
    console.log('first-contact e2e: one-shot keys persisted (firstActivation · firstGreenRun)');

    // ── Launch B · same machine memory, fresh territory ──────────────
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [wsB, `--user-data-dir=${userDataDir}`, '--disable-extensions', '--disable-gpu'],
      extensionTestsEnv: { NIKA_ITEST_SUITE: 'firstContactB' },
    });

    console.log('first-contact e2e: whole chain green (launch A · persistence · launch B)');
  } catch (err) {
    console.error('first-contact e2e failed:', err);
    if (process.env.NIKA_FC_DEBUG === '1') {
      console.error(`debug: profile kept at ${userDataDir} · workspaces ${wsA} ${wsB}`);
      process.exit(1);
    }
    process.exit(1);
  } finally {
    if (process.env.NIKA_FC_DEBUG !== '1') {
      for (const dir of [userDataDir, wsA, wsB]) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    }
  }
}

void main();
