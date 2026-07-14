// flowDoorsReal.e2e.test.ts — what the flow doors WRITE, the REAL
// binary must accept — and what they REFUSE to write, the binary must
// reject. The positive proof: order-on-state → bind → gate → fan-out
// chained as the pickers chain them rides `nika check -` clean. The
// negative proofs pin the W2 boundary itself: a `when:` reading
// `tasks.<id>` is NIKA-VAR-021 (the reason the gate door hoists through
// with: first), and a dead `depends_on:` is NIKA-PARSE-024 (the door
// never writes the dead key). Self-skips without a binary (CELLAR-first).

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { afterRewrite, bindingInsert, fanoutRewrite, gateRewrite } from '../core/flowEdit';
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
  'workflow:',
  '  id: flow-doors-proof',
  'model: mock/echo',
  '',
  'vars:',
  '  urls:',
  '    type: array',
  '    default: ["https://example.com"]',
  '',
  'tasks:',
  '  gather:',
  '    infer:',
  '      prompt: "collect"',
  '  thread:',
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

function rejects(bin: string, text: string, code: string): boolean {
  try {
    const out = execFileSync(bin, ['check', '-', '--json', '--color', 'never'], {
      input: text,
      timeout: 20000,
    }).toString();
    return out.includes(code);
  } catch (e) {
    // Non-zero exit — a parse rejection; the code rides stdout/stderr.
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    return `${err.stdout ?? ''}${err.stderr ?? ''}`.includes(code);
  }
}

function taskOf(text: string, id: string) {
  const t = parseRichWorkflow(text).tasks.find((x) => x.id === id);
  expect(t, `task ${id} present`).toBeDefined();
  return t!;
}

describe.skipIf(!BIN)('flow doors × the real binary', () => {
  it('order → bind → gate → fan-out, chained like the pickers, checks clean', () => {
    // « order on state » — thread waits for gather (control edge).
    const ordered = afterRewrite(BASE, taskOf(BASE, 'thread'), [['gather', 'succeeded']])!;
    // « choose a gate » content shape — the door HOISTS the value
    // through with: (the binding IS the edge), then reads the binding.
    const bound = bindingInsert(ordered, taskOf(ordered, 'thread'), 'gather', 'tasks.gather.output', [])!;
    const gated = gateRewrite(bound.text, taskOf(bound.text, 'thread'), `size(with.${bound.alias}) > 0`)!;
    // « choose the collection » — the typed array input (local read).
    const fanned = fanoutRewrite(gated, taskOf(gated, 'thread'), 'vars.urls')!;
    expect(fanned).toContain('    after: { gather: succeeded }');
    expect(fanned).toContain('      gather: ${{ tasks.gather.output }}');
    expect(fanned).toContain('    when: ${{ size(with.gather) > 0 }}');
    expect(fanned).toContain('    for_each: ${{ vars.urls }}');
    expect(check(BIN!, fanned).clean).toBe(true);
  });

  it('the boundary is real: a tasks.* gate is NIKA-VAR-021 — the reason the door hoists', () => {
    const orphanGate = gateRewrite(BASE, taskOf(BASE, 'thread'), "tasks.gather.status == 'success'")!;
    expect(
      rejects(BIN!, orphanGate, 'NIKA-VAR-021'),
      'the engine must refuse a tasks.* read inside when: — the door hoists through with: instead',
    ).toBe(true);
  });

  it('the dead key is really dead: depends_on is NIKA-PARSE-024', () => {
    const dead = BASE.replace('  thread:\n', '  thread:\n    depends_on: [gather]\n');
    expect(
      rejects(BIN!, dead, 'NIKA-PARSE-024'),
      'the engine must refuse depends_on — the doors write after:/with: only',
    ).toBe(true);
  });
});
