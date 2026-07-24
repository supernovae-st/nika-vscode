import { describe, it, expect } from 'vitest';
import { parseHelpCommands, buildCapabilities, describeCapabilities } from '../core/capabilities';
import { scanIslands, scanRefs, refAt, completionContextAt } from '../core/expr';
import { scanSecrets } from '../core/credentialLint';
import { parseFix, applyPermitsFix, insertPermitsBlock } from '../core/permitsEdit';
import { parseRichWorkflow, parseWorkflowTasks, taskAtLine } from '../workflowParser';

// ─── capabilities ────────────────────────────────────────────────────────────

const CLAP_HELP = `nika operator surface (WIP seed)

Usage: nika-cli <COMMAND>

Commands:
  check        Static pre-flight: the ADR-092 ladder (audit BEFORE run)
  inspect      Static anatomy: tasks · verbs · cost · permits — and the ONE graph projector
  explain      Teach one error code (cause · category · fix-form)
  spec         The embedded spec identity
  schema       The embedded JSON Schema
  examples     Browse the embedded examples
  new          Instantiate an embedded template skeleton
  completions  Generate shell completions from the clap tree (spec §9)
  trace        Read the flight recorder (replay or summarize a run)
  help         Print this message or the help of the given subcommand(s)

Options:
  -h, --help     Print help
  -V, --version  Print version
`;

