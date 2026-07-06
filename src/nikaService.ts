// nikaService.ts — the ONE seam between the extension and the binary.
//
// Every feature consumes the engine through this service: it resolves the
// binary, probes its REAL capability surface (`--help` · never a hardcoded
// matrix), caches per-document check/graph results, and supports dirty
// buffers via tmp files. Vocabulary lives in the binary (spec · schema ·
// templates · examples) — the extension projects, never duplicates.

import { execFile } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter, type Event, type TextDocument } from 'vscode';
import {
  buildCapabilities,
  noCapabilities,
  type CapabilitySet,
} from './core/capabilities';
import {
  EXIT,
  graphDocToDag,
  isGraphDoc,
  parseCatalogModels,
  parseCheckReport,
  parseTemplateSet,
  parseToolCategories,
  type CatalogModel,
  type CheckReport,
  type DagGraph,
  type GraphDoc,
} from './core/cliContract';
import { clientDagFor } from './core/clientDag';
import { annotateDataFlow } from './core/dataflow';
import { collectBodyFacts } from './core/bodyFacts';
import { parseRegions } from './core/regions';
import { buildSchemaIntel, type SchemaIntel } from './core/schemaIntel';
import { parseRichWorkflow } from './workflowParser';

/** Card substance (prompt · command · args) onto the graph nodes. */
function mergeBodyFacts(text: string, nodes: import('./core/cliContract').DagNode[]): void {
  const facts = collectBodyFacts(text);
  for (const node of nodes) {
    const f = facts.get(node.id);
    if (!f) { continue; }
    node.promptPreview = f.prompt;
    node.commandPreview = f.command;
    node.argsPreview = f.args;
  }
}

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CheckOutcome {
  exit: number;
  report?: CheckReport;
  /** Raw stdout — shown when the report does not parse. */
  raw: string;
}

interface CacheEntry<T> {
  version: number;
  value: T;
}

export class NikaService {
  private binary: string | undefined;
  private capsValue = noCapabilities();
  private readonly changeEmitter = new EventEmitter<void>();
  readonly onDidChange: Event<void> = this.changeEmitter.event;
  /** Fired after a check/graph completes for a document (uri string). */
  private readonly updateEmitter = new EventEmitter<string>();
  readonly onDidUpdateDocument: Event<string> = this.updateEmitter.event;

  private readonly checkCache = new Map<string, CacheEntry<CheckOutcome>>();
  private readonly graphCache = new Map<string, CacheEntry<GraphDoc | undefined>>();
  // In-flight dedup: concurrent callers for the same (uri, version) share
  // one spawn instead of racing on the same tmp file.
  private readonly checkInFlight = new Map<string, Promise<CheckOutcome>>();
  private readonly graphInFlight = new Map<string, Promise<GraphDoc | undefined>>();
  private tmpSeq = 0;

  get binaryPath(): string | undefined {
    return this.binary;
  }

  get caps(): CapabilitySet {
    return this.capsValue;
  }

  get available(): boolean {
    return this.binary !== undefined && this.capsValue.commands.size > 0;
  }

  private intelValue: SchemaIntel | undefined;

  /** Schema/canon-derived vocabulary (completions · hover). */
  get intel(): SchemaIntel | undefined {
    return this.intelValue;
  }

  private toolCatsValue: Record<string, string> | undefined;

  /** BARE builtin name → kebab category (`nika tools --json` · engine ≥0.94).
   *  Undefined on older binaries — consumers keep their fallback. */
  get toolCats(): Record<string, string> | undefined {
    return this.toolCatsValue;
  }

  private catalogModelsValue: Record<string, CatalogModel[]> | undefined;

  /** Provider → exact model rows (`nika catalog --json` · engine ≥0.94).
   *  Undefined on older binaries — the picker keeps free typing. */
  get catalogModels(): Record<string, CatalogModel[]> | undefined {
    return this.catalogModelsValue;
  }

