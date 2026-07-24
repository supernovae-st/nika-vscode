// firstContactA.test.ts — launch A of the first-contact e2e: the VIRGIN
// machine. The launcher (runFirstContact.ts) built this host from a
// fresh user-data-dir (globalState empty → the wire is armed), a
// workspace with no workflows, and a REAL released engine. From there,
// activation alone must produce the whole aha — this suite runs ZERO
// nika commands until every link is asserted; every wait polls an
// OBSERVABLE (a file · a tab · the engine's own journal), never a
// blind sleep.
//
// The chain, in order (core/firstContact.ts pins the decision table;
// this proves the WIRING end to end):
//   activation → auto-demo (hello-canvas lands · 0 gestures)
//              → the canvas opens (a webview tab)
//              → the mock run unfolds wave by wave (the journal's
//                event ORDER is the chronology)
//              → first green (workflow_completed · every task green)
//
// The confetti itself is a run:celebrate postMessage into the webview —
// no host API can observe another webview's messages, so the celebration
// is asserted at the closest honest level: the green happened on a
// virgin profile (both guards of maybeCelebrateFirstGreen hold). The
// never-twice side is unit-pinned (src/test/firstContact.test.ts): the
// harness's storage is memory-backed, so persisted state is not
// observable here (see runFirstContact.ts for the 2026-07-24 finding).

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const EXT_ID = 'supernovae.nika-lang';
const DEMO_FILE = 'hello-canvas.nika.yaml';
/** The demo's five tasks — the four waves (brief → two angles → weave)
 *  plus the receipt (demoWorkflow.ts is the SSOT of these ids). */
const DEMO_TASKS = ['brief', 'angle_practical', 'angle_skeptical', 'weave', 'receipt'];

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Poll an observable until it holds — the harness's wait pattern. */
async function until(
  what: string,
  check: () => boolean,
  timeoutMs: number,
  stepMs = 250,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) { return; }
    await sleep(stepMs);
  }
  assert.fail(`timed out (${timeoutMs}ms) waiting for: ${what}`);
}

function workspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'the e2e host opens a workspace folder');
  return folder!.uri.fsPath;
}

function newestTrace(root: string): string | undefined {
  const dir = path.join(root, '.nika', 'traces');
  if (!fs.existsSync(dir)) { return undefined; }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ndjson')).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : undefined;
}

/** The journal, reduced to what the assertions need: kind + task id,
 *  in write order. (tsconfig.integration rootDir excludes src/core —
 *  the shape is pinned by e2ePipeline fixtures, scanned inline here.) */
function traceEvents(file: string): Array<{ kind: string; task?: string }> {
  return fs.readFileSync(file, 'utf-8').split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try {
        const ev = JSON.parse(l) as {
          kind?: string;
          fields?: Array<{ key: string; value: unknown }>;
        };
        const task = ev.fields?.find((f) => f.key === 'task' || f.key === 'task_id')?.value;
        return { kind: ev.kind ?? '', task: typeof task === 'string' ? task : undefined };
      } catch {
        return { kind: '' };
      }
    });
}

function hasWebviewTab(): boolean {
  return vscode.window.tabGroups.all.some((g) =>
    g.tabs.some((t) => t.input instanceof vscode.TabInputWebview),
  );
}

suite('first contact · launch A (virgin machine · zero gestures to green)', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, `extension ${EXT_ID} must be present`);
    // onStartupFinished activates the extension by itself; awaiting the
    // (idempotent) activate() is the deterministic anchor, not a gesture.
    await ext!.activate();
    assert.ok(ext!.isActive, 'the extension activates');
  });

  suiteTeardown(async function () {
    this.timeout(45000);
    // The last test's anchor is the ENGINE's journal (workflow_completed)
    // — but the extension's run-close handler (child exit + stream
    // drain) runs a beat LATER. Killing the host between the two once
    // masked the close path entirely (2026-07-24). Bridge with an
    // OBSERVABLE per this suite's own law, never a blind sleep:
    // persistTrace() writes the extension's own trace copy
    // (`hello-canvas-<stamp>.ndjson` — slug-first, disjoint from the
    // engine's stamp-first journal names) at the END of the close
    // handler, so that file on disk proves the verdict/celebrate path
    // ran to completion inside this window.
    const dir = path.join(workspaceRoot(), '.nika', 'traces');
    await until(
      'the extension trace copy (the run-close handler ran)',
      () => fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.startsWith('hello-canvas-')),
      30000,
    );
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(500);
  });

  test('the demo lands by itself — no command, no click, no key', async function () {
    this.timeout(30000);
    const root = workspaceRoot();
    const demo = path.join(root, DEMO_FILE);
    // This suite issued NO nika.* command: the file appearing IS the
    // wire (activation → probe → firstContactMove = auto-demo → tryDemo).
    await until(`${DEMO_FILE} written by the extension itself`, () => fs.existsSync(demo), 25000);
    const body = fs.readFileSync(demo, 'utf-8');
    assert.ok(body.includes('id: hello-canvas'), 'the landed file is THE demo workflow');
    assert.ok(body.includes('model: mock/echo'), 'the demo pins mock/echo — zero keys, zero network');
  });

  test('the canvas opens beside it — the DAG lights itself', async function () {
    this.timeout(20000);
    await until('a webview tab (the DAG canvas)', hasWebviewTab, 15000);
    // The demo YAML is visible too (tryDemo opens it non-preview).
    const demoVisible = (): boolean => vscode.window.visibleTextEditors
      .some((e) => e.document.uri.fsPath.endsWith(DEMO_FILE));
    await until('the demo YAML visible in an editor', demoVisible, 5000);
  });

  test('the mock run unfolds in waves and reaches first green', async function () {
    this.timeout(90000);
    const root = workspaceRoot();
    // The engine journals under the spawn cwd (the spawn-cwd law) — the
    // workflow's own directory, i.e. the workspace root.
    await until('the run journal (.nika/traces/*.ndjson)', () => newestTrace(root) !== undefined, 30000);
    const trace = newestTrace(root)!;
    await until(
      'the terminal workflow event in the journal',
      () => traceEvents(trace).some((e) => e.kind.startsWith('workflow_') && e.kind !== 'workflow_started'),
      45000,
    );

    const events = traceEvents(trace);
    // First green: completed — and honestly so (no failure anywhere).
    assert.ok(events.some((e) => e.kind === 'workflow_completed'), 'the run completes GREEN');
    assert.ok(!events.some((e) => e.kind === 'workflow_failed'), 'no failed verdict');
    assert.ok(!events.some((e) => e.kind === 'task_failed'), 'no task failed');
    for (const t of DEMO_TASKS) {
      assert.ok(
        events.some((e) => e.kind === 'task_completed' && e.task === t),
        `task ${t} reached green`,
      );
    }

    // The waves, from the journal's own chronology (line order): the
    // brief settles before either angle starts; both angles before the
    // weave; the weave before the receipt.
    const at = (kind: string, task: string): number =>
      events.findIndex((e) => e.kind === kind && e.task === task);
    assert.ok(at('task_completed', 'brief') < at('task_started', 'angle_practical'), 'wave 1 → 2 (practical)');
    assert.ok(at('task_completed', 'brief') < at('task_started', 'angle_skeptical'), 'wave 1 → 2 (skeptical)');
    assert.ok(at('task_completed', 'angle_practical') < at('task_started', 'weave'), 'wave 2 → 3');
    assert.ok(at('task_completed', 'angle_skeptical') < at('task_started', 'weave'), 'wave 2 → 3');
    assert.ok(at('task_completed', 'weave') < at('task_started', 'receipt'), 'wave 3 → 4');
  });
});
