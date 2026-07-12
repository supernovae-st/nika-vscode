// flowDoorsReal.e2e.test.ts — what the flow doors WRITE, the REAL
// binary must accept — and what they REFUSE to write without, the
// binary must reject. The positive proof: wire → gate → fan-out chained
// as the pickers chain them rides `nika check -` clean. The negative
// proof pins the §219 law itself: a `when:` reading `tasks.<id>` with
// NO depends_on edge is a parse rejection — the reason the pickers
// wire the edge first. Self-skips without a binary (CELLAR-first).

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { dependsRewrite, fanoutRewrite, gateRewrite } from '../core/flowEdit';
import { parseRichWorkflow } from '../workflowParser';

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
  'workflow: flow-doors-proof',
  'model: mock/echo',
  '',
  'vars:',
  '  urls:',
  '    type: array',
  '    default: ["https://example.com"]',
  '',
  'tasks:',
  '  - id: gather',
  '    infer:',
  '      prompt: "collect"',
  '  - id: thread',
  '    infer:',
  '      prompt: "weave"',
  '',
].join('\n');

function check(bin: string, text: string): { clean?: boolean } {
  const out = execFileSync(bin, ['check', '-', '--json', '--color', 'never'], {
    input: text,
    timeout: 20000,
  }).toString();
  return JSON.parse(out) as { clean?: boolean };
}

function taskOf(text: string, id: string) {
  const t = parseRichWorkflow(text).tasks.find((x) => x.id === id);
  expect(t, `task ${id} present`).toBeDefined();
  return t!;
}

describe.skipIf(!BIN)('flow doors × the real binary', () => {
  it('wire → gate → fan-out, chained like the pickers, checks clean', () => {
    // « wire its inputs » — thread waits for gather.
    const wired = dependsRewrite(BASE, taskOf(BASE, 'thread'), ['gather'])!;
    // « choose a gate » — the status shape (edge already wired).
    const gated = gateRewrite(wired, taskOf(wired, 'thread'), "tasks.gather.status == 'success'")!;
    // « choose the collection » — the typed array input.
    const fanned = fanoutRewrite(gated, taskOf(gated, 'thread'), 'vars.urls')!;
    expect(fanned).toContain('    depends_on: [gather]');
    expect(fanned).toContain("    when: ${{ tasks.gather.status == 'success' }}");
    expect(fanned).toContain('    for_each: ${{ vars.urls }}');
    expect(check(BIN!, fanned).clean).toBe(true);
  });

  it('the §219 law is real: a tasks.* gate without its edge is REJECTED', () => {
    const orphanGate = gateRewrite(BASE, taskOf(BASE, 'thread'), "tasks.gather.status == 'success'")!;
    const rejected = (() => {
      try {
        return check(BIN!, orphanGate).clean !== true;
      } catch {
        return true; // non-zero exit — the parse rejection
      }
    })();
    expect(rejected, 'the engine must refuse the unwired reference — the reason the picker wires it first').toBe(true);
  });
});