  /** Set (or clear) the resolved binary and re-probe its surface. */
  async setBinary(binaryPath: string | undefined): Promise<void> {
    this.binary = binaryPath;
    this.checkCache.clear();
    this.graphCache.clear();
    // Forget in-flight spawns from the OLD binary: their .then() would
    // otherwise re-stamp the cleared caches with wrong-binary results.
    // (The processes finish on their own; .finally() deleting an absent
    // key is a no-op.)
    this.checkInFlight.clear();
    this.graphInFlight.clear();
    if (!binaryPath) {
      this.capsValue = noCapabilities();
      this.changeEmitter.fire();
      return;
    }
    const [help, version] = await Promise.all([
      this.spawnCli(binaryPath, ['--help'], 5000),
      this.spawnCli(binaryPath, ['--version'], 5000),
    ]);
    this.capsValue = buildCapabilities(help.stdout, version.stdout || version.stderr);
    this.changeEmitter.fire();

    // Load the schema/canon-derived vocabulary (async — providers pick it
    // up on the next query; a change event re-renders open surfaces).
    this.intelValue = undefined;
    if (this.capsValue.schema && this.capsValue.spec) {
      const [schemaRes, canonRes] = await Promise.all([
        this.spawnCli(binaryPath, ['schema'], 10000),
        this.spawnCli(binaryPath, ['spec', '--canon'], 10000),
      ]);
      try {
        this.intelValue = buildSchemaIntel(JSON.parse(schemaRes.stdout), canonRes.stdout);
      } catch {
        this.intelValue = undefined;
      }
      this.changeEmitter.fire();
    }

    // The binary's own vocabulary (engine ≥0.94 · E1): tool categories
    // + the exact per-provider model rows. Older binaries fail the
    // spawn or the parse — every consumer keeps its fallback.
    this.toolCatsValue = undefined;
    this.catalogModelsValue = undefined;
    const [toolsRes, catalogRes] = await Promise.all([
      this.spawnCli(binaryPath, ['tools', '--json'], 10000),
      this.spawnCli(binaryPath, ['catalog', '--json'], 10000),
    ]);
    if (toolsRes.code === 0) {
      this.toolCatsValue = parseToolCategories(toolsRes.stdout);
    }
    if (catalogRes.code === 0) {
      this.catalogModelsValue = parseCatalogModels(catalogRes.stdout);
    }
    if (this.toolCatsValue || this.catalogModelsValue) { this.changeEmitter.fire(); }
  }

  invalidate(uriString: string): void {
    this.checkCache.delete(uriString);
    this.graphCache.delete(uriString);
    // Detach in-flight runs for this doc too — their completion would
    // re-insert the pre-invalidation result into the cache.
    const prefix = `${uriString}#`;
    for (const key of this.checkInFlight.keys()) {
      if (key.startsWith(prefix)) { this.checkInFlight.delete(key); }
    }
    for (const key of this.graphInFlight.keys()) {
      if (key.startsWith(prefix)) { this.graphInFlight.delete(key); }
    }
  }

  runCli(args: string[], timeoutMs = 30000): Promise<CliResult> {
    if (!this.binary) {
      return Promise.resolve({ code: EXIT.ENV, stdout: '', stderr: 'nika binary not resolved' });
    }
    return this.spawnCli(this.binary, args, timeoutMs);
  }

