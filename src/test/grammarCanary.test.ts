// grammarCanary.test.ts — the ONE canary speaks the nine keys (the
// polarity proof · after #296 made the product canary the harness's).
//
// The product probe (Station · status pill) and the e2e floor gate share
// one document. If it slid back to the old envelope (`nika: v1` +
// `workflow:`), a 0.109 engine would parse-fatal it: the Station would
// tell every user with the CURRENT engine to « upgrade », and every
// real-binary suite would self-skip green having looked at nothing —
// the silent-skip class the belt exists to kill. Pure shape pins first;
// the armed-belt leg proves the POLARITY against the engine `NIKA_BIN`
// names (mutation-proof: the dead envelope must be REFUSED by the same
// binary that accepts the canary — a probe that said yes to both would
// gate nothing).

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { GRAMMAR_CANARY_DOC, grammarAccepted } from '../core/grammarCanary';
import { speaksGen1, gen1Floor } from './lspHarness';

const DEAD_ENVELOPE = [
  'nika: v1',
  'workflow:',
  '  id: canary',
  'model: mock/echo',
  'tasks:',
  '  probe:',
  '    infer:',
  '      prompt: "hi"',
  '',
].join('\n');

function check(bin: string, doc: string): string {
  try {
    return execFileSync(bin, ['check', '-', '--json', '--color', 'never'], {
      input: doc, timeout: 20000, encoding: 'utf8',
    });
  } catch (error) {
    const stdout = (error as { stdout?: unknown }).stdout;
    return typeof stdout === 'string' ? stdout : '';
  }
}

describe('the grammar canary · shape (pure)', () => {
  it('opens on a nika: identity, never the dead v1 marker', () => {
    const lines = GRAMMAR_CANARY_DOC.split('\n');
    expect(lines[0]).toMatch(/^nika: [a-z][a-z0-9-]*$/);
    expect(lines[0]).not.toBe('nika: v1');
  });

  it('carries no retired envelope key — the nine keys only', () => {
    const NINE = new Set(['nika', 'model', 'inputs', 'const', 'secrets', 'permits', 'run', 'tasks', 'outputs']);
    const topKeys = GRAMMAR_CANARY_DOC.split('\n')
      .filter((l) => /^[a-z_]+:/.test(l))
      .map((l) => l.slice(0, l.indexOf(':')));
    expect(topKeys.length).toBeGreaterThan(0);
    for (const k of topKeys) { expect(NINE.has(k), `top-level key ${k}`).toBe(true); }
    expect(GRAMMAR_CANARY_DOC).not.toMatch(/^workflow:/m);
    expect(GRAMMAR_CANARY_DOC).not.toMatch(/^description:/m);
  });

  it('is a tasks MAP with a model — the smallest thing an engine can plan', () => {
    expect(GRAMMAR_CANARY_DOC).toMatch(/^model: /m);
    expect(GRAMMAR_CANARY_DOC).toMatch(/^tasks:\n {2}[a-z]+:\n/m);
  });

  it('reads the parse_fatal tell and nothing else', () => {
    expect(grammarAccepted('{"parse_fatal":true}')).toBe(false);
    expect(grammarAccepted('{"conformance":[{"code":"NIKA-VAR-001"}]}')).toBe(true);
    expect(grammarAccepted('not json')).toBeUndefined();
  });
});

// The armed leg: when NIKA_BIN names an engine, that engine must speak
// the canary AND refuse the dead envelope. Locally without NIKA_BIN the
// leg says so (a dev machine may carry the stable engine).
const ARMED = process.env.NIKA_BIN;

describe.skipIf(!ARMED)('the grammar canary × the armed engine (NIKA_BIN)', () => {
  it('the engine accepts the nine-key canary — the suites RUN, no self-skip', () => {
    expect(grammarAccepted(check(ARMED!, GRAMMAR_CANARY_DOC))).toBe(true);
    expect(speaksGen1(ARMED!)).toBe(true);
    const floor = gen1Floor();
    expect(floor.off, floor.reason).toBe(false);
  });

  it('the same engine REFUSES the dead envelope (mutation proof · polarity)', () => {
    expect(grammarAccepted(check(ARMED!, DEAD_ENVELOPE))).toBe(false);
  });
});
