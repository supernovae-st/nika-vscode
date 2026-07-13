// toolVocabReal.e2e.test.ts — the offline courtesy cache stays honest.
// FALLBACK_TOOL_BLURBS is Lane C by declaration (SSOT.md): a fallback
// vocabulary for the no-binary journey whose descriptions the REAL
// catalog always overrides. What must NEVER drift silently is the
// STRUCTURE — a builtin added, renamed or retired in the engine has to
// show up here, or the offline palette teaches ghosts. Self-skips
// without a binary (CELLAR-first, the sister-session PATH shield).

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { FALLBACK_TOOL_BLURBS } from '../core/verbPalette';

const CELLAR = (() => {
  try {
    const base = '/opt/homebrew/Cellar/nika';
    const versions = fs.readdirSync(base).sort();
    return versions.length ? `${base}/${versions[versions.length - 1]}/bin/nika` : undefined;
  } catch { return undefined; }
})();

const BIN = [process.env.NIKA_BIN, CELLAR, 'nika']
  .filter((p): p is string => typeof p === 'string' && p.length > 0)
  .find((bin) => {
    try {
      execFileSync(bin, ['--version'], { timeout: 5000 });
      return true;
    } catch { return false; }
  });

describe.skipIf(!BIN)('offline tool vocabulary × the real catalog', () => {
  it('the fallback names ARE the catalog names — no ghosts, no gaps', () => {
    const out = execFileSync(BIN!, ['catalog', '--tools', '--json', '--color', 'never'], {
      timeout: 20000,
    }).toString();
    const doc = JSON.parse(out) as { tools?: Array<{ name?: string }> };
    const real = new Set(
      (doc.tools ?? []).map((t) => (t.name ?? '').replace(/^nika:/, '')).filter(Boolean),
    );
    const fallback = new Set(Object.keys(FALLBACK_TOOL_BLURBS));
    const ghosts = [...fallback].filter((b) => !real.has(b)).sort();
    const gaps = [...real].filter((b) => !fallback.has(b)).sort();
    expect(ghosts, 'fallback teaches tools the engine no longer carries').toEqual([]);
    expect(gaps, 'the engine grew builtins the offline palette does not know').toEqual([]);
  });
});
