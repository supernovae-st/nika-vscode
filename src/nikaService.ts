// nikaService.ts — the ONE seam between the extension and the binary.
//
// Every feature consumes the engine through this service: it resolves the
// binary, probes its REAL capability surface (`--help` · never a hardcoded
// matrix), caches per-document check/graph results, and pipes dirty
// buffers over stdin (`check -` · engine #190) — tmp files only as the
// pre-dash fallback. Vocabulary lives in the binary (spec · schema ·
// templates · examples) — the extension projects, never duplicates.

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
  parseToolMeta,
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
import { GRAMMAR_CANARY_DOC, grammarAccepted } from './core/grammarCanary';
import { parseSemanticDocument, type TaskSpans } from './core/semanticDoc';
import {
  parseDoctorReport,
  parseWelcomeDeep,
  type DoctorReport,
  type WelcomeDeep,
} from './core/stationModel';
import { runCliOnText, spawnCli, type CliResult } from './core/spawn';

export type { CliResult } from './core/spawn';

/** Card substance (prompt · command · args · policy facts) onto the nodes.
 *  Policy fills ONLY what the engine projection left undefined — the
 *  binary's graph (0.99+ policy fields) is the voice; this client YAML
 *  read is the pre-upgrade fallback. */
function mergeBodyFacts(text: string, nodes: import('./core/cliContract').DagNode[]): void {
  const facts = collectBodyFacts(text);
  for (const node of nodes) {
    const f = facts.get(node.id);
    if (!f) { continue; }
    node.promptPreview = f.prompt;
    node.commandPreview = f.command;
    node.argsPreview = f.args;
    node.retryMax ??= f.retryMax;
    node.timeout ??= f.timeout;
    node.onError ??= f.onError;
    node.outputNames ??= f.outputNames;
  }
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
  private readonly spansCache = new Map<string, CacheEntry<TaskSpans>>();
  // In-flight dedup: concurrent callers for the same (uri, version) share
  // one spawn instead of racing on the same tmp file.
  private readonly checkInFlight = new Map<string, Promise<CheckOutcome>>();
  private readonly graphInFlight = new Map<string, Promise<GraphDoc | undefined>>();

  // The `nika/semanticDocument` lane — set while a format-2 server runs
  // (extension.ts wires it on initialize, clears it on server death).
  // The oracle is the SAME projection as `inspect --format json` minus
  // one process spawn per refresh, plus the spans the CLI cannot carry.
  private semanticOracle: ((doc: TextDocument) => Promise<unknown>) | undefined;

  /** Wire (or clear) the LSP semantic-document lane. */
  setSemanticOracle(fn: ((doc: TextDocument) => Promise<unknown>) | undefined): void {
    this.semanticOracle = fn;
  }

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

  private toolCatsValue: Record<string, import('./core/cliContract').ToolMeta> | undefined;

  /** BARE builtin name → kebab category (`nika tools --json` · engine ≥0.94).
   *  Undefined on older binaries — consumers keep their fallback. */
  get toolCats(): Record<string, import('./core/cliContract').ToolMeta> | undefined {
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
    this.grammarValue = undefined;
    if (!binaryPath) {
      this.capsValue = noCapabilities();
      this.changeEmitter.fire();
      return;
    }
    // `check --help` rides along for the dash probe (engine #190), and
    // `explain --help` for the file-form probe (engine #298): on a
    // binary without the subcommand, clap errors and the empty stdout
    // keeps the gate off — no conditional second round-trip.
    const [help, version, checkHelp, explainHelp] = await Promise.all([
      spawnCli(binaryPath, ['--help'], 5000),
      spawnCli(binaryPath, ['--version'], 5000),
      spawnCli(binaryPath, ['check', '--help'], 5000),
      spawnCli(binaryPath, ['explain', '--help'], 5000),
    ]);
    this.capsValue = buildCapabilities(
      help.stdout,
      version.stdout || version.stderr,
      checkHelp.stdout,
      explainHelp.stdout,
    );
    this.changeEmitter.fire();

    // Load the schema/canon-derived vocabulary (async — providers pick it
    // up on the next query; a change event re-renders open surfaces).
    this.intelValue = undefined;
    if (this.capsValue.schema && this.capsValue.spec) {
      // New door first (engine ≥ the Rams pass: `spec --schema`), the
      // retired `schema` verb as the published-binary fallback.
      const [schemaNew, canonRes] = await Promise.all([
        spawnCli(binaryPath, ['spec', '--schema'], 10000),
        spawnCli(binaryPath, ['spec', '--canon'], 10000),
      ]);
      const schemaRes =
        schemaNew.code === 0 ? schemaNew : await spawnCli(binaryPath, ['schema'], 10000);
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
    // New door first (`catalog --tools` · the Rams pass), the retired
    // `tools` verb as the published-binary fallback.
    const [toolsNew, catalogRes] = await Promise.all([
      spawnCli(binaryPath, ['catalog', '--tools', '--json'], 10000),
      spawnCli(binaryPath, ['catalog', '--json'], 10000),
    ]);
    const toolsRes =
      toolsNew.code === 0 ? toolsNew : await spawnCli(binaryPath, ['tools', '--json'], 10000);
    if (toolsRes.code === 0) {
      this.toolCatsValue = parseToolMeta(toolsRes.stdout);
    }
    if (catalogRes.code === 0) {
      this.catalogModelsValue = parseCatalogModels(catalogRes.stdout);
    }
    if (this.toolCatsValue || this.catalogModelsValue) { this.changeEmitter.fire(); }
  }

  invalidate(uriString: string): void {
    this.checkCache.delete(uriString);
    this.graphCache.delete(uriString);
    this.spansCache.delete(uriString);
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

  runCli(args: string[], timeoutMs = 30000, stdin?: string, cwd?: string): Promise<CliResult> {
    if (!this.binary) {
      return Promise.resolve({ code: EXIT.ENV, stdout: '', stderr: 'nika binary not resolved' });
    }
    return spawnCli(this.binary, args, timeoutMs, stdin, cwd);
  }

  /** Run a CLI verb against `doc` — real path when saved, otherwise the
   *  text leg (stdin dash · tmp fallback on pre-dash binaries). Public:
   *  one-shot doc-scoped verbs (explain's engine voice) ride it too. */
  runDocCli(
    doc: TextDocument,
    args: (file: string) => string[],
    timeoutMs = 30000,
  ): Promise<CliResult> {
    if (!doc.isDirty && doc.uri.scheme === 'file') {
      return this.runCli(args(doc.uri.fsPath), timeoutMs);
    }
    return runCliOnText(this, args, doc.getText(), timeoutMs, 'doc');
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
    const promise: Promise<CheckOutcome> = this.runDocCli(doc, (file) => ['check', file, '--json']).then((res) => {
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
    const res = await this.runDocCli(doc, (file) => ['check', file, '--infer-permits', '--color', 'never']);
    const text = res.stdout.trim();
    return text.includes('permits:') ? text : undefined;
  }

  // ─── graph projection (LSP oracle first · `inspect --format` fallback) ───

  async graphDocument(doc: TextDocument): Promise<GraphDoc | undefined> {
    if (!this.caps.inspect && !this.semanticOracle) { return undefined; }
    const key = doc.uri.toString();
    const cached = this.graphCache.get(key);
    if (cached && cached.version === doc.version) { return cached.value; }

    // Same captured-version discipline as checkDocument (stale-stamp race).
    const checkedVersion = doc.version;
    const flightKey = `${key}#${checkedVersion}`;
    const inFlight = this.graphInFlight.get(flightKey);
    if (inFlight) { return inFlight; }

    const promise: Promise<GraphDoc | undefined> = this.projectDocument(doc, key, checkedVersion).then((value) => {
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

  /** The projection ladder. Oracle lane first — one LSP request against
   *  the server's live didChange text (zero process spawn · spans ride
   *  along). A server « parse »/« findings » answer is FINAL: the CLI
   *  is the same engine and would repeat it; only a TRANSPORT miss
   *  (server hiccup · document not open server-side, e.g. the
   *  workspace lint of closed files) falls through to the CLI lane. */
  private async projectDocument(
    doc: TextDocument,
    key: string,
    version: number,
  ): Promise<GraphDoc | undefined> {
    if (this.semanticOracle) {
      try {
        const payload = parseSemanticDocument(await this.semanticOracle(doc));
        if (payload) {
          if (Object.keys(payload.spans).length > 0) {
            this.spansCache.set(key, { version, value: payload.spans });
          }
          return payload.graph;
        }
      } catch {
        // Server died mid-request — the CLI lane still speaks.
      }
    }
    if (!this.caps.inspect) { return undefined; }
    const res = await this.runDocCli(doc, (file) => ['inspect', file, '--format', 'json']);
    if (res.code !== EXIT.OK) { return undefined; }
    try {
      const parsed: unknown = JSON.parse(res.stdout);
      return isGraphDoc(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  /** Latest cached graph, any version — for cheap reads on dirty buffers. */
  peekGraph(uriString: string): GraphDoc | undefined {
    return this.graphCache.get(uriString)?.value;
  }

  /** Task id → declaring range, from the last oracle answer (absent on
   *  the CLI lane — the projection JSON cannot carry ranges). */
  peekSpans(uriString: string): TaskSpans | undefined {
    return this.spansCache.get(uriString)?.value;
  }

  // ─── station surfaces (welcome --deep · doctor --json · the canary) ───────

  private grammarValue: boolean | undefined;

  /** Does THIS binary parse the refonte grammar? (D-V8 product probe —
   *  the Station says it honestly instead of letting doors crash.) */
  async speaksGrammar(): Promise<boolean | undefined> {
    if (!this.caps.check) { return undefined; }
    if (this.grammarValue !== undefined) { return this.grammarValue; }
    const res = await this.runCli(
      ['check', '-', '--json', '--color', 'never'], 20000, GRAMMAR_CANARY_DOC,
    );
    const verdict = grammarAccepted(res.stdout);
    if (verdict !== undefined) { this.grammarValue = verdict; }
    return verdict;
  }

  /** The workspace aggregate — `welcome --deep --json` (0.104 line),
   *  the retired `context --json` as the dev-build fallback. */
  async welcomeDeep(cwd?: string): Promise<WelcomeDeep | undefined> {
    if (!this.caps.welcome && !this.caps.context) { return undefined; }
    const args = this.caps.welcome
      ? ['welcome', '--deep', '--json']
      : ['context', '--json'];
    const res = await this.runCli(args, 20000, undefined, cwd);
    if (res.code !== 0 || !res.stdout) { return undefined; }
    try {
      return parseWelcomeDeep(JSON.parse(res.stdout));
    } catch {
      return undefined;
    }
  }

  /** `doctor --json` — findings carry their exact fix command. A
   *  failing environment may exit non-zero WITH the report: read
   *  stdout regardless. */
  async doctorJson(cwd?: string): Promise<DoctorReport | undefined> {
    if (!this.caps.doctor) { return undefined; }
    const res = await this.runCli(['doctor', '--json'], 20000, undefined, cwd);
    if (!res.stdout) { return undefined; }
    try {
      return parseDoctorReport(JSON.parse(res.stdout));
    } catch {
      return undefined;
    }
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
      // The engine projects the TYPED edges (kind · predicate · binding);
      // the client only overlays the hover io row (alias ← from.path —
      // a declared-bindings read, card substance not edge truth).
      const flow = annotateDataFlow(text, dag.nodes);
      dag.nodes = flow.nodes;
      mergeBodyFacts(text, dag.nodes);
      const regions = parseRegions(text);
      if (regions.length > 0) { dag.regions = regions; }
      return dag;
    }

    return clientDagFor(text, doc.uri.toString(), path.basename(doc.uri.fsPath ?? 'workflow'));
  }

  async graphFormat(doc: TextDocument, format: 'mermaid' | 'dot'): Promise<string | undefined> {
    if (!this.caps.inspect) { return undefined; }
    const res = await this.runDocCli(doc, (file) => ['inspect', file, '--format', format]);
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
    // New door first (`spec --schema` · the Rams pass), the retired
    // `schema` verb as the published-binary fallback.
    const fresh = await this.runCli(['spec', '--schema']);
    if (fresh.code === EXIT.OK) { return fresh.stdout; }
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
