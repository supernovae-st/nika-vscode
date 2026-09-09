import { describe, it, expect } from 'vitest';
import {
  type CheckReport,
  graphDocToDag,
  isGraphDoc,
  parseCatalogModels,
  parseCheckReport,
  parseToolMeta,
  collectFindings,
  countReportFindings,
  byteOffsetToPosition,
  inputsRead,
  inputsRequired,
  topoWaves,
  type GraphDoc,
} from '../core/cliContract';

const DOC: GraphDoc = {
  graph_format: 3,
  workflow: 'audit-site',
  nodes: [
    { id: 'fetch_page', kind: 'task', verb: 'invoke', tool: 'nika:fetch', when: 'true', permits: [] },
    {
      id: 'summarize',
      kind: 'task',
      verb: 'infer',
      model: 'anthropic/claude-sonnet-4-6',
      when: null,
      cost_interval: [0.01, 0.42],
      permits: [],
    },
    {
      id: 'fanout',
      kind: 'task',
      verb: 'exec',
      when: '${{ size(with.summary) > 0 }}',
      fan_out: { kind: 'list', count: 3 },
      permits: [],
    },
    // A cleanup unit (format 3): attached to fanout by its unwind edge —
    // never a wave member, never a task in the plan.
    { id: 'drop_temp', kind: 'finally', verb: 'exec', when: null, permits: ['exec: /bin/rm'] },
  ],
  edges: [
    { from: 'fetch_page', to: 'summarize', kind: 'value', binding: 'page' },
    { from: 'summarize', to: 'fanout', kind: 'control', predicate: 'success' },
    { from: 'summarize', to: 'fanout', kind: 'value', binding: 'summary' },
    { from: 'fetch_page', to: 'fanout', kind: 'recovery' },
    { from: 'fanout', to: 'drop_temp', kind: 'finally', predicate: 'unwind' },
  ],
};

