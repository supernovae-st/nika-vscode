// statusTruth.ts — the one degradation ladder behind the status pill.
//
// The census verdict (W-ERR): every degraded lane existed and NONE of
// them showed — a crashed language server fell back silently, a gen-0
// engine met gen-1 documents without a word, doctor fails lived only
// behind the Station badge. The pill is the ONE place a user glances,
// so the pill owns the truth: worst state wins, and every non-ok state
// names its exact next move (the menu's head action).
//
// V1.2 (annexe A #10-11): ONE fused workspace item — state · findings ·
// cost in the text, `$(sync~spin)` while background work runs, and the
// error background RESERVED for a broken workspace (doctor red — the
// run-blocking findings). A missing binary is a setup state, not a
// breakage: it warns, the welcome view leads.
//
// Pure derive — provable without VS Code.

export type LspState = 'off' | 'starting' | 'running' | 'failed';

export interface TruthInput {
  available: boolean;
  /** Cleaned semver (caller extracts from `--version` output). */
  version: string;
  lspCapable: boolean;
  lspState: LspState;
  runCapable: boolean;
  /** Grammar canary verdict — undefined means not probed yet (silent). */
  gen1: boolean | undefined;
  /** Last `doctor --json` summary.fail — undefined means never probed. */
  doctorFails: number | undefined;
  /** Background work in flight (live run · doctor sweep) — the spin. */
  busy?: boolean;
  /** Workspace rollups from `welcome --deep` — absent until probed. */
  workflowsTotal?: number;
  workflowsWithFindings?: number;
  /** Static cost ceiling across the workspace (before any token). */
  costBoundedUsd?: number;
  costIsFloor?: boolean;
}

export interface TruthAction {
  label: string;
  description: string;
  command: string;
}

export interface Truth {
  severity: 'ok' | 'warn' | 'error';
  /** Status-bar text (codicon syntax allowed). */
  text: string;
  /** Truth lines for the tooltip — degradations first, always honest. */
  tooltip: string[];
  /** Neutral workspace facts for the tooltip (rollups · cost ceiling) —
   *  rendered plain, never with the warning mark. */
  facts: string[];
  /** The exact next move — present iff severity is not 'ok'. */
  headline?: TruthAction;
}

/** The capability rung — what this binary + server actually give. */
function rungOf(t: TruthInput): string {
  if (t.lspCapable && t.lspState === 'running') { return '$(check) lsp'; }
  if (t.runCapable) { return '$(play) run'; }
  return 'static';
}

/** The pill's head glyph — spinning iff background work is live. */
function headOf(t: TruthInput): string {
  return t.busy === true ? '$(sync~spin)' : '$(zap)';
}

/** The one cost grammar (floor honesty): `$X` bounded · `≥ $X` floor. */
function costChip(t: TruthInput): string | undefined {
  const usd = t.costBoundedUsd;
  if (usd === undefined || usd <= 0) { return undefined; }
  const amount = usd.toFixed(usd < 0.1 ? 4 : 2)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return `${t.costIsFloor === true ? '≥ ' : ''}$${amount}`;
}

/** The workspace chips shared by every with-binary rung: findings first
 *  (doctor findings — the run-blocking ones), then the cost ceiling. */
function chipsOf(t: TruthInput): string {
  const chips: string[] = [];
  if (typeof t.doctorFails === 'number' && t.doctorFails > 0) {
    chips.push(`${t.doctorFails} finding${t.doctorFails === 1 ? '' : 's'}`);
  }
  const cost = costChip(t);
  if (cost !== undefined) { chips.push(cost); }
  return chips.map((c) => ` · ${c}`).join('');
}

/** Neutral workspace facts (tooltip tail) — present once deep probed. */
function factLines(t: TruthInput): string[] {
  const lines: string[] = [];
  if (typeof t.workflowsTotal === 'number' && t.workflowsTotal > 0) {
    const flagged = t.workflowsWithFindings ?? 0;
    lines.push(
      flagged > 0
        ? `workspace: ${t.workflowsTotal} workflow${t.workflowsTotal === 1 ? '' : 's'} · ${flagged} with check findings`
        : `workspace: ${t.workflowsTotal} workflow${t.workflowsTotal === 1 ? '' : 's'} · all check clean`,
    );
  }
  const cost = costChip(t);
  if (cost !== undefined) {
    lines.push(`cost ceiling ${cost} — static, before any token is spent`);
  }
  return lines;
}

// ─── The check lane's truth (language status · the {} flyout) ───────────────
//
// The trust illusion (annexe Q · the most dangerous state cell): a nika
// buffer with NO engine shows zero squiggles — indistinguishable from a
// buffer the oracle audited clean. « check: clean » on that buffer is a
// lie. The rule: a clean verdict is claimable ONLY when the oracle
// actually ran; otherwise the lane says OFF and names why. Findings that
// ARE painted (the local secrets lint runs with zero binary) stay a
// findings count — visible squiggles never lied.
//
// Pure derive — provable without VS Code.

