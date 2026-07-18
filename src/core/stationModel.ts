// stationModel.ts — the Station's one snapshot (pure parse + derive).
//
// The Station renders what the ENGINE already knows — Lane A only:
// `nika welcome --deep --json` (context_version 1 · wired clients ·
// local providers · key COUNTS, never values · workspace rollups) and
// `nika doctor --json` (summary + findings, each carrying its exact
// fix command). This module is the typed seam: refuse-malformed
// parsers and a pure row derivation the tree view renders dumbly —
// every behavior here is unit-testable without vscode.
//
// Sovereignty (the alignment doctrine): everything local, key
// PRESENCE only — a secret value never crosses this seam.

// ─── `nika doctor --json` ───────────────────────────────────────────────────

export type DoctorLevel = 'ok' | 'warn' | 'fail';

export interface DoctorFinding {
  label: string;
  level: DoctorLevel;
  detail: string;
  /** The exact repair command — `nika wire zed` · `export X_API_KEY=…`. */
  fix?: string;
}

export interface DoctorReport {
  summary: { ok: number; warn: number; fail: number };
  findings: DoctorFinding[];
}

export function parseDoctorReport(value: unknown): DoctorReport | undefined {
  if (typeof value !== 'object' || value === null) { return undefined; }
  const bag = value as { summary?: unknown; findings?: unknown };
  if (typeof bag.summary !== 'object' || bag.summary === null) { return undefined; }
  if (!Array.isArray(bag.findings)) { return undefined; }
  const s = bag.summary as { ok?: unknown; warn?: unknown; fail?: unknown };
  const summary = {
    ok: typeof s.ok === 'number' ? s.ok : 0,
    warn: typeof s.warn === 'number' ? s.warn : 0,
    fail: typeof s.fail === 'number' ? s.fail : 0,
  };
  const findings: DoctorFinding[] = [];
  for (const row of bag.findings) {
    if (typeof row !== 'object' || row === null) { continue; }
    const f = row as { label?: unknown; level?: unknown; detail?: unknown; fix?: unknown };
    if (typeof f.label !== 'string' || typeof f.detail !== 'string') { continue; }
    const level: DoctorLevel =
      f.level === 'fail' ? 'fail' : f.level === 'warn' ? 'warn' : 'ok';
    findings.push({
      label: f.label,
      level,
      detail: f.detail,
      ...(typeof f.fix === 'string' && f.fix.length > 0 ? { fix: f.fix } : {}),
    });
  }
  return { summary, findings };
}

// ─── `nika welcome --deep --json` (context_version 1) ───────────────────────

export interface WiredClient {
  id: string;
  wired: boolean;
}

export interface StationEnvironment {
  clients: WiredClient[];
  localProviders: string[];
  modelsPulled: number;
  modelsBytes: number;
  cloudKeysPresent: number;
  cloudKeysTotal: number;
}

export interface StationRollups {
  workflowsTotal: number;
  workflowsClean: number;
  workflowsWithFindings: number;
  costBoundedUsd: number;
  costIsFloor: boolean;
  permitsDeclared: number;
  runsCostUsd: number;
  runsUnpricedCalls: number;
}

export interface WelcomeDeep {
  contextVersion: number;
  engineVersion?: string;
  environment: StationEnvironment;
  rollups: StationRollups;
  workflowCount: number;
  runCount: number;
}

function num(v: unknown, fallback = 0): number {
  // The engine emits -0.0 for empty sums — normalize (a receipt never
  // reads « $-0 »).
  return typeof v === 'number' && !Number.isNaN(v) ? (Object.is(v, -0) ? 0 : v) : fallback;
}

