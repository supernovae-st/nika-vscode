// cliContract.ts — the grounded contracts of the `nika` CLI (pure · no vscode).
//
// Mirrors, field-for-field, what the engine actually emits today:
//   · `nika graph <file> --format json`  → GraphDoc (graph_format: 1 · spec §6)
//   · `nika check <file> --json`         → CheckReport (report_version: 1 · ADR-092)
// Source of truth: crates/nika-cli/src/verbs/{graph,check}.rs +
// crates/nika-schema/src/check/mod.rs. If a field here disagrees with the
// binary, the binary wins — adapters below are tolerant (optional fields,
// unknown keys ignored).

// ─── graph --format json ────────────────────────────────────────────────────

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
}

export interface GraphDocEdge {
  from: string;
  to: string;
  kind: string; // "depends_on" today (closed enum, grows with the spec)
}

export interface GraphDoc {
  graph_format: number;
  workflow: string;
  nodes: GraphDocNode[];
  edges: GraphDocEdge[];
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

export interface DagNode {
  id: string;
  label: string;
  verb: string;
  status: TaskStatus;
  durationMs?: number;
  provider?: string;
  model?: string;
  tool?: string;
  when?: string;
  fanOutKind?: string;
  fanOutCount?: number;
  costMin?: number;
  costMax?: number;
  dependsOn: string[];
  /** Inbound data bindings (alias ← from.path) — the wires, named. */
  bindingsIn?: Array<{ alias: string; from: string; path: string }>;
  /** Card body — what the task SAYS (client YAML read · ≤3 lines). */
  promptPreview?: string;
  /** Card body — the exec command line (client YAML read). */
  commandPreview?: string;
  /** Card body — invoke args summary `k: v · k: v` (client YAML read). */
  argsPreview?: string;
  /** Mean success duration across recorded traces (flight recorder). */
  avgMs?: number;
  /** How many recorded runs back that mean (0/undefined = none). */
  avgRuns?: number;
  /** Edited since its last successful run (dirty cone included). */
  stale?: boolean;
  /** The stale flag is inherited from an edited upstream task. */
  staleUpstream?: boolean;
}

export interface DagEdge {
  id: string;
  source: string;
  target: string;
  isDataEdge: boolean;
  /** Binding name(s) the edge carries (`page` · `output.title`). */
  label?: string;
  /**
   * A data ref WITHOUT its depends_on (NIKA-DAG-003): the wire the
   * author MEANT — rendered red dashed, click declares the dependency.
   */
  ghost?: boolean;
}

export interface DagGraph {
  workflowName: string;
  /**
   * Source document URI (vscode Uri string). Persisted into the webview
   * state so node-click jumps survive panel restoration across restarts.
   */
  workflowUri?: string;
  nodes: DagNode[];
  edges: DagEdge[];
}

export function isGraphDoc(value: unknown): value is GraphDoc {
  if (typeof value !== 'object' || value === null) { return false; }
  const v = value as Record<string, unknown>;
  return typeof v.graph_format === 'number' && Array.isArray(v.nodes) && Array.isArray(v.edges);
}

/** Adapt the CLI's canonical GraphDoc into the webview DagGraph shape. */
export function graphDocToDag(doc: GraphDoc): DagGraph {
  const dependsOn = new Map<string, string[]>();
  for (const edge of doc.edges) {
    const list = dependsOn.get(edge.to) ?? [];
    list.push(edge.from);
    dependsOn.set(edge.to, list);
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
        dependsOn: dependsOn.get(n.id) ?? [],
      };
      if (model) {
        node.model = model;
        const slash = model.indexOf('/');
        if (slash > 0) { node.provider = model.slice(0, slash); }
      }
      if (n.tool) { node.tool = n.tool; }
      // "true" is the implicit default gate — only surface real conditions.
      if (n.when && n.when !== 'true') { node.when = n.when; }
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
    edges: doc.edges.map((e) => ({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      isDataEdge: e.kind !== 'depends_on',
    })),
  };
}

// ─── check --json ───────────────────────────────────────────────────────────

export interface ByteSpan { start: number; end: number }

export interface ConformanceViolation {
  code: string;
  message: string;
  span?: ByteSpan | null;
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
  [key: string]: unknown;
}

export interface SecretLeak { task: string; secret: string; sink: string; trace: string }
export interface SecretEgress { output: string; secret: string; trace: string }
export interface CapabilityEscape { task: string; category: string; detail: string; fix?: string | null }
export interface SchemaTypeFinding { site: string; reference: string; target: string; [key: string]: unknown }
export interface UnknownTool { task: string; tool: string; suggestion?: string | null }
export interface SchemaLintFinding { task: string; path: string; detail: string }
export interface CheckHint { kind: string; task: string; advice: string }

/** The engine's scheduler-independent DAG read (additive · v0.81+). */
export interface ReportDagAnalysis {
  width: number;
  width_witness: string[];
  pinch_points: string[];
  blast_radius: Array<{ task: string; blocks: number }>;
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
  schema_lints: SchemaLintFinding[];
  hints: CheckHint[];
  /** Engine DAG read (width · pinch · blast) — absent on older binaries. */
  analysis?: ReportDagAnalysis;
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
      cost: (typeof v.cost === 'object' && v.cost !== null ? v.cost : { tasks: [] }) as CostCeiling,
      secret_leaks: arr('secret_leaks') as SecretLeak[],
      secret_egresses: arr('secret_egresses') as SecretEgress[],
      capability_escapes: arr('capability_escapes') as CapabilityEscape[],
      schema_findings: arr('schema_findings') as SchemaTypeFinding[],
      unknown_tools: arr('unknown_tools') as UnknownTool[],
      schema_lints: arr('schema_lints') as SchemaLintFinding[],
      hints: arr('hints') as CheckHint[],
      analysis:
        typeof v.analysis === 'object' && v.analysis !== null
          ? (v.analysis as unknown as ReportDagAnalysis)
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
}

/** Failure-class finding count (hints excluded — they never fail a check). */
export function countReportFindings(r: CheckReport): number {
  return (
    r.conformance.length +
    r.secret_leaks.length +
    r.secret_egresses.length +
    r.capability_escapes.length +
    r.schema_findings.length +
    r.unknown_tools.length +
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
    out.push({
      source: 'conformance',
      code: c.code,
      message: c.message,
      severity: 'error',
      span: c.span ?? undefined,
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
