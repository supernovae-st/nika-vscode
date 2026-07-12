// mcpConfig.ts — IDE-specific MCP configuration
//
// Auto-generates MCP config files for VS Code, Cursor, and Windsurf.
// All functions receive resolvedServerPath and log as parameters (no module state).

import { workspace, Uri, env } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  NIKA_MCP_COMMAND,
  patchCursorLikeConfig,
  patchVscodeConfig,
  type JsonObject,
} from './core/mcpConfigShape';

export type LogFn = (level: string, msg: string) => void;

export function isCursor(): boolean {
  return env.appName === 'Cursor' || env.uriScheme === 'cursor';
}

export function isWindsurf(): boolean {
  return env.appName === 'Windsurf' || env.uriScheme === 'windsurf';
}

// Workspace-committed config files (.cursor/mcp.json · .vscode/mcp.json)
// always reference the PATH-resolved `nika` command — a resolved absolute
// path (auto-download cache · per-machine install) committed to the repo
// would break for every teammate who clones it. Only the per-machine
// Windsurf global config may carry the resolved path.
const PORTABLE_COMMAND = NIKA_MCP_COMMAND;

export async function ensureCursorMcpConfig(_resolvedServerPath: string | undefined, log: LogFn): Promise<void> {
  const folder = workspace.workspaceFolders?.[0];
  if (!folder) { return; }

  const cursorDir = Uri.joinPath(folder.uri, '.cursor');
  const mcpPath = Uri.joinPath(cursorDir, 'mcp.json');

  const existing = await readJsonUri(mcpPath, log);
  if (existing === undefined && await existsUri(mcpPath)) { return; }
  const result = patchCursorLikeConfig(existing, PORTABLE_COMMAND);
  if (!result.changed && existing !== undefined) { return; }

  await workspace.fs.createDirectory(cursorDir);
  await workspace.fs.writeFile(mcpPath, Buffer.from(JSON.stringify(result.config, null, 2)));
  log('INFO', result.migrated
    ? 'Migrated .cursor/mcp.json Nika MCP command to `nika mcp`'
    : 'Auto-generated .cursor/mcp.json for Cursor MCP integration');
}

/** MACHINE-scoped fallback: when `nika` is not reachable on PATH (the
 *  extension-download-only user), Cursor's MCP client cannot start the
 *  oracle from the workspace config's portable `nika` command at all.
 *  ~/.cursor/mcp.json is per-machine (never committed), so the resolved
 *  ABSOLUTE path is correct there — same merge-safe patch, other servers
 *  untouched. The caller gates on the PATH probe: a brew install must
 *  never be shadowed by a downloaded binary. */
