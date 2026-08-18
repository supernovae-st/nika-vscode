import { describe, expect, it } from 'vitest';
import { collectBodyFacts } from '../core/bodyFacts';

const WF = `nika: probe
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
    after: { gather: success }
  jq_step:
    invoke:
      tool: "nika:jq"
      args:
        expr: ".items | length"
        input: "\${{ tasks.gather.output }}"
    after: { gather: success }
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

const POLICY_WF = `nika: policy-probe
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
    extract:
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

describe('collectBodyFacts · policy facts (retry · timeout · on_error · extract)', () => {
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

  it('collects the named extract: bindings the task produces (the old output: block is dead)', () => {
    expect(facts.get('guarded')?.outputNames).toEqual(['summary', 'title']);
    // A pre-0.109 `output:` block is refused by the engine (NIKA-PARSE-005
    // · renamed extract:) — the fallback reader does not resurrect it.
    const dead = collectBodyFacts(POLICY_WF.replace('    extract:\n', '    output:\n'));
    expect(dead.get('guarded')?.outputNames).toBeUndefined();
  });

  it('reads flow forms — retry: {max_attempts} · on_error: {recover}', () => {
    expect(facts.get('flow_forms')?.retryMax).toBe(2);
    expect(facts.get('flow_forms')?.onError).toBe('recover');
  });

  it('on_error knows two actions — fail_workflow is not one (failure is the default · nika 0.109)', () => {
    // The engine refuses `fail_workflow` (NIKA-PARSE-005 · « the fields
    // here: recover · skip · on_codes »); a reader that still surfaced it
    // would paint a chip for a form no file can carry.
    const dead = collectBodyFacts([
      'nika: dead-action',
      'model: mock/echo',
      'tasks:',
      '  a:',
      '    exec: { command: ["echo"] }',
      '    on_error: { fail_workflow: true }',
      '  b:',
      '    exec: { command: ["echo"] }',
      '    on_error:',
      '      fail_workflow: true',
    ].join('\n'));
    expect(dead.get('a')?.onError).toBeUndefined();
    expect(dead.get('b')?.onError).toBeUndefined();
  });

  it('a with: alias named timeout never impersonates the task field', () => {
    expect(facts.get('decoy')?.timeout).toBeUndefined();
  });
});

describe('collectBodyFacts · cleanup is a task, not a block (spec 03 §unwind · nika 0.109)', () => {
  it('an on_finally: block is dead — the fallback reader counts nothing from it', () => {
    // The engine refuses it (NIKA-PARSE-005 · « cleanup is a TASK now,
    // joined by an unwind edge »); the cleanup story rides the graph
    // (a `finally` node · the producer's cleanupTasks), never a chip
    // read from a dead block.
    const facts = collectBodyFacts([
      'nika: dead-block',
      'tasks:',
      '  process:',
      '    exec: ./process.sh',
      '    on_finally:',
      '      - exec:',
      '          command: ["rm", "-f", "/tmp/x"]',
      '  plain:',
      '    exec: echo hi',
    ].join('\n'));
    // No fact class carries the dead block: nothing named finally, no count.
    expect(JSON.stringify([...facts.values()])).not.toContain('finally');
    expect(facts.get('plain')).toBeUndefined();
  });
});

describe('collectBodyFacts · infer senses (spec 02 — thinking · vision)', () => {
  it('reads the thinking budget and counts vision sources', () => {
    const facts = collectBodyFacts([
      'nika: probe',
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
      'nika: probe',
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
  it('reads the collection and the knobs from the for_each BLOCK the engine admits (flow + nested)', () => {
    // 0.109: `for_each: { items: "…", max_parallel: N, fail_fast: B }` — the
    // knobs live INSIDE the block (spec 03); the pre-0.109 task-level
    // spelling below stays readable for old files.
    const flow = collectBodyFacts([
      'nika: probe',
      'tasks:',
      '  crawl:',
      '    for_each: { items: "${{ with.pages }}", max_parallel: 4, fail_fast: false }',
      '    invoke:',
      '      tool: nika:fetch',
      '      args:',
      '        url: ${{ item }}',
    ].join('\n')).get('crawl');
    expect(flow?.forEachSource).toBe('${{ with.pages }}');
    expect(flow?.maxParallel).toBe(4);
    expect(flow?.failFast).toBe(false);
    const nested = collectBodyFacts([
      'nika: probe',
      'tasks:',
      '  crawl:',
      '    for_each:',
      '      items: ${{ with.pages }}',
      '      max_parallel: 2',
      '    invoke:',
      '      tool: nika:fetch',
    ].join('\n')).get('crawl');
    expect(nested?.forEachSource).toBe('${{ with.pages }}');
    expect(nested?.maxParallel).toBe(2);
  });

  it('reads the cap and the per-item idiom at task level only', () => {
    const facts = collectBodyFacts([
      'nika: probe',
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
      'nika: probe',
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
      'nika: probe',
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
      'nika: probe',
      'tasks:',
      '  fan:',
      '    for_each: "${{ tasks.list.output }}"',
      '    exec: echo ${{ item }}',
    ].join('\n'));
    expect(facts.get('fan')?.forEachSource).toBe('${{ tasks.list.output }}');
  });

  it('a with-alias named for_each cannot impersonate the construct', () => {
    const facts = collectBodyFacts([
      'nika: probe',
      'tasks:',
      '  a:',
      '    exec: echo hi',
      '    with:',
      '      for_each: phantom',
    ].join('\n'));
    expect(facts.get('a')?.forEachSource).toBeUndefined();
  });
});

const MEDIA_WF = `nika: media_probe
model: mock/echo
tasks:
  stylize:
    invoke:
      tool: "nika:image_fx"
      args:
        input: ./out/hero-1.png
        ops:
          - dither:
              mode: bayer
          - duotone:
              dark: "#0a0f1e"
              light: "#8db4ff"
        out: ./out/hero-lofi.png
  chartify:
    invoke:
      tool: "nika:chart"
      args:
        data: "\${{ stats.output }}"
        chart:
          type: bar
          x: author
        out: ./out/velocity.svg
  chartlean:
    invoke:
      tool: "nika:chart"
      args:
        data: "\${{ stats.output }}"
        out: ./out/velocity.svg
        chart:
          type: heatmap
  plainlist:
    invoke:
      tool: "nika:prompt"
      args:
        message: pick one
        choices:
          - "yes"
          - "no"
`;

describe('collectBodyFacts · media args (CI-2 — the recipe is the soul)', () => {
  const facts = collectBodyFacts(MEDIA_WF);

  it('an ops LIST serializes its op names as a chain pair', () => {
    const a = facts.get('stylize')?.args ?? '';
    expect(a).toContain('input: ./out/hero-1.png');
    expect(a).toContain('ops: dither → duotone');
  });

  it('an empty MAP parent spends no pair — the shape fact survives ≤3', () => {
    const a = facts.get('chartify')?.args ?? '';
    // The freed slot is what lets `type: bar` through at all (the old
    // `chart: ` pair would have eaten it); `out:` past the budget is a
    // STATED gap (the frame skips its caption, never guesses one).
    expect(a).toBe('data: ${{ stats.output }} · type: bar · x: author');
  });

  it('author order can carry all three soul facts (data · out · type)', () => {
    expect(facts.get('chartlean')?.args).toBe(
      'data: ${{ stats.output }} · out: ./out/velocity.svg · type: heatmap',
    );
  });

  it('a plain string list is not a chain — no half-truth pair', () => {
    const a = facts.get('plainlist')?.args ?? '';
    expect(a).toContain('message: pick one');
    expect(a).not.toContain('choices: yes');
  });
});