describe('graphDocToDag', () => {
  it('adapts the CLI GraphDoc into the webview DagGraph — typed edges carried', () => {
    const dag = graphDocToDag(DOC);
    expect(dag.workflowName).toBe('audit-site');
    expect(dag.nodes).toHaveLength(4);
    expect(dag.edges).toHaveLength(5);

    const byId = new Map(dag.nodes.map((n) => [n.id, n]));
    expect(byId.get('summarize')?.producers).toEqual(['fetch_page']);
    // Recovery PARKS — fetch_page never becomes a scheduling producer of
    // fanout through it; the control + value pair dedupes to one producer.
    expect(byId.get('fanout')?.producers).toEqual(['summarize']);
    expect(byId.get('fetch_page')?.producers).toEqual([]);

    // Two edges may share endpoints (control + value is the spec's own
    // gate-tightening pairing) — the kind qualifies the id, nothing drops.
    const ids = dag.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(5);
    const ctl = dag.edges.find((e) => e.kind === 'control')!;
    expect(ctl.predicate).toBe('success');
    expect(ctl.label).toBeUndefined();
    const val = dag.edges.find((e) => e.kind === 'value' && e.target === 'fanout')!;
    expect(val.label).toBe('summary');
    const rec = dag.edges.find((e) => e.kind === 'recovery')!;
    expect(rec.source).toBe('fetch_page');

    // Every node starts pending — the static graph never carries run state.
    for (const n of dag.nodes) { expect(n.status).toBe('pending'); }
  });

  it('derives provider from the combined model form', () => {
    const dag = graphDocToDag(DOC);
    const n = dag.nodes.find((x) => x.id === 'summarize');
    expect(n?.provider).toBe('anthropic');
    expect(n?.model).toBe('anthropic/claude-sonnet-4-6');
    expect(n?.costMin).toBe(0.01);
    expect(n?.costMax).toBe(0.42);
  });

  it('drops the implicit "true" gate but keeps real conditions', () => {
    const dag = graphDocToDag(DOC);
    expect(dag.nodes.find((x) => x.id === 'fetch_page')?.when).toBeUndefined();
    expect(dag.nodes.find((x) => x.id === 'fanout')?.when).toContain('with.summary');
    expect(dag.nodes.find((x) => x.id === 'fanout')?.fanOutCount).toBe(3);
  });

  it('keeps invoke tool ids', () => {
    const dag = graphDocToDag(DOC);
    expect(dag.nodes.find((x) => x.id === 'fetch_page')?.tool).toBe('nika:fetch');
  });

  it('guards the envelope shape — and REFUSES formats 1 and 2 (no fallback)', () => {
    expect(isGraphDoc(DOC)).toBe(true);
    expect(isGraphDoc({ nodes: [] })).toBe(false);
    expect(isGraphDoc(null)).toBe(false);
    // A v1 reader assuming every edge orders would MIS-READ an
    // observation edge; a v2 reader assuming every node is a task would
    // SCHEDULE a cleanup unit — the number moved for those reasons, and a
    // reader refuses what it does not speak rather than guess.
    expect(isGraphDoc({ graph_format: 1, workflow: 'w', nodes: [], edges: [] })).toBe(false);
    expect(isGraphDoc({ graph_format: 2, workflow: 'w', nodes: [], edges: [] })).toBe(false);
    expect(isGraphDoc({ graph_format: 3, workflow: 'w', nodes: [], edges: [] })).toBe(true);
    expect(isGraphDoc({ graph_format: 4, workflow: 'w', nodes: [], edges: [] })).toBe(false);
    // Within 3 every node carries `kind` — a document that omits it is
    // not format 3, whatever its number says (that omission MEANS
    // « everything is a task », the format-2 falsehood).
    expect(isGraphDoc({ graph_format: 3, workflow: 'w', nodes: [{ id: 'a', verb: 'exec' }], edges: [] })).toBe(false);
  });

  it('a cleanup unit is an attachment: no producers, its anchors named, out of every wave', () => {
    const dag = graphDocToDag(DOC);
    const byId = new Map(dag.nodes.map((n) => [n.id, n]));
    const cleanup = byId.get('drop_temp')!;
    expect(cleanup.kind).toBe('finally');
    expect(cleanup.producers).toEqual([]);
    expect(cleanup.attachedTo).toEqual(['fanout']);
    expect(byId.get('fanout')?.kind).toBe('task');
    // The engine's PLAN rung says « 2 waves · 2 tasks » for two tasks +
    // one cleanup unit; the client's waves mirror it — the unit is in none.
    const waves = topoWaves(dag.nodes, dag.edges.filter((e) => e.kind !== 'recovery' && e.kind !== 'finally'));
    expect(waves.flat()).not.toContain('drop_temp');
    expect(waves.flat().sort()).toEqual(['fanout', 'fetch_page', 'summarize']);
  });

  it('the unwind attachment reaches the canvas as a finally edge wearing its predicate', () => {
    // The cleanup card has exactly ONE wire — the wire must say what it
    // is (kind) and what it means (`unwind`), or the canvas draws a data
    // wire that lies. The engine emits `predicate: "unwind"` on the finally
    // edge (observed on 0.109 · `inspect --format json`); the adapter keeps
    // it, the webview labels the wire with it.
    const dag = graphDocToDag(DOC);
    const fin = dag.edges.find((e) => e.kind === 'finally')!;
    expect(fin).toBeDefined();
    expect(fin.source).toBe('fanout');
    expect(fin.target).toBe('drop_temp');
    expect(fin.predicate).toBe('unwind');
    expect(fin.label).toBeUndefined();
    expect(fin.id).toBe('fanout->drop_temp:finally:unwind');
    // The producer side of the attachment: its card names the units it
    // unwinds into (the chip that replaced the dead on_finally count).
    const byId = new Map(dag.nodes.map((n) => [n.id, n]));
    expect(byId.get('fanout')?.cleanupTasks).toEqual(['drop_temp']);
    expect(byId.get('summarize')?.cleanupTasks).toBeUndefined();
    expect(byId.get('drop_temp')?.cleanupTasks).toBeUndefined();
  });
});

