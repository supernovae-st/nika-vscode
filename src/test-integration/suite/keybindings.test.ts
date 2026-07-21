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

/** True when a default-keymap `when` fires in a PLAIN text editor —
 *  the collision class the family's static table was authored at.
 *  No when = global; otherwise the clause must demand an editor/text
 *  focus token and nothing else positive (negations like
 *  `!editorReadonly` keep comment/trim chords in the class; an armed
 *  extra context like `selectionAnchorSet` or another surface like
 *  `inKeybindings` takes the row out of a nika editor's reality). */
function firesInPlainTextEditor(when: string | undefined): boolean {
  if (when === undefined) { return true; }
  if (!/\b(editorFocus|editorTextFocus|textInputFocus)\b/.test(when)) { return false; }
  const leftover = when
    .replace(/!\s*[A-Za-z_.:-]+/g, ' ')
    .replace(/\b(editorFocus|editorTextFocus|textInputFocus)\b/g, ' ')
    .replace(/&&|\|\||[()]/g, ' ')
    .trim();
  return leftover === '';
}

/** Second stroke → owning command for every K-prefix chord the LIVE
 *  default keymap can fire in a plain text editor. The dump lists
 *  extension-contributed defaults too — OUR rows are excluded: the
 *  question is what the EDITOR owns where nika files live. */
async function liveKChordOwners(): Promise<Map<string, string>> {
  await vscode.commands.executeCommand('workbench.action.openDefaultKeybindingsFile');
  let text = '';
  for (let i = 0; i < 20 && text === ''; i++) {
    const doc = vscode.window.activeTextEditor?.document
      ?? vscode.workspace.textDocuments.find((d) => d.uri.path.endsWith('keybindings.json'));
    if (doc && doc.getText().includes('"key"')) { text = doc.getText(); }
    else { await sleep(250); }
  }
  assert.ok(text !== '', 'the default keybindings dump must open and carry rows');
  const rows = JSON.parse(text.replace(/^\s*\/\/.*$/gm, '')) as
    Array<{ key: string; command?: string; when?: string }>;
  const owners = new Map<string, string>();
  for (const row of rows) {
    if (row.command?.startsWith('nika.')) { continue; }
    if (!firesInPlainTextEditor(row.when)) { continue; }
    const m = row.key.match(/^(?:ctrl|cmd)\+k (?:ctrl|cmd)\+(.+)$/);
    if (m && !owners.has(m[1])) { owners.set(m[1], row.command ?? '?'); }
  }
  return owners;
}

suite('nika-lang · the chord family vs the live default keymap', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, `extension ${EXT_ID} must be present in the dev host`);
    await ext!.activate();
  });

  /** The ONE accepted shadow, found by this arbiter's first run and
   *  kept deliberately: `⌘K ⌘B` fork-from-task outranks the niche
   *  anchor-selection entry point INSIDE nika files (the palette keeps
   *  serving Set Selection Anchor there; everywhere else the default
   *  still owns the chord). Pinned so this list grows by decision,
   *  never by accident. */
  const ACCEPTED_SHADOWS = new Map([['b', 'editor.action.setSelectionAnchor']]);

  test('no family second stroke shadows a live default chord', async function () {
    this.timeout(20000);
    const owners = await liveKChordOwners();
    assert.ok(owners.size > 0, 'the dump must yield at least one K-chord row');
    const ext = vscode.extensions.getExtension(EXT_ID);
    const pkg = ext!.packageJSON as {
      contributes: { keybindings: Array<{ command: string; key: string }> };
    };
    for (const b of pkg.contributes.keybindings) {
      const stroke = b.key.match(/^ctrl\+k ctrl\+(.+)$/)?.[1];
      assert.ok(stroke, `${b.key} (${b.command}) must ride the K chord prefix`);
      if (ACCEPTED_SHADOWS.get(stroke!) === owners.get(stroke!)) { continue; }
      assert.ok(
        !owners.has(stroke!),
        `${b.key} (${b.command}) shadows the live default ${owners.get(stroke!)}`,
      );
    }
  });

  test('d stays default-occupied (moveSelectionToNextFindMatch) — the demo rides h', async function () {
    this.timeout(20000);
    const owners = await liveKChordOwners();
    assert.ok(
      owners.has('d'),
      'upstream freed ctrl+k ctrl+d — the demo chord may graduate from h to d',
    );
  });
});