export function parseWelcomeDeep(value: unknown): WelcomeDeep | undefined {
  if (typeof value !== 'object' || value === null) { return undefined; }
  const bag = value as {
    context_version?: unknown;
    identity?: unknown;
    environment?: unknown;
    rollups?: unknown;
    workspace?: unknown;
  };
  if (typeof bag.context_version !== 'number') { return undefined; }
  const env = (bag.environment ?? {}) as {
    clients?: unknown;
    local_providers?: unknown;
    models_pulled?: unknown;
    models_bytes?: unknown;
    cloud_keys_present?: unknown;
    cloud_keys_total?: unknown;
  };
  const clients: WiredClient[] = [];
  if (Array.isArray(env.clients)) {
    for (const c of env.clients) {
      const row = c as { id?: unknown; wired?: unknown };
      if (typeof row.id === 'string') {
        clients.push({ id: row.id, wired: row.wired === true });
      }
    }
  }
  const roll = (bag.rollups ?? {}) as Record<string, unknown>;
  const ws = (bag.workspace ?? {}) as { workflows?: unknown; runs?: unknown };
  const identity = (bag.identity ?? {}) as { version?: unknown };
  return {
    contextVersion: bag.context_version,
    ...(typeof identity.version === 'string' ? { engineVersion: identity.version } : {}),
    environment: {
      clients,
      localProviders: Array.isArray(env.local_providers)
        ? env.local_providers.filter((p): p is string => typeof p === 'string')
        : [],
      modelsPulled: num(env.models_pulled),
      modelsBytes: num(env.models_bytes),
      cloudKeysPresent: num(env.cloud_keys_present),
      cloudKeysTotal: num(env.cloud_keys_total),
    },
    rollups: {
      workflowsTotal: num(roll.workflows_total),
      workflowsClean: num(roll.workflows_clean),
      workflowsWithFindings: num(roll.workflows_with_findings),
      costBoundedUsd: num(roll.cost_bounded_usd),
      costIsFloor: roll.cost_is_floor === true,
      permitsDeclared: num(roll.permits_declared),
      runsCostUsd: num(roll.runs_cost_usd),
      runsUnpricedCalls: num(roll.runs_unpriced_calls),
    },
    workflowCount: Array.isArray(ws.workflows) ? ws.workflows.length : 0,
    runCount: Array.isArray(ws.runs) ? ws.runs.length : 0,
  };
}

// ─── The snapshot + pure row derivation ─────────────────────────────────────

/** One CLI probe, discriminated — « the verb doesn't exist », « it
 *  answered nothing » and « it answered garbage » are three different
 *  stories, and the census caught them collapsed into one silent
 *  `undefined` (an 0.104 engine with broken JSON read as « engine too
 *  old »). The Station tells each one apart. */
export type Probe<T> =
  | { kind: 'ok'; value: T }
  /** The capability ladder says this binary has no such verb. */
  | { kind: 'unsupported' }
  /** The spawn failed or stdout came back empty. */
  | { kind: 'no-output' }
  /** Real output that would not parse — engine/extension mismatch. */
  | { kind: 'unparseable'; detail: string };

export interface StationSnapshot {
  /** Which binary won the resolution ladder (absent = none found). */
  binaryPath?: string;
  engineVersion?: string;
  extensionVersion?: string;
  /** Does the engine PARSE this extension's grammar generation? */
  speaksGrammar?: boolean;
  lspState: 'running' | 'starting' | 'failed' | 'off';
  doctor?: DoctorReport;
  deep?: WelcomeDeep;
  /** A probe that ANSWERED but broke (no-output · unparseable) — the
   *  honest row's text. Absent when ok or unsupported. */
  doctorBroke?: string;
  deepBroke?: string;
  /** Workspace scaffold facts (rules files the extension can see). */
  rulesPresent?: boolean;
}

export type StationRowKind =
  | 'section'
  | 'fact'
  | 'finding'
  | 'client'
  | 'action';

