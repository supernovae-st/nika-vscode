// stationModel.test.ts — the Station snapshot contract.
//
// Fixtures are the REAL shapes captured from a 0.104 binary (doctor
// --json · welcome --deep --json) — the parsers refuse malformed
// payloads whole, normalize the engine's -0.0 empties, and the row
// derivation is pure so every rendering decision is provable here.

import { describe, it, expect } from 'vitest';
import {
  buildStationRows,
  deriveStationBadge,
  formatBytes,
  formatCost,
  parseDoctorReport,
  parseModelList,
  parseWelcomeDeep,
  type StationRow,
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

/** Walk every row of the derived tree (sections included). */
function flatten(rows: StationRow[]): StationRow[] {
  return rows.flatMap((r) => [r, ...flatten(r.children ?? [])]);
}

describe('buildStationRows — pure derivation (now · next · recent)', () => {
  const snap = {
    binaryPath: '/opt/homebrew/bin/nika',
    engineVersion: 'nika 0.104.0',
    lspState: 'running' as const,
    doctor: parseDoctorReport(DOCTOR),
    deep: parseWelcomeDeep(DEEP),
  };

  it('three questions top-level — recent hides when no run happened', () => {
    const rows = buildStationRows(snap);
    expect(rows.map((r) => r.id)).toEqual(['now', 'next']);
    const now = rows[0];
    expect(now.children?.map((c) => c.id)).toEqual(['engine', 'wired', 'providers', 'workspace']);
  });

  it('findings group by severity under next — the count rides the description', () => {
    const next = buildStationRows(snap).find((r) => r.id === 'next');
    expect(next?.description).toBe('2 to look at');
    expect(next?.children?.map((c) => c.id)).toEqual(['next.warn']);
    expect(next?.children?.[0].label).toBe('Warnings — 2');
  });

  it('fails outrank warns and set the section level', () => {
    const doctor = parseDoctorReport({
      summary: { ok: 0, warn: 1, fail: 1 },
      findings: [
        { label: 'agent', level: 'warn', detail: 'zed not wired', fix: 'nika wire zed' },
        { label: 'binary', level: 'fail', detail: 'engine too old', fix: 'brew upgrade nika' },
      ],
    });
    const next = buildStationRows({ ...snap, doctor }).find((r) => r.id === 'next');
    expect(next?.level).toBe('fail');
    expect(next?.children?.map((c) => c.id)).toEqual(['next.fail', 'next.warn']);
    expect(next?.children?.[0].label).toBe('Failing — 1');
  });

  it('a finding’s repair rides the wrench (fix), never the primary click', () => {
    const next = buildStationRows(snap).find((r) => r.id === 'next');
    const zed = flatten(next ? [next] : []).find((c) => c.description === 'nika wire zed');
    expect(zed?.fix).toEqual({ id: 'nika.station.applyFix', args: ['nika wire zed'] });
    expect(zed?.command).toBeUndefined();
  });

  it('all-clear doctor is a NOW fact carrying the report door — next hides', () => {
    const doctor = parseDoctorReport({
      summary: { ok: 3, warn: 0, fail: 0 },
      findings: [{ label: 'binary', level: 'ok', detail: 'v0.104.0', fix: null }],
    });
    const rows = buildStationRows({ ...snap, doctor });
    expect(rows.find((r) => r.id === 'next')).toBeUndefined();
    const clear = rows[0].children?.find((c) => c.id === 'doctor.clear');
    expect(clear?.level).toBe('ok');
    expect(clear?.context).toBe('doctorHead');
    expect(clear?.command).toBeUndefined();
  });

  it('unwired clients repair through the wrench; wired ones rest', () => {
    const wired = buildStationRows(snap)[0].children?.find((r) => r.id === 'wired');
    expect(wired?.label).toBe('Agents — 1/3 wired');
    const zed = wired?.children?.find((c) => c.id === 'client.zed');
    expect(zed?.fix).toEqual({ id: 'nika.station.wire', args: ['zed'] });
    expect(zed?.command).toBeUndefined();
    const cursor = wired?.children?.find((c) => c.id === 'client.cursor');
    expect(cursor?.command).toBeUndefined();
    expect(cursor?.fix).toBeUndefined();
  });

  it('no row in the whole tree executes on its primary click', () => {
    // Navigation-only commands may ride a click; anything that spawns
    // a terminal, touches the clipboard or restarts a process must be
    // a `fix` (the wrench) instead.
    const executing = ['nika.station.applyFix', 'nika.station.wire', 'nika.station.doctorReport', 'nika.doctorPing', 'nika.restartServer'];
    for (const row of flatten(buildStationRows({ ...snap, lspState: 'failed' }))) {
      if (row.command) { expect(executing).not.toContain(row.command.id); }
    }
  });

  it('a failed language server repairs through the wrench', () => {
    const rows = buildStationRows({ ...snap, lspState: 'failed' });
    const lsp = rows[0].children?.[0].children?.find((c) => c.id === 'engine.lsp');
    expect(lsp?.fix).toEqual({ id: 'nika.restartServer' });
    expect(lsp?.command).toBeUndefined();
  });

  it('no binary → the ONE install action, no dead sections', () => {
    const rows = buildStationRows({ lspState: 'off' });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('now');
    expect(rows[0].children?.[0].children?.[0].command?.id).toBe('nika.finishSetup');
  });

  it('an off-grammar engine says so — honestly, with the check door', () => {
    const rows = buildStationRows({ ...snap, speaksGrammar: false });
    const grammar = rows[0].children?.[0].children?.find((c) => c.id === 'engine.grammar');
    expect(grammar?.level).toBe('warn');
    expect(grammar?.command?.id).toBe('nika.checkBinary');
  });

  it('empty workspace points at the first gesture, not a zero table', () => {
    const ws = buildStationRows(snap)[0].children?.find((r) => r.id === 'workspace');
    expect(ws?.children?.[0].command?.id).toBe('nika.newSession');
  });
});

describe('buildStationRows — cost rollups (presentation, floor stays source)', () => {
  const deep = parseWelcomeDeep({
    ...DEEP,
    rollups: {
      cost_bounded_usd: 0.42,
      cost_is_floor: true,
      permits_declared: 4,
      runs_cost_usd: 0.12,
      runs_unpriced_calls: 2,
      workflows_clean: 2,
      workflows_total: 3,
      workflows_with_findings: 1,
    },
    workspace: { git: false, root: '.', runs: [{}, {}, {}], workflows: [{}, {}, {}] },
  });
  const snap = {
    binaryPath: '/opt/homebrew/bin/nika',
    lspState: 'running' as const,
    deep,
  };

  it('the ceiling dims into the description; the floor `≥` survives', () => {
    const ws = buildStationRows(snap)[0].children?.find((r) => r.id === 'workspace');
    const cost = ws?.children?.find((c) => c.id === 'ws.cost');
    expect(cost?.label).toBe('ceiling');
    expect(cost?.description).toBe('≥ $0.42 · 4 permits');
    expect(cost?.level).toBe('warn');
  });

  it('the cost tooltip is a markdown breakdown table with the floor honesty note', () => {
    const ws = buildStationRows(snap)[0].children?.find((r) => r.id === 'workspace');
    const cost = ws?.children?.find((c) => c.id === 'ws.cost');
    expect(cost?.tooltipMarkdown).toContain('| ceiling | ≥ $0.42 |');
    expect(cost?.tooltipMarkdown).toContain('| permits declared | 4 |');
    expect(cost?.tooltipMarkdown).toContain('FLOOR, not a ceiling');
  });

  it('recent carries the runs row: spend dimmed · unpriced named · table tooltip', () => {
    const recent = buildStationRows(snap).find((r) => r.id === 'recent');
    const runs = recent?.children?.find((c) => c.id === 'ws.runs');
    expect(runs?.label).toBe('3 runs');
    expect(runs?.description).toBe('spent $0.12 · 2 unpriced');
    expect(runs?.tooltipMarkdown).toContain('| spent | $0.12 |');
    expect(runs?.tooltipMarkdown).toContain('| unpriced calls | 2 |');
    expect(runs?.tooltipMarkdown).toContain('unpriced, never free');
  });
});

describe('deriveStationBadge — the badge law (fails only)', () => {
  const base = { binaryPath: '/x/nika', lspState: 'running' as const };

  it('counts run-blocking findings — doctor FAILS — with a tooltip', () => {
    const doctor = parseDoctorReport({
      summary: { ok: 1, warn: 5, fail: 2 },
      findings: [],
    });
    expect(deriveStationBadge({ ...base, doctor })).toEqual({
      value: 2,
      tooltip: 'nika doctor: 2 failing',
    });
  });

  it('warns never ring the bell; no doctor, no badge — undefined clears', () => {
    const doctor = parseDoctorReport({ summary: { ok: 1, warn: 9, fail: 0 }, findings: [] });
    expect(deriveStationBadge({ ...base, doctor })).toBeUndefined();
    expect(deriveStationBadge(base)).toBeUndefined();
  });
});

describe('buildStationRows — probe honesty (census pattern 5)', () => {
  const base = {
    binaryPath: '/opt/homebrew/bin/nika',
    engineVersion: 'nika 0.104.0',
    lspState: 'running' as const,
  };

  it('a broken probe earns its own row under next: warn · the detail · click retries', () => {
    const rows = buildStationRows({ ...base, doctorBroke: 'Unexpected token < in JSON' });
    const next = rows.find((r) => r.id === 'next');
    const broke = next?.children?.find((r) => r.id === 'doctor.broke');
    expect(broke?.level).toBe('warn');
    expect(broke?.description).toBe('Unexpected token < in JSON');
    expect(broke?.command?.id).toBe('nika.station.refresh');
  });

  it('a broken probe NEVER wears the « predates 0.104 » row — that would be a lie', () => {
    const rows = buildStationRows({ ...base, deepBroke: 'shape mismatch (context_version envelope)' });
    const all = flatten(rows);
    expect(all.find((r) => r.id === 'engine.predates')).toBeUndefined();
    expect(all.find((r) => r.id === 'deep.broke')).toBeDefined();
  });

  it('an unsupported engine keeps the predates row and earns no broke rows', () => {
    const all = flatten(buildStationRows(base));
    expect(all.find((r) => r.id === 'engine.predates')).toBeDefined();
    expect(all.find((r) => r.id === 'doctor.broke')).toBeUndefined();
    expect(all.find((r) => r.id === 'deep.broke')).toBeUndefined();
  });
});

describe('parseModelList — the pulled-GGUF rows (plain text · real 0.105 shape)', () => {
  const REAL = [
    'models · /Users/x/.nika/models',
    '  Qwen/Qwen3-0.6B-GGUF:Q8_0                    ·  609.8 MiB  ·  Qwen3-0.6B-Q8_0.gguf',
    '  bartowski/SmolLM2-135M-Instruct-GGUF:Q4_K_M  ·  100.6 MiB  ·  SmolLM2-135M-Instruct-Q4_K_M.gguf  ·  llama — runner-only',
    '',
    'serve one: nika model serve --model <id>  ·  reclaim: nika model rm <id>',
  ].join('\n');

  it('parses the indented rows · header and footer teachings skipped', () => {
    const models = parseModelList(REAL);
    expect(models).toHaveLength(2);
    expect(models[0]).toEqual({
      id: 'Qwen/Qwen3-0.6B-GGUF:Q8_0',
      size: '609.8 MiB',
      file: 'Qwen3-0.6B-Q8_0.gguf',
    });
    expect(models[1].note).toBe('llama — runner-only');
  });

  it('an empty models dir yields the honest empty list', () => {
    expect(parseModelList('models · /Users/x/.nika/models\n\nserve one: …')).toEqual([]);
    expect(parseModelList('')).toEqual([]);
  });

  it('unexpected shapes fall out silently — never a throw', () => {
    expect(parseModelList('  just-one-field\n  two · fields')).toEqual([]);
  });
});
