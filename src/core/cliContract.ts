// cliContract.ts — the grounded contracts of the `nika` CLI (pure · no vscode).
//
// Mirrors, field-for-field, what the engine actually emits today:
//   · `nika inspect <file> --format json` → GraphDoc (graph_format: 2 · 03-dag §projection)
//   · `nika check <file> --json`          → CheckReport (report_version: 1 · ADR-092)
// Source of truth: crates/nika-cli/src/verbs/{inspect,check}.rs +
// crates/nika-schema/src/check/mod.rs. If a field here disagrees with the
// binary, the binary wins — adapters below are tolerant WITHIN the format
// (optional fields, unknown keys and unknown edge kinds ignored — the
// fold-tolerance law), but a reader MUST refuse a graph_format it does
// not speak: format 1 is dead, no fallback survives W2.

// ─── inspect --format json ──────────────────────────────────────────────────

export interface GraphDocFanOut {
  kind: string; // "list" | "expression"
  count?: number | null;
}

export interface GraphDocNode {
  id: string;
  verb: string;
  tool?: string | null;
  model?: string | null;
  when?: string | null;
  fan_out?: GraphDocFanOut | null;
  permits?: string[];
  /** [min_path_usd, worst_case_usd] — only for priced inference tasks. */
  cost_interval?: [number, number] | null;
  /** Declared policy, engine-projected (0.99+ graph) — ONE voice: when
   *  these ship, the client stops re-parsing the YAML for them. */
  retry_max_attempts?: number | null;
  timeout_ms?: number | null;
  on_error?: string | null;
  outputs?: string[] | null;
}

/** The graph_format 2 edge kinds (closed at six · additive within the
 *  format · a reader ignores kinds it does not know). `finally` is
 *  RESERVED — named so the enum is complete, never emitted in W2. */
export type GraphEdgeKind =
  | 'value'
  | 'terminal-observation'
  | 'failure-observation'
  | 'control'
  | 'recovery'
  | 'finally';

export interface GraphDocEdge {
  from: string;
  to: string;
  /** Typed kind (GraphEdgeKind values today — unknown kinds tolerated). */
  kind: string;
  /** control edges — the `after:` predicate (succeeded · failed · skipped · terminal). */
  predicate?: string;
  /** data/observation edges — the `with:` binding name that created it. */
  binding?: string;
}

export interface GraphDoc {
  /** Always 2 — `isGraphDoc` refuses any other format (no v1 fallback). */
  graph_format: number;
  workflow: string;
  nodes: GraphDocNode[];
  edges: GraphDocEdge[];
}

/** Data crosses this kind (value + the two observations). */
export function isDataKind(kind: string): boolean {
  return kind === 'value' || kind === 'terminal-observation' || kind === 'failure-observation';
}

/** The kinds that SCHEDULE (G_p = E_d ∪ E_c) — recovery is a parking
 *  read and `finally` a cleanup attachment: neither orders execution. */
export function isSchedulingKind(kind: string): boolean {
  return kind !== 'recovery' && kind !== 'finally';
}

// ─── The webview DAG shape (mirrored in dagPanel.ts / webview/dag.ts) ───────

// Mirrors the engine's §3.1 run-state machine: `retrying` (the attempt
// failed, the TASK has not — amber, transient) and `cancelled` (a
// decision, not a defect — dim, NEVER red) are first-class.
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'retrying'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface SubManifest {
  tasks: number;
  waves: number;
  costMin?: number;
  costMax?: number;
  /** Distinct engine-attributed grants across the child's tasks. */
  permits?: number;
  /** The callable contract joined with the parent's args (spec 01
   *  §vars × invoke args — facts from both sides, check owns the
   *  findings). ≤6 rows travel; the card paints ≤4. */
  contract?: Array<{ name: string; state: 'supplied' | 'default' | 'required-unset' | 'optional'; type?: string }>;
  /** The hover peek's skeleton (≤30 tasks): verb-hued dots in wave
   *  columns + the REAL edges — a miniature of the child's own
   *  projection, never an invented shape. */
  skeleton?: {
    nodes: Array<{ id: string; verb: string; wave: number }>;
    edges: Array<{ source: string; target: string }>;
  };
}

