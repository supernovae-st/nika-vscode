// contractDoorsReal.e2e.test.ts — what the contract doors WRITE, the
// REAL binary must accept. The pure edits (schemaInsert · outputsRewrite
// · declareInput · promoteVar) are chained on one fixture exactly as the
// pickers chain them, and the result rides `nika check -` — clean, no
// findings. A door that writes YAML the engine rejects is worse than no
// door. Self-skips without a binary (CELLAR-first, the journeyReal
// shield: PATH may carry a sister session's in-flight build).

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { SCHEMA_SHAPES, schemaInsert } from '../core/schemaEdit';
import { outputsRewrite } from '../core/outputsEdit';
import { declareInput, promoteVar } from '../core/varsEdit';

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

const BASE = [
  'nika: v1',
  'workflow:',
  '  id: contract-doors-proof',
  'model: mock/echo',
  '',
  'vars:',
  '  topic: "Rust async 2026"',
  '',
  'tasks:',
  '  gather:',
  '    infer:',
  '      prompt: "Collect notes on ${{ vars.topic }}"',
  '',
].join('\n');

function check(bin: string, text: string): { clean?: boolean; findings?: unknown[] } {
  const out = execFileSync(bin, ['check', '-', '--json', '--color', 'never'], {
    input: text,
    timeout: 20000,
  }).toString();
  return JSON.parse(out) as { clean?: boolean; findings?: unknown[] };
}

describe.skipIf(!BIN)('contract doors × the real binary', () => {
  it('the chained door edits produce a workflow check calls clean', () => {
    // « type its output » — every proven shape, appended to the infer.
    const infLine = BASE.split('\n').findIndex((l) => /^\s+infer:/.test(l));
    for (const shape of SCHEMA_SHAPES) {
      const ins = schemaInsert(BASE, infLine, 'infer', shape)!;
      expect(ins).toBeDefined();
      const lines = BASE.split('\n');
      lines.splice(ins.atLine, 0, ins.text.replace(/\n$/, ''));
      const typed = lines.join('\n');

      // « choose what it publishes » + « declare an input » (typed ·
      // required) + « make it callable » on the untyped topic.
      const published = outputsRewrite(typed, ['gather'])!;
      const declared = declareInput(published, { name: 'lang', type: 'string', required: true })!;
      const promoted = promoteVar(declared, 'topic')!;
      expect(promoted).toContain('type: string');

      const report = check(BIN!, promoted);
      expect(report.clean, `shape ${shape.id} → ${JSON.stringify(report.findings ?? [])}`).toBe(true);
    }
  });

  it('the untyped shorthand the declare door writes is equally legal', () => {
    const next = declareInput(BASE, { name: 'out_dir', def: '"./out"' })!;
    expect(check(BIN!, next).clean).toBe(true);
  });
});