describe('capabilities', () => {
  it('parses the clap Commands: section, excluding help', () => {
    const cmds = parseHelpCommands(CLAP_HELP);
    expect(cmds.has('check')).toBe(true);
    expect(cmds.has('trace')).toBe(true);
    expect(cmds.has('completions')).toBe(true);
    expect(cmds.has('help')).toBe(false);
    expect(cmds.has('run')).toBe(false);
    expect(cmds.size).toBe(9);
  });

  it('builds the gate set — run/lsp/mcp stay off until the engine ships them', () => {
    const caps = buildCapabilities(CLAP_HELP, 'nika-cli 0.80.0\n');
    expect(caps.check).toBe(true);
    expect(caps.inspect).toBe(true);
    expect(caps.newTemplate).toBe(true);
    expect(caps.run).toBe(false);
    expect(caps.lsp).toBe(false);
    expect(caps.mcp).toBe(false);
    expect(caps.test).toBe(false); // golden testing ships with the 0.94 line
    expect(caps.version).toBe('nika-cli 0.80.0');
    expect(describeCapabilities(caps)).toContain('static suite');
  });

  it('lights golden testing the day --help lists `test`', () => {
    const withTest = CLAP_HELP.replace(
      '  trace ',
      '  test         Golden-test a workflow under the mock provider\n  trace ',
    );
    const caps = buildCapabilities(withTest, 'nika 0.94.0');
    expect(caps.test).toBe(true);
  });

  it('lights run/lsp/mcp up the day --help lists them', () => {
    const future = CLAP_HELP.replace(
      '  trace ',
      '  run          Run a workflow\n  lsp          Language server\n  mcp          MCP server\n  trace ',
    );
    const caps = buildCapabilities(future, 'nika 0.81.0');
    expect(caps.run).toBe(true);
    expect(caps.lsp).toBe(true);
    expect(caps.mcp).toBe(true);
    expect(describeCapabilities(caps)).toContain('full surface');
  });

  it('handles a missing binary gracefully', () => {
    const caps = buildCapabilities('', '');
    expect(caps.commands.size).toBe(0);
    expect(describeCapabilities(caps)).toBe('no binary');
  });

  it('never promotes wrapped description lines into phantom commands', () => {
    const wrapped = CLAP_HELP.replace(
      '  inspect      Static anatomy: tasks · verbs · cost · permits — and the ONE graph projector\n',
      '  inspect      Static anatomy: tasks · verbs ·\n               cost and permits boundary audit\n',
    );
    const cmds = parseHelpCommands(wrapped);
    expect(cmds.has('inspect')).toBe(true);
    expect(cmds.has('cost')).toBe(false); // the wrapped-line first word
    expect(cmds.size).toBe(9);
  });

  // ─── stdin dash (engine #190 · `nika check - --json`) ─────────────────────

  const CHECK_HELP_DASH = `Static pre-flight: the ADR-092 ladder (audit BEFORE run)

Usage: nika-cli check [OPTIONS] <FILE>

Arguments:
  <FILE>  Workflow file (\`*.nika.yaml\`) · \`-\` reads stdin

Options:
      --json  Emit the machine-readable report (never coloured)
  -h, --help  Print help
`;

  const CHECK_HELP_PRE_DASH = CHECK_HELP_DASH.replace(' · `-` reads stdin', '');

  it('lights stdinDash when check --help documents the dash', () => {
    const caps = buildCapabilities(CLAP_HELP, 'nika-cli 0.93.1', CHECK_HELP_DASH);
    expect(caps.stdinDash).toBe(true);
  });

  it('keeps stdinDash off on a pre-dash binary — the tmp fallback stays', () => {
    const caps = buildCapabilities(CLAP_HELP, 'nika-cli 0.93.1', CHECK_HELP_PRE_DASH);
    expect(caps.stdinDash).toBe(false);
  });

  it('keeps stdinDash off when the probe itself failed (empty output)', () => {
    const caps = buildCapabilities(CLAP_HELP, 'nika-cli 0.93.1');
    expect(caps.stdinDash).toBe(false);
  });

  // `check --fix` rides the same discriminator surface: its own flag
  // line in `check --help` (captured verbatim from the released 0.105).
  const CHECK_HELP_FIX = `${CHECK_HELP_DASH}
      --fix   Apply the machine-applicable rename repairs (typed did-you-mean suggestions only: fields · tools · args), rewrite the file, and re-audit
`;

  it('lights checkFix when check --help documents --fix', () => {
    const caps = buildCapabilities(CLAP_HELP, 'nika-cli 0.105.0', CHECK_HELP_FIX);
    expect(caps.checkFix).toBe(true);
  });

  it('keeps checkFix off on a pre-fix binary — the door stays honest', () => {
    const caps = buildCapabilities(CLAP_HELP, 'nika-cli 0.93.1', CHECK_HELP_DASH);
    expect(caps.checkFix).toBe(false);
  });

  // Captured verbatim from the engine #298 build (2026-07-08) — the file
  // form's own doc line is the discriminator, same law as stdinDash.
  const EXPLAIN_HELP_FILE_FORM = `Teach one error code (cause · category · fix-form) — or narrate a workflow FILE: what it does · the waves · cost before a token is spent · what it touches · how to run it

Usage: nika explain [OPTIONS] <CODE>

Arguments:
  <CODE>
          An error code (\`NIKA-440\` · bare \`440\`) or a workflow file path (\`*.nika.yaml\` · \`-\` reads stdin)

Options:
      --json  File form only: emit the versioned machine twin
  -h, --help  Print help
`;

  // Captured verbatim from the released 0.97.0 — code-teacher only.
  const EXPLAIN_HELP_CODE_ONLY = `Teach one error code (cause · category · fix-form)

Usage: nika explain [OPTIONS] <CODE>

Arguments:
  <CODE>
          The code (\`NIKA-440\` or bare \`440\`)
`;

  it('lights explainFile when explain --help documents the file form', () => {
    const caps = buildCapabilities(CLAP_HELP, 'nika-cli 0.98.0', '', EXPLAIN_HELP_FILE_FORM);
    expect(caps.explainFile).toBe(true);
  });

  it('keeps explainFile off on the released code-only explain (0.97 line)', () => {
    const caps = buildCapabilities(CLAP_HELP, 'nika-cli 0.97.0', '', EXPLAIN_HELP_CODE_ONLY);
    expect(caps.explainFile).toBe(false);
  });

  it('keeps explainFile off when the probe itself failed (empty output)', () => {
    const caps = buildCapabilities(CLAP_HELP, 'nika-cli 0.98.0');
    expect(caps.explainFile).toBe(false);
  });

  it('never lights stdinDash without check itself', () => {
    const noCheck = CLAP_HELP.replace(/^ {2}check.*\n/m, '');
    const caps = buildCapabilities(noCheck, 'nika-cli 0.93.1', CHECK_HELP_DASH);
    expect(caps.stdinDash).toBe(false);
  });
});

// ─── expr ────────────────────────────────────────────────────────────────────

