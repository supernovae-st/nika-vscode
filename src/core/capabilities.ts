// capabilities.ts — capability probing of the resolved binary (pure parse).
//
// The extension adapts to what the binary ACTUALLY ships instead of
// hardcoding a feature matrix: today's static suite (check · inspect ·
// graph · explain · spec · schema · examples · new · completions · trace)
// lights up immediately; `run` / `lsp` / `mcp` light up the day the
// engine ships them — same extension, zero release needed. The probe
// parses `--help` (clap's "Commands:" section), never guesses.

export interface CapabilitySet {
  /** Subcommand names found in `--help`. */
  commands: Set<string>;
  /** `--version` output, trimmed (e.g. "nika-cli 0.80.0"). */
  version: string;
  check: boolean;
  inspect: boolean;
  graph: boolean;
  explain: boolean;
  init: boolean;
  spec: boolean;
  schema: boolean;
  examples: boolean;
  newTemplate: boolean;
  trace: boolean;
  run: boolean;
  lsp: boolean;
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
}

/** True when the probed version is ≥ major.minor (e.g. "nika 0.93.1"). */
export function versionAtLeast(versionText: string, major: number, minor: number): boolean {
  const m = versionText.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) { return false; }
  const [maj, min] = [Number(m[1]), Number(m[2])];
  return maj > major || (maj === major && min >= minor);
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
): CapabilitySet {
  const commands = parseHelpCommands(helpText);
  return {
    commands,
    version: versionText.trim(),
    check: commands.has('check'),
    inspect: commands.has('inspect'),
    graph: commands.has('graph'),
    explain: commands.has('explain'),
    init: commands.has('init'),
    spec: commands.has('spec'),
    schema: commands.has('schema'),
    examples: commands.has('examples'),
    newTemplate: commands.has('new'),
    trace: commands.has('trace'),
    run: commands.has('run'),
    lsp: commands.has('lsp'),
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
  if (caps.graph) { have.push('graph'); }
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
