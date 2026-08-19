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
import { RULES_TEACHES, buildCursorRules, shouldRewriteRules, type RulesIntel } from './core/cursorRules';

export type LogFn = (level: string, msg: string) => void;

/** What a config writer actually DID — the caller's toast must tell
 *  this truth, never assume the write happened (a malformed file is
 *  refused, silently, and «wired» would be a lie). */
export type McpWriteState = 'wired' | 'unchanged' | 'refused-malformed' | 'skipped';
export interface McpWriteResult { state: McpWriteState; file?: string }

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

export async function ensureCursorMcpConfig(_resolvedServerPath: string | undefined, log: LogFn): Promise<McpWriteResult> {
  const folder = workspace.workspaceFolders?.[0];
  if (!folder) { return { state: 'skipped' }; }

  const cursorDir = Uri.joinPath(folder.uri, '.cursor');
  const mcpPath = Uri.joinPath(cursorDir, 'mcp.json');

  const existing = await readJsonUri(mcpPath, log);
  if (existing === undefined && await existsUri(mcpPath)) {
    return { state: 'refused-malformed', file: mcpPath.fsPath };
  }
  const result = patchCursorLikeConfig(existing, PORTABLE_COMMAND);
  if (!result.changed && existing !== undefined) { return { state: 'unchanged', file: mcpPath.fsPath }; }

  await workspace.fs.createDirectory(cursorDir);
  await workspace.fs.writeFile(mcpPath, Buffer.from(JSON.stringify(result.config, null, 2)));
  log('INFO', result.migrated
    ? 'Migrated .cursor/mcp.json Nika MCP command to `nika mcp`'
    : 'Auto-generated .cursor/mcp.json for Cursor MCP integration');
  return { state: 'wired', file: mcpPath.fsPath };
}

/** MACHINE-scoped fallback: when `nika` is not reachable on PATH (the
 *  extension-download-only user), Cursor's MCP client cannot start the
 *  oracle from the workspace config's portable `nika` command at all.
 *  ~/.cursor/mcp.json is per-machine (never committed), so the resolved
 *  ABSOLUTE path is correct there — same merge-safe patch, other servers
 *  untouched. The caller gates on the PATH probe: a brew install must
 *  never be shadowed by a downloaded binary. */
export async function ensureCursorGlobalMcpConfig(absoluteServerPath: string, log: LogFn): Promise<McpWriteResult> {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE;
  if (!homeDir) { return { state: 'skipped' }; }
  const configDir = path.join(homeDir, '.cursor');
  const configPath = path.join(configDir, 'mcp.json');
  try {
    fs.mkdirSync(configDir, { recursive: true });
    let existing: JsonObject | undefined;
    if (fs.existsSync(configPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as JsonObject;
      } catch {
        // malformed JSON — never overwrite what we cannot read
        log('WARN', `Refusing to overwrite malformed MCP config ${configPath}`);
        return { state: 'refused-malformed', file: configPath };
      }
    }
    const result = patchCursorLikeConfig(existing, absoluteServerPath);
    if (!result.changed && existing !== undefined) { return { state: 'unchanged', file: configPath }; }
    fs.writeFileSync(configPath, JSON.stringify(result.config, null, 2));
    log('INFO', `Wrote machine-scoped ~/.cursor/mcp.json (nika not on PATH — absolute path used)`);
    return { state: 'wired', file: configPath };
  } catch (err) {
    log('WARN', `global mcp.json write failed: ${err instanceof Error ? err.message : String(err)}`);
    return { state: 'skipped', file: configPath };
  }
}

/** Re-exported for the callers that pass provider groups (extension ·
 *  lspClient) — the shape lives with the pure text builder. */
export type { RulesIntel } from './core/cursorRules';

