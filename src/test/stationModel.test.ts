// stationModel.test.ts — the Station snapshot contract.
//
// Fixtures are the REAL shapes captured from a 0.104 binary (doctor
// --json · welcome --deep --json) — the parsers refuse malformed
// payloads whole, normalize the engine's -0.0 empties, and the row
// derivation is pure so every rendering decision is provable here.

import { describe, it, expect } from 'vitest';
import {
  buildStationRows,
  formatBytes,
  formatCost,
  parseDoctorReport,
  parseWelcomeDeep,
} from '../core/stationModel';

const DOCTOR = {
  summary: { ok: 17, warn: 10, fail: 0 },
  findings: [
    { label: 'binary', level: 'ok', detail: 'v0.104.0 · self-contained', fix: null },
    { label: 'agent', level: 'warn', detail: 'zed config exists but Nika MCP is not wired', fix: 'nika wire zed' },
    { label: 'provider', level: 'warn', detail: 'MISTRAL_API_KEY absent', fix: 'export MISTRAL_API_KEY=…' },
  ],
};

const DEEP = {
  context_version: 1,
  identity: { pack_version: '0.1.0-draft', version: '0.104.0' },
  environment: {
    clients: [
      { id: 'cursor', wired: true },
      { id: 'zed', wired: false },
      { id: 'vscode', wired: false },
    ],
    cloud_keys_present: 4,
    cloud_keys_total: 11,
    local_providers: ['ollama', 'lmstudio', 'llamacpp', 'localai', 'vllm'],
    models_bytes: 744901120,
    models_pulled: 2,
  },
  rollups: {
    cost_bounded_usd: -0.0,
    cost_is_floor: false,
    permits_declared: 0,
    runs_cost_usd: -0.0,
    runs_unpriced_calls: 0,
    workflows_clean: 0,
    workflows_total: 0,
    workflows_with_findings: 0,
  },
  workspace: { git: false, root: '.', runs: [], workflows: [] },
};

describe('parseDoctorReport', () => {
  it('reads summary + findings, keeps only real fixes', () => {
    const r = parseDoctorReport(DOCTOR);
    expect(r?.summary).toEqual({ ok: 17, warn: 10, fail: 0 });
    expect(r?.findings).toHaveLength(3);
    expect(r?.findings[0].fix).toBeUndefined();
    expect(r?.findings[1].fix).toBe('nika wire zed');
  });

  it('refuses malformed payloads whole', () => {
    expect(parseDoctorReport(undefined)).toBeUndefined();
    expect(parseDoctorReport({ findings: [] })).toBeUndefined();
    expect(parseDoctorReport({ summary: {}, findings: 'x' })).toBeUndefined();
  });
});

describe('parseWelcomeDeep', () => {
  it('reads the context_version 1 aggregate — presence counts, never values', () => {
    const d = parseWelcomeDeep(DEEP);
    expect(d?.contextVersion).toBe(1);
    expect(d?.engineVersion).toBe('0.104.0');
    expect(d?.environment.clients.map((c) => c.id)).toEqual(['cursor', 'zed', 'vscode']);
    expect(d?.environment.cloudKeysPresent).toBe(4);
    expect(d?.environment.modelsPulled).toBe(2);
  });

  it('normalizes the engine’s -0.0 empties — a receipt never reads $-0', () => {
    const d = parseWelcomeDeep(DEEP);
    expect(Object.is(d?.rollups.costBoundedUsd, -0)).toBe(false);
    expect(d?.rollups.costBoundedUsd).toBe(0);
  });

  it('refuses payloads without the version marker', () => {
    expect(parseWelcomeDeep({ environment: {} })).toBeUndefined();
  });
});

describe('formatters — the one cost grammar', () => {
  it('bounded reads $X · floor reads ≥ $X (never a naked wrong number)', () => {
    expect(formatCost(2.1, false)).toBe('$2.1');
    expect(formatCost(0.0042, true)).toBe('≥ $0.0042');
    expect(formatCost(0, false)).toBe('$0');
  });

  it('bytes humanize at binary units', () => {
    expect(formatBytes(744901120)).toBe('710 MiB');
    expect(formatBytes(0)).toBe('0 B');
  });
});

describe('buildStationRows — pure derivation', () => {
  const snap = {
    binaryPath: '/opt/homebrew/bin/nika',
    engineVersion: 'nika 0.104.0',
    lspState: 'running' as const,
    doctor: parseDoctorReport(DOCTOR),
    deep: parseWelcomeDeep(DEEP),
  };

  it('sections in journey order: engine · doctor · agents · providers · workspace', () => {
    const rows = buildStationRows(snap);
    expect(rows.map((r) => r.id)).toEqual(['engine', 'doctor', 'wired', 'providers', 'workspace']);
  });

  it('doctor rows carry their exact fix as the click action', () => {
    const doctor = buildStationRows(snap).find((r) => r.id === 'doctor');
    expect(doctor?.label).toBe('Doctor — 2 to look at');
    const zed = doctor?.children?.find((c) => c.description === 'nika wire zed');
    expect(zed?.command).toEqual({ id: 'nika.station.applyFix', args: ['nika wire zed'] });
  });

  it('unwired clients get the wire action; wired ones rest', () => {
    const wired = buildStationRows(snap).find((r) => r.id === 'wired');
    expect(wired?.label).toBe('Agents — 1/3 wired');
    const zed = wired?.children?.find((c) => c.id === 'client.zed');
    expect(zed?.command).toEqual({ id: 'nika.station.wire', args: ['zed'] });
    const cursor = wired?.children?.find((c) => c.id === 'client.cursor');
    expect(cursor?.command).toBeUndefined();
  });

  it('no binary → the ONE install action, no dead sections', () => {
    const rows = buildStationRows({ lspState: 'off' });
    expect(rows).toHaveLength(1);
    expect(rows[0].children?.[0].command?.id).toBe('nika.finishSetup');
  });

  it('an off-grammar engine says so — honestly, with the check door', () => {
    const rows = buildStationRows({ ...snap, speaksGrammar: false });
    const grammar = rows[0].children?.find((c) => c.id === 'engine.grammar');
    expect(grammar?.level).toBe('warn');
    expect(grammar?.command?.id).toBe('nika.checkBinary');
  });

  it('empty workspace points at the first gesture, not a zero table', () => {
    const rows = buildStationRows(snap);
    const ws = rows.find((r) => r.id === 'workspace');
    expect(ws?.children?.[0].command?.id).toBe('nika.newSession');
  });
});
