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

const POLICY_WF = `nika: v1
workflow: policy_probe
model: mock/echo
tasks:
  - id: guarded
    infer:
      prompt: "Summarize."
    timeout: "30s"
    retry:
      max_attempts: 3
      backoff_ms: 200
    on_error:
      skip: true
    output:
      summary: ".text"
      title: ".title"
  - id: flow_forms
    exec:
      command: echo hi
    retry: { max_attempts: 2 }
    on_error: { recover: "fallback" }
  - id: decoy
    invoke:
      tool: "nika:jq"
      args:
        expr: "."
    with:
      timeout: "\${{ tasks.guarded.output }}"
`;

describe('collectBodyFacts · policy facts (retry · timeout · on_error · output)', () => {
  const facts = collectBodyFacts(POLICY_WF);

  it('reads retry.max_attempts from a block', () => {
    expect(facts.get('guarded')?.retryMax).toBe(3);
  });

  it('reads the quoted Go-duration timeout', () => {
    expect(facts.get('guarded')?.timeout).toBe('30s');
  });

  it('reads the on_error action key (block form)', () => {
    expect(facts.get('guarded')?.onError).toBe('skip');
  });

  it('collects named output bindings the task produces', () => {
    expect(facts.get('guarded')?.outputNames).toEqual(['summary', 'title']);
  });

  it('reads flow forms — retry: {max_attempts} · on_error: {recover}', () => {
    expect(facts.get('flow_forms')?.retryMax).toBe(2);
    expect(facts.get('flow_forms')?.onError).toBe('recover');
  });

  it('a with: alias named timeout never impersonates the task field', () => {
    expect(facts.get('decoy')?.timeout).toBeUndefined();
  });
});