describe('expr', () => {
  const Y = 'prompt: "Summarize ${{ tasks.fetch_page.output }} for ${{ with.aud }}"';

  it('scans islands with exact offsets', () => {
    const islands = scanIslands(Y);
    expect(islands).toHaveLength(2);
    expect(Y.slice(islands[0].start, islands[0].end)).toBe('${{ tasks.fetch_page.output }}');
    expect(islands[0].unclosed).toBe(false);
  });

  it('tolerates an unclosed trailing island (mid-typing)', () => {
    const islands = scanIslands('x: ${{ tasks.fe');
    expect(islands).toHaveLength(1);
    expect(islands[0].unclosed).toBe(true);
  });

  it('extracts root-anchored refs with paths', () => {
    const refs = scanRefs(Y);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ root: 'tasks', path: ['fetch_page', 'output'] });
    expect(refs[1]).toMatchObject({ root: 'with', path: ['aud'] });
  });

  it('ignores refs outside islands', () => {
    expect(scanRefs('after: { fetch: succeeded }')).toHaveLength(0);
  });

  it('resolves the ref under the cursor', () => {
    const offset = Y.indexOf('fetch_page') + 3;
    const ref = refAt(Y, offset);
    expect(ref?.root).toBe('tasks');
    expect(ref?.path[0]).toBe('fetch_page');
  });

  it('classifies completion contexts', () => {
    const root = completionContextAt('p: ${{ ta', 9);
    expect(root).toMatchObject({ kind: 'root', partial: 'ta' });

    const text = 'p: ${{ tasks. }}';
    const member = completionContextAt(text, text.indexOf('.') + 1);
    expect(member).toMatchObject({ kind: 'member', root: 'tasks', path: [], partial: '' });

    const deep = 'p: ${{ tasks.fetch.ou';
    const deepCtx = completionContextAt(deep, deep.length);
    expect(deepCtx).toMatchObject({ kind: 'member', root: 'tasks', path: ['fetch'], partial: 'ou' });

    expect(completionContextAt('prompt: hello', 5)).toBeUndefined();
  });
});

// ─── secretsScan ─────────────────────────────────────────────────────────────

describe('secretsScan', () => {
  it('flags literal vendor credentials with an env suggestion', () => {
    const yaml = [
      'tasks:',
      '  ship:',
      '    infer:',
      '      api_key: sk-ant-abc123def456ghi789jkl012',
    ].join('\n');
    const findings = scanSecrets(yaml);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('anthropic-api-key');
    expect(findings[0].line).toBe(3);
    expect(findings[0].envVar).toBe('API_KEY');
  });

  it('stays silent on templated values, comments, and prose', () => {
    const clean = [
      '# sk-ant-abc123def456ghi789jkl012 (docs example)',
      'key: ${{ env.ANTHROPIC_API_KEY }}',
      'note: "ask-antoine about it"',
    ].join('\n');
    expect(scanSecrets(clean)).toHaveLength(0);
  });

  it('catches AWS + GitHub shapes with vendor default env names', () => {
    const yaml = 'cmd: deploy --token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345\nid: AKIAIOSFODNN7EXAMPLE'; // secrets-scan:allow (scanner fixture · AWS doc example key)
    const findings = scanSecrets(yaml);
    expect(findings.map((f) => f.kind).sort()).toEqual(['aws-access-key-id', 'github-token']);
  });

  it('rejects vendor prefixes embedded in longer words', () => {
    const yaml = [
      'note: risk-AbCdEf012345678901234567890123456789', // secrets-scan:allow (scanner fixture · deliberately NOT an sk- key)
      'word: lighp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345',    // not a ghp_ token
    ].join('\n');
    expect(scanSecrets(yaml)).toHaveLength(0);
  });
});

// ─── permitsEdit ─────────────────────────────────────────────────────────────

