// preflight.ts — the pre-run flight plan (pure · no vscode).
//
// « Costs and secrets visible BEFORE the run »: compose what the binary
// already proves statically (`check --json` — cost ceiling · waves ·
// permits escapes · secret flows) with what the client can verify
// without spending a token (secrets/env declarations vs the actual
// environment · models vs the catalog's key requirements). Every line
// is DERIVED — nothing here executes, estimates never masquerade as
// facts, and what cannot be verified says so (« declared », never
// « verified »).

import { parseRichWorkflow } from '../workflowParser';
import { scanRefs } from './expr';
import type { CheckReport, ReportRequirements } from './cliContract';

// ─── Static facts read from the YAML ────────────────────────────────────────

export interface SecretFact {
  name: string;
  /** `env` · `vault` (default) · `file` — engine SecretSource enum. */
  source: string;
  /** For `env` source: the environment variable name (defaults to the secret name). */
  key?: string;
}

export interface PreflightFacts {
  secrets: SecretFact[];
  /** Keys DEFINED by the envelope `env:` block (values live in the YAML). */
  envDefined: string[];
  /** Env vars the body actually READS (`${{ env.X }}`) — the requirements. */
  envRefs: string[];
  /** model id → task ids that will call it (infer/agent only). */
  models: Map<string, string[]>;
  /** Declared `permits:` categories (fs · net · exec · tools). */
  permitCategories: string[];
  permitsDeclared: boolean;
}

/** E-REQ adapter: the engine's own requirements section (0.95+) IS the
 *  facts — the client parser below survives only as the <0.95 fallback.
 *  Permits stay client-read (not part of the engine contract yet). */
export function factsFromRequirements(req: ReportRequirements, text: string): PreflightFacts {
  const clientFacts = collectPreflightFacts(text);
  return {
    secrets: req.secrets.map((s) => ({
      name: s.name,
      source: s.source,
      key: s.source === 'env' ? s.key : undefined,
    })),
    envDefined: req.env_defined,
    envRefs: req.env_reads,
    models: new Map(req.models.map((m) => [m.model, m.tasks])),
    permitCategories: clientFacts.permitCategories,
    permitsDeclared: clientFacts.permitsDeclared,
  };
}

/**
 * Line-based tolerant read of the envelope blocks preflight cares about.
 * Never throws; a half-typed file yields partial facts — and it is the
 * FALLBACK: an engine that states requirements (E-REQ · 0.95+) wins.
 */
