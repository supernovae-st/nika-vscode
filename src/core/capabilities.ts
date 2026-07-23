// capabilities.ts — capability probing of the resolved binary (pure parse).
//
// The extension adapts to what the binary ACTUALLY ships instead of
// hardcoding a feature matrix: today's static suite (check · inspect ·
// explain · spec · schema · examples · new · completions · trace)
// lights up immediately; `run` / `lsp` / `mcp` light up the day the
// engine ships them — same extension, zero release needed. The probe
// parses `--help` (clap's "Commands:" section), never guesses.

export interface CapabilitySet {
  /** Subcommand names found in `--help`. */
  commands: Set<string>;
  /** `--version` output, trimmed (e.g. "nika-cli 0.80.0"). */
  version: string;
  check: boolean;
  /** `nika inspect` — anatomy AND the one graph projector
   *  (`--format json|mermaid|dot` · graph_format 2). */
  inspect: boolean;
  explain: boolean;
  init: boolean;
  spec: boolean;
  schema: boolean;
  /** `nika model` — local GGUFs: pull · serve · list · rm (0.105+). */
  model: boolean;
  examples: boolean;
  newTemplate: boolean;
  trace: boolean;
  run: boolean;
  lsp: boolean;
  /** `nika dap` — the replay debugger (0.96+). */
  dap: boolean;
  mcp: boolean;
  wire: boolean;
  doctor: boolean;
  /** `nika test <file> [--update]` — golden testing under the mock
   *  provider (offline · deterministic · the 0.94 line). */
  test: boolean;
  /** `run --resume <trace>` + `--from <task>` (ADR-099 · the 0.93 line):
   *  engine-side dirty-slice — unchanged tasks cache-hit with their
   *  recorded output, edited tasks + their cone re-run. */
  resume: boolean;
  /** `check/graph/inspect -` read stdin (engine #190): dirty buffers pipe
   *  straight into the binary — no tmp-file dance. Probed on the REAL
   *  `check --help` text (a version gate would misread dev builds — main
   *  carried the dash while still reporting 0.93.1); pre-dash binaries
   *  keep the tmp fallback. */
  stdinDash: boolean;
  /** `explain <file>` narrates a workflow (engine #298 · the 30s arc):
   *  the positional routes a PATH to the story renderer (waves · cost
   *  honesty · touches · run/trace hand-off) with an `--json` machine
   *  twin. Probed on the REAL `explain --help` doc line (same law as
   *  stdinDash: help text over version numbers — dev builds lie about
   *  versions, never about their own help). Consumed: the explain
   *  command speaks the ENGINE's narration when this probes true. */
  explainFile: boolean;
  /** `nika context` aggregates the workspace (engine 0.99 line · the
   *  30s arc W4): every workflow audited + runs folded + environment,
   *  one versioned JSON. RENAMED to `welcome --deep` on the 0.104
   *  line — this probe keeps the old verb alive for the dev builds
   *  that still carry it; `welcome` is the current door. */
  context: boolean;
  /** `nika welcome` (0.104 line) — `--json` machine snapshot ·
   *  `--deep --json` = the full context aggregate (context_version 1).
   *  Powers the Station view and the `nika_workspace` LM tool. */
  welcome: boolean;
}

/** True when the probed version is ≥ major.minor (e.g. "nika 0.93.1"). */
export function versionAtLeast(versionText: string, major: number, minor: number): boolean {
  const m = versionText.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) { return false; }
  const [maj, min] = [Number(m[1]), Number(m[2])];
  return maj > major || (maj === major && min >= minor);
}

/** The schema door: 0.105 folded the `schema` verb into `spec --schema`.
 *  The door is open when EITHER form ships — consumers try the new form
 *  first and keep the retired verb as the published-binary fallback.
 *  Gating on `schema` alone left every 0.105 user without schema intel
 *  (the fallback chain existed but sat behind a dead outer gate). */