export interface CheckLaneInput {
  /** A nika document is active (the lane is silent otherwise). */
  hasActiveDoc: boolean;
  /** Engine binary resolved AND answering. */
  available: boolean;
  /** This binary has `nika check`. */
  checkCapable: boolean;
  /** The `nika.diagnostics.runOn` setting value. */
  runOn: string;
  /** Painted nika findings on the active file (client or LSP). */
  findings: number;
  /** How many of those are errors. */
  errors: number;
}

export interface CheckLaneTruth {
  text: string;
  detail?: string;
  severity: 'info' | 'warn' | 'error';
  /** Which door the item opens: the report, the engine setup, or the
   *  setting that switched the lane off. */
  command: 'report' | 'setup' | 'settings';
}

export function checkLaneTruth(t: CheckLaneInput): CheckLaneTruth {
  if (!t.hasActiveDoc) {
    return { text: '$(check) check', severity: 'info', command: 'report' };
  }
  if (t.findings > 0) {
    const worst = t.errors > 0 ? 'error' : 'warn';
    return {
      text: `$(warning) check: ${t.findings} finding${t.findings === 1 ? '' : 's'}`,
      detail: t.errors > 0 ? `${t.errors} error${t.errors === 1 ? '' : 's'} block the run` : 'warnings only',
      severity: worst,
      command: 'report',
    };
  }
  // Zero squiggles — only an oracle that RAN may call that clean.
  if (!t.available) {
    return {
      text: '$(circle-slash) check: off — engine missing',
      detail: 'no squiggles is not a verdict; nothing has audited this file',
      severity: 'warn',
      command: 'setup',
    };
  }
  if (!t.checkCapable) {
    return {
      text: '$(circle-slash) check: off — this engine predates `check`',
      detail: 'update the binary to audit this file',
      severity: 'warn',
      command: 'setup',
    };
  }
  if (t.runOn === 'off') {
    return {
      text: '$(circle-slash) check: off',
      detail: 'disabled by nika.diagnostics.runOn — nothing audits this file',
      severity: 'info', // the user's own switch — honest label, no nag
      command: 'settings',
    };
  }
  return {
    text: '$(pass-filled) check: clean',
    detail: 'static pre-flight — audit before run',
    severity: 'info',
    command: 'report',
  };
}

export function statusTruth(t: TruthInput): Truth {
  // Rung 0 — no engine at all. A setup state, not a breakage: the warn
  // background points at the welcome view's one gesture (the error
  // background stays reserved for a workspace that IS broken).
  if (!t.available) {
    return {
      severity: 'warn',
      text: `${headOf(t)} nika: no engine`,
      tooltip: ['no engine binary on this machine — every engine surface is parked'],
      facts: [],
      headline: {
        label: '$(zap) Finish setup — install engine + wire everything',
        description: 'verified download · MCP · LSP · one gesture',
        command: 'nika.finishSetup',
      },
    };
  }

  const tooltip: string[] = [];
  const fails = typeof t.doctorFails === 'number' ? t.doctorFails : 0;
  if (fails > 0) {
    tooltip.push(`doctor: ${fails} finding${fails === 1 ? '' : 's'} failing — the Station carries the exact fix commands`);
  }

  // Rung 1 — the workspace is BROKEN: doctor red, runs blocked. The
  // ONE state that earns the error background (annexe A #11).
  if (fails > 0) {
    return {
      severity: 'error',
      text: `${headOf(t)} nika ${t.version}${chipsOf(t)}`,
      tooltip,
      facts: factLines(t),
      headline: {
        label: '$(radio-tower) Open the Station',
        description: `${fails} failing finding${fails === 1 ? '' : 's'} — each row carries its fix`,
        command: 'nika.showStation',
      },
    };
  }

  // Rung 2 — the server crashed. The CLI lane keeps working, but the
  // user must KNOW they lost live intelligence (it used to be silent).
  if (t.lspCapable && t.lspState === 'failed') {
    return {
      severity: 'warn',
      text: `${headOf(t)} nika ${t.version} · lsp down${chipsOf(t)}`,
      tooltip: [
        'the language server stopped — completions and live diagnostics are parked',
        'the CLI lane (check · graph · run) still works',
        ...tooltip,
      ],
      facts: factLines(t),
      headline: {
        label: '$(refresh) Restart language server',
        description: 'the crash details are in the output channel',
        command: 'nika.restartServer',
      },
    };
  }

  // A generation gap is the NORMAL state between engine releases (the
  // extension tracks the incoming grammar; scaffolds delegate to
  // `nika new`, so daily authoring follows THE ENGINE's generation).
  // It reads as a quiet truth line — a warn pill with a dead action
  // (« update » to a release that does not exist yet) would nag every
  // current pairing. The Station's grammar row stays the deep surface.
  if (t.gen1 === false) {
    tooltip.unshift('engine speaks the previous grammar generation — scaffolds adapt; the newest lenses arrive with the next engine');
  }

  return {
    severity: 'ok',
    text: `${headOf(t)} nika ${t.version} · ${rungOf(t)}${chipsOf(t)}`,
    tooltip,
    facts: factLines(t),
  };
}
