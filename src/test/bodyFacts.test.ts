import { describe, expect, it } from 'vitest';
import { collectBodyFacts } from '../core/bodyFacts';

const WF = `nika: v1
workflow: probe
model: mock/echo
tasks:
  - id: gather
    infer:
      prompt: "Summarize the latest news about workflow engines in three bullets."
  - id: long_block
    infer:
      prompt: |
        First display line of the block.
        Second display line.
        Third display line.
        Fourth line must be cut by the clamp.
  - id: shell_step
    exec:
      command: echo processing && sleep 1
    depends_on: [gather]
  - id: jq_step
    invoke:
      tool: "nika:jq"
      args:
        expr: ".items | length"
        input: "\${{ tasks.gather.output }}"
    depends_on: [gather]
  - id: bare
    invoke:
      tool: "nika:read"
`;

describe('collectBodyFacts', () => {
  const facts = collectBodyFacts(WF);

  it('reads inline quoted prompts', () => {
    expect(facts.get('gather')?.prompt).toBe(
      'Summarize the latest news about workflow engines in three bullets.',
    );
  });

  it('reads block-scalar prompts and clamps to 3 lines with ellipsis', () => {
    const p = facts.get('long_block')?.prompt ?? '';
    expect(p.split('\n')).toHaveLength(3);
    expect(p.endsWith('…')).toBe(true);
    expect(p).toContain('First display line');
  });

  it('reads exec commands (first line, unquoted)', () => {
    expect(facts.get('shell_step')?.command).toBe('echo processing && sleep 1');
  });

  it('summarizes invoke args as k: v pairs', () => {
    const a = facts.get('jq_step')?.args ?? '';
    expect(a).toContain('expr: .items | length');
    expect(a).toContain('input:');
  });

  it('emits nothing for tasks without body facts', () => {
    expect(facts.has('bare')).toBe(false);
  });
});
