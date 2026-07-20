// statusTruth.test.ts — the degradation ladder, provable (W-ERR S1 ·
// V1.2 fused item).
//
// The law under test: worst state wins · every non-ok state names its
// exact next move · an unprobed canary stays silent (never a false
// alarm) · the ERROR background belongs to doctor red ALONE (annexe A
// #11 — no binary is a setup warn, not a breakage) · the busy flag
// spins the head · findings + cost ride the text as chips.

import { describe, it, expect } from 'vitest';
import { checkLaneTruth, statusTruth, type CheckLaneInput, type TruthInput } from '../core/statusTruth';

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
  it('no binary is a setup WARN (never the error background) + the install move', () => {
    const t = statusTruth(input({ available: false, lspState: 'failed', gen1: false }));
    expect(t.severity).toBe('warn');
    expect(t.text).toContain('no engine');
    expect(t.headline?.command).toBe('nika.finishSetup');
  });

  it('doctor red is THE error state: run-blocking findings own the background + the Station move', () => {
    const t = statusTruth(input({ doctorFails: 3 }));
    expect(t.severity).toBe('error');
    expect(t.text).toContain('3 findings');
    expect(t.headline?.command).toBe('nika.showStation');
    expect(t.tooltip.join(' ')).toContain('fix');
    // Singular grammar holds.
    expect(statusTruth(input({ doctorFails: 1 })).text).toContain('1 finding');
  });

  it('doctor red outranks a crashed server (worst wins)', () => {
    const t = statusTruth(input({ doctorFails: 2, lspState: 'failed' }));
    expect(t.severity).toBe('error');
    expect(t.headline?.command).toBe('nika.showStation');
  });

  it('a crashed server (doctor clean) warns and says the CLI lane survives', () => {
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
});

describe('statusTruth — the fused chips (V1.2)', () => {
  it('busy spins the head on every rung; idle carries the zap', () => {
    expect(statusTruth(input({ busy: true })).text).toContain('$(sync~spin)');
    expect(statusTruth(input({ busy: true, available: false })).text).toContain('$(sync~spin)');
    expect(statusTruth(input({ busy: true, doctorFails: 2 })).text).toContain('$(sync~spin)');
    expect(statusTruth(input({})).text).toContain('$(zap)');
    expect(statusTruth(input({})).text).not.toContain('sync~spin');
  });

  it('the cost ceiling rides the text — floor-honest, trailing zeros trimmed', () => {
    expect(statusTruth(input({ costBoundedUsd: 0.42 })).text).toContain('$0.42');
    expect(statusTruth(input({ costBoundedUsd: 0.042 })).text).toContain('$0.042');
    expect(statusTruth(input({ costBoundedUsd: 1.5, costIsFloor: true })).text).toContain('≥ $1.5');
    // Zero/absent cost = no chip (a `$0` would be noise, not truth).
    expect(statusTruth(input({ costBoundedUsd: 0 })).text).not.toContain('$0');
    expect(statusTruth(input({})).text).not.toContain('$0');
  });

  it('findings + cost compose in order: state · findings · cost', () => {
    const t = statusTruth(input({ doctorFails: 3, costBoundedUsd: 0.42 }));
    const findingsAt = t.text.indexOf('3 findings');
    const costAt = t.text.indexOf('$0.42');
    expect(findingsAt).toBeGreaterThan(-1);
    expect(costAt).toBeGreaterThan(findingsAt);
  });

  it('workspace rollups are FACTS (plain lines), never warning lines', () => {
    const t = statusTruth(input({ workflowsTotal: 5, workflowsWithFindings: 2, costBoundedUsd: 0.42 }));
    expect(t.facts.join(' ')).toContain('5 workflows');
    expect(t.facts.join(' ')).toContain('2 with check findings');
    expect(t.facts.join(' ')).toContain('cost ceiling $0.42');
    expect(t.tooltip.join(' ')).not.toContain('5 workflows');
    const clean = statusTruth(input({ workflowsTotal: 3, workflowsWithFindings: 0 }));
    expect(clean.facts.join(' ')).toContain('all check clean');
  });
});

// ─── checkLaneTruth — the trust illusion, dead (V-SOTA.A #3) ────────────────
//
// The most dangerous state cell (annexe Q): a nika buffer with NO engine
// shows zero squiggles and the check lane said « clean » — indistinguishable
// from an audited buffer. The law: a clean verdict is claimable ONLY when
// the oracle actually ran; every off-state names why and opens the right
// door. Findings that ARE painted (the binary-less secrets lint) stay a
// findings count — visible squiggles never lied.

function lane(partial: Partial<CheckLaneInput>): CheckLaneInput {
  return {
    hasActiveDoc: true,
    available: true,
    checkCapable: true,
    runOn: 'type',
    findings: 0,
    errors: 0,
    ...partial,
  };
}

describe('checkLaneTruth — clean is only claimable when the oracle ran', () => {
  it('NO binary + zero squiggles NEVER reads clean (the illusion, dead)', () => {
    const t = checkLaneTruth(lane({ available: false }));
    expect(t.text).not.toContain('clean');
    expect(t.text).toContain('engine missing');
    expect(t.severity).toBe('warn');
    expect(t.command).toBe('setup'); // rule 10: the one executable next step
    expect(t.detail).toContain('no squiggles is not a verdict');
  });

  it('an engine that predates `check` is the same honest OFF, not clean', () => {
    const t = checkLaneTruth(lane({ checkCapable: false }));
    expect(t.text).not.toContain('clean');
    expect(t.text).toContain('predates');
    expect(t.severity).toBe('warn');
    expect(t.command).toBe('setup');
  });

  it("runOn 'off' is the user's own switch — honest label, info, the settings door", () => {
    const t = checkLaneTruth(lane({ runOn: 'off' }));
    expect(t.text).not.toContain('clean');
    expect(t.severity).toBe('info');
    expect(t.command).toBe('settings');
  });

  it('clean requires available AND capable AND on', () => {
    const t = checkLaneTruth(lane({}));
    expect(t.text).toContain('clean');
    expect(t.severity).toBe('info');
    expect(t.command).toBe('report');
  });

  it('painted findings stay a findings count even with no binary (squiggles never lied)', () => {
    const t = checkLaneTruth(lane({ available: false, findings: 2, errors: 1 }));
    expect(t.text).toContain('2 findings');
    expect(t.severity).toBe('error');
    expect(t.detail).toContain('1 error');
    expect(t.command).toBe('report');
  });

  it('warnings-only findings warn; no active doc stays silent info', () => {
    expect(checkLaneTruth(lane({ findings: 1 })).severity).toBe('warn');
    expect(checkLaneTruth(lane({ findings: 1 })).detail).toBe('warnings only');
    const idle = checkLaneTruth(lane({ hasActiveDoc: false }));
    expect(idle.text).toBe('$(check) check');
    expect(idle.severity).toBe('info');
  });
});
