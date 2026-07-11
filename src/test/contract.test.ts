// contract.test.ts — the extension ↔ engine seam, pinned against the REAL
// binary. Skips cleanly when no binary is present (CI without the engine
// workspace); locally it is the drift alarm: if a flag, JSON shape, enum
// or template set changes engine-side, this suite goes red before any
// user does.
//
// Includes the OWN-CORPUS law applied to snippets: every shippable
// snippet, materialized, must pass `nika check` conformance — an
// extension must not teach syntax its own oracle rejects.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCapabilities } from '../core/capabilities';
import {
  EXIT,
  collectFindings,
  graphDocToDag,
  isGraphDoc,
  parseCheckReport,
  parseTemplateSet,
  topoWaves,
} from '../core/cliContract';
import { analyzeDag } from '../core/dagAnalysis';
import { parseCanonErrorCodes } from '../core/schemaIntel';
import { applyPermitsFix, insertPermitsBlock, parseFix } from '../core/permitsEdit';

// Candidate binaries, dev-tree first. Override with NIKA_BIN.
const CANDIDATES = [
  process.env.NIKA_BIN,
  path.resolve(__dirname, '../../../../repos/engine/target/release/nika-cli'),
  path.resolve(__dirname, '../../../../repos/engine/target/debug/nika-cli'),
].filter((p): p is string => typeof p === 'string');

const BIN = CANDIDATES.find((p) => {
  try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; }
});