describe('parseCheckReport + collectFindings', () => {
  const REPORT = JSON.stringify({
    report_version: 1,
    clean: false,
    conformance: [
      { code: 'NIKA-DAG-002', message: 'cycle detected: a → b → a', span: { start: 10, end: 20 } },
    ],
    waves: [],
    cost: { tasks: [{ task: 'sum', usd: 0.4, min_path_usd: 0.1 }], bounded_total_usd: 0.4, min_path_total_usd: 0.1 },
    secret_leaks: [{ task: 'ship', secret: 'API_KEY', sink: 'exec', trace: 'via with.key' }],
    secret_egresses: [{ output: 'result', secret: 'API_KEY', trace: 'outputs.result' }],
    capability_escapes: [
      { task: 'ship', category: 'net', detail: 'fetch to example.com', fix: 'add "example.com" to permits.net.hosts' },
    ],
    schema_findings: [{ site: 'tasks.use.prompt', reference: 'tasks.sum.output.titel', target: 'tasks.sum.schema' }],
    unknown_tools: [{ task: 'ship', tool: 'nika:fetchh', suggestion: 'nika:fetch' }],
    unknown_args: [{ task: 'sum', tool: 'nika:jq', arg: 'data', suggestion: 'input' }],
    missing_args: [{ task: 'ship', tool: 'nika:log', arg: 'message' }],
    gate_findings: [
      { task: 'never', kind: 'dead_task', detail: 'gate is unsatisfiable', fix: 'when: always', span: { start: 30, end: 42 } },
    ],
    schema_lints: [{ task: 'sum', path: 'schema.required', detail: 'required name not in properties' }],
    hints: [{ kind: 'pin-max-tokens', task: 'sum', advice: 'set max_tokens to bound the ceiling' }],
  });

  it('parses the JSON report envelope', () => {
    const report = parseCheckReport(REPORT);
    expect(report).toBeDefined();
    expect(report?.report_version).toBe(1);
    expect(report?.clean).toBe(false);
    expect(report?.cost.bounded_total_usd).toBe(0.4);
  });

  it('rejects non-report JSON and garbage', () => {
    expect(parseCheckReport('{"foo": 1}')).toBeUndefined();
    expect(parseCheckReport('not json')).toBeUndefined();
  });

  it('flattens every finding family with the right severity', () => {
    const report = parseCheckReport(REPORT);
    const findings = collectFindings(report!);
    expect(findings).toHaveLength(11);

    const bySource = new Map(findings.map((f) => [f.source, f]));
    expect(bySource.get('conformance')?.code).toBe('NIKA-DAG-002');
    expect(bySource.get('conformance')?.span).toEqual({ start: 10, end: 20 });
    expect(bySource.get('capability-escape')?.fix).toBe('add "example.com" to permits.net.hosts');
    expect(bySource.get('unknown-tool')?.suggestion).toBe('nika:fetch');
    expect(bySource.get('hint')?.severity).toBe('info');

    // The three families the engine counts in `clean` (check/mod.rs
    // is_clean) — a missing required arg fails `nika check`, so a client
    // that skips these paints CLEAN on an exit-2 file.
    const unknownArg = bySource.get('unknown-arg');
    expect(unknownArg?.severity).toBe('error');
    expect(unknownArg?.task).toBe('sum');
    expect(unknownArg?.message).toContain('data');
    expect(unknownArg?.suggestion).toBe('input');

    const missingArg = bySource.get('missing-arg');
    expect(missingArg?.severity).toBe('error');
    expect(missingArg?.task).toBe('ship');
    expect(missingArg?.message).toContain('message');

    const gate = bySource.get('gate');
    expect(gate?.severity).toBe('error');
    expect(gate?.task).toBe('never');
    expect(gate?.span).toEqual({ start: 30, end: 42 });
    expect(gate?.fix).toBe('when: always');

    const errors = findings.filter((f) => f.severity === 'error');
    expect(errors).toHaveLength(10); // everything except the hint
  });

  it('counts the three arg/gate families as failure classes', () => {
    const report = parseCheckReport(REPORT);
    // 7 legacy families + unknown_args + missing_args + gate_findings.
    expect(countReportFindings(report!)).toBe(10);
  });

  it('keeps the families absent-safe on older binaries', () => {
    const report = parseCheckReport(JSON.stringify({ report_version: 1, cost: {} }));
    expect(report?.unknown_args).toEqual([]);
    expect(report?.missing_args).toEqual([]);
    expect(report?.gate_findings).toEqual([]);
    expect(countReportFindings(report!)).toBe(0);
  });

  it('round-trips EVERY CheckReport key through the parser — the dead-code-on-the-wire ratchet', () => {
    // The class struck twice in two days: `requirements` (0.97.0 review)
    // then `pricing` (0.97.2 review) — interface + consumers shipped, the
    // parser copy didn't, the feature was silently dead on the wire. This
    // fixture is typed Required<CheckReport>: adding a field to the
    // interface BREAKS THIS FIXTURE at compile time, forcing it in here —
    // and the loop below then fails until parseCheckReport copies it.
    const FULL_WIRE: Required<CheckReport> = {
      report_version: 1,
      clean: false,
      conformance: [],
      waves: [],
      cost: { tasks: [] },
      secret_leaks: [],
      secret_egresses: [],
      capability_escapes: [],
      schema_findings: [],
      unknown_tools: [],
      unknown_args: [],
      missing_args: [],
      gate_findings: [],
      schema_lints: [],
      hints: [],
      analysis: { width: 1, width_witness: ['a'], pinch_points: [], blast_radius: [] },
      requirements: {
        models: [], secrets: [],
        config_reads: [], config_defined: [], inputs_required: [],
      },
      pricing: { models: [{ model: 'ollama/qwen3.5:4b', input_per_million: null, output_per_million: null }] },
    };
    const parsed = parseCheckReport(JSON.stringify(FULL_WIRE));
    expect(parsed).toBeDefined();
    for (const key of Object.keys(FULL_WIRE) as Array<keyof CheckReport>) {
      expect(parsed?.[key], `parseCheckReport drops \`${key}\` — dead code on the wire`).toBeDefined();
    }
  });

  it('carries the requirements section through the parse (E-REQ · 0.97.1)', () => {
    // The 0.97.0 review's exact finding: the adapter existed, the copy
    // didn't — report.requirements was ALWAYS undefined and the whole
    // engine-stated-contract branch was dead code on the wire.
    const report = parseCheckReport(JSON.stringify({
      report_version: 1,
      cost: {},
      requirements: {
        models: [{ model: 'ollama/qwen3.5:4b', provider: 'ollama', requires_key: false }],
        secrets: [],
        env: [],
      },
    }));
    expect(report?.requirements).toBeDefined();
    expect(report?.requirements?.models?.[0]?.provider).toBe('ollama');
    // absent on older binaries → undefined, never a throw
    const older = parseCheckReport(JSON.stringify({ report_version: 1, cost: {} }));
    expect(older?.requirements).toBeUndefined();
  });

  it('reads the requirements section in the nine-key vocabulary (inputs_read · inputs_required)', () => {
    // nika 0.109 states the caller contract in the three-authority
    // vocabulary (observed on the engine: `inputs_read` · `inputs_required`
    // · `models` · `secrets`). The pre-0.109 spellings (`config_reads` ·
    // `config_defined` · `env_reads` · `env_defined` · `vars_required`) died
    // with the fields they described — a reader that kept them would report
    // a `config:` lane no engine emits (an empty `?? []`, never an error).
    const req = { models: [], secrets: [],
      inputs_read: ['region', 'topic'], inputs_required: ['topic'] };
    expect(inputsRequired(req)).toEqual(['topic']);
    expect(inputsRead(req)).toEqual(['region', 'topic']);
    // Absent → empty, never a throw.
    expect(inputsRequired({ models: [], secrets: [] })).toEqual([]);
    expect(inputsRead({ models: [], secrets: [] })).toEqual([]);
    // The dead spellings are not read: a legacy wire yields nothing, loudly
    // nothing — not a phantom config lane.
    const legacy = { models: [], secrets: [],
      config_reads: ['REGION'], config_defined: ['REGION'], vars_required: ['topic'] } as unknown as Parameters<typeof inputsRequired>[0];
    expect(inputsRequired(legacy)).toEqual([]);
    expect(inputsRead(legacy)).toEqual([]);
  });

  it('prefers the engine-stamped severity + docs_url (E4 wire · ≥0.94)', () => {
    const report = parseCheckReport(JSON.stringify({
      report_version: 1,
      conformance: [
        {
          code: 'NIKA-DAG-002',
          message: 'cycle detected',
          severity: 'warning',
          docs_url: 'https://nika.sh/errors/NIKA-DAG-002',
        },
        // Unknown severity name from a future engine → degrade to error,
        // never crash; absent docs_url stays absent (client fallback).
        { code: 'NIKA-VAR-001', message: 'unresolved', severity: 'fatal-9000' },
      ],
      waves: [],
      cost: { tasks: [] },
    })!);
    const [warned, degraded] = collectFindings(report!);
    expect(warned.severity).toBe('warning');
    expect(warned.docsUrl).toBe('https://nika.sh/errors/NIKA-DAG-002');
    expect(degraded.severity).toBe('error');
    expect(degraded.docsUrl).toBeUndefined();
  });
});

