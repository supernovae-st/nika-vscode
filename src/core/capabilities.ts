// capabilities.ts — capability probing of the resolved binary (pure parse).
//
// The extension adapts to what the binary ACTUALLY ships instead of
// hardcoding a feature matrix: today's static suite (check · inspect ·
// explain · spec · examples · new · completions · trace)
// lights up immediately; `run` / `lsp` / `mcp` light up the day the
// engine ships them — same extension, zero release needed. The probe
// parses `--help` and proves omitted doors through their own `--help`,
// never guesses.

/** Every command that can light an extension capability. When the first
 *  screen omits a door, the service proves that door directly. */
export const CAPABILITY_COMMANDS = [
  'check',
  'inspect',
  'explain',
  'init',
  'spec',
  'catalog',
  'model',
  'try',
  'new',
  'trace',
  'run',
  'lsp',
  'dap',
  'mcp',
  'wire',
  'doctor',
  'test',
  'welcome',
] as const;

export interface CapabilitySet {
  /** Subcommand names found in `--help`. */
  commands: Set<string>;
  /** Admitted engine version (e.g. "nika 0.118.1"). */
  version: string;
  check: boolean;
  /** `nika inspect` — anatomy AND the one graph projector
   *  (`--format json|mermaid|dot` · graph_format 3). */
  inspect: boolean;
  explain: boolean;
  init: boolean;
  spec: boolean;
  /** Canonical read flags proven by the command's successful own help. */
  specSchema: boolean;
  catalogTools: boolean;
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
  /** `check --fix` — the in-binary repair loop (`clippy --fix` shape):
   *  applies the typed did-you-mean renames (fields · tools · args),
   *  rewrites the ONE real file and re-audits; ambiguous tokens are
   *  skipped with a note, never guessed. Probed on the `check --help`
   *  text (help text over version numbers). */
  checkFix: boolean;
  /** `explain <file>` narrates a workflow (engine #298 · the 30s arc):
   *  the positional routes a PATH to the story renderer (waves · cost
   *  honesty · touches · run/trace hand-off) with an `--json` machine
   *  twin. Probed on the REAL `explain --help` doc line. The explain
   *  command speaks the ENGINE's narration when this probes true. */
  explainFile: boolean;
  /** `nika welcome` (0.104 line) — `--json` machine snapshot ·
   *  `--deep --json` = the full context aggregate (context_version 1).
   *  Powers the Station view and the `nika_workspace` LM tool. */
  welcome: boolean;
}

/** Parse a clap command table or the 0.116 first-contact help mirror. */
export function parseHelpCommands(helpText: string): Set<string> {
  const commands = new Set<string>();
  const lines = helpText.split('\n');
  let inCommands = false;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    // 0.116's first screen is intentionally a five-line next-step mirror,
    // not clap's exhaustive command table. Capture only an explicit second
    // token; the bare `nika` row is the welcome door, not a subcommand claim.
    const firstContact = line.match(/^nika\s+([a-z][a-z0-9-]*)(?:\s|$)/);
    if (
      firstContact
      && (CAPABILITY_COMMANDS as readonly string[]).includes(firstContact[1])
    ) {
      commands.add(firstContact[1]);
    }
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
  probedOk: readonly string[] = [],
  readHelp: { spec?: string; catalog?: string; run?: string } = {},
): CapabilitySet {
  // The first screen is not an exhaustive capability register. A verb proven
  // by its own successful --help door joins the visible command set.
  const commands = parseHelpCommands(helpText);
  for (const p of probedOk) { commands.add(p); }
  return {
    commands,
    version: versionText.trim(),
    check: commands.has('check'),
    inspect: commands.has('inspect'),
    explain: commands.has('explain'),
    init: commands.has('init'),
    spec: commands.has('spec'),
    specSchema: commands.has('spec') && /^\s+--schema(?:[=\s]|$)/m.test(readHelp.spec ?? ''),
    catalogTools: commands.has('catalog') && /^\s+--tools(?:[=\s]|$)/m.test(readHelp.catalog ?? ''),
    model: commands.has('model'),
    // V5: the showroom door is `try` (the examples verb tree died
    // in 0.107) — the cap keeps its name, its source is the living door.
    examples: commands.has('try'),
    newTemplate: commands.has('new'),
    trace: commands.has('trace'),
    run: commands.has('run'),
    lsp: commands.has('lsp'),
    dap: commands.has('dap'),
    mcp: commands.has('mcp'),
    wire: commands.has('wire'),
    doctor: commands.has('doctor'),
    test: commands.has('test'),
    resume: commands.has('run')
      && /^\s+--resume(?:[=\s]|$)/m.test(readHelp.run ?? '')
      && /^\s+--from(?:[=\s]|$)/m.test(readHelp.run ?? ''),
    // A flag with its own help line.
    checkFix: commands.has('check') && /--fix\b/.test(checkHelpText),
    // The file form overloads an EXISTING subcommand — the discriminator
    // is its own doc line in `explain --help` (released 0.97 says only
    // « Teach one error code »; the file form adds « narrate a workflow
    // FILE »).
    explainFile: commands.has('explain') && /narrate a workflow FILE/.test(explainHelpText),
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