export interface DagNode {
  id: string;
  label: string;
  verb: string;
  status: TaskStatus;
  durationMs?: number;
  /** Agent register size (client YAML read — default-deny means an
   *  absent register is NO tools; the card says the capability). */
  toolsCount?: number;
  /** A live pause parked ON this task — the human question
   *  (nika:prompt · workflow_paused). Cleared on any status move. */
  pausedQuestion?: string;
  /** ADR-099 resume — settled from the recorded output, NOT re-executed
   *  (paints success; this flag keeps the story honest on every surface). */
  cached?: boolean;
  /** `on_error: recover` repaired this success (0.98+ wire) — the NIKA
   *  code the repair absorbed. A repaired success never paints clean. */
  recoveredFrom?: string;
  /** Recorded per-task spend (terminal events' `cost_usd`) — engine
   *  truth, never estimated here. Feeds the canvas live cost ticker. */
  usd?: number;
  /** One badge-safe line of the recorded output (hover-card fact). */
  outputPreview?: string;
  provider?: string;
  model?: string;
  tool?: string;
  when?: string;
  /** Per-task capability grants (`inspect --format json` · the #367
   *  affirmative permits contract) — engine truth, never parsed here. */
  permits?: string[];
  fanOutKind?: string;
  fanOutCount?: number;
  costMin?: number;
  costMax?: number;
  /** Inbound SCHEDULING producers (control + data edges) — the port fact. */
  producers: string[];
  /** Inbound data bindings (alias ← from.path) — the wires, named. */
  bindingsIn?: Array<{ alias: string; from: string; path: string }>;
  /** Card body — what the task SAYS (client YAML read · ≤3 lines). */
  promptPreview?: string;
  /** Card body — the exec command line (client YAML read). */
  commandPreview?: string;
  /** Card body — invoke args summary `k: v · k: v` (client YAML read). */
  argsPreview?: string;
  /** `retry.max_attempts` — the declared retry budget (client YAML read). */
  retryMax?: number;
  /** `timeout` Go-duration string, as written (`30s` · client YAML read). */
  timeout?: string;
  /** `on_error` action — exactly one of recover · skip · fail_workflow. */
  onError?: string;
  /** Named `output:` bindings this task PRODUCES (client YAML read · ≤4). */
  outputNames?: string[];
  /** `on_finally:` cleanup steps declared on this task (client YAML
   *  read) — ALWAYS run on a started task, whatever the outcome. */
  finallyCount?: number;
  /** NIKA-DAG-006 (static gate analysis): the `when:` gate is FALSE
   *  under every reachable combination — this task can never run. */
  deadGate?: boolean;
  /** infer `thinking:` scratch budget (-1 = enabled, no explicit cap). */
  thinkingBudget?: number;
  /** infer `vision:` image inputs riding the prompt. */
  visionCount?: number;
  /** Composition (spec 14): the CHILD workflow's own manifest — read
   *  from ITS engine projection (each file's truth stays its own; the
   *  parent never invents a rollup the engine has not blessed). */
  subManifest?: SubManifest;
  /** `max_parallel:` — the fan-out's concurrency cap. */
  maxParallel?: number;
  /** `fail_fast: false` — per-item error handling (skip-and-report). */
  failFast?: boolean;
  /** Mean success duration across recorded traces (flight recorder). */
  avgMs?: number;
  /** How many recorded runs back that mean (0/undefined = none). */
  avgRuns?: number;
  /** Edited since its last successful run (dirty cone included). */
  stale?: boolean;
  /** The stale flag is inherited from an edited upstream task. */
  staleUpstream?: boolean;
  /** Task-attributed `nika check` findings on this task (0 = none). */
  auditCount?: number;
  /** Worst severity across those findings. */
  auditWorst?: 'error' | 'warning' | 'info';
  /** The task's RECORDED media artifact (latest matching trace · one per
   *  card — first image, else first audio). `src` is a host-absolute
   *  path until DagPanel maps it to a webview URI at post time; `path`
   *  stays host-absolute for the open-artifact jump. Engine truth: the
   *  file the run actually wrote (artifacts.ts), never a guess. */
  artifact?: {
    kind: 'image' | 'audio' | 'file';
    src: string;
    path: string;
    name: string;
    tip?: string;
    /** How many artifacts of that kind the task recorded (label `1/N`). */
    count?: number;
    /** Audio only — recorded duration. */
    durationMs?: number;
  };
}

export interface DagEdge {
  id: string;
  source: string;
  target: string;
  /** graph_format 2 typed kind — value · terminal-observation ·
   *  failure-observation · control · recovery (unknown kinds tolerated,
   *  rendered as data). There is no untyped edge anymore. */
  kind: string;
  /** control edges — the `after:` predicate (succeeded · failed · skipped · terminal). */
  predicate?: string;
  /** data/observation edges — the `with:` binding name riding the wire. */
  label?: string;
}