function run(args: string[], input?: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(BIN!, args, {
      encoding: 'utf-8',
      input,
      timeout: 30000,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? EXIT.ENV, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function tmpWorkflow(content: string): string {
  const file = path.join(os.tmpdir(), `nika-contract-${process.pid}-${Math.floor(performance.now() * 1000)}.nika.yaml`);
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}

const CLEAN_WF = `nika: v1
workflow: contract-smoke

model: mock/echo

tasks:
  - id: fetch_page
    invoke:
      tool: nika:fetch
      args:
        url: https://example.com

  - id: summarize
    depends_on: [fetch_page]
    with:
      page: \${{ tasks.fetch_page.output }}
    infer:
      prompt: "Summarize \${{ with.page }}"
`;

describe.skipIf(!BIN)('engine contract (real binary)', () => {
  it('capability probe AGREES with the binary --help (generation-independent)', () => {
    const help = run(['--help']).stdout;
    const version = run(['--version']).stdout;
    const caps = buildCapabilities(help, version);
    // The static suite is the floor — every generation that gets here
    // ships it (a binary without `check` is not a Nika binary).
    for (const cmd of ['check', 'graph', 'inspect', 'explain', 'spec', 'schema', 'examples', 'new', 'trace', 'completions']) {
      expect(caps.commands.has(cmd), `--help must list ${cmd}`).toBe(true);
    }
    // The CONTRACT under test is the probe LOGIC, not a fixed feature
    // set: each capability flag must equal whether `--help` lists its
    // command. This is what lets the gate light run/lsp/mcp the day they
    // land with ZERO extension release — and it stays true across the
    // dev-tree's release (may lag) vs debug (fresh) binaries, instead of
    // re-coupling the test to one generation's feature set.
    const lists = (cmd: string): boolean => new RegExp(`^\\s{2}${cmd}\\s`, 'm').test(help);
    expect(caps.run).toBe(lists('run'));
    expect(caps.lsp).toBe(lists('lsp'));
    expect(caps.mcp).toBe(lists('mcp'));
  });

  it('check --json parses through the adapter on a clean workflow (exit 0)', () => {
    const file = tmpWorkflow(CLEAN_WF);
    try {
      const res = run(['check', file, '--json']);
      expect(res.code).toBe(EXIT.OK);
      const report = parseCheckReport(res.stdout);
      expect(report).toBeDefined();
      expect(report!.report_version).toBe(1);
      expect(report!.clean).toBe(true);
      expect(report!.conformance).toHaveLength(0);
      expect(report!.waves.length).toBeGreaterThan(0);
      // Hints are informational — they never fail the check.
      const findings = collectFindings(report!);
      expect(findings.every((f) => f.source === 'hint')).toBe(true);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('check --json carries findings + did-you-mean on a broken workflow (exit 2)', () => {
    const file = tmpWorkflow(CLEAN_WF.replace('nika:fetch', 'nika:fetchh'));
    try {
      const res = run(['check', file, '--json']);
      expect(res.code).toBe(EXIT.FILE_FINDINGS);
      const report = parseCheckReport(res.stdout)!;
      expect(report.clean).toBe(false);
      expect(report.unknown_tools).toHaveLength(1);
      expect(report.unknown_tools[0].suggestion).toBe('nika:fetch');
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('graph --format json adapts into the webview DagGraph', () => {
    const file = tmpWorkflow(CLEAN_WF);
    try {
      const res = run(['graph', file, '--format', 'json']);
      expect(res.code).toBe(EXIT.OK);
      const doc: unknown = JSON.parse(res.stdout);
      expect(isGraphDoc(doc)).toBe(true);
      const dag = graphDocToDag(doc as Parameters<typeof graphDocToDag>[0]);
      expect(dag.nodes.map((n) => n.id)).toEqual(['fetch_page', 'summarize']);
      expect(dag.nodes[0].tool).toBe('nika:fetch');
      expect(dag.edges).toEqual([
        { id: 'fetch_page->summarize', source: 'fetch_page', target: 'summarize', isDataEdge: false },
      ]);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('infer-permits output round-trips through insertPermitsBlock + applyPermitsFix', () => {
    const file = tmpWorkflow(CLEAN_WF);
    try {
      const res = run(['check', file, '--infer-permits', '--no-color']);
      const permitsYaml = res.stdout.trim();
      expect(permitsYaml).toContain('permits:');

      // Insert the boundary, then apply a fix in the EXACT emitted style.
      const withBoundary = insertPermitsBlock(CLEAN_WF, permitsYaml);
      expect(withBoundary).toContain('permits:');
      const fix = parseFix('add "api.example.org" to permits.net.http');
      expect(fix).toBeDefined();
      const repaired = applyPermitsFix(withBoundary, fix!);
      // Either the editor handled the emitted shape (flow or block) — or it
      // REFUSED (undefined when already present). Corruption would show as
      // a failed re-check below.
      const finalDoc = repaired ?? withBoundary;
      const file2 = tmpWorkflow(finalDoc);
      try {
        const recheck = run(['check', file2, '--json']);
        const report = parseCheckReport(recheck.stdout)!;
        expect(report.conformance).toHaveLength(0); // never corrupt the YAML
      } finally {
        fs.unlinkSync(file2);
      }
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('the embedded schema pins the enums the snippets teach', () => {
    const res = run(['schema']);
    expect(res.code).toBe(EXIT.OK);
    const schema = JSON.parse(res.stdout) as {
      $defs: {
        exec: { properties: { capture: { enum?: string[] } } };
        retry: { properties: Record<string, unknown> };
        invoke: { properties: { tool: { oneOf: Array<{ enum?: string[] }> } } };
      };
    };
    // capture choices offered by the exec snippet
    expect(schema.$defs.exec.properties.capture.enum).toEqual(
      expect.arrayContaining(['stdout', 'stderr', 'combined', 'structured']),
    );
    // retry field is backoff_strategy (NOT backoff)
    expect(Object.keys(schema.$defs.retry.properties)).toContain('backoff_strategy');
    expect(Object.keys(schema.$defs.retry.properties)).toContain('jitter');
    // every builtin offered by snippets exists in the closed tool enum
    const tools = schema.$defs.invoke.properties.tool.oneOf.find((o) => o.enum)?.enum ?? [];
    for (const t of ['nika:fetch', 'nika:read', 'nika:write', 'nika:jq', 'nika:validate', 'nika:done']) {
      expect(tools, `builtin ${t} must exist`).toContain(t);
    }
  });

  it('template set parses and every template passes its own check (own-corpus law)', () => {
    const probe = path.join(os.tmpdir(), `nika-contract-probe-${process.pid}.nika.yaml`);
    const listing = run(['new', '--from', '?', probe]);
    const templates = parseTemplateSet(`${listing.stdout}\n${listing.stderr}`);
    expect(templates.length).toBeGreaterThan(0);

    for (const slug of templates) {
      const dest = path.join(os.tmpdir(), `nika-contract-tpl-${process.pid}-${slug}.nika.yaml`);
      try {
        const created = run(['new', '--from', slug, dest, '--force']);
        expect(created.code, `new --from ${slug}`).toBe(EXIT.OK);
        const checked = run(['check', dest, '--json']);
        const report = parseCheckReport(checked.stdout)!;
        expect(report.conformance, `template ${slug} must be conformant`).toHaveLength(0);
      } finally {
        fs.rmSync(dest, { force: true });
      }
    }
  });

  it('schema + canon project into the full intel (the completion vocabulary)', async () => {
    const { buildSchemaIntel } = await import('../core/schemaIntel');
    const schema = JSON.parse(run(['schema']).stdout);
    const canon = run(['spec', '--canon']).stdout;
    const intel = buildSchemaIntel(schema, canon);
    expect(intel).toBeDefined();
    // CROSS-SURFACE coherence, not magic numbers: the projected vocab
    // size must equal the count the canon DECLARES for itself. Pinning a
    // literal (22 builtins → 23 when nika:compose lands) re-couples the
    // test to one generation; deriving from the canon's own count block
    // is generation-independent AND a real check (schema enum ↔ canon
    // count agree). The named members below are the locked v0.1 floor.
    const canonCount = (key: string): number | undefined => {
      const block = canon.split('\n');
      const start = block.findIndex((l) => l.startsWith(`${key}:`));
      if (start === -1) { return undefined; }
      for (let i = start + 1; i < block.length && /^\s/.test(block[i]); i++) {
        const m = block[i].match(/^\s+count:\s*(\d+)/);
        if (m) { return Number(m[1]); }
      }
      return undefined;
    };
    expect(intel!.providers.all).toHaveLength(canonCount('providers')!);
    expect(intel!.providers.local).toContain('ollama');
    expect(intel!.extractModes).toHaveLength(canonCount('extract_modes')!);
    expect(intel!.builtinTools).toHaveLength(canonCount('builtins')!);
    expect(intel!.taskFields.map((f) => f.name)).toEqual(
      expect.arrayContaining(['id', 'depends_on', 'when', 'for_each', 'retry', 'infer', 'exec', 'invoke', 'agent']),
    );
    expect(intel!.verbFields.infer.map((f) => f.name)).toContain('prompt');
  });

  it('graph-edit skeletons pass their own check (own-corpus · the n8n loop is safe)', async () => {
    const { insertTaskSkeleton } = await import('../core/structuralFixes');
    const base = 'nika: v1\nworkflow: edit-corpus\n\nmodel: mock/echo\n\ntasks:\n  - id: seed\n    infer:\n      prompt: "hello"\n';
    for (const verb of ['infer', 'exec', 'invoke', 'agent'] as const) {
      const inserted = insertTaskSkeleton(base, verb, 'seed');
      expect(inserted).toBeDefined();
      const file = tmpWorkflow(inserted!.text);
      try {
        const res = run(['check', file, '--json']);
        const report = parseCheckReport(res.stdout);
        expect(report, `report parses for ${verb} skeleton`).toBeDefined();
        expect(report!.conformance, `skeleton ${verb}:\n${inserted!.text}`).toHaveLength(0);
        expect(report!.unknown_tools, `skeleton ${verb} tools`).toHaveLength(0);
      } finally {
        fs.unlinkSync(file);
      }
    }
  });

  it('shape propagation AGREES with the oracle (valid path clean · invalid flagged by both)', async () => {
    const { collectShapes, shapeAt } = await import('../core/schemaShape');
    const wf = (field: string): string => [
      'nika: v1',
      'workflow: shape-agreement',
      'model: mock/echo',
      '',
      'tasks:',
      '  - id: extract',
      '    infer:',
      '      prompt: "extract"',
      '      schema:',
      '        type: object',
      '        properties:',
      '          title:',
      '            type: string',
      '        required: [title]',
      '',
      '  - id: use',
      '    depends_on: [extract]',
      '    infer:',
      `      prompt: "use \${{ tasks.extract.output.${field} }}"`,
    ].join('\n');

    for (const [field, valid] of [['title', true], ['titel', false]] as const) {
      const doc = wf(field);
      const shape = collectShapes(doc).get('extract')!;
      const clientSays = shapeAt(shape, [field]) !== undefined;
      expect(clientSays, `client verdict for .${field}`).toBe(valid);

      const file = tmpWorkflow(doc);
      try {
        const report = parseCheckReport(run(['check', file, '--json']).stdout)!;
        const oracleSays = report.schema_findings.length === 0;
        expect(oracleSays, `oracle verdict for .${field}`).toBe(valid);
      } finally {
        fs.unlinkSync(file);
      }
    }
  });

  it('redundant-dep hint is ADDITIVE (the oracle stays clean · we suggest tighter)', async () => {
    const { redundantEdges } = await import('../core/graphIntel');
    const doc = [
      'nika: v1',
      'workflow: redundancy',
      'model: mock/echo',
      '',
      'tasks:',
      '  - id: a',
      '    exec: { command: "echo a" }',
      '  - id: b',
      '    depends_on: [a]',
      '    exec: { command: "echo b" }',
      '  - id: c',
      '    depends_on: [a, b]',
      '    exec: { command: "echo c" }',
    ].join('\n');
    const file = tmpWorkflow(doc);
    try {
      const report = parseCheckReport(run(['check', file, '--json']).stdout)!;
      expect(report.conformance).toHaveLength(0); // redundancy is legal
      const redundant = redundantEdges(['a', 'b', 'c'], [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'c' },
        { source: 'b', target: 'c' },
      ]);
      expect(redundant).toEqual([{ source: 'a', target: 'c' }]); // we still teach
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('explain teaches a real code and refuses garbage gracefully', () => {
    const real = run(['explain', 'NIKA-440']);
    expect(real.stdout.length).toBeGreaterThan(40);
    const fake = run(['explain', 'NIKA-99999']);
    expect(fake.code).not.toBe(EXIT.OK);
  });
});

// ─── Snippets own-corpus ─────────────────────────────────────────────────────

interface Snippet { prefix: string[] | string; body: string[]; description?: string }

/** Materialize VS Code snippet syntax into plain text (first choice wins). */
export function materializeSnippet(body: string[]): string {
  let text = body.join('\n');
  text = text.replace(/\$\{\d+\|([^|]*)\|\}/g, (_m, choices: string) => choices.split(',')[0]);
  // ${N:default} — innermost-first so nested placeholders resolve.
  for (let i = 0; i < 5 && /\$\{\d+:/.test(text); i++) {
    text = text.replace(/\$\{\d+:((?:[^{}]|\{\{[^}]*\}\})*)\}/g, '$1');
  }
  text = text.replace(/\$\{\d+\}/g, '');
  text = text.replace(/\$\d+/g, '');
  text = text.replace(/\\\$/g, '$');
  return text;
}

const SNIPPETS_PATH = path.resolve(__dirname, '../../snippets/nika.code-snippets');

describe.skipIf(!BIN)('snippets own-corpus (real binary)', () => {
  const all = JSON.parse(fs.readFileSync(SNIPPETS_PATH, 'utf-8')) as Record<string, Snippet>;

  /**
   * Wrap a fragment snippet into a checkable workflow. Referenced
   * `vars.X` are synthesized (the user's file declares them in reality —
   * the corpus check asserts the snippet body itself is sound).
   */
  function checkable(name: string, text: string): string | undefined {
    const varRefs = [...new Set(
      [...text.matchAll(/\$\{\{\s*vars\.([a-z0-9_]+)/g)].map((m) => m[1]),
    )];
    const varsBlock = varRefs.length > 0
      ? `vars:\n${varRefs.map((v) => `  ${v}: "corpus"`).join('\n')}\n\n`
      : '';
    const envelope = `nika: v1\nworkflow: snippet-corpus\n\nmodel: mock/echo\n\n${varsBlock}`;

    if (text.includes('nika: v1')) { return text; } // full workflow snippet
    if (text.startsWith('tasks:')) { return envelope + text; }
    if (/^- id:/m.test(text)) {
      const indented = text.split('\n').map((l) => (l.length > 0 ? `  ${l}` : l)).join('\n');
      return `${envelope}tasks:\n${indented}`;
    }
    // Field fragments (with: · retry: · when: …) need a task context.
    void name;
    return undefined;
  }

  for (const [name, snippet] of Object.entries(all)) {
    const text = materializeSnippet(snippet.body);
    const wf = checkable(name, text);
    if (!wf) { continue; }

    it(`snippet "${name}" passes nika check conformance`, () => {
      const file = tmpWorkflow(wf);
      try {
        const res = run(['check', file, '--json']);
        const report = parseCheckReport(res.stdout);
        expect(report, `report must parse for ${name}\n${res.stdout || res.stderr}`).toBeDefined();
        expect(report!.conformance, `conformance for:\n${wf}`).toHaveLength(0);
        expect(report!.unknown_tools, `unknown tools for:\n${wf}`).toHaveLength(0);
        expect(report!.schema_lints, `schema lints for:\n${wf}`).toHaveLength(0);
      } finally {
        fs.unlinkSync(file);
      }
    });
  }
});

// ─── explain ↔ canon error codes (the fallback's typed contract) ─────────────
// `nika explain` knows the NUMERIC registry; the SPEC conformance codes
// (NIKA-DAG-003 …) answer exit 2. The extension falls back to the canon's
// error_codes table — both halves of that seam are pinned here.

describe.skipIf(!BIN)('explain ↔ canon error codes (real binary)', () => {
  it('spec conformance codes either teach natively or trigger the fallback', () => {
    // Two binary generations: ≥ the explain-canon fix, NIKA-DAG-003
    // answers exit 0 with the canon row (binary = SSOT, the fallback is
    // dormant); older binaries answer exit 2 (typed signal) and the
    // extension projects the same canon row itself. Both are correct —
    // a third behavior is drift.
    const res = run(['explain', 'NIKA-DAG-003']);
    if (res.code === EXIT.OK) {
      expect(res.stdout).toContain('NIKA-DAG-003');
      expect(res.stdout).toContain('validation_error');
    } else {
      expect(res.code).toBe(EXIT.FILE_FINDINGS);
    }
  });

  it('the canon error_codes table carries every namespace the checker emits', () => {
    const canon = run(['spec', '--canon']).stdout;
    const rows = parseCanonErrorCodes(canon);
    expect(rows.length).toBeGreaterThan(0);

    // Derived count, never hand-written: the canon's own count field.
    const declared = canon.match(/error_codes:\s*\n\s*count:\s*(\d+)/);
    expect(declared, 'canon declares error_codes.count').not.toBeNull();
    expect(rows).toHaveLength(Number(declared![1]));

    const dag3 = rows.find((r) => r.code === 'NIKA-DAG-003');
    expect(dag3).toBeDefined();
    expect(dag3!.category).toBe('validation_error');
    expect(dag3!.failure.length).toBeGreaterThan(10);
  });

  it('numeric registry codes still answer exit 0 (native explain)', () => {
    const res = run(['explain', 'NIKA-440']);
    expect(res.code).toBe(EXIT.OK);
    expect(res.stdout).toContain('NIKA-440');
  });
});

// ─── graphDocToDag pure adaptation (no binary needed) ────────────────────────

describe('graphDocToDag adaptation (pure)', () => {
  it('carries per-task permits onto the node (#367 contract)', () => {
    const doc = {
      graph_format: 1,
      workflow: 'permits_probe',
      nodes: [
        { id: 'a', verb: 'invoke', tool: 'nika:fetch', permits: ['net.http: api.example.org'] },
        { id: 'b', verb: 'infer', permits: [] },
      ],
      edges: [{ from: 'a', to: 'b', kind: 'depends_on' }],
    };
    const dag = graphDocToDag(doc as Parameters<typeof graphDocToDag>[0]);
    expect(dag.nodes[0].permits).toEqual(['net.http: api.example.org']);
    // An empty grant list stays absent — no fake ▦0 chip.
    expect(dag.nodes[1].permits).toBeUndefined();
  });
});

// ─── DAG insights on the REAL projection ─────────────────────────────────────
// The analysis invariants hold on whatever the engine actually projects —
// width bounds every wave, Brent + Graham hold, ghosts shape nothing.

describe.skipIf(!BIN)('dag insights on the real graph projection', () => {
  it('analyzeDag invariants hold on the engine-projected graph', () => {
    const file = tmpWorkflow(CLEAN_WF);
    try {
      const res = run(['graph', file, '--format', 'json']);
      expect(res.code).toBe(EXIT.OK);
      const doc: unknown = JSON.parse(res.stdout);
      expect(isGraphDoc(doc)).toBe(true);
      if (!isGraphDoc(doc)) { return; }
      const dag = graphDocToDag(doc);
      const ins = analyzeDag(dag.nodes, dag.edges);

      expect(ins.nodeCount).toBe(dag.nodes.length);
      for (const wave of topoWaves(dag.nodes, dag.edges)) {
        expect(ins.width).toBeGreaterThanOrEqual(wave.length);
      }
      expect(ins.span).toBeLessThanOrEqual(ins.work);
      for (const { workers, makespan } of ins.makespans) {
        expect(makespan).toBeGreaterThanOrEqual(Math.max(ins.work / workers, ins.span) - 1e-9);
        expect(makespan).toBeLessThanOrEqual(ins.work / workers + (ins.span * (workers - 1)) / workers + 1e-9);
      }
    } finally {
      fs.unlinkSync(file);
    }
  });
});

// ─── analysis oracle-agreement (client dagAnalysis ↔ engine report) ─────────
// The engine now ships its own DAG read (report.analysis · additive).
// The client's analyzeDag must AGREE with it on the same workflow —
// width, witness size, pinch set. Capability-honest: older binaries
// without the field skip the agreement (never a false claim).

const DIAMOND_WF = `nika: v1
workflow: analysis-agreement

model: mock/echo

tasks:
  - id: root
    infer:
      prompt: "seed"

  - id: left
    depends_on: [root]
    infer:
      prompt: "l"

  - id: right
    depends_on: [root]
    infer:
      prompt: "r"

  - id: join
    depends_on: [left, right]
    infer:
      prompt: "j"
`;

describe.skipIf(!BIN)('analysis agreement (real binary)', () => {
  it('client width/pinch agree with the engine read when it ships', () => {
    const file = tmpWorkflow(DIAMOND_WF);
    try {
      const check = run(['check', file, '--json']);
      const report = parseCheckReport(check.stdout);
      expect(report).toBeDefined();
      if (!report?.analysis) { return; } // older binary — nothing to disagree with

      const graphRes = run(['graph', file, '--format', 'json']);
      const doc: unknown = JSON.parse(graphRes.stdout);
      expect(isGraphDoc(doc)).toBe(true);
      if (!isGraphDoc(doc)) { return; }
      const dag = graphDocToDag(doc);
      const client = analyzeDag(dag.nodes, dag.edges);

      expect(client.width, 'width must agree').toBe(report.analysis.width);
      expect(client.widthWitness.length).toBe(report.analysis.width_witness.length);
      expect([...client.pinchPoints].sort()).toEqual(
        [...report.analysis.pinch_points].sort(),
      );
      // Blast radius agrees per task (engine lists blocks > 0 only).
      for (const { task, blocks } of report.analysis.blast_radius) {
        expect(client.blastRadius.get(task), `blast(${task})`).toBe(blocks);
      }
    } finally {
      fs.unlinkSync(file);
    }
  });
});

// ─── intent routing (`nika new` · the deterministic generation floor) ───────
// The binary now BM25-routes free-form intents to embedded templates —
// the same routing the extension proved client-side (intentRank.ts).
// Capability-honest: older binaries answer exit 2 (unknown template)
// and the extension's own routing covers; new binaries route natively.

describe.skipIf(!BIN)('new intent routing (real binary)', () => {
  it('routes a parallel intent or honestly declines (two generations)', () => {
    const dest = path.join(os.tmpdir(), `nika-route-${process.pid}.nika.yaml`);
    try {
      const res = run(['new', '--from', 'summarize every item in parallel', dest, '--force']);
      if (res.code === EXIT.OK) {
        expect(res.stdout).toContain('routed intent');
        // Own-corpus: whatever it routed to passes the oracle.
        const check = run(['check', dest, '--json']);
        const report = parseCheckReport(check.stdout);
        expect(report?.conformance ?? []).toHaveLength(0);
      } else {
        // Older binary: the wire-contract error, never a half-write.
        expect(res.code).toBe(EXIT.FILE_FINDINGS);
        expect(`${res.stdout}${res.stderr}`).toContain('embedded set:');
      }
    } finally {
      fs.rmSync(dest, { force: true });
    }
  });
});
