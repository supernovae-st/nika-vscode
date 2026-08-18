// deadEnvelopeReal.e2e.test.ts — the retired envelope keys are REFUSED
// by the real engine (the teach-the-refusal lane · one negative per key).
//
// The nine-key envelope of nika 0.109 is exactly nika · model · inputs ·
// const · secrets · permits · run · tasks · outputs. Every surface of this
// extension that once taught `workflow:` · `config:` · `types:` ·
// `policy:` · `assert:` (and the `nika: v1` marker in front of the
// `workflow:` block) was rewritten to the nine keys — this suite is the
// floor under that rewrite: the ENGINE refuses each dead key with
// NIKA-PARSE-005 and its refusal names the destination, so a surface
// that slid back would teach a refusal, and this suite would say which.
// Same shape as flowDoorsReal's « the dead key is really dead » test.
// Skips WITH its reason on a machine without a nine-key engine.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { REAL_BIN as BIN, speaksGen1 } from './lspHarness';

const NINE_KEYS = ['nika', 'model', 'inputs', 'const', 'secrets', 'permits', 'run', 'tasks', 'outputs'];

/** The smallest live document — the dead key is spliced in per case. */
const LIVE = [
  'nika: dead-key-probe',
  'model: mock/echo',
  'tasks:',
  '  a:',
  '    infer:',
  '      prompt: "x"',
  '',
].join('\n');

function check(bin: string, text: string): { code: number; out: string } {
  try {
    const out = execFileSync(bin, ['check', '-', '--json', '--color', 'never'], {
      input: text, timeout: 20000, encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/** Every dead top-level key · the block spliced after `model:` · the
 *  destination the engine's own refusal must name (spec §2bis). */
const DEAD: Array<{ key: string; block: string; destination: RegExp }> = [
  { key: 'workflow', block: 'workflow:\n  id: dead-key-probe\n', destination: /identity moved onto `nika:`|nika: <id>/ },
  { key: 'config', block: 'config:\n  region: { type: string, default: "eu" }\n', destination: /inputs:.*required: false|required: false/ },
  { key: 'types', block: 'types:\n  Note: { type: object }\n', destination: /schema:|returns:/ },
  { key: 'policy', block: 'policy:\n  net: none\n', destination: /permits:/ },
  { key: 'assert', block: 'assert:\n  - "${{ tasks.a.output != null }}"\n', destination: /nika trace verify|trace/ },
];

describe.skipIf(!BIN || !speaksGen1(BIN))('the dead envelope keys × the real binary (teach the refusal)', () => {
  it.each(DEAD)('$key: is refused with NIKA-PARSE-005 and the refusal names where it went', ({ key, block, destination }) => {
    const doc = LIVE.replace('model: mock/echo\n', `model: mock/echo\n${block}`);
    const res = check(BIN!, doc);
    expect(res.code, `${key}: the engine must not accept a dead key\n${res.out}`).not.toBe(0);
    expect(res.out, `${key}: the refusal is NIKA-PARSE-005`).toContain('NIKA-PARSE-005');
    expect(res.out, `${key}: the refusal names the key`).toMatch(new RegExp(`unknown field \`${key}\``));
    expect(res.out, `${key}: the refusal teaches the destination`).toMatch(destination);
    // The refusal lists the nine keys — the whole envelope, nothing else.
    for (const k of NINE_KEYS) { expect(res.out, `${key}: the refusal lists ${k}`).toContain(k); }
  });

  it('the previous identity (nika: v1 + workflow:) is refused on the first line — the marker is not a name', () => {
    const doc = LIVE.replace('nika: dead-key-probe\n', 'nika: v1\nworkflow:\n  id: dead-key-probe\n');
    const res = check(BIN!, doc);
    expect(res.code).not.toBe(0);
    expect(res.out).toContain('NIKA-PARSE-005');
    expect(res.out).toMatch(/unknown field `workflow`/);
  });

  it('the live document these probes are cut from checks clean (the control)', () => {
    // A negative suite whose control is not green proves nothing.
    const res = check(BIN!, LIVE);
    expect(res.code, res.out).toBe(0);
  });
});