/** Author-declared task grouping (`# nika:region <name>`). */
export interface DagRegion {
  name: string;
  taskIds: string[];
}

export interface DagGraph {
  /** The resolved binary ships `run --resume` (ADR-099) — the canvas may
   *  offer the re-run-changed affordance. Stamped at graph load. */
  resumeCapable?: boolean;
  workflowName: string;
  /**
   * Source document URI (vscode Uri string). Persisted into the webview
   * state so node-click jumps survive panel restoration across restarts.
   */
  workflowUri?: string;
  nodes: DagNode[];
  edges: DagEdge[];
  /** Author-declared regions (background groupings) — optional. */
  regions?: DagRegion[];
}

/** `30000` → `30s` · `90000` → `1m30s` · `1500` → `1.5s` — the compact
 *  Go-ish display of an engine-projected timeout. */
export function goishDuration(ms: number): string {
  if (ms < 1000) { return `${ms}ms`; }
  const s = ms / 1000;
  if (s < 60) { return Number.isInteger(s) ? `${s}s` : `${s.toFixed(1)}s`; }
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  return rest === 0 ? `${m}m` : `${m}m${rest}s`;
}

/** Accepts ONLY `graph_format: 2` — a reader refuses a format it does
 *  not speak rather than guess (format 1's untyped edges would be
 *  mis-read as ordering; the format number moved for that reason). */
export function isGraphDoc(value: unknown): value is GraphDoc {
  if (typeof value !== 'object' || value === null) { return false; }
  const v = value as Record<string, unknown>;
  return v.graph_format === 2 && Array.isArray(v.nodes) && Array.isArray(v.edges);
}

/** Stable id for one typed edge — TWO edges may share endpoints (a
 *  control edge next to a value edge is the spec's own gate-tightening
 *  pairing), so the kind + its qualifier join the key. */
export function dagEdgeId(e: GraphDocEdge): string {
  return `${e.from}->${e.to}:${e.kind}:${e.binding ?? e.predicate ?? ''}`;
}

/** Adapt the CLI's canonical GraphDoc into the webview DagGraph shape. */
export function graphDocToDag(doc: GraphDoc): DagGraph {
  const producers = new Map<string, string[]>();
  for (const edge of doc.edges) {
    if (!isSchedulingKind(edge.kind)) { continue; } // recovery parks, never orders
    const list = producers.get(edge.to) ?? [];
    if (!list.includes(edge.from)) { list.push(edge.from); }
    producers.set(edge.to, list);
  }

  return {
    workflowName: doc.workflow,
    nodes: doc.nodes.map((n) => {
      const model = n.model ?? undefined;
      const node: DagNode = {
        id: n.id,
        label: n.id,
        verb: n.verb,
        status: 'pending',
        producers: producers.get(n.id) ?? [],
      };
      if (model) {
        node.model = model;
        const slash = model.indexOf('/');
        if (slash > 0) { node.provider = model.slice(0, slash); }
      }
      if (n.tool) { node.tool = n.tool; }
      // "true" is the implicit default gate — only surface real conditions.
      if (n.when && n.when !== 'true') { node.when = n.when; }
      if (n.permits && n.permits.length > 0) { node.permits = n.permits; }
      // Engine-projected policy (0.99+): the DECLARED facts in the
      // engine's own voice — bodyFacts stays the pre-upgrade fallback
      // (mergeBodyFacts only fills what is still undefined).
      if (typeof n.retry_max_attempts === 'number') { node.retryMax = n.retry_max_attempts; }
      if (typeof n.timeout_ms === 'number') { node.timeout = goishDuration(n.timeout_ms); }
      if (typeof n.on_error === 'string') { node.onError = n.on_error; }
      if (Array.isArray(n.outputs) && n.outputs.length > 0) {
        node.outputNames = n.outputs.slice(0, 4);
      }
      if (n.fan_out) {
        node.fanOutKind = n.fan_out.kind;
        if (typeof n.fan_out.count === 'number') { node.fanOutCount = n.fan_out.count; }
      }
      if (n.cost_interval) {
        node.costMin = n.cost_interval[0];
        node.costMax = n.cost_interval[1];
      }
      return node;
    }),
    edges: doc.edges.map((e) => {
      const edge: DagEdge = {
        id: dagEdgeId(e),
        source: e.from,
        target: e.to,
        kind: e.kind,
      };
      if (typeof e.predicate === 'string') { edge.predicate = e.predicate; }
      if (typeof e.binding === 'string') { edge.label = e.binding; }
      return edge;
    }),
  };
}

