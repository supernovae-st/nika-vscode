// statusTruth.ts — the one degradation ladder behind the status pill.
//
// The census verdict (W-ERR): every degraded lane existed and NONE of
// them showed — a crashed language server fell back silently, a gen-0
// engine met gen-1 documents without a word, doctor fails lived only
// behind the Station badge. The pill is the ONE place a user glances,
// so the pill owns the truth: worst state wins, and every non-ok state
// names its exact next move (the menu's head action).
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
  /** The exact next move — present iff severity is not 'ok'. */
  headline?: TruthAction;
}

/** The capability rung — what this binary + server actually give. */
function rungOf(t: TruthInput): string {
  if (t.lspCapable && t.lspState === 'running') { return '$(check) lsp'; }
  if (t.runCapable) { return '$(play) run'; }
  return 'static';
}

export function statusTruth(t: TruthInput): Truth {
  // Rung 0 — no engine at all. Everything else assumes a binary.
  if (!t.available) {
    return {
      severity: 'error',
      text: '$(zap) nika: no binary',
      tooltip: ['no engine binary on this machine — every surface is parked'],
      headline: {
        label: '$(zap) Finish setup — install engine + wire everything',
        description: 'verified download · MCP · LSP · one gesture',
        command: 'nika.finishSetup',
      },
    };
  }

  const tooltip: string[] = [];
  if (typeof t.doctorFails === 'number' && t.doctorFails > 0) {
    tooltip.push(`doctor: ${t.doctorFails} fail${t.doctorFails === 1 ? '' : 's'} — the Station carries the exact fix commands`);
  }

  // Rung 1 — the server crashed. The CLI lane keeps working, but the
  // user must KNOW they lost live intelligence (it used to be silent).
  if (t.lspCapable && t.lspState === 'failed') {
    return {
      severity: 'warn',
      text: `$(zap) nika ${t.version} · lsp down`,
      tooltip: [
        'the language server stopped — completions and live diagnostics are parked',
        'the CLI lane (check · graph · run) still works',
        ...tooltip,
      ],
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
    text: `$(zap) nika ${t.version} · ${rungOf(t)}`,
    tooltip,
  };
}
