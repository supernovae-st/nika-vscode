// welcomeBoundary.test.ts — the welcome-surface command boundary, pinned
// (maker≠checker). Claim under test: a compromised webview riding the
// welcome whitelist gains NO arbitrary write via nika.tryDemo. The proof
// is structural — the four facts that together close the door, read off
// the extension source (the parity.mjs idiom).

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