/** Write `.cursor/rules/nika.mdc` — the AI-assistant teaching text.
 *  Never overwrites a user's own file; DOES refresh a file this
 *  extension generated at an older language (the stamp line says which
 *  engine it teaches · `shouldRewriteRules`), because a stale copy would
 *  keep teaching every model in the workspace a grammar the installed
 *  engine refuses. */
export async function ensureCursorRules(log: LogFn, providers?: RulesIntel): Promise<void> {
  const folder = workspace.workspaceFolders?.[0];
  if (!folder) { return; }

  const rulesDir = Uri.joinPath(folder.uri, '.cursor', 'rules');
  const rulePath = Uri.joinPath(rulesDir, 'nika.mdc');

  let refresh = false;
  try {
    const existing = Buffer.from(await workspace.fs.readFile(rulePath)).toString('utf8');
    if (!shouldRewriteRules(existing)) { return; } // the user's own, or already current
    refresh = true;
  } catch {
    // Create
  }

  // Vocabulary derives from the binary at generation time — a hardcoded
  // provider list in generated rules is exactly the teaching-drift class
  // the own-corpus law exists for. No intel → the text points at the source.
  const content = buildCursorRules(providers);

  await workspace.fs.createDirectory(rulesDir);
  await workspace.fs.writeFile(rulePath, Buffer.from(content));
  log('INFO', refresh
    ? `Refreshed .cursor/rules/nika.mdc (an older generation taught a dead grammar · now teaches ${RULES_TEACHES})`
    : `Auto-generated .cursor/rules/nika.mdc (teaches ${RULES_TEACHES})`);
}

export async function ensureVscodeMcpConfig(_resolvedServerPath: string | undefined, log: LogFn): Promise<McpWriteResult> {
  const folder = workspace.workspaceFolders?.[0];
  if (!folder) { return { state: 'skipped' }; }

  const vscodeDir = Uri.joinPath(folder.uri, '.vscode');
  const mcpPath = Uri.joinPath(vscodeDir, 'mcp.json');

  const existing = await readJsonUri(mcpPath, log);
  if (existing === undefined && await existsUri(mcpPath)) {
    return { state: 'refused-malformed', file: mcpPath.fsPath };
  }
  const result = patchVscodeConfig(existing, PORTABLE_COMMAND);
  if (!result.changed && existing !== undefined) { return { state: 'unchanged', file: mcpPath.fsPath }; }

  await workspace.fs.createDirectory(vscodeDir);
  await workspace.fs.writeFile(mcpPath, Buffer.from(JSON.stringify(result.config, null, 2)));
  log('INFO', result.migrated
    ? 'Migrated .vscode/mcp.json Nika MCP command to `nika mcp`'
    : 'Auto-generated .vscode/mcp.json for VS Code MCP integration');
  return { state: 'wired', file: mcpPath.fsPath };
}

export async function ensureWindsurfMcpConfig(resolvedServerPath: string | undefined, log: LogFn): Promise<McpWriteResult> {
  // Windsurf uses a global config at ~/.codeium/windsurf/mcp_config.json
  const homeDir = process.env.HOME ?? process.env.USERPROFILE;
  if (!homeDir) { return { state: 'skipped' }; }

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
        log('WARN', `Refusing to overwrite malformed MCP config ${configPath}`);
        return { state: 'refused-malformed', file: configPath };
      }
    }
    const result = patchCursorLikeConfig(existing, nikaPath);
    if (!result.changed && existing !== undefined) { return { state: 'unchanged', file: configPath }; }
    fs.writeFileSync(configPath, JSON.stringify(result.config, null, 2));
    log('INFO', result.migrated
      ? 'Migrated Windsurf MCP Nika command to `nika mcp`'
      : 'Auto-configured Windsurf MCP at ~/.codeium/windsurf/mcp_config.json');
    return { state: 'wired', file: configPath };
  } catch (err) {
    log('WARN', `Failed to configure Windsurf MCP: ${err}`);
    return { state: 'skipped', file: configPath };
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
