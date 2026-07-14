// armorDoorsReal.e2e.test.ts — the armor the doors write, the REAL
// binary must accept; the recovery deadlock they refuse to write, it
// must reject. Positive: retry + recover + timeout chained on one task
// ride `nika check -` clean. Negative: `recover:` pointing at a task
// that transitively depends on the declarer is NIKA-DAG-004 territory
// (the spec's parse-time acyclicity rule) — the reason recover sources
// come from upstreamCandidates. Self-skips without a binary.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { armorWrite } from '../core/armorEdit';
import { insertDefaultModel } from '../core/modelEdit';
import { parseRichWorkflow } from '../workflowParser';
import type { TaskRange } from '../core/flowEdit';

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
  '  id: armor-doors-proof',
  '  description: "the three walls"',
  'tasks:',
  '  cache_read:',
  '    exec:',
  '      command: ["cat", "cache.json"]',
  '  live_fetch:',
  '    infer:',
  '      prompt: "fetch the live data"',
  '  consume:',
  '    after: { live_fetch: succeeded }',
  '    exec:',
  '      command: ["true"]',
  '',
].join('\n');

function check(bin: string, text: string): { clean?: boolean } {
  const out = execFileSync(bin, ['check', '-', '--json', '--color', 'never'], {
    input: text,
    timeout: 20000,
  }).toString();
  return JSON.parse(out) as { clean?: boolean };
}

function taskOf(text: string, id: string): TaskRange {
  const t = parseRichWorkflow(text).tasks.find((x) => x.id === id);
  expect(t, `task ${id} present`).toBeDefined();
  return t as unknown as TaskRange;
}

describe.skipIf(!BIN)('armor doors × the real binary', () => {
  it('retry + recover + timeout + the envelope model check clean', () => {
    // The status-row model door first (infer present, no model).
    const withModel = insertDefaultModel(BASE, 'mock/echo')!;
    // The three walls on live_fetch — recover falls back to cache_read
    // (upstream-safe: consume depends on live_fetch, cache_read doesn't).
    const retried = armorWrite(withModel, taskOf(withModel, 'live_fetch'), 'retry')!;
    const recovered = armorWrite(retried, taskOf(retried, 'live_fetch'), 'recover', '${{ tasks.cache_read.output }}')!;
    const bounded = armorWrite(recovered, taskOf(recovered, 'live_fetch'), 'timeout')!;
    expect(bounded).toContain('    retry:');
    expect(bounded).toContain('      recover: ${{ tasks.cache_read.output }}');
    expect(bounded).toContain('    timeout: "60s"');
    expect(check(BIN!, bounded).clean).toBe(true);
  });

  it('the acyclicity law is real: recover from a DESCENDANT is rejected', () => {
    // consume depends on live_fetch — recovering live_fetch FROM
    // consume's output is the NIKA-DAG-004 deadlock the spec forbids.
    const withModel = insertDefaultModel(BASE, 'mock/echo')!;
    const deadlock = armorWrite(withModel, taskOf(withModel, 'live_fetch'), 'recover', '${{ tasks.consume.output }}')!;
    const rejected = (() => {
      try {
        return check(BIN!, deadlock).clean !== true;
      } catch {
        return true; // non-zero exit — the parse rejection
      }
    })();
    expect(rejected, 'the engine must refuse the recovery deadlock — the reason sources come from upstreamCandidates').toBe(true);
  });

  it('the skip wall checks clean too', () => {
    const withModel = insertDefaultModel(BASE, 'mock/echo')!;
    const skipped = armorWrite(withModel, taskOf(withModel, 'live_fetch'), 'skip')!;
    expect(check(BIN!, skipped).clean).toBe(true);
  });
});
