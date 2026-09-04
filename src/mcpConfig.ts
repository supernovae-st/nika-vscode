// mcpConfig.ts — IDE-specific MCP configuration
//
// Machine-scoped absolute-path wiring for download-only Cursor/Windsurf.
// Portable/project wiring belongs to the engine; these are not retry writers.

import { env } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  patchCursorLikeConfig,
  type JsonObject,
} from './core/mcpConfigShape';

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

/** MACHINE-scoped operation: when `nika` is not reachable on PATH (the
 *  extension-download-only user), Cursor's MCP client cannot start the
 *  oracle from the workspace config's portable `nika` command at all.
 *  ~/.cursor/mcp.json is per-machine (never committed), so the resolved
 *  ABSOLUTE path is correct there — same merge-safe patch, other servers
 *  untouched. Selected before engine wiring, never after its result.
 *  The caller gates on the PATH probe: a brew install must
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