describe('permitsEdit', () => {
  it('parses the ONE fix grammar form', () => {
    const fix = parseFix('add "example.com" to permits.net.hosts');
    expect(fix).toEqual({ value: 'example.com', path: ['net', 'hosts'] });
    expect(parseFix('remove "x" from permits.net')).toBeUndefined();
    expect(parseFix('add "a\\"b" to permits.fs.read')).toEqual({ value: 'a"b', path: ['fs', 'read'] });
  });

  it('appends to an existing nested list', () => {
    const doc = ['nika: v1', 'permits:', '  net:', '    hosts:', '      - "a.com"', 'tasks: []'].join('\n');
    const out = applyPermitsFix(doc, { value: 'b.com', path: ['net', 'hosts'] })!;
    const lines = out.split('\n');
    expect(lines[4]).toBe('      - "a.com"');
    expect(lines[5]).toBe('      - "b.com"');
    expect(lines[6]).toBe('tasks: []');
  });

  it('creates missing sub-paths inside an existing boundary', () => {
    const doc = ['permits:', '  net:', '    hosts:', '      - "a.com"', ''].join('\n');
    const out = applyPermitsFix(doc, { value: '/tmp/**', path: ['fs', 'write'] })!;
    expect(out).toContain('  fs:');
    expect(out).toContain('    write:');
    expect(out).toContain('      - "/tmp/**"');
    // The existing net block is untouched.
    expect(out).toContain('      - "a.com"');
  });

  it('creates the whole boundary when absent (default-deny once present)', () => {
    const doc = 'nika: v1\nworkflow:\n  id: t\ntasks: []\n';
    const out = applyPermitsFix(doc, { value: 'example.com', path: ['net', 'hosts'] })!;
    expect(out).toContain('\npermits:\n  net:\n    hosts:\n      - "example.com"');
  });

  it('returns undefined when the value is already present (idempotent)', () => {
    const doc = ['permits:', '  net:', '    hosts:', '      - "a.com"'].join('\n');
    expect(applyPermitsFix(doc, { value: 'a.com', path: ['net', 'hosts'] })).toBeUndefined();
  });

  it('edits flow-style lines in place — the --infer-permits shape', () => {
    const doc = [
      'nika: v1',
      'permits:',
      '  net: { http: ["example.com"] }',
      '  exec: false',
      '  tools: ["nika:fetch"]',
      'tasks: []',
    ].join('\n');

    const net = applyPermitsFix(doc, { value: 'api.com', path: ['net', 'http'] })!;
    expect(net).toContain('  net: { http: ["example.com", "api.com"] }');
    expect(net.split('\n')).toHaveLength(doc.split('\n').length); // in place · no splice

    const tools = applyPermitsFix(doc, { value: 'nika:read', path: ['tools'] })!;
    expect(tools).toContain('  tools: ["nika:fetch", "nika:read"]');

    // Idempotent on flow lines too.
    expect(applyPermitsFix(doc, { value: 'example.com', path: ['net', 'http'] })).toBeUndefined();
    // Not a list (exec: false) → refuse rather than corrupt.
    expect(applyPermitsFix(doc, { value: 'x', path: ['exec'] })).toBeUndefined();
  });

  it('fills an empty flow list', () => {
    const doc = 'permits:\n  net: { http: [] }\n';
    const out = applyPermitsFix(doc, { value: 'a.com', path: ['net', 'http'] })!;
    expect(out).toContain('  net: { http: ["a.com"] }');
  });

  it('handles a ] inside single-quoted flow values', () => {
    const doc = "permits:\n  net: { http: ['a].com'] }\n";
    const out = applyPermitsFix(doc, { value: 'b.com', path: ['net', 'http'] })!;
    expect(out).toContain(`net: { http: ['a].com', "b.com"] }`);
  });

  it('replaces or appends the full inferred boundary', () => {
    const doc = 'nika: v1\npermits:\n  net:\n    hosts:\n      - "old.com"\ntasks: []';
    const out = insertPermitsBlock(doc, 'permits:\n  net:\n    hosts:\n    - "new.com"\n');
    expect(out).toContain('new.com');
    expect(out).not.toContain('old.com');
    expect(out).toContain('tasks: []');

    const fresh = insertPermitsBlock('nika: v1\ntasks: []\n', 'permits:\n  fs: {}');
    expect(fresh).toContain('\npermits:\n  fs: {}');
  });
});

// ─── rich workflow parse ─────────────────────────────────────────────────────

