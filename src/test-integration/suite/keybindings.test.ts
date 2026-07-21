// keybindings.test.ts — the ⌘K family vs the LIVE default keymap.
//
// The unit belt (src/test/keybindings.test.ts) holds a STATIC table of
// default-occupied `ctrl+k ctrl+<x>` chords; this suite is the runtime
// authority it promises: the real editor's default-keybindings dump.
// Two truths held here: no family stroke shadows a live default, and
// `d` IS occupied (moveSelectionToNextFindMatch) — the reason the demo
// chord rides H. The day upstream frees D, the second test fails and
// the demo chord may graduate to its initial.

import * as assert from 'assert';
import * as vscode from 'vscode';

const EXT_ID = 'supernovae.nika-lang';

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Second strokes the LIVE default keymap binds on the K chord prefix. */
async function liveKChordStrokes(): Promise<Set<string>> {
  await vscode.commands.executeCommand('workbench.action.openDefaultKeybindingsFile');
  let text = '';
  for (let i = 0; i < 20 && text === ''; i++) {
    const doc = vscode.window.activeTextEditor?.document
      ?? vscode.workspace.textDocuments.find((d) => d.uri.path.endsWith('keybindings.json'));
    if (doc && doc.getText().includes('"key"')) { text = doc.getText(); }
    else { await sleep(250); }
  }
  assert.ok(text !== '', 'the default keybindings dump must open and carry rows');
  const rows = JSON.parse(text.replace(/^\s*\/\/.*$/gm, '')) as Array<{ key: string }>;
  const strokes = new Set<string>();
  for (const row of rows) {
    const m = row.key.match(/^(?:ctrl|cmd)\+k (?:ctrl|cmd)\+(.+)$/);
    if (m) { strokes.add(m[1]); }
  }
  return strokes;
}

suite('nika-lang · the chord family vs the live default keymap', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, `extension ${EXT_ID} must be present in the dev host`);
    await ext!.activate();
  });

  test('no family second stroke shadows a live default chord', async function () {
    this.timeout(20000);
    const occupied = await liveKChordStrokes();
    assert.ok(occupied.size > 0, 'the dump must yield at least one K-chord row');
    const ext = vscode.extensions.getExtension(EXT_ID);
    const pkg = ext!.packageJSON as {
      contributes: { keybindings: Array<{ command: string; key: string }> };
    };
    for (const b of pkg.contributes.keybindings) {
      const stroke = b.key.match(/^ctrl\+k ctrl\+(.+)$/)?.[1];
      assert.ok(stroke, `${b.key} (${b.command}) must ride the K chord prefix`);
      assert.ok(
        !occupied.has(stroke!),
        `${b.key} (${b.command}) shadows a live default chord`,
      );
    }
  });

  test('d stays default-occupied (moveSelectionToNextFindMatch) — the demo rides h', async function () {
    this.timeout(20000);
    const occupied = await liveKChordStrokes();
    assert.ok(
      occupied.has('d'),
      'upstream freed ctrl+k ctrl+d — the demo chord may graduate from h to d',
    );
  });
});
