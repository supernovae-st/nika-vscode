// statusTruth.test.ts — the degradation ladder, provable (W-ERR S1).
//
// The law under test: worst state wins · every non-ok state names its
// exact next move · an unprobed canary stays silent (never a false
// alarm) · doctor fails ride the tooltip without stealing the pill.

import { describe, it, expect } from 'vitest';
import { statusTruth, type TruthInput } from '../core/statusTruth';

function input(partial: Partial<TruthInput>): TruthInput {
  return {
    available: true,
    version: '0.104.0',
    lspCapable: true,
    lspState: 'running',
    runCapable: true,
    gen1: true,
    doctorFails: 0,
    ...partial,
  };
}

describe('statusTruth — the ladder (worst wins)', () => {
  it('no binary is the floor: error + the install move, whatever else is true', () => {
    const t = statusTruth(input({ available: false, lspState: 'failed', gen1: false }));
    expect(t.severity).toBe('error');
    expect(t.text).toContain('no binary');
    expect(t.headline?.command).toBe('nika.finishSetup');
  });

  it('a crashed server outranks everything above the floor and says the CLI lane survives', () => {
    const t = statusTruth(input({ lspState: 'failed', gen1: false }));
    expect(t.severity).toBe('warn');
    expect(t.text).toContain('lsp down');
    expect(t.headline?.command).toBe('nika.restartServer');
    expect(t.tooltip.join(' ')).toContain('CLI lane');
  });

  it('a generation gap is a quiet truth line, never a warn — the NORMAL state between releases', () => {
    // Empirical (2026-07-19): brew 0.104 refuses the object-envelope
    // canary while main requires it — every current pairing sits in
    // this state, scaffolds delegate to `nika new` and daily flows
    // work. A warn pill here would nag with a dead « update » action.
    const t = statusTruth(input({ gen1: false }));
    expect(t.severity).toBe('ok');
    expect(t.headline).toBeUndefined();
    expect(t.text).not.toContain('gen-0');
    expect(t.tooltip.join(' ')).toContain('previous grammar generation');
  });

  it('an unprobed canary stays silent — undefined is never an alarm', () => {
    const t = statusTruth(input({ gen1: undefined }));
    expect(t.severity).toBe('ok');
    expect(t.headline).toBeUndefined();
  });

  it('healthy reads the rung: lsp when running, run without lsp, static at the floor', () => {
    expect(statusTruth(input({})).text).toContain('lsp');
    expect(statusTruth(input({ lspCapable: false, lspState: 'off' })).text).toContain('run');
    expect(statusTruth(input({ lspCapable: false, lspState: 'off', runCapable: false })).text)
      .toContain('static');
  });

  it('doctor fails ride the tooltip on every rung above the floor — never the pill', () => {
    const ok = statusTruth(input({ doctorFails: 3 }));
    expect(ok.severity).toBe('ok');
    expect(ok.text).not.toContain('3');
    expect(ok.tooltip.join(' ')).toContain('3 fails');
    const down = statusTruth(input({ lspState: 'failed', doctorFails: 1 }));
    expect(down.tooltip.join(' ')).toContain('1 fail');
    expect(statusTruth(input({ doctorFails: 0 })).tooltip.join(' ')).not.toContain('doctor');
  });
});
