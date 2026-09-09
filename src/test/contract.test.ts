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
import {
  CAPABILITY_COMMANDS,
  buildCapabilities,
  parseHelpCommands,
} from '../core/capabilities';
import {
  EXIT,
  collectFindings,
  goishDuration,
  graphDocToDag,
  isGraphDoc,
  parseCheckReport,
  parseTemplateSet,
  topoWaves,
} from '../core/cliContract';
import { analyzeDag } from '../core/dagAnalysis';
import { parseCanonErrorCodes } from '../core/schemaIntel';
import { applyPermitsFix, insertPermitsBlock, parseFix } from '../core/permitsEdit';
import { scaffoldContent } from '../core/newWorkflowWizard';
import { GRAMMAR_CANARY_DOC, grammarAccepted } from '../core/grammarCanary';
import { DEMO_WORKFLOW } from '../core/demoWorkflow';
import { GENERATE_FALLBACK_TEMPLATE } from '../core/generateStaging';
import { NIKA_VERB_STARTERS } from '../core/verbStarters.generated';
import { engineSupportError, parseBinaryVersion } from '../core/binaryVersion';
import { traceVerificationDocument } from '../core/traceVerification';

// Candidate binaries, dev-tree first. Override with NIKA_BIN.
const CANDIDATES = [
  process.env.NIKA_BIN,
  path.resolve(__dirname, '../../../../repos/engine/repo/target/release/nika'),
  path.resolve(__dirname, '../../../../repos/engine/repo/target/debug/nika'),
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

const CLEAN_WF = `nika: contract-smoke

model: mock/echo

permits:
  tools: ["nika:fetch"]
  net:
    http: ["example.com"]

tasks:
  fetch_page:
    invoke:
      tool: nika:fetch
      args:
        url: https://example.com

  summarize:
    with:
      page: \${{ tasks.fetch_page.output }}
    infer:
      prompt: "Summarize \${{ with.page }}"
`;

describe.skipIf(!BIN)('engine contract (real binary)', () => {
  it('delegates the chain and seal distinction, including a stripped header, to the real engine', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nika-verify-adapter-'));
    try {
      const trace = path.join(dir, 'recorded.ndjson');
      const raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'chained-run.ndjson'), 'utf8');
      fs.writeFileSync(trace, raw);
      const intact = run(['trace', 'verify', trace, '--json']);
      const document = traceVerificationDocument(intact, trace);
      expect(document).toBeDefined();
      expect(JSON.parse(document ?? 'null')).toMatchObject({ verify_version: 1, trace, seal: { tier: 'unsealed' } });

      const lines = raw.split('\n');
      const header = JSON.parse(lines[0]);
      delete header.chain;
      lines[0] = JSON.stringify(header);
      fs.writeFileSync(trace, lines.join('\n'));
      const stripped = run(['trace', 'verify', trace, '--json']);
      expect(stripped.code).not.toBe(0);
      expect(JSON.parse(traceVerificationDocument(stripped, trace) ?? 'null'))
        .toMatchObject({ verify_version: 1, trace, tier: 'broken' });
    } finally { fs.rmSync(dir, { recursive: true }); }
  });

  it('the selected development binary meets the candidate support floor', () => {
    const version = run(['--version']);
    expect(version.code).toBe(0);
    expect(engineSupportError(parseBinaryVersion(version.stdout))).toBeNull();
  });

  it.each([
    ['check', '-', '--json'],
    ['check', '-', '--infer-permits', '--color', 'never'],
    ['inspect', '-', '--format', 'json'],
    ['explain', '-', '--json'],
  ])('supported engine accepts dirty-buffer stdin: %s', (...args) => {
    const result = run(args, CLEAN_WF);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it('the supported run door proves both resume flags', () => {
    const help = run(['run', '--help']);
    expect(help.code).toBe(0);
    expect(buildCapabilities('', run(['--version']).stdout, '', '', ['run'], { run: help.stdout }).resume).toBe(true);
  });

  it('capability probe AGREES with the binary --help (generation-independent)', () => {
    const help = run(['--help']).stdout;
    const version = run(['--version']).stdout;
    // The first screen is a user next-step mirror, not an exhaustive command
    // register. Every capability the extension may expose is proven by the
    // command's own help door when omitted there.
    const probedOk = CAPABILITY_COMMANDS.filter((verb) => run([verb, '--help']).code === 0);
    const caps = buildCapabilities(help, version, '', '', probedOk);
    // The static suite is the floor — every generation that gets here
    // ships it (a binary without `check` is not a Nika binary). The
    // FIRST-SCREEN floor names the visible craft; the hidden doors are
    // proven by probe above (the belt caught the dark caps 2026-08-01).
    for (const cmd of ['check', 'explain', 'try', 'new', 'trace']) {
      expect(caps.commands.has(cmd), `--help must list ${cmd}`).toBe(true);
    }
    for (const cmd of ['inspect', 'spec']) {
      expect(caps.commands.has(cmd), `the hidden door ${cmd} must answer its own --help`).toBe(true);
    }
    // The CONTRACT under test is the probe LOGIC, not a fixed feature
    // set: each capability flag must equal whether `--help` lists its
    // command. This is what lets the gate light run/lsp/mcp the day they
    // land with ZERO extension release — and it stays true across the
    // dev-tree's release (may lag) vs debug (fresh) binaries, instead of
    // re-coupling the test to one generation's feature set.
    const listed = parseHelpCommands(help);
    expect(caps.run).toBe(listed.has('run') || probedOk.includes('run'));
    // lsp/mcp ride the same proof path when the first screen omits them.
    expect(caps.lsp).toBe(listed.has('lsp') || probedOk.includes('lsp'));
    expect(caps.mcp).toBe(listed.has('mcp') || probedOk.includes('mcp'));
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

  it('the blank scaffold and the sub-workflow scaffold check clean on the pinned engine (own-corpus law)', () => {
    // 2026-08-18: the extension scaffolded `nika: v1` + `workflow: { id }`
    // — the previous envelope — while its ENGINE_PIN spoke the nine-key
    // one; every blank/starter file the wizard wrote was refused on the
    // first line (NIKA-PARSE-005). The scaffold is teaching: it must pass
    // the oracle it ships with, like every snippet.
    const blank = scaffoldContent('my-flow', { kind: 'blank' }, 'mock/echo')
      // the break_me curriculum is commented YAML; the file as written must check
      ;
    const file = tmpWorkflow(blank);
    try {
      const res = run(['check', file, '--json']);
      const report = parseCheckReport(res.stdout);
      expect(report, res.stdout + res.stderr).toBeDefined();
      expect(grammarAccepted(res.stdout), `the scaffold must PARSE on the pinned engine:\n${res.stdout}`).toBe(true);
      const hard = collectFindings(report!).filter((f) => f.source !== 'hint');
      expect(hard.map((f) => f.code), res.stdout).toEqual([]);
    } finally {
      fs.unlinkSync(file);
    }
    // the canary the Station probes is the same envelope
    const canary = tmpWorkflow(GRAMMAR_CANARY_DOC);
    try {
      const res = run(['check', canary, '--json']);
      expect(grammarAccepted(res.stdout), res.stdout).toBe(true);
    } finally {
      fs.unlinkSync(canary);
    }
  });

  it('every OTHER template the extension writes checks clean on the pinned engine (own-corpus law · after #296)', () => {
    // #296 pinned the blank scaffold and the sub-workflow scaffold. The
    // extension writes three more files: the demo sandbox (`nika.tryDemo`
    // · hello-canvas), every verb STARTER scaffold (the wizard's second
    // step · one per generated starter), and the generation prompt's
    // fallback template (what a model adapts when the corpus has no
    // closer skeleton). Each is teaching; each must pass the oracle it
    // ships with — a template the engine refuses on the first line
    // teaches a refusal.
    // authored HERE → must check hard-clean · a starter body is a Lane B
    // projection of the spec's own starters (SLOT-marked skeletons whose
    // `${{ inputs.input }}` the author declares next) → must PARSE and
    // carry no envelope/parse-class finding; the slot's VAR-001 is the
    // author's next move, not a dead form.
    const authored: Array<[string, string]> = [
      ['demo · hello-canvas', DEMO_WORKFLOW],
      ['generate · fallback template', GENERATE_FALLBACK_TEMPLATE],
    ];
    const starters: Array<[string, string]> = [];
    for (const verb of Object.keys(NIKA_VERB_STARTERS) as Array<keyof typeof NIKA_VERB_STARTERS>) {
      for (const starter of NIKA_VERB_STARTERS[verb]) {
        starters.push([`starter · ${starter.id}`, scaffoldContent('starter-probe', { kind: 'starter', verb, starter }, 'mock/echo')]);
      }
    }
    expect(starters.length).toBeGreaterThan(0);
    const judge = (label: string, body: string, hardClean: boolean): void => {
      const file = tmpWorkflow(body);
      try {
        const res = run(['check', file, '--json']);
        const report = parseCheckReport(res.stdout);
        expect(report, `${label}: ${res.stdout}${res.stderr}`).toBeDefined();
        expect(grammarAccepted(res.stdout), `${label} must PARSE on the pinned engine:\n${res.stdout}`).toBe(true);
        const hard = collectFindings(report!).filter((f) => f.source !== 'hint');
        const parseClass = hard.filter((f) => /^NIKA-PARSE-|^NIKA-VALUES-/.test(f.code));
        expect(parseClass.map((f) => `${f.code}: ${f.message}`), `${label} teaches a dead form:\n${body}`).toEqual([]);
        if (hardClean) {
          expect(hard.map((f) => `${f.code}: ${f.message}`), `${label}:\n${body}`).toEqual([]);
        }
      } finally {
        fs.unlinkSync(file);
      }
    };
    for (const [label, body] of authored) { judge(label, body, true); }
    for (const [label, body] of starters) { judge(label, body, false); }
  });

  it('check --json carries findings + did-you-mean on a broken workflow (exit 2)', () => {
    const file = tmpWorkflow(CLEAN_WF.replaceAll('nika:fetch', 'nika:fetchh'));
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

  it('inspect --format json adapts into the webview DagGraph (graph_format 3)', () => {
    const file = tmpWorkflow(CLEAN_WF);
    try {
      const res = run(['inspect', file, '--format', 'json']);
      expect(res.code).toBe(EXIT.OK);
      const doc: unknown = JSON.parse(res.stdout);
      expect(isGraphDoc(doc)).toBe(true);
      const dag = graphDocToDag(doc as Parameters<typeof graphDocToDag>[0]);
      expect(dag.nodes.map((n) => n.id)).toEqual(['fetch_page', 'summarize']);
      expect(dag.nodes[0].tool).toBe('nika:fetch');
      expect(dag.edges).toEqual([
        // The with: binding IS the edge — typed value, the alias rides it.
        { id: 'fetch_page->summarize:value:page', source: 'fetch_page', target: 'summarize', kind: 'value', label: 'page' },
      ]);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('inspect --format json projects a cleanup unit as a finally NODE on an unwind edge (format 3 · the engine\'s own shape)', () => {
    // Observed on the 0.109 engine (2026-08-18): the node carries
    // `kind: "finally"`, the attachment is `{ kind: "finally", predicate:
    // "unwind" }` from the producer to its cleanup task, and the PLAN
    // seats only the task population (« 2 waves · 2 tasks » for two
    // tasks + one cleanup unit). This pins that shape end to end.
    const file = tmpWorkflow(`nika: unwind-seam
model: mock/echo
tasks:
  gather:
    infer:
      prompt: "gather"
  thread:
    with:
      seed: \${{ tasks.gather.output }}
    infer:
      prompt: "thread \${{ with.seed }}"
  cleanup:
    after: { thread: unwind }
    infer:
      prompt: "cleanup"
`);
    try {
      const check = run(['check', file, '--json']);
      expect(check.code, check.stdout).toBe(EXIT.OK);
      const res = run(['inspect', file, '--format', 'json']);
      expect(res.code).toBe(EXIT.OK);
      const doc: unknown = JSON.parse(res.stdout);
      expect(isGraphDoc(doc)).toBe(true);
      const graph = doc as { graph_format: number; nodes: Array<{ id: string; kind: string }>; edges: Array<Record<string, unknown>> };
      expect(graph.graph_format).toBe(3);
      expect(graph.nodes.map((n) => [n.id, n.kind])).toEqual([
        ['gather', 'task'], ['thread', 'task'], ['cleanup', 'finally'],
      ]);
      expect(graph.edges).toContainEqual({ from: 'thread', to: 'cleanup', kind: 'finally', predicate: 'unwind' });

      const dag = graphDocToDag(doc as Parameters<typeof graphDocToDag>[0]);
      const cleanup = dag.nodes.find((n) => n.id === 'cleanup')!;
      expect(cleanup.kind).toBe('finally');
      expect(cleanup.attachedTo).toEqual(['thread']);
      expect(cleanup.producers).toEqual([]);
      const fin = dag.edges.find((e) => e.kind === 'finally')!;
      expect(fin.predicate).toBe('unwind');
      expect(dag.nodes.find((n) => n.id === 'thread')?.cleanupTasks).toEqual(['cleanup']);
      // The client's waves mirror the engine's PLAN: the unit sits in none.
      const waves = topoWaves(dag.nodes, dag.edges.filter((e) => e.kind !== 'recovery' && e.kind !== 'finally'));
      expect(waves).toEqual([['gather'], ['thread']]);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('the projected policy + per-task permits reach the cards (0.99.1+ graph · capability-honest)', () => {
    // Pins the WHOLE seam the dense cards read: engine projection →
    // graphDocToDag → card fields. Capability-honest: a binary whose
    // JSON predates the policy fields (brew 0.99.0) soft-passes — the
    // floor stays green while dev/next binaries PIN the contract.
    const file = tmpWorkflow(`nika: policy-seam
model: mock/echo
permits:
  fs:
    write:
      - "out/*"
tasks:
  guarded:
    infer:
      prompt: "p"
      max_tokens: 5
    timeout: "30s"
    retry:
      max_attempts: 3
    on_error:
      skip: true
    extract:
      summary: ".text"
  save:
    after: { guarded: success }
    invoke:
      tool: "nika:write"
      args:
        path: "out/report.md"
        content: "hi"
`);
    try {
      const res = run(['inspect', file, '--format', 'json']);
      expect(res.code).toBe(EXIT.OK);
      const doc = JSON.parse(res.stdout) as Parameters<typeof graphDocToDag>[0];
      expect(isGraphDoc(doc)).toBe(true);
      const rawGuarded = doc.nodes.find((n) => n.id === 'guarded');
      if (rawGuarded?.retry_max_attempts === undefined) {
        // Pre-projection binary — the YAML fallback lane owns this
        // floor (bodyFacts unit suite); nothing to pin here.
        expect.soft(true).toBe(true);
        return;
      }
      const dag = graphDocToDag(doc);
      const guarded = dag.nodes.find((n) => n.id === 'guarded')!;
      expect(guarded.retryMax).toBe(3);
      expect(guarded.timeout).toBe('30s');
      expect(guarded.onError).toBe('skip');
      expect(guarded.outputNames).toEqual(['summary']);
      // Per-task permits (engine #445): the write task pins its effect
      // family strings; the bare infer pins nothing.
      const save = dag.nodes.find((n) => n.id === 'save')!;
      expect(save.permits).toBeDefined();
      expect(save.permits).toContain('fs.write: out/report.md');
      expect(save.permits).toContain('tool: nika:write');
      expect(guarded.permits).toBeUndefined();
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('infer-permits output round-trips through insertPermitsBlock + applyPermitsFix', () => {
    const file = tmpWorkflow(CLEAN_WF);
    try {
      const res = run(['check', file, '--infer-permits', '--color', 'never']);
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
    const res = run(['spec', '--schema']);
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
    const listing = run(['new', '?']);
    const templates = parseTemplateSet(`${listing.stdout}\n${listing.stderr}`);
    expect(templates.length).toBeGreaterThan(0);

    for (const slug of templates) {
      const dest = path.join(os.tmpdir(), `nika-contract-tpl-${process.pid}-${slug}.nika.yaml`);
      try {
        const created = run(['new', slug, dest, '--force']);
        expect(created.code, `new ${slug}`).toBe(EXIT.OK);
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
    const schema = JSON.parse(run(['spec', '--schema']).stdout);
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
      // W2: the two boundary doors lead the task shape — depends_on is dead.
      expect.arrayContaining(['with', 'after', 'when', 'for_each', 'retry', 'infer', 'exec', 'invoke', 'agent']),
    );
    expect(intel!.verbFields.infer.map((f) => f.name)).toContain('prompt');
  });

  it('graph-edit skeletons pass their own check (own-corpus · the n8n loop is safe)', async () => {
    const { insertTaskSkeleton } = await import('../core/structuralFixes');
    // The graft law the spec's starters-projector uses: every
    // `inputs.X` a starter references is declared before the check (the
    // SLOT teaches the author to wire THEIR input — the corpus proves
    // the SHAPE). The starters reference `inputs.*` since the E-split,
    // so the corpus must DECLARE inputs: or every skeleton would read an
    // undeclared name. This suite runs a dev-tree build, i.e. main.
    const base = 'nika: edit-corpus\n\nmodel: mock/echo\n\ninputs:\n  topic: { type: string, default: "probe" }\n  input: { type: string, default: "probe" }\n\ntasks:\n  seed:\n    infer:\n      prompt: "hello"\n';
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
      'nika: shape-agreement',
      'model: mock/echo',
      '',
      'tasks:',
      '  extract:',
      '    infer:',
      '      prompt: "extract"',
      '      schema:',
      '        type: object',
      '        properties:',
      '          title:',
      '            type: string',
      '        required: [title]',
      '',
      '  use:',
      '    with:',
      `      picked: \${{ tasks.extract.output.${field} }}`,
      '    infer:',
      '      prompt: "use ${{ with.picked }}"',
    ].join('\n');

    for (const [field, valid] of [['title', true], ['titel', false]] as const) {
      const doc = wf(field);
      const shape = collectShapes(doc).get('extract')!;
      const clientSays = shapeAt(shape, [field]) !== undefined;
      expect(clientSays, `client verdict for .${field}`).toBe(valid);

      const file = tmpWorkflow(doc);
      try {
        const report = parseCheckReport(run(['check', file, '--json']).stdout)!;
        // 0.107 moved the bad-output-path class to CONFORMANCE
        // (NIKA-VAR-003) — the oracle verdict is the report's own
        // clean flag (this fixture's ONLY delta is the field), and the
        // shape complaint must live in ONE of the two lanes.
        const shapeComplaint =
          report.schema_findings.length > 0 ||
          report.conformance.some((c) => c.message?.includes(`.${field}`));
        expect(!shapeComplaint, `oracle verdict for .${field}`).toBe(valid);
        expect(report.clean, `clean flag for .${field}`).toBe(valid);
      } finally {
        fs.unlinkSync(file);
      }
    }
  });

  it('a restated control edge stays LEGAL (redundancy is the linter\'s, never a hard error)', () => {
    // The pre-W2 client transitive-reduction hint died with the gate
    // algebra v2 (pass-sets compose per edge — a longer path does not
    // imply the direct edge's admission). The surviving claim: the
    // triangle shape is CONFORMANT; any nudge is the engine's own
    // one-obvious-way lane, never a client re-guess.
    const doc = [
      'nika: redundancy',
      'model: mock/echo',
      '',
      'tasks:',
      '  a:',
      '    exec: { command: ["echo", "a"] }',
      '  b:',
      '    after: { a: success }',
      '    exec: { command: ["echo", "b"] }',
      '  c:',
      '    after: { a: success, b: success }',
      '    exec: { command: ["echo", "c"] }',
    ].join('\n');
    const file = tmpWorkflow(doc);
    try {
      const report = parseCheckReport(run(['check', file, '--json']).stdout)!;
      expect(report.conformance).toHaveLength(0);
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

// ─── explain ↔ canon error codes (the fallback's typed contract) ─────────────
// `nika explain` knows the NUMERIC registry; the SPEC conformance codes
// (NIKA-DAG-003 …) answer exit 2. The extension falls back to the canon's
// error_codes table — both halves of that seam are pinned here.

describe.skipIf(!BIN)('explain ↔ canon error codes (real binary)', () => {
  it('spec conformance codes teach natively — a RETIRED code keeps its page', () => {
    // A live spec code teaches its canon row (category + failure); a
    // retired one (NIKA-DAG-003 died with W2 — the binding IS the edge)
    // still answers: the page says « retired » and names the successor
    // (NIKA-VAR-021). Older binaries answer exit 2 (typed signal) and
    // the extension projects the canon itself. A third behavior is drift.
    const live = run(['explain', 'NIKA-DAG-005']);
    if (live.code === EXIT.OK) {
      expect(live.stdout).toContain('NIKA-DAG-005');
      expect(live.stdout).toContain('validation_error');
    } else {
      expect(live.code).toBe(EXIT.FILE_FINDINGS);
    }
    const retired = run(['explain', 'NIKA-DAG-003']);
    if (retired.code === EXIT.OK) {
      expect(retired.stdout).toContain('NIKA-DAG-003');
      expect(retired.stdout.toLowerCase()).toContain('retired');
      expect(retired.stdout).toContain('NIKA-VAR-021'); // the successor teaching
    } else {
      expect(retired.code).toBe(EXIT.FILE_FINDINGS);
    }
  });

  it('the canon error_codes table carries every W2 flow code the checker emits', () => {
    const canon = run(['spec', '--canon']).stdout;
    const rows = parseCanonErrorCodes(canon);
    expect(rows.length).toBeGreaterThan(0);

    // The fallback carries AT LEAST what the canon declares for itself.
    // (Exact count-vs-items equality is the SPEC repo's own derive gate —
    // canon-spec-counts-derive.sh — not a client re-check: as of the W2
    // window the table holds 61 items against a declared 59, an upstream
    // count drift the client must not paper over NOR crash on.)
    const declared = canon.match(/error_codes:\s*\n\s*count:\s*(\d+)/);
    expect(declared, 'canon declares error_codes.count').not.toBeNull();
    expect(rows.length).toBeGreaterThanOrEqual(Number(declared![1]));

    // The W2 flow codes are rows; the retired DAG-003 is a COMMENT (an
    // allocation hole, never a row) — the fallback must reflect both.
    for (const code of ['NIKA-PARSE-024', 'NIKA-DAG-005', 'NIKA-VAR-021']) {
      const row = rows.find((r) => r.code === code);
      expect(row, `${code} in the canon table`).toBeDefined();
      expect(row!.category).toBe('validation_error');
      expect(row!.failure.length).toBeGreaterThan(10);
    }
    expect(rows.find((r) => r.code === 'NIKA-DAG-003')).toBeUndefined();
  });

  it('numeric registry codes still answer exit 0 (native explain)', () => {
    const res = run(['explain', 'NIKA-440']);
    expect(res.code).toBe(EXIT.OK);
    expect(res.stdout).toContain('NIKA-440');
  });
});

// ─── graphDocToDag pure adaptation (no binary needed) ────────────────────────

describe('graphDocToDag adaptation (pure)', () => {
  it('engine-projected policy wins the card fields (0.99+ graph)', () => {
    const doc = {
      graph_format: 3,
      workflow: 'policy_probe',
      nodes: [
        {
          id: 'guarded', kind: 'task', verb: 'infer',
          retry_max_attempts: 3, timeout_ms: 30_000,
          on_error: 'skip', outputs: ['summary', 'title'],
        },
        { id: 'bare', kind: 'task', verb: 'exec' },
      ],
      edges: [],
    };
    const dag = graphDocToDag(doc as Parameters<typeof graphDocToDag>[0]);
    const guarded = dag.nodes[0];
    expect(guarded.retryMax).toBe(3);
    expect(guarded.timeout).toBe('30s');
    expect(guarded.onError).toBe('skip');
    expect(guarded.outputNames).toEqual(['summary', 'title']);
    const bare = dag.nodes[1];
    expect(bare.retryMax).toBeUndefined();
    expect(bare.timeout).toBeUndefined();
    expect(bare.onError).toBeUndefined();
    expect(bare.outputNames).toBeUndefined();
  });

  it('goishDuration renders engine timeout_ms compactly', () => {
    expect(goishDuration(500)).toBe('500ms');
    expect(goishDuration(1_500)).toBe('1.5s');
    expect(goishDuration(30_000)).toBe('30s');
    expect(goishDuration(90_000)).toBe('1m30s');
    expect(goishDuration(120_000)).toBe('2m');
  });

  it('carries per-task permits onto the node (#367 contract)', () => {
    const doc = {
      graph_format: 3,
      workflow: 'permits_probe',
      nodes: [
        { id: 'a', kind: 'task', verb: 'invoke', tool: 'nika:fetch', permits: ['net.http: api.example.org'] },
        { id: 'b', kind: 'task', verb: 'infer', permits: [] },
      ],
      edges: [{ from: 'a', to: 'b', kind: 'control', predicate: 'success' }],
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
      const res = run(['inspect', file, '--format', 'json']);
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

const DIAMOND_WF = `nika: analysis-agreement

model: mock/echo

tasks:
  root:
    infer:
      prompt: "seed"

  left:
    after: { root: success }
    infer:
      prompt: "l"

  right:
    after: { root: success }
    infer:
      prompt: "r"

  join:
    after: { left: success, right: success }
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

      const graphRes = run(['inspect', file, '--format', 'json']);
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
      const res = run(['new', 'summarize every item in parallel', dest, '--force']);
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