export function collectPreflightFacts(text: string): PreflightFacts {
  const lines = text.split('\n');
  const secrets: SecretFact[] = [];
  const envDefined: string[] = [];
  const permitCategories: string[] = [];
  let permitsDeclared = false;

  type Block = 'secrets' | 'env' | 'permits' | null;
  let block: Block = null;
  let current: SecretFact | null = null;

  for (const line of lines) {
    const top = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (top) {
      current = null;
      block = top[1] === 'secrets' ? 'secrets'
        : top[1] === 'env' ? 'env'
          : top[1] === 'permits' ? 'permits' : null;
      if (top[1] === 'permits') { permitsDeclared = true; }
      continue;
    }
    if (block === null) { continue; }
    const key2 = line.match(/^ {2}([A-Za-z0-9_-]+):\s*(.*)$/);
    if (key2) {
      if (block === 'secrets') {
        current = { name: key2[1], source: 'vault' };
        secrets.push(current);
      } else if (block === 'env') {
        envDefined.push(key2[1]);
      } else {
        permitCategories.push(key2[1]);
      }
      continue;
    }
    const key4 = line.match(/^ {4}([A-Za-z0-9_-]+):\s*(.*)$/);
    if (key4 && block === 'secrets' && current) {
      const value = key4[2].replace(/#.*$/, '').trim().replace(/^["']|["']$/g, '');
      if (key4[1] === 'source' && value) { current.source = value; }
      if (key4[1] === 'key' && value) { current.key = value; }
    }
  }

  // Models: infer/agent tasks resolve task-model ?? workflow default.
  const wf = parseRichWorkflow(text);
  const models = new Map<string, string[]>();
  for (const task of wf.tasks) {
    if (task.verb !== 'infer' && task.verb !== 'agent') { continue; }
    const model = task.model ?? wf.defaultModel;
    if (!model) { continue; }
    (models.get(model) ?? models.set(model, []).get(model)!).push(task.id);
  }

  // Requirements = what the body READS: `${{ env.X }}` refs (a key merely
  // defined in the envelope is configuration, not a requirement).
  const envRefs = [...new Set(
    scanRefs(text)
      .filter((r) => r.root === 'env' && r.path.length > 0)
      .map((r) => r.path[0]),
  )];

  return { secrets, envDefined, envRefs, models, permitCategories, permitsDeclared };
}

// ─── Catalog: provider → key requirements ───────────────────────────────────

export interface ProviderKeyInfo {
  envVar?: string;
  requiresKey: boolean;
  local: boolean;
}

/** Parse `nika catalog --json` for the KEY story (id · env_var · local). */
export function parseCatalogProviders(stdout: string): Record<string, ProviderKeyInfo> | undefined {
  try {
    const v = JSON.parse(stdout) as Record<string, unknown>;
    if (typeof v !== 'object' || v === null || !Array.isArray(v.providers)) { return undefined; }
    const out: Record<string, ProviderKeyInfo> = {};
    for (const entry of v.providers as unknown[]) {
      if (typeof entry !== 'object' || entry === null) { continue; }
      const p = entry as Record<string, unknown>;
      if (typeof p.id !== 'string') { continue; }
      out[p.id] = {
        envVar: typeof p.env_var === 'string' && p.env_var.length > 0 ? p.env_var : undefined,
        requiresKey: p.requires_key === true,
        local: p.local === true,
      };
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

// ─── The composed preflight model ────────────────────────────────────────────

export interface PreflightInputs {
  workflowName: string;
  facts: PreflightFacts;
  report?: CheckReport;
  /** Graph for wave narration (real dependencies only — ghosts excluded). */
  graph?: { nodes: Array<{ id: string; verb?: string }>; edges: Array<{ source: string; target: string; ghost?: boolean }> };
  catalog?: Record<string, ProviderKeyInfo>;
  /** Injected environment probe — tests never read the real env. */
  envPresent: (name: string) => boolean;
  /** Last recorded run of THIS workflow, when one exists. */
  lastRun?: { durationMs?: number; costUsd?: number };
}

export interface SecretRow {
  name: string;
  source: string;
  /** 'present' | 'missing' (env) · 'declared' (vault/file — not statically verifiable). */
  status: 'present' | 'missing' | 'declared';
  detail: string;
}

export interface ModelRow {
  model: string;
  tasks: string[];
  /** 'local' | 'key-present' | 'key-missing' | 'unknown' (no catalog). */
  status: 'local' | 'key-present' | 'key-missing' | 'unknown';
  detail: string;
}

export interface PreflightModel {
  workflowName: string;
  clean?: boolean;
  findings: number;
  waves: string[][];
  secretRows: SecretRow[];
  envRows: Array<{ name: string; status: 'defined' | 'present' | 'missing' }>;
  modelRows: ModelRow[];
  permits: { declared: boolean; categories: string[]; escapes: number; leaks: number; egresses: number };
  cost: { label: string; unbounded: boolean; topTasks: Array<{ task: string; label: string }> };
  lastRun?: { durationMs?: number; costUsd?: number };
  /** Blocking truths (missing env secret · missing model key) — the gate list. */
  blockers: string[];
}

/** Kahn waves over real edges, stable in node order — the plan narration. */
function wavesOf(graph: NonNullable<PreflightInputs['graph']>): string[][] {
  const indeg = new Map<string, number>();
  const down = new Map<string, string[]>();
  for (const n of graph.nodes) { indeg.set(n.id, 0); }
  for (const e of graph.edges) {
    if (e.ghost || !indeg.has(e.source) || !indeg.has(e.target)) { continue; }
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    (down.get(e.source) ?? down.set(e.source, []).get(e.source)!).push(e.target);
  }
  const waves: string[][] = [];
  let frontier = graph.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const done = new Set<string>();
  while (frontier.length > 0) {
    waves.push(frontier);
    const next: string[] = [];
    for (const id of frontier) {
      done.add(id);
      for (const t of down.get(id) ?? []) {
        indeg.set(t, (indeg.get(t) ?? 1) - 1);
        if (indeg.get(t) === 0 && !done.has(t)) { next.push(t); }
      }
    }
    frontier = graph.nodes.filter((n) => next.includes(n.id)).map((n) => n.id);
  }
  return waves;
}

const usd = (n: number): string =>
  `$${n.toFixed(n < 0.1 ? 4 : 2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}`;

export function buildPreflight(inputs: PreflightInputs): PreflightModel {
  const { facts, report, catalog, envPresent } = inputs;
  const blockers: string[] = [];

  const secretRows: SecretRow[] = facts.secrets.map((s) => {
    if (s.source === 'env') {
      const key = s.key ?? s.name;
      const present = envPresent(key);
      if (!present) { blockers.push(`secret \`${s.name}\`: env \`${key}\` is not set`); }
      return {
        name: s.name,
        source: 'env',
        status: present ? 'present' : 'missing',
        detail: present ? `env \`${key}\` is set` : `env \`${key}\` is NOT set`,
      };
    }
    return {
      name: s.name,
      source: s.source,
      status: 'declared',
      detail: `${s.source} — presence not statically verifiable`,
    };
  });

  const envRows = facts.envRefs.map((name) => {
    if (facts.envDefined.includes(name)) {
      return { name, status: 'defined' as const };
    }
    const present = envPresent(name);
    if (!present) { blockers.push(`env \`${name}\`: read by the workflow, not set, no workflow default`); }
    return { name, status: present ? ('present' as const) : ('missing' as const) };
  });

  const modelRows: ModelRow[] = [...facts.models.entries()].map(([model, tasks]) => {
    const provider = model.includes('/') ? model.slice(0, model.indexOf('/')) : model;
    if (provider === 'mock') {
      return { model, tasks, status: 'local', detail: 'mock — zero keys, zero spend' };
    }
    const info = catalog?.[provider];
    if (!info) {
      return { model, tasks, status: 'unknown', detail: 'provider not in catalog (older binary or custom) — key not checked' };
    }
    if (info.local || !info.requiresKey) {
      return { model, tasks, status: 'local', detail: 'local · sovereign — no key needed' };
    }
    const present = info.envVar !== undefined && envPresent(info.envVar);
    if (!present) {
      blockers.push(`model \`${model}\`: \`${info.envVar ?? 'API key'}\` is not set`);
    }
    return {
      model,
      tasks,
      status: present ? 'key-present' : 'key-missing',
      detail: present ? `\`${info.envVar}\` is set` : `\`${info.envVar ?? '?'}\` is NOT set`,
    };
  });

  const cost = report?.cost;
  const unbounded = cost?.has_unbounded === true;
  let costLabel = 'no static cost data';
  if (cost) {
    const min = cost.min_path_total_usd;
    const max = cost.bounded_total_usd;
    if (unbounded) {
      costLabel = `≥ ${usd(min ?? max ?? 0)} — UNBOUNDED (a priced task has no max_tokens)`;
    } else if (max !== undefined) {
      costLabel = min !== undefined && min !== max ? `${usd(min)} – ${usd(max)}` : usd(max);
    } else if ((cost.tasks ?? []).every((t) => !t.usd)) {
      costLabel = '$0 — no priced task (mock/local)';
    }
  }
  const topTasks = (cost?.tasks ?? [])
    .filter((t) => typeof t.usd === 'number' && t.usd > 0)
    .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))
    .slice(0, 3)
    .map((t) => ({ task: t.task, label: `${usd(t.usd ?? 0)}${t.max_tokens ? '' : ' (unbounded)'}` }));

  return {
    workflowName: inputs.workflowName,
    clean: report?.clean,
    findings: report?.conformance.length ?? 0,
    waves: inputs.graph ? wavesOf(inputs.graph) : [],
    secretRows,
    envRows,
    modelRows,
    permits: {
      declared: facts.permitsDeclared,
      categories: facts.permitCategories,
      escapes: report?.capability_escapes.length ?? 0,
      leaks: report?.secret_leaks.length ?? 0,
      egresses: report?.secret_egresses.length ?? 0,
    },
    cost: { label: costLabel, unbounded, topTasks },
    lastRun: inputs.lastRun,
    blockers,
  };
}

// ─── The pill chip (glanceable verdict · click = the full flight plan) ──────

export interface PreflightChip {
  text: string;
  cls: 'ok' | 'warn' | 'bad';
  tip: string;
}

export function preflightChipModel(m: PreflightModel): PreflightChip {
  if (m.blockers.length > 0) {
    return {
      text: `✗ ${m.blockers.length} missing`,
      cls: 'bad',
      tip: `${m.blockers.join('\n')}\n\nClick for the flight plan.`,
    };
  }
  const flows = m.permits.leaks + m.permits.egresses;
  if (m.permits.escapes > 0 || flows > 0) {
    const bits: string[] = [];
    if (m.permits.escapes > 0) { bits.push(`${m.permits.escapes} capability escape(s)`); }
    if (flows > 0) { bits.push(`${flows} secret flow(s)`); }
    return {
      text: '⚠ flows',
      cls: 'warn',
      tip: `${bits.join(' · ')} — review before running.\n\nClick for the flight plan.`,
    };
  }
  // A ✓ that verified nothing is a soft lie: unknown-provider models
  // (no catalog on this binary) demote the verdict to a neutral dot.
  const unknown = m.modelRows.filter((r) => r.status === 'unknown').length;
  const facts: string[] = [];
  if (m.modelRows.length > 0) { facts.push(`${m.modelRows.length} model${m.modelRows.length > 1 ? 's' : ''}${unknown > 0 ? ` (${unknown} key${unknown > 1 ? 's' : ''} NOT checked — catalog unavailable)` : ' ok'}`); }
  if (m.secretRows.length > 0) { facts.push(`${m.secretRows.length} secret${m.secretRows.length > 1 ? 's' : ''}`); }
  facts.push(m.permits.declared ? 'boundary declared' : 'engine-floor permits');
  return {
    text: unknown > 0 ? '· preflight' : '✓ preflight',
    cls: 'ok',
    tip: `${facts.join(' · ')}\n\nClick for the flight plan.`,
  };
}

// ─── Markdown rendering (the flight-plan document) ──────────────────────────

export function renderPreflight(m: PreflightModel): string {
  const out: string[] = [];
  out.push(`# Preflight — ${m.workflowName}`);
  out.push('');
  out.push('> Understandable before it runs: every line below is DERIVED — from `nika check --json`, `nika catalog --json`, the YAML, and your environment. Nothing was executed; no token was spent.');
  out.push('');

  out.push('## Verdict');
  out.push('');
  if (m.blockers.length === 0) {
    out.push('**READY** — no missing secret, no missing model key.');
  } else {
    out.push(`**BLOCKED — ${m.blockers.length} missing requirement${m.blockers.length > 1 ? 's' : ''}:**`);
    for (const b of m.blockers) { out.push(`- ${b}`); }
  }
  out.push('');
  out.push(`- Conformance: ${m.clean === true ? 'clean ✓' : m.findings > 0 ? `${m.findings} finding${m.findings > 1 ? 's' : ''} — fix before running` : m.clean === false ? 'not clean' : 'not checked'}`);
  out.push(`- Estimated cost: ${m.cost.label}`);
  if (m.lastRun && (m.lastRun.durationMs !== undefined || m.lastRun.costUsd !== undefined)) {
    const bits: string[] = [];
    if (m.lastRun.durationMs !== undefined) { bits.push(`${(m.lastRun.durationMs / 1000).toFixed(1)}s`); }
    if (m.lastRun.costUsd !== undefined) { bits.push(usd(m.lastRun.costUsd)); }
    out.push(`- Last recorded run: ${bits.join(' · ')}`);
  } else {
    out.push('- Last recorded run: no history');
  }
  out.push('');

  if (m.waves.length > 0) {
    out.push('## The plan');
    out.push('');
    m.waves.forEach((wave, i) => {
      out.push(`- Wave ${i + 1} — ${wave.map((id) => `\`${id}\``).join(' · ')}${wave.length > 1 ? ' (run together)' : ''}`);
    });
    out.push('');
  }

  out.push('## Models & keys');
  out.push('');
  if (m.modelRows.length === 0) {
    out.push('No model-bearing task (no infer/agent) — this workflow spends nothing on inference.');
  } else {
    for (const r of m.modelRows) {
      const icon = r.status === 'key-missing' ? '✗' : r.status === 'unknown' ? '·' : '✓';
      out.push(`- ${icon} \`${r.model}\` — ${r.detail} · used by ${r.tasks.map((t) => `\`${t}\``).join(', ')}`);
    }
  }
  out.push('');

  out.push('## Secrets & env');
  out.push('');
  if (m.secretRows.length === 0 && m.envRows.length === 0) {
    out.push('No `secrets:` or `env:` declared.');
  } else {
    for (const s of m.secretRows) {
      const icon = s.status === 'present' ? '✓' : s.status === 'missing' ? '✗' : '·';
      out.push(`- ${icon} secret \`${s.name}\` (${s.source}) — ${s.detail}`);
    }
    for (const e of m.envRows) {
      const icon = e.status === 'missing' ? '✗' : '✓';
      const detail = e.status === 'defined' ? 'defined in the workflow `env:` block'
        : e.status === 'present' ? 'process env set'
          : 'NOT set (and no workflow default)';
      out.push(`- ${icon} env \`${e.name}\` — ${detail}`);
    }
  }
  out.push('');

  out.push('## Permits & flows');
  out.push('');
  out.push(m.permits.declared
    ? `- Boundary declared: ${m.permits.categories.map((c) => `\`${c}\``).join(' · ') || '(empty = pure compute)'}`
    : '- No `permits:` boundary — the engine floor applies (default-deny; consider `Nika: Insert Inferred Permits Boundary`)');
  out.push(`- Capability escapes: ${m.permits.escapes === 0 ? 'none ✓' : `${m.permits.escapes} — effects outside the boundary (see the check report)`}`);
  out.push(`- Secret flow: ${m.permits.leaks === 0 && m.permits.egresses === 0 ? 'no leak · no egress ✓' : `${m.permits.leaks} leak(s) · ${m.permits.egresses} egress(es) — review before running`}`);
  out.push('');

  if (m.cost.topTasks.length > 0) {
    out.push('## Top cost drivers');
    out.push('');
    for (const t of m.cost.topTasks) { out.push(`- \`${t.task}\` — ${t.label}`); }
    out.push('');
  }

  return out.join('\n');
}
