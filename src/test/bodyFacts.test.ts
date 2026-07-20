import { describe, expect, it } from 'vitest';
import { collectBodyFacts } from '../core/bodyFacts';

const WF = `nika: v1
workflow:
  id: probe
model: mock/echo
tasks:
  gather:
    infer:
      prompt: "Summarize the latest news about workflow engines in three bullets."
  long_block:
    infer:
      prompt: |
        First display line of the block.
        Second display line.
        Third display line.
        Fourth line must be cut by the clamp.
  shell_step:
    exec:
      command: echo processing && sleep 1
    after: { gather: succeeded }
  jq_step:
    invoke:
      tool: "nika:jq"
      args:
        expr: ".items | length"
        input: "\${{ tasks.gather.output }}"
    after: { gather: succeeded }
  bare:
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
workflow:
  id: policy_probe
model: mock/echo
tasks:
  guarded:
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
  flow_forms:
    exec:
      command: echo hi
    retry: { max_attempts: 2 }
    on_error: { recover: "fallback" }
  decoy:
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

describe('collectBodyFacts · on_finally (spec 03 §on_finally)', () => {
  it('counts the cleanup list members and survives on a scalar-verb task', () => {
    const facts = collectBodyFacts([
      'nika: v1',
      'workflow: probe',
      'tasks:',
      '  process:',
      '    exec: ./process.sh',
      '    on_finally:',
      '      - exec:',
      '          command: ["rm", "-f", "/tmp/x"]',
      '      - invoke:',
      '          tool: nika:emit',
      '          args: { event: done }',
      '  plain:',
      '    exec: echo hi',
    ].join('\n'));
    expect(facts.get('process')?.finallyCount).toBe(2);
    expect(facts.get('plain')).toBeUndefined();
  });

  it('an empty or non-list on_finally counts nothing (check owns conformance)', () => {
    const facts = collectBodyFacts([
      'nika: v1',
      'workflow: probe',
      'tasks:',
      '  a:',
      '    exec: echo hi',
      '    on_finally:',
      '  b:',
      '    exec: echo ho',
      '    prompt: never',
    ].join('\n'));
    expect(facts.get('a')?.finallyCount).toBeUndefined();
  });

  it('a with-alias named on_finally can never impersonate the task-level hook', () => {
    const facts = collectBodyFacts([
      'nika: v1',
      'workflow: probe',
      'tasks:',
      '  a:',
      '    exec: echo hi',
      '    with:',
      '      on_finally:',
      '        - not-a-cleanup',
    ].join('\n'));
    expect(facts.get('a')?.finallyCount).toBeUndefined();
  });
});

describe('collectBodyFacts · infer senses (spec 02 — thinking · vision)', () => {
  it('reads the thinking budget and counts vision sources', () => {
    const facts = collectBodyFacts([
      'nika: v1',
      'workflow: probe',
      'tasks:',
      '  see:',
      '    infer:',
      '      prompt: describe the diagram',
      '      thinking:',
      '        enabled: true',
      '        budget_tokens: 4000',
      '      vision:',
      '        - source: file',
      '          path: ./a.png',
      '        - source: url',
      '          url: https://x/y.png',
    ].join('\n'));
    expect(facts.get('see')?.thinkingBudget).toBe(4000);
    expect(facts.get('see')?.visionCount).toBe(2);
  });

  it('enabled-without-budget reads as -1 (on, uncapped); absent stays silent', () => {
    const facts = collectBodyFacts([
      'nika: v1',
      'workflow: probe',
      'tasks:',
      '  think:',
      '    infer:',
      '      prompt: hard question',
      '      thinking:',
      '        enabled: true',
      '  plain:',
      '    infer:',
      '      prompt: easy',
    ].join('\n'));
    expect(facts.get('think')?.thinkingBudget).toBe(-1);
    expect(facts.get('plain')?.thinkingBudget).toBeUndefined();
    expect(facts.get('plain')?.visionCount).toBeUndefined();
  });
});

describe('collectBodyFacts · fan-out policies (spec 03 — max_parallel · fail_fast)', () => {
  it('reads the cap and the per-item idiom at task level only', () => {
    const facts = collectBodyFacts([
      'nika: v1',
      'workflow: probe',
      'tasks:',
      '  crawl:',
      '    for_each: ${{ with.pages }}',
      '    max_parallel: 4',
      '    fail_fast: false',
      '    invoke:',
      '      tool: nika:fetch',
      '      args:',
      '        url: ${{ item }}',
      '  quiet:',
      '    exec: echo hi',
    ].join('\n'));
    expect(facts.get('crawl')?.maxParallel).toBe(4);
    expect(facts.get('crawl')?.failFast).toBe(false);
    expect(facts.get('quiet')?.maxParallel).toBeUndefined();
  });

  it('a with-alias named max_parallel cannot impersonate the policy', () => {
    const facts = collectBodyFacts([
      'nika: v1',
      'workflow: probe',
      'tasks:',
      '  a:',
      '    exec: echo hi',
      '    with:',
      '      max_parallel: 9',
    ].join('\n'));
    expect(facts.get('a')?.maxParallel).toBeUndefined();
  });

  it('reads the for_each collection as written (unquoted interpolation — the spec form)', () => {
    const facts = collectBodyFacts([
      'nika: v1',
      'workflow: probe',
      'tasks:',
      '  crawl:',
      '    for_each: ${{ with.pages }}',
      '    invoke:',
      '      tool: nika:fetch',
      '      args:',
      '        url: ${{ item }}',
      '  quiet:',
      '    exec: echo hi',
    ].join('\n'));
    expect(facts.get('crawl')?.forEachSource).toBe('${{ with.pages }}');
    expect(facts.get('quiet')?.forEachSource).toBeUndefined();
  });

  it('for_each alone earns the entry, quoted forms unwrap one quote layer', () => {
    const facts = collectBodyFacts([
      'nika: v1',
      'workflow: probe',
      'tasks:',
      '  fan:',
      '    for_each: "${{ tasks.list.output }}"',
      '    exec: echo ${{ item }}',
    ].join('\n'));
    expect(facts.get('fan')?.forEachSource).toBe('${{ tasks.list.output }}');
  });

  it('a with-alias named for_each cannot impersonate the construct', () => {
    const facts = collectBodyFacts([
      'nika: v1',
      'workflow: probe',
      'tasks:',
      '  a:',
      '    exec: echo hi',
      '    with:',
      '      for_each: phantom',
    ].join('\n'));
    expect(facts.get('a')?.forEachSource).toBeUndefined();
  });
});