  private spawnCli(bin: string, args: string[], timeoutMs: number): Promise<CliResult> {
    return new Promise((resolve) => {
      execFile(
        bin,
        args,
        { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1' } },
        (error, stdout, stderr) => {
          let code = 0;
          if (error) {
            const ec = (error as NodeJS.ErrnoException & { code?: unknown }).code;
            code = typeof ec === 'number' ? ec : EXIT.ENV;
          }
          resolve({ code, stdout: stdout ?? '', stderr: stderr ?? '' });
        },
      );
    });
  }

  /** Run `fn` against a real file for `doc` — tmp copy when dirty/untitled. */
  private async withDocFile<T>(doc: TextDocument, fn: (fsPath: string) => Promise<T>): Promise<T> {
    if (!doc.isDirty && doc.uri.scheme === 'file') {
      return fn(doc.uri.fsPath);
    }
    // Unique per invocation (digest + version + pid + seq): two concurrent
    // calls must never share a tmp path — one would unlink it mid-read.
    const digest = crypto.createHash('sha256').update(doc.uri.toString()).digest('hex').slice(0, 12);
    this.tmpSeq += 1;
    const tmp = path.join(
      os.tmpdir(),
      `nika-ext-${digest}-v${doc.version}-${process.pid}-${this.tmpSeq}.nika.yaml`,
    );
    fs.writeFileSync(tmp, doc.getText(), 'utf-8');
    try {
      return await fn(tmp);
    } finally {
      fs.unlink(tmp, () => undefined);
    }
  }

  // ─── check ────────────────────────────────────────────────────────────────

  async checkDocument(doc: TextDocument): Promise<CheckOutcome | undefined> {
    if (!this.caps.check) { return undefined; }
    const key = doc.uri.toString();
    const cached = this.checkCache.get(key);
    if (cached && cached.version === doc.version) { return cached.value; }

    // Capture the version BEING checked: `doc` is a live reference, and
    // stamping the cache with a re-read doc.version would label a stale
    // result as current when the user typed mid-check (then every later
    // call at that version cache-HITS the wrong content).
    const checkedVersion = doc.version;
    const flightKey = `${key}#${checkedVersion}`;
    const inFlight = this.checkInFlight.get(flightKey);
    if (inFlight) { return inFlight; }

    // The cache stamp is GUARDED on still being the registered flight:
    // invalidate()/setBinary() detach flights, and a detached result must
    // not re-stamp a deliberately cleared cache.
    const promise: Promise<CheckOutcome> = this.withDocFile(doc, async (fsPath) => {
      const res = await this.runCli(['check', fsPath, '--json']);
      return {
        exit: res.code,
        report: parseCheckReport(res.stdout),
        raw: res.stdout || res.stderr,
      } satisfies CheckOutcome;
    }).then((outcome) => {
      if (this.checkInFlight.get(flightKey) === promise) {
        this.checkCache.set(key, { version: checkedVersion, value: outcome });
        this.updateEmitter.fire(key);
      }
      return outcome;
    }).finally(() => {
      if (this.checkInFlight.get(flightKey) === promise) {
        this.checkInFlight.delete(flightKey);
      }
    });
    this.checkInFlight.set(flightKey, promise);
    return promise;
  }

  /** Latest cached check, any version — for cheap reads on dirty buffers. */
  peekCheck(uriString: string): CheckOutcome | undefined {
    return this.checkCache.get(uriString)?.value;
  }

  /** `check --infer-permits` — the inferred boundary YAML, when derivable. */
  async inferPermits(doc: TextDocument): Promise<string | undefined> {
    if (!this.caps.check) { return undefined; }
    const res = await this.withDocFile(doc, (fsPath) =>
      this.runCli(['check', fsPath, '--infer-permits', '--no-color']),
    );
    const text = res.stdout.trim();
    return text.includes('permits:') ? text : undefined;
  }

  // ─── graph ────────────────────────────────────────────────────────────────

  async graphDocument(doc: TextDocument): Promise<GraphDoc | undefined> {
    if (!this.caps.graph) { return undefined; }
    const key = doc.uri.toString();
    const cached = this.graphCache.get(key);
    if (cached && cached.version === doc.version) { return cached.value; }

    // Same captured-version discipline as checkDocument (stale-stamp race).
    const checkedVersion = doc.version;
    const flightKey = `${key}#${checkedVersion}`;
    const inFlight = this.graphInFlight.get(flightKey);
    if (inFlight) { return inFlight; }

    const promise: Promise<GraphDoc | undefined> = this.withDocFile(doc, async (fsPath) => {
      const res = await this.runCli(['graph', fsPath, '--format', 'json']);
      if (res.code !== EXIT.OK) { return undefined; }
      try {
        const parsed: unknown = JSON.parse(res.stdout);
        return isGraphDoc(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    }).then((value) => {
      if (this.graphInFlight.get(flightKey) === promise) {
        this.graphCache.set(key, { version: checkedVersion, value });
        this.updateEmitter.fire(key);
      }
      return value;
    }).finally(() => {
      if (this.graphInFlight.get(flightKey) === promise) {
        this.graphInFlight.delete(flightKey);
      }
    });
    this.graphInFlight.set(flightKey, promise);
    return promise;
  }

  /** Latest cached graph, any version — for cheap reads on dirty buffers. */
  peekGraph(uriString: string): GraphDoc | undefined {
    return this.graphCache.get(uriString)?.value;
  }

  /**
   * The DAG for the webview — binary projection first (authoritative ·
   * cost/when/fan-out enriched), client-side parse as the degraded path
   * (binary missing or workflow not yet conformant).
   */
  async dagForDocument(doc: TextDocument): Promise<DagGraph> {
    const text = doc.getText();
    const projected = await this.graphDocument(doc);
    if (projected) {
      const dag = graphDocToDag(projected);
      dag.workflowUri = doc.uri.toString();
      // The engine projects ORDER; the data story (which edges CARRY
      // bindings, under which alias) derives from the text.
      const flow = annotateDataFlow(text, dag.nodes, dag.edges);
      dag.nodes = flow.nodes;
      dag.edges = [...flow.edges, ...flow.ghosts];
      mergeBodyFacts(text, dag.nodes);
      const regions = parseRegions(text);
      if (regions.length > 0) { dag.regions = regions; }
      return dag;
    }

    return clientDagFor(text, doc.uri.toString(), path.basename(doc.uri.fsPath ?? 'workflow'));
    const wf = parseRichWorkflow(text);
    const base: DagGraph = {
      workflowName: wf.name ?? path.basename(doc.uri.fsPath ?? 'workflow'),
      workflowUri: doc.uri.toString(),
      nodes: wf.tasks.map((t) => ({
        id: t.id,
        label: t.id,
        verb: t.verb,
        status: 'pending' as const,
        model: t.model ?? wf.defaultModel,
        tool: t.tool,
        dependsOn: t.dependsOn,
      })),
      edges: wf.tasks.flatMap((t) =>
        t.dependsOn.map((dep) => ({
          id: `${dep}->${t.id}`,
          source: dep,
          target: t.id,
          isDataEdge: false,
        })),
      ),
    };
    const flow = annotateDataFlow(text, base.nodes, base.edges);
    base.nodes = flow.nodes;
    base.edges = [...flow.edges, ...flow.ghosts];
    mergeBodyFacts(text, base.nodes);
    const regions = parseRegions(text);
    if (regions.length > 0) { base.regions = regions; }
    return base;
  }

  async graphFormat(doc: TextDocument, format: 'mermaid' | 'dot'): Promise<string | undefined> {
    if (!this.caps.graph) { return undefined; }
    const res = await this.withDocFile(doc, (fsPath) =>
      this.runCli(['graph', fsPath, '--format', format]),
    );
    return res.code === EXIT.OK ? res.stdout : undefined;
  }

  // ─── embedded surface (binary = vocabulary SSOT) ─────────────────────────

  async explain(code: string): Promise<string | undefined> {
    if (!this.caps.explain) { return this.explainFromCanon(code); }
    const res = await this.runCli(['explain', code]);
    // exit 2 = the numeric registry doesn't know this code (a TYPED
    // signal — never string-sniff the answer). The spec's conformance
    // codes (NIKA-DAG-003 · NIKA-BUILTIN-001 · …) live in the canon's
    // error_codes table instead — fall back to that projection.
    if (res.code === EXIT.FILE_FINDINGS) {
      return this.explainFromCanon(code) ?? (res.stdout.trim().length > 0 ? res.stdout : undefined);
    }
    return res.stdout.trim().length > 0 ? res.stdout : undefined;
  }

  /** Teach a spec conformance code from the embedded canon (projection). */
  private explainFromCanon(code: string): string | undefined {
    const wanted = code.trim().toUpperCase();
    const row = this.intelValue?.errorCodes.find((c) => c.code === wanted);
    if (!row) { return undefined; }
    return [
      `${row.code} · ${row.category} · transient: ${row.transient}`,
      '',
      `  ${row.failure}`,
      '',
      'Spec conformance code — projected from the embedded canon',
      '(`nika spec --canon` · error_codes). Prose home: spec/05-errors.md.',
    ].join('\n');
  }

  async specText(canon = false): Promise<string | undefined> {
    if (!this.caps.spec) { return undefined; }
    const res = await this.runCli(canon ? ['spec', '--canon'] : ['spec']);
    return res.code === EXIT.OK ? res.stdout : undefined;
  }

  async schemaText(): Promise<string | undefined> {
    if (!this.caps.schema) { return undefined; }
    const res = await this.runCli(['schema']);
    return res.code === EXIT.OK ? res.stdout : undefined;
  }

  async examplesList(): Promise<string[]> {
    if (!this.caps.examples) { return []; }
    const res = await this.runCli(['examples', 'list']);
    if (res.code !== EXIT.OK) { return []; }
    return res.stdout
      .split('\n')
      .map((l) => {
        const m = l.match(/^[\s·•-]*([a-z0-9][a-z0-9_-]+)\b/);
        return m ? m[1] : undefined;
      })
      .filter((s): s is string => s !== undefined);
  }

  async exampleShow(slug: string): Promise<string | undefined> {
    if (!this.caps.examples) { return undefined; }
    const res = await this.runCli(['examples', 'show', slug]);
    return res.code === EXIT.OK ? res.stdout : undefined;
  }

  /** Embedded template slugs — `nika new --from '?'` answers with the set. */
  async templatesList(): Promise<string[]> {
    if (!this.caps.newTemplate) { return []; }
    const probe = path.join(os.tmpdir(), 'nika-ext-templates-probe.nika.yaml');
    const res = await this.runCli(['new', '--from', '?', probe]);
    return parseTemplateSet(`${res.stdout}\n${res.stderr}`);
  }

  async newFromTemplate(slug: string, destFsPath: string): Promise<CliResult> {
    return this.runCli(['new', '--from', slug, destFsPath]);
  }
}
