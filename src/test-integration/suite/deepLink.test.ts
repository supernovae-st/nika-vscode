// deepLink.test.ts — the front door is mounted, black-box.
//
// The unit belt (src/test/deepLink.test.ts) proves the GATE: allowlist,
// traversal pins, the consent law as data. This suite proves the DOOR
// exists in the real host: VS Code allows exactly ONE uri handler per
// extension, so a second registration under the extension's identity
// throwing is positive proof the extension registered its handler at
// activation. If the registration ever drops out of activate(), the
// second register SUCCEEDS and the assertion fails.

import * as assert from 'assert';
import * as vscode from 'vscode';

const EXT_ID = 'supernovae.nika-lang';

suite('nika-lang · vscode:// deep-link door', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, `extension ${EXT_ID} must be present in the dev host`);
    await ext!.activate();
  });

  test('the uri handler is registered (a second registration throws)', () => {
    assert.throws(() => {
      const second = vscode.window.registerUriHandler({ handleUri: () => undefined });
      // Unreachable when the door is mounted — but if the host ever
      // allowed the registration, drop it immediately so this probe
      // never becomes the extension's live handler.
      second.dispose();
    });
  });

  test('onUri is a declared activation event (the door opens a cold window)', () => {
    const ext = vscode.extensions.getExtension(EXT_ID);
    const events = (ext!.packageJSON as { activationEvents?: string[] }).activationEvents ?? [];
    assert.ok(events.includes('onUri'), 'activationEvents must carry onUri');
  });
});