// ─── check --json ───────────────────────────────────────────────────────────

export interface ByteSpan { start: number; end: number }

export interface ConformanceViolation {
  code: string;
  message: string;
  span?: ByteSpan | null;
  /** Engine-stamped severity (E4 wire · engine ≥0.94) — absent before. */
  severity?: string;
  /** Engine-stamped per-code docs page (`https://nika.sh/errors/<CODE>`). */
  docs_url?: string;
}

export interface TaskCost {
  task: string;
  model?: string | null;
  max_tokens?: number | null;
  usd?: number | null;
  min_path_usd?: number | null;
}

export interface CostCeiling {
  tasks: TaskCost[];
  bounded_total_usd?: number;
  min_path_total_usd?: number;
  /** True when ≥1 priced task has no token limit — the total is a FLOOR. */
  has_unbounded?: boolean;
  [key: string]: unknown;
}

export interface SecretLeak { task: string; secret: string; sink: string; trace: string }
export interface SecretEgress { output: string; secret: string; trace: string }
export interface CapabilityEscape { task: string; category: string; detail: string; fix?: string | null }
export interface SchemaTypeFinding { site: string; reference: string; target: string; [key: string]: unknown }
export interface UnknownTool { task: string; tool: string; suggestion?: string | null }
export interface UnknownArg { task: string; tool: string; arg: string; suggestion?: string | null }
export interface MissingArg { task: string; tool: string; arg: string }
export interface GateFinding {
  task: string;
  /** `dead_task` | `bad_status_literal` (snake_case · non_exhaustive). */
  kind: string;
  detail: string;
  fix?: string | null;
  span?: ByteSpan | null;
}
export interface SchemaLintFinding { task: string; path: string; detail: string }
export interface CheckHint { kind: string; task: string; advice: string }

/** The engine's scheduler-independent DAG read (additive · v0.81+). */
export interface ReportDagAnalysis {
  width: number;
  width_witness: string[];
  pinch_points: string[];
  blast_radius: Array<{ task: string; blocks: number }>;
}

/** E-REQ (0.95+): the caller contract, stated by the checker itself. */
export interface ReportRequirements {
  models: Array<{ model: string; tasks: string[] }>;
  secrets: Array<{ name: string; source: string; key: string }>;
  env_reads: string[];
  env_defined: string[];
  vars_required: string[];
}

export interface CheckReport {
  report_version: number;
  clean?: boolean;
  conformance: ConformanceViolation[];
  waves: number[][];
  cost: CostCeiling;
  secret_leaks: SecretLeak[];
  secret_egresses: SecretEgress[];
  capability_escapes: CapabilityEscape[];
  schema_findings: SchemaTypeFinding[];
  unknown_tools: UnknownTool[];
  /** `args:` keys the builtin does not declare (the jq data-vs-input class). */
  unknown_args: UnknownArg[];
  /** Required `args:` keys absent from the call — fails `nika check`. */
  missing_args: MissingArg[];
  /** `when:`-gate reachability (dead task · bad status literal). */
  gate_findings: GateFinding[];
  schema_lints: SchemaLintFinding[];
  hints: CheckHint[];
  /** Engine DAG read (width · pinch · blast) — absent on older binaries. */
  analysis?: ReportDagAnalysis;
  /** The caller contract (models · secrets · env split · required vars) —
   *  absent on pre-0.95 binaries; the client parser is the fallback. */
  requirements?: ReportRequirements;
  /** Per-model rates from the engine's vendored catalog (0.96+) —
   *  null rates mean UNKNOWN (never rendered as $0). */
  pricing?: ReportPricing;
}

export interface ReportPricing {
  models: Array<{
    model: string;
    input_per_million: number | null;
    output_per_million: number | null;
  }>;
  /** The vendored catalog's provenance (0.98+) — which prices produced
   *  every figure, from when. Old engines omit it: render nothing. */
  snapshot?: {
    source?: string;
    as_of?: string;
    source_sha256_16?: string;
    rules?: number;
    providers?: number;
  };
}

/**
 * Normalize the `cost` block so `cost.tasks` is ALWAYS an array — a real
 * report can carry a `cost` object with no `tasks` key (unbounded-only),
 * and the type claims `TaskCost[]`, so unchecked consumers would throw.
 */
