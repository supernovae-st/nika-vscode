// welcomeBoundary.test.ts — the welcome-surface boundaries, pinned
// (maker≠checker). Claims under test: a compromised webview riding the
// welcome surface gains NO arbitrary write via nika.tryDemo AND no
// arbitrary read via welcome:open. The proof is structural — the facts
// that together close each door, read off the extension source (the
// parity.mjs idiom). Behavior of the read gate is unit-tested separately
// in welcomeGuard.test.ts.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const src = fs.readFileSync(path.resolve(__dirname, '..', 'extension.ts'), 'utf-8');

describe('welcome-surface command boundary (nika.tryDemo)', () => {
  it('the welcome whitelist forwards ONLY a command name, never a webview arg', () => {
    // The one dispatch site gates on the closed Set, then calls
    // executeCommand with the name ALONE — no second argument means no
    // webview-supplied payload can reach any command.
    expect(src).toMatch(/if\s*\(WELCOME_COMMANDS\.has\(msg\.command\)\)\s*\{\s*await commands\.executeCommand\(msg\.command\);/);
    // The dangerous shape — forwarding a webview value as an arg — is absent.
    expect(src).not.toMatch(/executeCommand\(msg\.command\s*,/);
  });

  it('nika.tryDemo is whitelisted AND its handler takes no argument', () => {
    expect(src).toMatch(/WELCOME_COMMANDS = new Set\(\[[\s\S]*?'nika\.tryDemo'[\s\S]*?\]\);/);
    // A bare `async ()` — no uri/arg param a webview could populate.
    expect(src).toMatch(/registerCommand\('nika\.tryDemo',\s*async \(\)\s*=>/);
  });

  it('the demo write path is host-derived, never from a command argument', () => {
    // The target dir comes from workspaceFolders / os.tmpdir() only — the
    // webview names nothing about where the file lands.
    expect(src).toMatch(/demoTargetDir\(workspace\.workspaceFolders\?\.\[0\]\?\.uri\.fsPath,\s*os\.tmpdir\(\)\)/);
  });
});

describe('welcome-surface open boundary (welcome:open)', () => {
  it('the handler gates the webview uri through the capability allowlist BEFORE opening', () => {
    // welcome:open carries a webview-supplied uri — it MUST pass
    // welcomeOpenAllowed (membership in the surfaced set) before any
    // openTextDocument, so a uri the extension never showed cannot reach
    // an arbitrary read. The guard returns on refusal (no open).
    expect(src).toMatch(/if\s*\(!welcomeOpenAllowed\(msg\.uri,\s*welcomeSurfaced\)\)\s*\{[\s\S]*?return;\s*\}\s*const doc = await workspace\.openTextDocument\(Uri\.parse\(msg\.uri\)\)/);
  });

  it('the allowlist is the exact set of surfaced recents — the source of truth', () => {
    // welcomeSurfaced is rebuilt from the recents pushed to the webview,
    // so the capability always mirrors what the canvas was actually shown.
    expect(src).toMatch(/welcomeSurfaced = new Set\(recent\.map\(\(r\) => r\.uri\)\)/);
  });
});