export async function ensureCursorGlobalMcpConfig(absoluteServerPath: string, log: LogFn): Promise<void> {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE;
  if (!homeDir) { return; }
  const configDir = path.join(homeDir, '.cursor');
  const configPath = path.join(configDir, 'mcp.json');
  try {
    fs.mkdirSync(configDir, { recursive: true });
    let existing: JsonObject | undefined;
    if (fs.existsSync(configPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as JsonObject;
      } catch {
        return; // malformed JSON — never overwrite what we cannot read
      }
    }
    const result = patchCursorLikeConfig(existing, absoluteServerPath);
    if (!result.changed && existing !== undefined) { return; }
    fs.writeFileSync(configPath, JSON.stringify(result.config, null, 2));
    log('INFO', `Wrote machine-scoped ~/.cursor/mcp.json (nika not on PATH — absolute path used)`);
  } catch (err) {
    log('WARN', `global mcp.json write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Provider groups for the generated rules (derived from the canon). */
export interface RulesIntel {
  cloud: string[];
  local: string[];
  test: string[];
}

export async function ensureCursorRules(log: LogFn, providers?: RulesIntel): Promise<void> {
  const folder = workspace.workspaceFolders?.[0];
  if (!folder) { return; }

  const rulesDir = Uri.joinPath(folder.uri, '.cursor', 'rules');
  const rulePath = Uri.joinPath(rulesDir, 'nika.mdc');

  try {
    await workspace.fs.stat(rulePath);
    return; // Already exists
  } catch {
    // Create
  }

  // Vocabulary derives from the binary at generation time — a hardcoded
  // provider list in generated rules is exactly the teaching-drift class
  // the own-corpus law exists for. No intel → point at the source.
  const providerLines = providers
    ? [
        '## Providers (from the embedded canon at setup time)',
        `cloud: ${providers.cloud.join(', ')}`,
        `local (sovereign · zero-cloud): ${providers.local.join(', ')}`,
        `test: ${providers.test.join(', ')}`,
      ]
    : [
        '## Providers',
        'Run `nika spec --canon` for the canonical provider list (cloud · local-sovereign · test).',
      ];

  const content = [
    '---',
    'description: Nika workflow language rules for AI assistance',
    'globs: ["**/*.nika.yaml", "**/*.nika.yml"]',
    'alwaysApply: false',
    '---',
    '',
    '# Nika Workflow Language',
    '',
    'Envelope: `nika: v1` (always · frozen forever). Extension: .nika.yaml.',
    '',
    '## 4 Verbs (locked forever)',
    '- infer: LLM call ({ prompt, system?, temperature?, schema? })',
    '- exec: subprocess ({ command, cwd?, capture: text|structured })',
    '- invoke: builtin/MCP tool ({ tool, args }) — HTTP fetch = `tool: nika:fetch` (a TOOL, not a verb)',
    '- agent: agent loop ({ model, prompt, tools: default-deny whitelist, max_turns, max_tokens_total })',
    '',
    '## Key Rules',
    '- Interpolation: ${{ vars.x }} · ${{ tasks.id.output }} · ${{ env.KEY }} · ${{ with.alias }}',
    '- Bindings: with: { alias: ${{ tasks.id.output }} } then ${{ with.alias }}',
    '- Model: combined form `model: provider/name` (e.g. anthropic/claude-sonnet-4-6 · mock/echo for tests)',
    '- depends_on is always an array: depends_on: [task_id]',
    '- timeout is a Go-duration string, quoted: timeout: "5m"',
    '- Secrets via ${{ env.KEY }} — NEVER literal keys in YAML',
    '- output: named jq bindings · outputs: = the workflow return value',
    '- when: CEL conditional · retry: { max_attempts, backoff } · on_error: recover:',
    '- After writing or editing any *.nika.yaml, ALWAYS run `nika check <file> --json` and fix every finding before finishing. Never declare the task done while findings remain. Unknown code → `nika explain NIKA-XXXX`.',
    '',
    ...providerLines,
    '',
    'Refer to AGENTS.md for complete documentation · `nika spec <section>` for the embedded spec.',
  ].join('\n');

  await workspace.fs.createDirectory(rulesDir);
  await workspace.fs.writeFile(rulePath, Buffer.from(content));
  log('INFO', 'Auto-generated .cursor/rules/nika.mdc');
}

export async function ensureVscodeMcpConfig(_resolvedServerPath: string | undefined, log: LogFn): Promise<void> {
  const folder = workspace.workspaceFolders?.[0];
  if (!folder) { return; }

  const vscodeDir = Uri.joinPath(folder.uri, '.vscode');
  const mcpPath = Uri.joinPath(vscodeDir, 'mcp.json');

  const existing = await readJsonUri(mcpPath, log);
  if (existing === undefined && await existsUri(mcpPath)) { return; }
  const result = patchVscodeConfig(existing, PORTABLE_COMMAND);
  if (!result.changed && existing !== undefined) { return; }

  await workspace.fs.createDirectory(vscodeDir);
  await workspace.fs.writeFile(mcpPath, Buffer.from(JSON.stringify(result.config, null, 2)));
  log('INFO', result.migrated
    ? 'Migrated .vscode/mcp.json Nika MCP command to `nika mcp`'
    : 'Auto-generated .vscode/mcp.json for VS Code MCP integration');
}

export async function ensureWindsurfMcpConfig(resolvedServerPath: string | undefined, log: LogFn): Promise<void> {
  // Windsurf uses a global config at ~/.codeium/windsurf/mcp_config.json
  const homeDir = process.env.HOME ?? process.env.USERPROFILE;
  if (!homeDir) { return; }

  const configDir = path.join(homeDir, '.codeium', 'windsurf');
  const configPath = path.join(configDir, 'mcp_config.json');

  const nikaPath = resolvedServerPath ?? 'nika';

  try {
    fs.mkdirSync(configDir, { recursive: true });
    let existing: JsonObject | undefined;
    if (fs.existsSync(configPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as JsonObject;
      } catch {
        // Malformed JSON — don't overwrite
        return;
      }
    }
    const result = patchCursorLikeConfig(existing, nikaPath);
    if (!result.changed && existing !== undefined) { return; }
    fs.writeFileSync(configPath, JSON.stringify(result.config, null, 2));
    log('INFO', result.migrated
      ? 'Migrated Windsurf MCP Nika command to `nika mcp`'
      : 'Auto-configured Windsurf MCP at ~/.codeium/windsurf/mcp_config.json');
  } catch (err) {
    log('WARN', `Failed to configure Windsurf MCP: ${err}`);
  }
}

async function existsUri(uri: Uri): Promise<boolean> {
  try {
    await workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function readJsonUri(uri: Uri, log: LogFn): Promise<JsonObject | undefined> {
  try {
    const bytes = await workspace.fs.readFile(uri);
    return JSON.parse(Buffer.from(bytes).toString('utf-8')) as JsonObject;
  } catch (err) {
    if (await existsUri(uri)) {
      log('WARN', `Refusing to overwrite malformed MCP config ${uri.fsPath}: ${err}`);
    }
    return undefined;
  }
}