describe('byteOffsetToPosition', () => {
  it('maps ascii offsets', () => {
    const text = 'abc\ndef\n';
    expect(byteOffsetToPosition(text, 0)).toEqual({ line: 0, character: 0 });
    expect(byteOffsetToPosition(text, 5)).toEqual({ line: 1, character: 1 });
  });

  it('accounts for multibyte UTF-8 (é = 2 bytes · 1 UTF-16 unit)', () => {
    const text = 'é: x\nid: café\n';
    // bytes: é(2) :(1) space(1) x(1) \n(1) = 6 → start of line 1
    expect(byteOffsetToPosition(text, 6)).toEqual({ line: 1, character: 0 });
  });

  it('counts astral chars as 2 UTF-16 units (🦋 = 4 bytes)', () => {
    const text = '🦋ab';
    expect(byteOffsetToPosition(text, 4)).toEqual({ line: 0, character: 2 });
    expect(byteOffsetToPosition(text, 5)).toEqual({ line: 0, character: 3 });
  });
});

// ─── resume capability (ADR-099 · version-gated flag, not a subcommand) ─────
import { buildCapabilities } from '../core/capabilities';

describe('parseToolMeta (nika tools --json · v1 envelope)', () => {
  it('maps BARE tool names → category + the binary description (the teaching voice)', () => {
    const stdout = JSON.stringify({
      tools_version: 1,
      tools: [
        { name: 'nika:log', category: 'core', description: 'x' },
        { name: 'nika:image_generate', category: 'media' },
        { name: 'nika:fetch', category: 'network', description: '' },
      ],
    });
    expect(parseToolMeta(stdout)).toEqual({
      log: { cat: 'core', desc: 'x' },
      image_generate: { cat: 'media', desc: undefined },
      // Empty descriptions stay absent — a blank teaches nothing.
      fetch: { cat: 'network', desc: undefined },
    });
  });

  it('skips entries without a string category (catalog gap → fallback)', () => {
    const stdout = JSON.stringify({
      tools_version: 1,
      tools: [
        { name: 'nika:log', category: 'core' },
        { name: 'nika:mystery', category: null },
      ],
    });
    expect(parseToolMeta(stdout)).toEqual({ log: { cat: 'core', desc: undefined } });
  });

  it('is undefined on non-JSON, wrong envelope, or empty tools', () => {
    expect(parseToolMeta('')).toBeUndefined();
    expect(parseToolMeta('nika 0.92.0')).toBeUndefined();
    expect(parseToolMeta('{"catalog_version":1}')).toBeUndefined();
    expect(parseToolMeta('{"tools_version":1,"tools":[]}')).toBeUndefined();
  });

  it('ignores unknown fields (additive-only envelope contract)', () => {
    const stdout = JSON.stringify({
      tools_version: 1,
      future_field: { x: 1 },
      tools: [{ name: 'nika:jq', category: 'data', args: ['expression'], extra: true }],
    });
    expect(parseToolMeta(stdout)).toEqual({ jq: { cat: 'data', desc: undefined } });
  });
});