function normalizeCost(raw: unknown): CostCeiling {
  if (typeof raw !== 'object' || raw === null) { return { tasks: [] }; }
  const c = raw as Record<string, unknown>;
  return { ...(c as object), tasks: Array.isArray(c.tasks) ? (c.tasks as TaskCost[]) : [] } as CostCeiling;
}

/** One catalog model, picker-ready: the full id + a one-line fact. */
export interface CatalogModel {
  /** The runnable model id (`claude-sonnet-4-20250514`). */
  model: string;
  /** `200k ctx · reasoning · vision · json:schema` — facts only, may be empty. */
  desc: string;
}

/**
 * Parse `nika catalog --json` (catalog_version 1 · additive-only) into
 * provider → picker-ready model rows. Providers with no models are
 * dropped (the canon list stays the picker's skeleton — the catalog
 * only ENRICHES the step-2 choice). Undefined on garbage, wrong
 * envelope, or an empty map — callers keep the free-typed fallback.
 */
export function parseCatalogModels(stdout: string): Record<string, CatalogModel[]> | undefined {
  try {
    const v = JSON.parse(stdout) as Record<string, unknown>;
    if (typeof v !== 'object' || v === null || !Array.isArray(v.providers)) { return undefined; }
    const out: Record<string, CatalogModel[]> = {};
    for (const entry of v.providers as unknown[]) {
      if (typeof entry !== 'object' || entry === null) { continue; }
      const p = entry as Record<string, unknown>;
      if (typeof p.id !== 'string' || !Array.isArray(p.models)) { continue; }
      const rows: CatalogModel[] = [];
      for (const m of p.models as unknown[]) {
        if (typeof m !== 'object' || m === null) { continue; }
        const mm = m as Record<string, unknown>;
        if (typeof mm.model !== 'string' || mm.model.length === 0) { continue; }
        const facts: string[] = [];
        if (typeof mm.context_window_tokens === 'number' && mm.context_window_tokens > 0) {
          facts.push(`${Math.round(mm.context_window_tokens / 1000)}k ctx`);
        }
        const caps = (typeof mm.capabilities === 'object' && mm.capabilities !== null)
          ? mm.capabilities as Record<string, unknown>
          : {};
        if (caps.reasoning === true) { facts.push('reasoning'); }
        if (caps.vision === true) { facts.push('vision'); }
        if (typeof caps.json_mode === 'string' && caps.json_mode.length > 0) {
          facts.push(`json:${caps.json_mode}`);
        }
        rows.push({ model: mm.model, desc: facts.join(' · ') });
      }
      if (rows.length > 0) { out[p.id] = rows; }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse `nika tools --json` (tools_version 1 · additive-only envelope)
 * into a BARE-name → kebab-category map (`log → core`). Entries without
 * a string category are skipped (catalog gap — the glyph fallback holds).
 * Undefined on non-JSON, wrong envelope, or an empty map — callers keep
 * their presentation fallback.
 */
/** One argument row from a tool's schema (`catalog --tools --json`). */
export interface ToolArgSpec {
  name: string;
  required: boolean;
  type?: string;
  desc?: string;
}

/** One builtin's canvas-relevant vocabulary row (`tools --json`). */
export interface ToolMeta {
  cat: string;
  /** The binary's own one-line description — the palette's teaching voice. */
  desc?: string;
  /** Argument rows (required first · declaration order) — the invoke-lens skeleton source. */
  args?: ToolArgSpec[];
}

export function parseToolMeta(stdout: string): Record<string, ToolMeta> | undefined {
  try {
    const v = JSON.parse(stdout) as Record<string, unknown>;
    if (typeof v !== 'object' || v === null || !Array.isArray(v.tools)) { return undefined; }
    const meta: Record<string, ToolMeta> = {};
    for (const entry of v.tools as unknown[]) {
      if (typeof entry !== 'object' || entry === null) { continue; }
      const t = entry as Record<string, unknown>;
      if (typeof t.name !== 'string' || typeof t.category !== 'string') { continue; }
      const row: ToolMeta = {
        cat: t.category,
        desc: typeof t.description === 'string' && t.description.length > 0
          ? t.description
          : undefined,
      };
      const args = parseToolArgs(t);
      if (args.length > 0) { row.args = args; }
      meta[t.name.replace(/^nika:/, '')] = row;
    }
    return Object.keys(meta).length > 0 ? meta : undefined;
  } catch {
    return undefined;
  }
}

/** The tool's argument rows from its JSON-schema `parameters` (declaration
 * order via `args` when present · required first) — absent schema → []. */
function parseToolArgs(t: Record<string, unknown>): ToolArgSpec[] {
  const params = t.parameters;
  if (typeof params !== 'object' || params === null) { return []; }
  const props = (params as Record<string, unknown>).properties;
  if (typeof props !== 'object' || props === null) { return []; }
  const requiredRaw = (params as Record<string, unknown>).required;
  const required = new Set(
    Array.isArray(requiredRaw) ? requiredRaw.filter((x): x is string => typeof x === 'string') : [],
  );
  const declared = Array.isArray(t.args)
    ? t.args.filter((x): x is string => typeof x === 'string')
    : [];
  const names = declared.length > 0 ? declared : Object.keys(props);
  const rows: ToolArgSpec[] = [];
  for (const name of names) {
    const p = (props as Record<string, unknown>)[name];
    if (typeof p !== 'object' || p === null) { continue; }
    const spec = p as Record<string, unknown>;
    rows.push({
      name,
      required: required.has(name),
      type: typeof spec.type === 'string' ? spec.type : undefined,
      desc: typeof spec.description === 'string' ? spec.description : undefined,
    });
  }
  // Required first, declaration order preserved within each half.
  return [...rows.filter((r) => r.required), ...rows.filter((r) => !r.required)];
}

export function parseCheckReport(jsonText: string): CheckReport | undefined {
  try {
    const v = JSON.parse(jsonText) as Record<string, unknown>;
    if (typeof v !== 'object' || v === null) { return undefined; }
    if (typeof v.report_version !== 'number') { return undefined; }
    const arr = (k: string): unknown[] => (Array.isArray(v[k]) ? (v[k] as unknown[]) : []);
    return {
      report_version: v.report_version,
      clean: typeof v.clean === 'boolean' ? v.clean : undefined,
      conformance: arr('conformance') as ConformanceViolation[],
      waves: arr('waves') as number[][],
      cost: normalizeCost(v.cost),
      secret_leaks: arr('secret_leaks') as SecretLeak[],
      secret_egresses: arr('secret_egresses') as SecretEgress[],
      capability_escapes: arr('capability_escapes') as CapabilityEscape[],
      schema_findings: arr('schema_findings') as SchemaTypeFinding[],
      unknown_tools: arr('unknown_tools') as UnknownTool[],
      unknown_args: arr('unknown_args') as UnknownArg[],
      missing_args: arr('missing_args') as MissingArg[],
      gate_findings: arr('gate_findings') as GateFinding[],
      schema_lints: arr('schema_lints') as SchemaLintFinding[],
      hints: arr('hints') as CheckHint[],
      analysis:
        typeof v.analysis === 'object' && v.analysis !== null
          ? (v.analysis as unknown as ReportDagAnalysis)
          : undefined,
      // E-REQ (engine-stated contract): without this copy the whole
      // requirements adapter is dead code on the wire — the 0.97.0
      // review's exact finding.
      requirements:
        typeof v.requirements === 'object' && v.requirements !== null
          ? (v.requirements as unknown as ReportRequirements)
          : undefined,
      // The SAME class recurred one field later (pricing · 0.97.2): the
      // interface + consumers shipped, the copy didn't, the feature was
      // dead on the wire. The full-wire round-trip test now makes any
      // future omission fail at compile time + test time.
      pricing:
        typeof v.pricing === 'object' && v.pricing !== null
          ? (v.pricing as unknown as ReportPricing)
          : undefined,
    };
  } catch {
    return undefined;
  }
}

// ─── Unified finding (one shape for diagnostics + code actions) ─────────────

export type FindingSource =
  | 'conformance'
  | 'secret-leak'
  | 'secret-egress'
  | 'capability-escape'
  | 'schema-type'
  | 'unknown-tool'
  | 'unknown-arg'
  | 'missing-arg'
  | 'gate'
  | 'schema-lint'
  | 'hint';

export type FindingSeverity = 'error' | 'warning' | 'info';

export interface UnifiedFinding {
  source: FindingSource;
  /** Real NIKA-XXX code when the report carries one, else a stable slug. */
  code: string;
  message: string;
  severity: FindingSeverity;
  span?: ByteSpan;
  /** Task id, when the finding is task-attributed (no span available). */
  task?: string;
  /** Machine-applicable fix line (the ONE grammar: add "X" to permits.<path>). */
  fix?: string;
  /** Did-you-mean replacement, when the report suggests one. */
  suggestion?: string;
  /** Engine-stamped docs page for the code — preferred over any
   *  client-derived URL when present (one truth, the engine's). */
  docsUrl?: string;
}

/** Failure-class finding count (hints excluded — they never fail a check).
 *  Mirrors the engine's `CheckReport::is_clean` family list — a family
 *  missing here paints a CLEAN badge on a file `nika check` exits 2 on. */
export function countReportFindings(r: CheckReport): number {
  return (
    r.conformance.length +
    r.secret_leaks.length +
    r.secret_egresses.length +
    r.capability_escapes.length +
    r.schema_findings.length +
    r.unknown_tools.length +
    r.unknown_args.length +
    r.missing_args.length +
    r.gate_findings.length +
    r.schema_lints.length
  );
}

const NIKA_CODE = /\bNIKA-[A-Z]*-?\d+\b/;

function codeOf(message: string, fallback: string): string {
  const m = message.match(NIKA_CODE);
  return m ? m[0] : fallback;
}

/** Flatten a CheckReport into one diagnostics-ready list. */
export function collectFindings(report: CheckReport): UnifiedFinding[] {
  const out: UnifiedFinding[] = [];

  for (const c of report.conformance) {
    // Engine-stamped severity wins (E4 wire); an unknown future name
    // degrades to error — a finding never silently softens.
    const stamped = c.severity === 'warning' || c.severity === 'info' || c.severity === 'error'
      ? c.severity
      : 'error';
    out.push({
      source: 'conformance',
      code: c.code,
      message: c.message,
      severity: stamped,
      span: c.span ?? undefined,
      docsUrl: typeof c.docs_url === 'string' && c.docs_url.length > 0 ? c.docs_url : undefined,
    });
  }
  for (const l of report.secret_leaks) {
    out.push({
      source: 'secret-leak',
      code: codeOf(l.trace, 'nika.secret-leak'),
      message: `secret \`${l.secret}\` escapes the masking boundary into ${l.sink} — ${l.trace}`,
      severity: 'error',
      task: l.task,
    });
  }
  for (const e of report.secret_egresses) {
    out.push({
      source: 'secret-egress',
      code: codeOf(e.trace, 'nika.secret-egress'),
      message: `secret \`${e.secret}\` leaves the run via outputs.${e.output} — ${e.trace}`,
      severity: 'error',
    });
  }
  for (const esc of report.capability_escapes) {
    out.push({
      source: 'capability-escape',
      code: codeOf(esc.detail, 'nika.capability-escape'),
      message: `${esc.category} effect outside the declared permits: boundary — ${esc.detail}`,
      severity: 'error',
      task: esc.task,
      fix: esc.fix ?? undefined,
    });
  }
  for (const f of report.schema_findings) {
    out.push({
      source: 'schema-type',
      code: codeOf(`${f.site} ${f.reference}`, 'nika.schema-type'),
      message: `\`${f.reference}\` is proven invalid against the declared shape of ${f.target} (at ${f.site})`,
      severity: 'error',
    });
  }
  for (const t of report.unknown_tools) {
    out.push({
      source: 'unknown-tool',
      code: 'nika.unknown-tool',
      message: `unknown builtin \`${t.tool}\`${t.suggestion ? ` — did you mean \`${t.suggestion}\`?` : ''}`,
      severity: 'error',
      task: t.task,
      suggestion: t.suggestion ?? undefined,
    });
  }
  for (const a of report.unknown_args) {
    out.push({
      source: 'unknown-arg',
      code: 'nika.unknown-arg',
      message: `\`${a.tool}\` has no arg \`${a.arg}\`${a.suggestion ? ` — did you mean \`${a.suggestion}\`?` : ''}`,
      severity: 'error',
      task: a.task,
      suggestion: a.suggestion ?? undefined,
    });
  }
  for (const m of report.missing_args) {
    out.push({
      source: 'missing-arg',
      code: 'nika.missing-arg',
      message: `\`${m.tool}\` is missing required arg \`${m.arg}\``,
      severity: 'error',
      task: m.task,
    });
  }
  for (const g of report.gate_findings) {
    out.push({
      source: 'gate',
      code: `nika.gate.${g.kind}`,
      message: g.detail,
      severity: 'error',
      task: g.task,
      span: g.span ?? undefined,
      fix: g.fix ?? undefined,
    });
  }
  for (const s of report.schema_lints) {
    out.push({
      source: 'schema-lint',
      code: 'nika.schema-lint',
      message: `schema defect at ${s.path}: ${s.detail}`,
      severity: 'error',
      task: s.task,
    });
  }
  for (const h of report.hints) {
    out.push({
      source: 'hint',
      code: `nika.hint.${h.kind}`,
      message: h.advice,
      severity: 'info',
      task: h.task,
    });
  }

  return out;
}

// ─── Byte offsets → line/character ──────────────────────────────────────────
// Report spans are UTF-8 BYTE offsets; editor positions are UTF-16 (line,
// character). One forward scan builds the mapping.

export interface TextPosition { line: number; character: number }

export function byteOffsetToPosition(text: string, byteOffset: number): TextPosition {
  let bytes = 0;
  let line = 0;
  let character = 0;
  for (const ch of text) {
    if (bytes >= byteOffset) { break; }
    const code = ch.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (ch === '\n') {
      line += 1;
      character = 0;
    } else {
      // Surrogate pairs count as 2 UTF-16 units (what editors expect).
      character += code >= 0x10000 ? 2 : 1;
    }
  }
  return { line, character };
}

// ─── Topological waves (client-side · mirrors the engine's plan shape) ──────
// Kahn levels over the DagGraph: waves[n] = node ids runnable once wave n-1
// completed. Powers the webview's wave bands + entrance stagger. Cycles
// (only possible on the degraded client-parse path) fall into a final
// catch-all wave instead of looping.

export function topoWaves(nodes: Array<{ id: string }>, edges: Array<{ source: string; target: string }>): string[][] {
  const indegree = new Map<string, number>();
  const downstream = new Map<string, string[]>();
  for (const n of nodes) { indegree.set(n.id, 0); }
  for (const e of edges) {
    if (!indegree.has(e.source) || !indegree.has(e.target)) { continue; }
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    (downstream.get(e.source) ?? downstream.set(e.source, []).get(e.source)!).push(e.target);
  }
  const waves: string[][] = [];
  let frontier = nodes.map((n) => n.id).filter((id) => indegree.get(id) === 0);
  const seen = new Set<string>();
  while (frontier.length > 0) {
    waves.push(frontier);
    for (const id of frontier) { seen.add(id); }
    const next: string[] = [];
    for (const id of frontier) {
      for (const child of downstream.get(id) ?? []) {
        const deg = (indegree.get(child) ?? 0) - 1;
        indegree.set(child, deg);
        if (deg === 0) { next.push(child); }
      }
    }
    frontier = next;
  }
  const leftovers = nodes.map((n) => n.id).filter((id) => !seen.has(id));
  if (leftovers.length > 0) { waves.push(leftovers); } // cycle fallback
  return waves;
}

/**
 * Critical path: the longest chain by per-node weight (duration when known,
 * else 1 hop). Returns the node ids on the path, source → sink.
 */
export function criticalPath(
  nodes: Array<{ id: string; durationMs?: number }>,
  edges: Array<{ source: string; target: string }>,
): string[] {
  const weight = new Map(nodes.map((n) => [n.id, Math.max(n.durationMs ?? 1, 1)]));
  const upstream = new Map<string, string[]>();
  for (const e of edges) {
    (upstream.get(e.target) ?? upstream.set(e.target, []).get(e.target)!).push(e.source);
  }
  const best = new Map<string, { total: number; prev?: string }>();
  for (const wave of topoWaves(nodes, edges)) {
    for (const id of wave) {
      let total = weight.get(id) ?? 1;
      let prev: string | undefined;
      for (const up of upstream.get(id) ?? []) {
        const upBest = best.get(up)?.total ?? 0;
        if (upBest + (weight.get(id) ?? 1) > total) {
          total = upBest + (weight.get(id) ?? 1);
          prev = up;
        }
      }
      best.set(id, { total, prev });
    }
  }
  let tail: string | undefined;
  let max = -1;
  for (const [id, b] of best) {
    if (b.total > max) { max = b.total; tail = id; }
  }
  const path: string[] = [];
  while (tail) {
    path.unshift(tail);
    tail = best.get(tail)?.prev;
  }
  return path;
}

// ─── Template set (`nika new --from '?'`) ───────────────────────────────────
// The binary answers with one line:
//   unknown template `?` — embedded set: agent-loop · chain · etl-state · …

export function parseTemplateSet(text: string): string[] {
  const tail = text.match(/embedded set:\s*([^\n]+)/i)?.[1];
  if (!tail) { return []; }
  return tail
    .split(/[·,]/)
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9][a-z0-9_-]*$/.test(s));
}

// ─── Exit codes (spec §4 · locked) ──────────────────────────────────────────

export const EXIT = {
  OK: 0,
  WORKFLOW_FAILED: 1,
  FILE_FINDINGS: 2,
  ENV: 3,
} as const;