export interface StationRow {
  kind: StationRowKind;
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  /** codicon id (the tokens SSOT bindings — pulse · plug · shield …). */
  icon?: string;
  /** `ok`-family severity drives the icon color theme. */
  level?: DoctorLevel;
  /** A command the row runs on click (command id + args). */
  command?: { id: string; args?: unknown[] };
  children?: StationRow[];
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) { return '0 B'; }
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u += 1; }
  return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} ${units[u]}`;
}

/** The one cost grammar (annexe G · floor honesty): bounded `$X`,
 *  floor `≥ $X` — never a naked wrong number. */
export function formatCost(usd: number, isFloor: boolean): string {
  const amount = usd.toFixed(usd > 0 && usd < 0.1 ? 4 : 2)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return `${isFloor ? '≥ ' : ''}$${amount}`;
}

/** Derive the whole tree — pure, so the view stays a dumb renderer. */
export function buildStationRows(snap: StationSnapshot): StationRow[] {
  const rows: StationRow[] = [];

  // ── ENGINE (the NOW card) ──
  const engineChildren: StationRow[] = [];
  if (!snap.binaryPath) {
    engineChildren.push({
      kind: 'action',
      id: 'engine.install',
      label: 'Install the engine',
      description: 'one gesture — verified download · MCP · LSP',
      icon: 'zap',
      level: 'warn',
      command: { id: 'nika.finishSetup' },
    });
  } else {
    engineChildren.push({
      kind: 'fact',
      id: 'engine.binary',
      label: snap.engineVersion ?? 'engine',
      description: snap.binaryPath,
      tooltip: `The binary that won the resolution ladder:\n${snap.binaryPath}`,
      icon: 'zap',
      level: 'ok',
    });
    if (snap.speaksGrammar === false) {
      engineChildren.push({
        kind: 'fact',
        id: 'engine.grammar',
        label: 'speaks an older grammar',
        description: 'this extension writes the refonte language — upgrade the engine',
        icon: 'warning',
        level: 'warn',
        command: { id: 'nika.checkBinary' },
      });
    }
    engineChildren.push({
      kind: 'fact',
      id: 'engine.lsp',
      label: snap.lspState === 'running' ? 'language server on'
        : snap.lspState === 'starting' ? 'language server starting'
          : snap.lspState === 'failed' ? 'language server failed'
            : 'language server off',
      icon: snap.lspState === 'running' ? 'check' : snap.lspState === 'failed' ? 'error' : 'circle-outline',
      level: snap.lspState === 'failed' ? 'fail' : snap.lspState === 'running' ? 'ok' : 'warn',
      command: snap.lspState === 'failed' ? { id: 'nika.restartServer' } : undefined,
    });
  }
  rows.push({
    kind: 'section',
    id: 'engine',
    label: 'Engine',
    icon: 'zap',
    children: engineChildren,
  });

  // An engine without the station surfaces says so — a missing
  // section must never read as « all clear » (silent ≠ healthy). A
  // BROKEN probe is a different story and must never wear this row:
  // « too old » on a current engine whose JSON broke is a lie.
  if (snap.binaryPath && !snap.doctor && !snap.deep
      && snap.doctorBroke === undefined && snap.deepBroke === undefined) {
    rows.push({
      kind: 'fact',
      id: 'engine.predates',
      label: 'this engine predates the station surfaces',
      description: 'doctor --json · welcome --deep arrive with 0.104+',
      icon: 'info',
      level: 'warn',
    });
  }

  // A probe that answered and broke gets its own honest row — never a
  // blank section, never a stale one. Click retries (the cheap move);
  // persistence means an engine/extension mismatch worth reporting.
  const brokeRow = (id: string, surface: string, detail: string): StationRow => ({
    kind: 'fact',
    id,
    label: `${surface} unreadable`,
    description: detail,
    tooltip: 'The engine answered but the JSON did not parse — an engine/extension '
      + 'mismatch, not your project. Click to retry; report it if it persists.',
    icon: 'warning',
    level: 'warn',
    command: { id: 'nika.station.refresh' },
  });
  if (snap.doctorBroke !== undefined) {
    rows.push(brokeRow('doctor.broke', 'doctor --json', snap.doctorBroke));
  }
  if (snap.deepBroke !== undefined) {
    rows.push(brokeRow('deep.broke', 'workspace snapshot', snap.deepBroke));
  }

  // ── FIX (doctor findings that carry a next step) ──
  if (snap.doctor) {
    const actionable = snap.doctor.findings.filter((f) => f.level !== 'ok');
    const label = actionable.length === 0
      ? 'Doctor — all clear'
      : `Doctor — ${actionable.length} to look at`;
    rows.push({
      kind: 'section',
      id: 'doctor',
      label,
      icon: 'pulse',
      level: snap.doctor.summary.fail > 0 ? 'fail' : actionable.length > 0 ? 'warn' : 'ok',
      command: { id: 'nika.station.doctorReport' },
      children: actionable.slice(0, 12).map((f, i) => ({
        kind: 'finding' as const,
        id: `doctor.${f.label}.${i}`,
        label: f.detail,
        description: f.fix,
        tooltip: f.fix ? `${f.detail}\n\nfix: ${f.fix}` : f.detail,
        icon: f.level === 'fail' ? 'error' : 'warning',
        level: f.level,
        command: f.fix ? { id: 'nika.station.applyFix', args: [f.fix] } : undefined,
      })),
    });
  }

  // ── WIRED (agent clients — the extension is the agents' oracle) ──
  if (snap.deep) {
    const clients = snap.deep.environment.clients;
    const wiredCount = clients.filter((c) => c.wired).length;
    rows.push({
      kind: 'section',
      id: 'wired',
      label: `Agents — ${wiredCount}/${clients.length} wired`,
      icon: 'plug',
      children: clients.map((c) => ({
        kind: 'client' as const,
        id: `client.${c.id}`,
        label: c.id,
        description: c.wired
          ? 'MCP wired'
          : 'not wired',
        icon: c.wired ? 'pass-filled' : 'circle-outline',
        level: c.wired ? 'ok' as const : 'warn' as const,
        command: c.wired ? undefined : { id: 'nika.station.wire', args: [c.id] },
      })),
    });
  }

  // ── PROVIDERS (sovereign first — local models are a first-class row) ──
  if (snap.deep) {
    const env = snap.deep.environment;
    rows.push({
      kind: 'section',
      id: 'providers',
      label: 'Providers',
      icon: 'server-process',
      children: [
        {
          kind: 'fact',
          id: 'providers.local',
          label: `local — ${env.localProviders.join(' · ')}`,
          description: `${env.modelsPulled} model${env.modelsPulled === 1 ? '' : 's'} pulled · ${formatBytes(env.modelsBytes)}`,
          tooltip: 'Local engines need no key — the sovereign lane.\nnika model list · nika doctor --ping',
          icon: 'vm',
          level: 'ok',
          command: { id: 'nika.doctorPing' },
        },
        {
          kind: 'fact',
          id: 'providers.cloud',
          label: `cloud keys — ${env.cloudKeysPresent}/${env.cloudKeysTotal} present`,
          tooltip: 'Key PRESENCE only — values never leave your machine.',
          icon: 'key',
          level: env.cloudKeysPresent > 0 ? 'ok' : 'warn',
        },
      ],
    });
  }

  // ── WORKSPACE (rollups — the engine audited every file) ──
  if (snap.deep) {
    const r = snap.deep.rollups;
    const wsChildren: StationRow[] = [];
    if (r.workflowsTotal === 0) {
      wsChildren.push({
        kind: 'action',
        id: 'ws.first',
        label: 'No workflows yet',
        description: 'new file · describe → generate · examples',
        icon: 'new-file',
        command: { id: 'nika.newSession' },
      });
    } else {
      wsChildren.push({
        kind: 'fact',
        id: 'ws.audit',
        label: `${r.workflowsClean}/${r.workflowsTotal} check clean`,
        description: r.workflowsWithFindings > 0 ? `${r.workflowsWithFindings} with findings` : undefined,
        icon: r.workflowsWithFindings === 0 ? 'pass-filled' : 'warning',
        level: r.workflowsWithFindings === 0 ? 'ok' : 'warn',
      });
      wsChildren.push({
        kind: 'fact',
        id: 'ws.cost',
        label: `ceiling ${formatCost(r.costBoundedUsd, r.costIsFloor)}`,
        description: `${r.permitsDeclared} permits declared`,
        tooltip: r.costIsFloor
          ? 'At least one task is unbounded — this is a FLOOR, not a ceiling.'
          : 'Static cost ceiling across the workspace, before any token is spent.',
        icon: 'credit-card',
        level: r.costIsFloor ? 'warn' : 'ok',
      });
      if (snap.deep.runCount > 0) {
        wsChildren.push({
          kind: 'fact',
          id: 'ws.runs',
          label: `${snap.deep.runCount} recent run${snap.deep.runCount === 1 ? '' : 's'} · spent ${formatCost(r.runsCostUsd, false)}`,
          description: r.runsUnpricedCalls > 0 ? `${r.runsUnpricedCalls} unpriced calls` : undefined,
          tooltip: r.runsUnpricedCalls > 0
            ? 'Unpriced calls: a local model is unpriced, never free.'
            : undefined,
          icon: 'record',
          level: 'ok',
        });
      }
    }
    rows.push({
      kind: 'section',
      id: 'workspace',
      label: 'Workspace',
      icon: 'root-folder',
      children: wsChildren,
    });
  }

  return rows;
}
