// demoWorkflow.test.ts — the demo sandbox, pinned. Here we pin its
// STRUCTURE (four waves · mock/echo · the commented break_me · the eleven
// interpolations that must survive the template literal), the 0.106
// value-authority family it declares, and the pure target-dir decision.
//
// NOT proven here · `nika check` rc=0 against a 0.106 binary. The shipped
// 0.105.0 binary still accepts the dead `vars:` form, so it cannot judge
// this file either way; the pin below is a structural proof against the
// spec, not a run.

import { describe, it, expect } from 'vitest';
import { DEMO_WORKFLOW, DEMO_WORKFLOW_FILE, demoTargetDir } from '../core/demoWorkflow';

describe('demoWorkflow — the sandbox const', () => {
  it('is the four-wave hello-canvas on mock/echo', () => {
    expect(DEMO_WORKFLOW_FILE).toBe('hello-canvas.nika.yaml');
    // The nine-key envelope (nika 0.109): the identity line IS the name —
    // no `v1`, no `workflow:` block; the description is the comment above.
    expect(DEMO_WORKFLOW).toMatch(/^nika: hello-canvas$/m);
    expect(DEMO_WORKFLOW).not.toMatch(/^workflow:/m);
    expect(DEMO_WORKFLOW).not.toContain('nika: v1');
    expect(DEMO_WORKFLOW).toMatch(/^# brief · two angles in parallel · weave · write a receipt$/m);
    expect(DEMO_WORKFLOW).toContain('model: mock/echo');
    // The five tasks across four waves (brief → 2 angles → weave → receipt).
    for (const task of ['brief:', 'angle_practical:', 'angle_skeptical:', 'weave:', 'receipt:']) {
      expect(DEMO_WORKFLOW).toContain(task);
    }
    // Two angles bind the SAME brief — a parallel wave (the ∥ moment).
    expect((DEMO_WORKFLOW.match(/brief: \$\{\{ tasks\.brief\.output \}\}/g) ?? [])).toHaveLength(2);
    // The receipt is the exec verb (writes to disk · the fourth wave).
    expect(DEMO_WORKFLOW).toMatch(/receipt:[\s\S]*exec:/);
  });

  it('carries the interpolations verbatim (template-literal escaping held)', () => {
    // The exact bug the round-trip guards: a mis-escaped `${{` would either
    // fail to compile OR collapse to a JS-interpolated value. Eleven markers
    // must survive as literal bytes.
    expect((DEMO_WORKFLOW.match(/\$\{\{/g) ?? [])).toHaveLength(11);
    expect(DEMO_WORKFLOW).toContain('${{ inputs.topic }}');
    expect(DEMO_WORKFLOW).toContain('${{ tasks.weave.output }}');
    // No stray value from a botched interpolation.
    expect(DEMO_WORKFLOW).not.toContain('[object');
    expect(DEMO_WORKFLOW).not.toContain('undefined');
  });

  it('declares its knob under a LIVE value authority — never the dead vars:/env:', () => {
    // The E-split (R3a): `vars:` refuses NIKA-VALUES-001, `env:`
    // NIKA-VALUES-002. The first file a new user opens must not teach a
    // form the engine refuses.
    expect(DEMO_WORKFLOW).not.toMatch(/^vars:/m);
    expect(DEMO_WORKFLOW).not.toMatch(/^env:/m);
    expect(DEMO_WORKFLOW).not.toMatch(/\$\{\{ (vars|env)\./);
    // `topic` is caller-overridable → an input, and its default keeps the
    // sandbox one-click (never lands in `inputs_required`).
    expect(DEMO_WORKFLOW).toMatch(/^inputs:\n {2}topic:\n {4}type: string\n {4}default: /m);
  });

  it('keeps break_me COMMENTED — green by default (the walkthrough uncomments it)', () => {
    expect(DEMO_WORKFLOW).toContain('break_me');
    for (const line of DEMO_WORKFLOW.split('\n')) {
      if (line.includes('break_me')) {
        expect(line.trim().startsWith('#')).toBe(true);
      }
    }
  });

  it('is sovereign by construction — offline, zero keys (alignment Rule 6)', () => {
    expect(DEMO_WORKFLOW).toContain('model: mock/echo');
    // No cloud provider named · no network verb — nothing to spend.
    expect(DEMO_WORKFLOW).not.toMatch(/anthropic|openai|\bxai\b|gemini|http:\/\//i);
  });

  it('lands in the workspace root, or a tmp scratch dir when no folder is open', () => {
    expect(demoTargetDir('/ws/root', '/tmp')).toEqual({ dir: '/ws/root', scratch: false });
    const scratch = demoTargetDir(undefined, '/tmp');
    expect(scratch.scratch).toBe(true);
    expect(scratch.dir).toBe('/tmp/nika-demo');
  });
});
