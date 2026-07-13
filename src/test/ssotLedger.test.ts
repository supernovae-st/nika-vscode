// ssotLedger.test.ts — the « no silent knowledge » gate. SSOT.md is the
// ledger of every language-knowledge artifact and its source lane; this
// suite makes the ledger STRUCTURAL: a generated file outside the
// ledger, a ledger row pointing nowhere, or a resurrected snippets dir
// fails the build — the question « what is your source? » cannot be
// skipped.

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const LEDGER = fs.readFileSync(path.join(ROOT, 'SSOT.md'), 'utf8');

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'out') { continue; }
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { yield* walk(p); } else { yield p; }
  }
}

describe('SSOT ledger (no silent knowledge)', () => {
  it('every generated artifact is a ledger row', () => {
    const generated = [...walk(path.join(ROOT, 'src'))]
      .filter((p) => /\.generated\.(ts|json|css)$/.test(p))
      .map((p) => path.relative(ROOT, p).replace(/\\/g, '/'))
      // The webview mirror of design tokens is projected FROM the same
      // module by tokens-parity (internal coherence gate) — one row
      // covers the pair.
      .filter((p) => !p.startsWith('src/webview/'));
    expect(generated.length).toBeGreaterThanOrEqual(3);
    for (const rel of generated) {
      expect(LEDGER, `${rel} must be declared in SSOT.md (Lane B) with its projector + gate`)
        .toContain(path.basename(rel));
    }
  });

  it('every Lane B row points at a file that exists', () => {
    const rows = LEDGER.match(/`src\/[^`]+\.generated\.ts`/g) ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      const rel = row.replace(/`/g, '').split(' ')[0];
      expect(fs.existsSync(path.join(ROOT, rel)), `${rel} is in the ledger but missing on disk`).toBe(true);
    }
  });

  it('the CI closes every Lane B loop consumer-side', () => {
    const ci = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    for (const projector of ['starters-projector.py', 'authoring-projector.py', 'design-projector.py']) {
      expect(ci, `${projector} --check must run in CI`).toContain(`${projector} --check`);
    }
  });

  it('editor snippets stay dead — starters and the catalog own that knowledge', () => {
    expect(fs.existsSync(path.join(ROOT, 'snippets'))).toBe(false);
    const manifest = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    expect(manifest).not.toContain('"snippets"');
  });

  it('no hardcoded provider order outside the projected token', () => {
    // The one legitimate carrier is design-tokens.generated.ts; any
    // other file listing 3+ provider slugs in sequence is a fork.
    const offenders = [...walk(path.join(ROOT, 'src'))]
      .filter((p) => p.endsWith('.ts') && !p.endsWith('.generated.ts') && !p.includes(`${path.sep}test${path.sep}`))
      .filter((p) => /'ollama',\s*\n?\s*'lmstudio',\s*\n?\s*'llamacpp'/.test(fs.readFileSync(p, 'utf8')))
      .map((p) => path.relative(ROOT, p));
    expect(offenders).toEqual([]);
  });
});