describe('parseCatalogModels (nika catalog --json · v1 envelope)', () => {
  const CATALOG = JSON.stringify({
    catalog_version: 1,
    providers: [
      {
        id: 'anthropic',
        models: [
          {
            id: 'sonnet',
            model: 'claude-sonnet-4-20250514',
            context_window_tokens: 200000,
            max_output_tokens: 8192,
            capabilities: { reasoning: true, vision: true, json_mode: 'schema' },
          },
          { id: 'haiku', model: 'claude-haiku-4-5', context_window_tokens: 200000, capabilities: { vision: false } },
        ],
      },
      { id: 'empty-provider', models: [] },
    ],
  });

  it('maps provider → picker-ready model rows (ctx + capability line)', () => {
    const cat = parseCatalogModels(CATALOG)!;
    expect(Object.keys(cat)).toEqual(['anthropic']); // empty providers dropped
    expect(cat.anthropic).toHaveLength(2);
    expect(cat.anthropic[0].model).toBe('claude-sonnet-4-20250514');
    expect(cat.anthropic[0].desc).toBe('200k ctx · reasoning · vision · json:schema');
    expect(cat.anthropic[1].desc).toBe('200k ctx');
  });

  it('is undefined on garbage, wrong envelope, or an empty map', () => {
    expect(parseCatalogModels('')).toBeUndefined();
    expect(parseCatalogModels('nika 0.92.0')).toBeUndefined();
    expect(parseCatalogModels('{"tools_version":1}')).toBeUndefined();
    expect(parseCatalogModels('{"catalog_version":1,"providers":[]}')).toBeUndefined();
  });

  it('ignores unknown fields and odd ctx values (additive-only contract)', () => {
    const cat = parseCatalogModels(JSON.stringify({
      catalog_version: 1,
      future: true,
      providers: [{ id: 'x', extra: 1, models: [{ model: 'm-1', novel_field: 2 }] }],
    }))!;
    expect(cat.x[0]).toEqual({ model: 'm-1', desc: '' });
  });
});

describe('resume capability gate', () => {
  const HELP = 'Commands:\n  run  Execute\n  check  Audit\n\nOptions:\n';
  it('requires both flags in the current run help', () => {
    expect(buildCapabilities(HELP, 'nika 0.118.1', '', '', [], { run: '  --resume <TRACE>\n  --from <TASK>' }).resume).toBe(true);
  });
  it('a version alone, a missing flag, or a missing run command grants nothing', () => {
    expect(buildCapabilities(HELP, 'nika 0.118.1').resume).toBe(false);
    expect(buildCapabilities(HELP, 'nika 0.118.1', '', '', [], { run: '  --resume <TRACE>' }).resume).toBe(false);
    expect(buildCapabilities('Commands:\n  check Audit\n', 'nika 0.118.1', '', '', [], { run: '  --resume <TRACE>\n  --from <TASK>' }).resume).toBe(false);
  });
});