describe('parseRichWorkflow', () => {
  const YAML = [
    'nika: v1',
    'workflow:',
    '  id: audit',
    'model: anthropic/claude-sonnet-4-6',
    'secrets:',
    '  github_token: required',
    'vars:',
    '  depth: 3',
    '',
    'tasks:',
    '  fetch_page:',
    '    invoke:',
    '      tool: nika:fetch',
    '',
    '  summarize:',
    '    with:',
    '      page: ${{ tasks.fetch_page.output }}',
    '    infer:',
    '      model: mock/echo',
    '      prompt: "sum ${{ with.page }}"',
    '',
    '  ship:',
    '    after:',
    '      summarize: succeeded',
    '    exec:',
    '      command: ["echo", "done"]',
    '',
    'permits:',
    '  net:',
    '    hosts: []',
  ].join('\n');

  it('captures envelope facts + declared keys', () => {
    const wf = parseRichWorkflow(YAML);
    expect(wf.name).toBe('audit');
    expect(wf.defaultModel).toBe('anthropic/claude-sonnet-4-6');
    expect(wf.secretsKeys).toEqual(['github_token']);
    expect(wf.varsKeys).toEqual(['depth']);
    expect(wf.permitsLine).toBe(YAML.split('\n').findIndex((l) => l === 'permits:'));
  });

  it('captures tasks with spans, verbs, boundary edges and with-aliases', () => {
    const wf = parseRichWorkflow(YAML);
    expect(wf.tasks.map((t) => t.id)).toEqual(['fetch_page', 'summarize', 'ship']);

    const sum = wf.tasks[1];
    expect(sum.verb).toBe('infer');
    // The binding IS the edge — the with: ref makes fetch_page a producer.
    expect(sum.withRefs).toEqual([{ alias: 'page', from: 'fetch_page', path: 'output' }]);
    expect(sum.producers).toEqual(['fetch_page']);
    expect(sum.withAliases).toEqual(['page']);
    expect(sum.model).toBe('mock/echo');

    const ship = wf.tasks[2];
    expect(ship.verb).toBe('exec');
    expect(ship.after).toEqual({ summarize: 'succeeded' });
    expect(ship.producers).toEqual(['summarize']);

    const fetch = wf.tasks[0];
    expect(fetch.verb).toBe('invoke');
    expect(fetch.tool).toBe('nika:fetch');
    expect(fetch.endLine).toBeLessThan(sum.line);
  });

  it('parses the inline flow forms the spec teaches (with: {…} · after: {…})', () => {
    const inline = [
      'tasks:',
      '  a:',
      '    infer: { prompt: "First" }',
      '  b:',
      '    with: { prev: ${{ tasks.a.output }}, style: "concise" }',
      '    after: { a: succeeded }',
      '    infer: { prompt: "Second · ${{ with.prev }}" }',
    ].join('\n');
    const wf = parseRichWorkflow(inline);
    const b = wf.tasks.find((t) => t.id === 'b')!;
    expect(b.withAliases).toEqual(['prev', 'style']);
    expect(b.withRefs).toEqual([{ alias: 'prev', from: 'a', path: 'output' }]);
    expect(b.after).toEqual({ a: 'succeeded' });
    expect(b.producers).toEqual(['a']); // deduped across both doors
  });

  it('collects on_error.recover refs as recovery reads (never producers)', () => {
    const doc = [
      'tasks:',
      '  cache:',
      '    exec: { command: ["cat", "cache.json"] }',
      '  live:',
      '    on_error:',
      '      recover: ${{ tasks.cache.output }}',
      '    exec: { command: ["fetch-live"] }',
    ].join('\n');
    const wf = parseRichWorkflow(doc);
    const live = wf.tasks.find((t) => t.id === 'live')!;
    expect(live.recoverRefs).toEqual(['cache']);
    expect(live.producers).toEqual([]); // recovery parks — never orders
  });

  it('resolves the enclosing task for a line', () => {
    const wf = parseRichWorkflow(YAML);
    const promptLine = YAML.split('\n').findIndex((l) => l.includes('prompt:'));
    expect(taskAtLine(wf, promptLine)?.id).toBe('summarize');
    expect(taskAtLine(wf, 0)).toBeUndefined();
  });

  it('does not promote nested deeper keys into phantom tasks', () => {
    const nested = [
      'tasks:',
      '  real_task:',
      '    invoke:',
      '      tool: nika:read',
      '      args:',
      '        items:',
      '          nested_option:',
      '            value: 1',
      '  second_task:',
      '    exec:',
      '      command: echo ok',
    ].join('\n');
    const wf = parseRichWorkflow(nested);
    expect(wf.tasks.map((t) => t.id)).toEqual(['real_task', 'second_task']);
    // The legacy tree-view parser obeys the same canonical column.
    const flat = parseWorkflowTasks(nested);
    expect(flat.map((t) => t.id)).toEqual(['real_task', 'second_task']);
  });

  it('keeps after entries separated by blank lines', () => {
    const spaced = [
      'tasks:',
      '  a:',
      '    exec:',
      '      command: ["echo", "a"]',
      '  b:',
      '    after:',
      '      a: succeeded',
      '',
      '      c: terminal',
      '    exec:',
      '      command: ["echo", "b"]',
      '  c:',
      '    exec:',
      '      command: ["echo", "c"]',
    ].join('\n');
    const wf = parseRichWorkflow(spaced);
    expect(wf.tasks.find((t) => t.id === 'b')?.after).toEqual({ a: 'succeeded', c: 'terminal' });
  });
});