export function hasSchemaDoor(caps: Pick<CapabilitySet, 'spec' | 'schema'>): boolean {
  return caps.spec || caps.schema;
}

/** Parse the clap `--help` output into the set of subcommand names. */
export function parseHelpCommands(helpText: string): Set<string> {
  const commands = new Set<string>();
  const lines = helpText.split('\n');
  let inCommands = false;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (/^Commands:\s*$/.test(line)) {
      inCommands = true;
      continue;
    }
    if (inCommands) {
      // Section ends at the next unindented header ("Options:", "Arguments:").
      if (/^\S/.test(line) && line.trim().length > 0) { break; }
      // Subcommand names sit at EXACTLY 2 spaces (clap). Wrapped description
      // lines align at the description column (much deeper) — a `\s{2,}`
      // match would promote words like "ladder" from a wrapped line into
      // phantom capabilities.
      const m = line.match(/^ {2}([a-z][a-z0-9-]*)(?:\s|$)/);
      if (m && m[1] !== 'help') { commands.add(m[1]); }
    }
  }
  return commands;
}

export function buildCapabilities(
  helpText: string,
  versionText: string,
  checkHelpText = '',
  explainHelpText = '',
): CapabilitySet {
  const commands = parseHelpCommands(helpText);
  return {
    commands,
    version: versionText.trim(),
    check: commands.has('check'),
    inspect: commands.has('inspect'),
    explain: commands.has('explain'),
    init: commands.has('init'),
    spec: commands.has('spec'),
    schema: commands.has('schema'),
    model: commands.has('model'),
    examples: commands.has('examples'),
    newTemplate: commands.has('new'),
    trace: commands.has('trace'),
    run: commands.has('run'),
    lsp: commands.has('lsp'),
    dap: commands.has('dap'),
    mcp: commands.has('mcp'),
    wire: commands.has('wire'),
    doctor: commands.has('doctor'),
    test: commands.has('test'),
    // A flag, not a subcommand — the top-level help can't carry it, so
    // the gate is the release line that shipped ADR-099. A custom build
    // reporting an older version just keeps the affordance hidden.
    resume: commands.has('run') && versionAtLeast(versionText, 0, 93),
    // The dash is an ARGUMENT shape, not a subcommand — the discriminator
    // is its own doc line in `check --help` ("`-` reads stdin").
    stdinDash: commands.has('check') && /reads stdin/.test(checkHelpText),
    // The file form overloads an EXISTING subcommand — the discriminator
    // is its own doc line in `explain --help` (released 0.97 says only
    // « Teach one error code »; the file form adds « narrate a workflow
    // FILE »).
    explainFile: commands.has('explain') && /narrate a workflow FILE/.test(explainHelpText),
    context: commands.has('context'),
    // `welcome --deep` IS the renamed context verb (0.104 line): the
    // machine/workspace aggregate one JSON — wired clients · local
    // providers · key COUNTS (never values) · workflow/run rollups.
    welcome: commands.has('welcome'),
  };
}

/** Empty capability set — binary missing or probe failed. */
export function noCapabilities(): CapabilitySet {
  return buildCapabilities('', '');
}

/** One-line human summary for the status bar tooltip. */
export function describeCapabilities(caps: CapabilitySet): string {
  if (caps.commands.size === 0) { return 'no binary'; }
  const have: string[] = [];
  if (caps.check) { have.push('check'); }
  if (caps.inspect) { have.push('inspect'); }
  if (caps.run) { have.push('run'); }
  if (caps.lsp) { have.push('lsp'); }
  if (caps.mcp) { have.push('mcp'); }
  const pending: string[] = [];
  if (!caps.run) { pending.push('run'); }
  if (!caps.lsp) { pending.push('lsp'); }
  if (!caps.mcp) { pending.push('mcp'); }
  return pending.length === 0
    ? `full surface (${have.join(' · ')})`
    : `static suite (${have.join(' · ')}) — ${pending.join('/')} ship with the engine climb`;
}
