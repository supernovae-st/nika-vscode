// history.test.ts — the Run History tree in the REAL host (V-SOTA.B B2).
//
// The pure model (buildHistoryRows) proves sections, order and the
// #k↔run mapping in vitest; this suite proves what only a real VS Code
// can: the when-gated view REGISTERS, `nika.runHistory` loads it and
// raises `nika.historyActive`, the $(markdown) export reproduces the
// grid document, close lowers the context, and the two item wrappers
// are typeof-guarded (garbage in → silent no-op, never a throw).
//
// The views.when verdict itself (contributed `when` honored by the
// runtime) is receipted against workbench.desktop.main.js 1.106.3 in
// features/historyView.ts — this suite records the live focus behavior
// around it without hard-asserting workbench internals.

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const EXT_ID = 'supernovae.nika-lang';

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** One Diamond-shape journal line (the engine's own wire). */
function line(kind: string, tsMs: number, fields: Array<{ key: string; value: unknown }>): string {
  return JSON.stringify({
    id: '00000000-0000-0000-0000-000000000000',
    timestamp: { unix_ms: tsMs },
    kind,
    run: 'run-int',
    fields,
  });
}

function trace(tasks: Array<{ id: string; status: 'success' | 'failed'; durationMs?: number; output?: string }>): string {
  const out: string[] = [line('workflow_started', 0, [{ key: 'workflow', value: 'history-int' }])];
  let ts = 10;
  for (const t of tasks) {
    out.push(line('task_started', ts, [{ key: 'task', value: t.id }]));
    const fields: Array<{ key: string; value: unknown }> = [{ key: 'task', value: t.id }];
    if (t.durationMs !== undefined) { fields.push({ key: 'duration_ms', value: t.durationMs }); }
    if (t.output !== undefined) { fields.push({ key: 'output', value: t.output }); }
    out.push(line(t.status === 'success' ? 'task_completed' : 'task_failed', ts + (t.durationMs ?? 5), fields));
    ts += 100;
  }
  out.push(line('workflow_completed', ts, []));
  return out.join('\n');
}

const WORKFLOW = [
  'nika: v1',
  'workflow:',
  '  id: history-int',
  'model: mock/echo',
  '',
  'tasks:',
  '  flk:',
  '    infer:',
  '      prompt: flaky one',
  '  slw:',
  '    infer:',
  '      prompt: slowing one',
  '  std:',
  '    infer:',
  '      prompt: steady one',
  '',
].join('\n');

suite('nika-lang · run history (V-SOTA.B B2 · the native tree)', () => {
  let docUri: vscode.Uri;

  suiteSetup(async function () {
    this.timeout(30000);
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, `extension ${EXT_ID} must be present`);
    await ext!.activate();

    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'the integration host opens a workspace folder');
    const root = folder!.uri.fsPath;

    // Seed the journal dir: four runs of history-int shaped to light all
    // three sections — flk mixed (flaky) · slw 100/100/100/300 (slowing,
    // ≥3 measured + past the noise floor) · std steady.
    const traces = path.join(root, '.nika', 'traces');
    fs.mkdirSync(traces, { recursive: true });
    const runsSeed: Array<Array<{ id: string; status: 'success' | 'failed'; durationMs?: number; output?: string }>> = [
      [{ id: 'flk', status: 'success' }, { id: 'slw', status: 'success', durationMs: 100 }, { id: 'std', status: 'success' }],
      [{ id: 'flk', status: 'failed' }, { id: 'slw', status: 'success', durationMs: 100 }, { id: 'std', status: 'success' }],
      [{ id: 'flk', status: 'success' }, { id: 'slw', status: 'success', durationMs: 100 }, { id: 'std', status: 'success' }],
      [
        { id: 'flk', status: 'success' },
        { id: 'slw', status: 'success', durationMs: 300 },
        // The newest run records an artifact — the report's file: link
        // (B2.c) resolves it against the run cwd, so the file exists.
        { id: 'std', status: 'success', output: JSON.stringify({ path: 'out/receipt.txt' }) },
      ],
    ];
    const base = Date.now() - 60_000;
    runsSeed.forEach((tasks, i) => {
      const p = path.join(traces, `run-${i + 1}.ndjson`);
      fs.writeFileSync(p, trace(tasks));
      const mtime = new Date(base + i * 10_000);
      fs.utimesSync(p, mtime, mtime);
    });
    fs.mkdirSync(path.join(root, 'out'), { recursive: true });
    fs.writeFileSync(path.join(root, 'out', 'receipt.txt'), 'the recorded receipt\n');

    const wf = path.join(root, 'history-int.nika.yaml');
    fs.writeFileSync(wf, WORKFLOW);
    docUri = vscode.Uri.file(wf);
  });

  suiteTeardown(async function () {
    this.timeout(10000);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(1000);
  });

  test('runHistory loads the when-gated tree; export reproduces the grid; close lowers it', async function () {
    this.timeout(30000);

    // Live probe (recorded, not hard-asserted — workbench internals):
    // focusing the when-hidden view before any load.
    let beforeFocus = 'resolved';
    try { await vscode.commands.executeCommand('nikaRunHistory.focus'); } catch { beforeFocus = 'rejected'; }
    console.log(`[history-int] focus before load: ${beforeFocus}`);

    // The one gesture — the tree loads, the context rises, the view focuses.
    await vscode.commands.executeCommand('nika.runHistory', docUri);
    await sleep(800);
    await vscode.commands.executeCommand('nikaRunHistory.focus');

    // Still window (scripts/media idiom): NIKA_HISTORY_STILL=<ms> also
    // opens the newest run's report (its artifact resolves → file: link)
    // and holds both surfaces up for an outer screencapture.
    const still = Number(process.env.NIKA_HISTORY_STILL ?? 0);
    if (still > 0) {
      const folder = vscode.workspace.workspaceFolders![0].uri.fsPath;
      const newest = vscode.Uri.file(path.join(folder, '.nika', 'traces', 'run-4.ndjson'));
      await vscode.commands.executeCommand('nika.runReport', newest);
      this.timeout(30000 + still);
      await sleep(still);
    }

    // The export is the OLD document, verbatim — grid + callouts.
    await vscode.commands.executeCommand('nika.history.exportDoc');
    await sleep(800);
    const exported = vscode.workspace.textDocuments.find((d) =>
      d.getText().startsWith('# Run history — history-int'),
    );
    assert.ok(exported, 'exportDoc must open the markdown grid document');
    const text = exported!.getText();
    assert.ok(text.includes('| task | runs |'), 'the export carries the grid');
    assert.ok(text.includes('## Flaky tasks'), 'the export carries the flaky callout (flk is flaky)');
    assert.ok(text.includes('## Slowing down'), 'the export carries the slowdown callout (slw is slowing)');

    // The detail door (§7e): the one primary every run item shares —
    // a real host materializes the nika-run: page with its sections.
    const folder = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const newestTrace = vscode.Uri.file(path.join(folder, '.nika', 'traces', 'run-4.ndjson'));
    await vscode.commands.executeCommand('nika.runDetail', newestTrace);
    await sleep(800);
    const detail = vscode.workspace.textDocuments.find((d) => d.uri.scheme === 'nika-run');
    assert.ok(detail, 'nika.runDetail must materialize a nika-run: document');
    const detailText = detail!.getText();
    assert.ok(detailText.includes('# Run detail — history-int'), 'the page titles on the recorded workflow name');
    assert.ok(detailText.includes('## Tasks'), 'the page carries the per-task breakdown');
    assert.ok(detailText.includes('| `slw` |'), 'every folded task appears as a row');
    assert.ok(!detailText.includes('](command:'), 'not one command: link (dead in the preview — annexe R)');

    // The wrappers hold the law: garbage in → silent no-op, never a throw.
    await vscode.commands.executeCommand('nika.history.report');
    await vscode.commands.executeCommand('nika.history.report', { traceFsPath: 42 });
    await vscode.commands.executeCommand('nika.runDetail');
    await vscode.commands.executeCommand('nika.runDetail', { traceFsPath: 42 });
    await vscode.commands.executeCommand('nika.runs.showTaskInDag');
    await vscode.commands.executeCommand('nika.runs.showTaskInDag', { taskId: 'flk' });

    // Close lowers the context; the live probe after mirrors the before.
    await vscode.commands.executeCommand('nika.history.close');
    await sleep(400);
    let afterFocus = 'resolved';
    try { await vscode.commands.executeCommand('nikaRunHistory.focus'); } catch { afterFocus = 'rejected'; }
    console.log(`[history-int] focus after close: ${afterFocus}`);
    assert.strictEqual(
      afterFocus,
      beforeFocus,
      'close must return the view to its pre-load state (the context key drives it)',
    );
  });

  test('a STRING arg is the gate query — the view loads filtered, the export stays whole', async function () {
    this.timeout(30000);

    // Query mode targets the ACTIVE document (a string is never a path
    // — the typeof guard routes it to the filter seat).
    const doc = await vscode.workspace.openTextDocument(docUri);
    await vscode.window.showTextDocument(doc, { preview: false });
    await vscode.commands.executeCommand('nika.runHistory', 'flk');
    await sleep(800);
    // The when-gated view rose on a string arg: focus resolves.
    await vscode.commands.executeCommand('nikaRunHistory.focus');

    // The filter narrows the TREE, never the document: the export is
    // still the whole story, every task in the grid.
    await vscode.commands.executeCommand('nika.history.exportDoc');
    await sleep(800);
    const exported = vscode.workspace.textDocuments.find((d) =>
      d.getText().startsWith('# Run history — history-int'),
    );
    assert.ok(exported, 'exportDoc must open the grid in query mode too');
    for (const id of ['flk', 'slw', 'std']) {
      assert.ok(exported!.getText().includes(`\`${id}\``), `the export keeps ${id} (unfiltered)`);
    }

    await vscode.commands.executeCommand('nika.history.close');
    await sleep(300);
  });
});
