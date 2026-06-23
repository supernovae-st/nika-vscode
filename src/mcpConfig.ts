// mcpConfig.ts — IDE-specific MCP configuration
//
// Auto-generates MCP config files for VS Code, Cursor, and Windsurf.
// All functions receive resolvedServerPath and log as parameters (no module state).

import { workspace, Uri, env } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
const PORTABLE_COMMAND = 'nika';

export async function ensureCursorMcpConfig(_resolvedServerPath: string | undefined, log: LogFn): Promise<void> {
  const folder = workspace.workspaceFolders?.[0];
  if (!folder) { return; }

  const cursorDir = Uri.joinPath(folder.uri, '.cursor');
  const mcpPath = Uri.joinPath(cursorDir, 'mcp.json');

  try {
    await workspace.fs.stat(mcpPath);
    return; // Already exists — don't overwrite
  } catch {
    // File doesn't exist — create it
  }

  const mcpConfig = {
    mcpServers: {
      nika: {
        command: PORTABLE_COMMAND,
        args: ['mcp', 'serve', '--stdio'],
      },
    },
  };

  await workspace.fs.createDirectory(cursorDir);
  await workspace.fs.writeFile(mcpPath, Buffer.from(JSON.stringify(mcpConfig, null, 2)));
  log('INFO', 'Auto-generated .cursor/mcp.json for Cursor MCP integration');
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
    '- After editing, run `nika check <file>` and fix diagnostics. Unknown code → `nika explain NIKA-XXXX`.',
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

  try {
    await workspace.fs.stat(mcpPath);
    return;
  } catch {
    // Create
  }

  const mcpConfig = {
    servers: {
      nika: {
        type: 'stdio',
        command: PORTABLE_COMMAND,
        args: ['mcp', 'serve', '--stdio'],
      },
    },
  };

  await workspace.fs.createDirectory(vscodeDir);
  await workspace.fs.writeFile(mcpPath, Buffer.from(JSON.stringify(mcpConfig, null, 2)));
  log('INFO', 'Auto-generated .vscode/mcp.json for VS Code MCP integration');
}

export async function ensureWindsurfMcpConfig(resolvedServerPath: string | undefined, log: LogFn): Promise<void> {
  // Windsurf uses a global config at ~/.codeium/windsurf/mcp_config.json
  const homeDir = process.env.HOME ?? process.env.USERPROFILE;
  if (!homeDir) { return; }

  const configDir = path.join(homeDir, '.codeium', 'windsurf');
  const configPath = path.join(configDir, 'mcp_config.json');

  if (fs.existsSync(configPath)) {
    // Check if nika is already configured
    try {
      const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (existing?.mcpServers?.nika) { return; }
    } catch {
      // Malformed JSON — don't overwrite
      return;
    }
  }

  const nikaPath = resolvedServerPath ?? 'nika';
  const mcpConfig = {
    mcpServers: {
      nika: {
        command: nikaPath,
        args: ['mcp', 'serve', '--stdio'],
      },
    },
  };

  try {
    fs.mkdirSync(configDir, { recursive: true });
    if (fs.existsSync(configPath)) {
      // Merge into existing config
      const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      existing.mcpServers = { ...existing.mcpServers, nika: mcpConfig.mcpServers.nika };
      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));
    } else {
      fs.writeFileSync(configPath, JSON.stringify(mcpConfig, null, 2));
    }
    log('INFO', 'Auto-configured Windsurf MCP at ~/.codeium/windsurf/mcp_config.json');
  } catch (err) {
    log('WARN', `Failed to configure Windsurf MCP: ${err}`);
  }
}
