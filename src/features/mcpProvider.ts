// mcpProvider.ts — native MCP server definition provider (VS Code ≥1.101).
//
// Where the host supports it, `nika mcp` registers itself in agent mode
// with ZERO config files — the modern path beside the file-writer
// (`nika wire` / mcpConfig.ts) that Cursor and older hosts still need.
// Everything is feature-detected at runtime: Cursor has neither the API
// nor the contribution point, and must never see a throw.

import * as vscode from 'vscode';
import type { NikaService } from '../nikaService';

/** Structural shims — the API may not exist on this host's `vscode`. */
interface McpDefinitionProviderApi {
  registerMcpServerDefinitionProvider?: (
    id: string,
    provider: {
      onDidChangeMcpServerDefinitions?: vscode.Event<void>;
      provideMcpServerDefinitions(): unknown[] | Promise<unknown[]>;
    },
  ) => vscode.Disposable;
}

type McpStdioCtor = new (label: string, command: string, args?: string[]) => unknown;

export function registerMcpDefinitionProvider(
  context: vscode.ExtensionContext,
  service: NikaService,
  log: (level: string, msg: string) => void,
): void {
  const host = vscode as unknown as {
    lm?: McpDefinitionProviderApi;
    McpStdioServerDefinition?: McpStdioCtor;
  };
  const register = host.lm?.registerMcpServerDefinitionProvider;
  const Stdio = host.McpStdioServerDefinition;
  if (typeof register !== 'function' || typeof Stdio !== 'function') {
    log('INFO', 'MCP definition provider API absent on this host (Cursor/older VS Code) — file-based wiring stays the path');
    return;
  }

  const emitter = new vscode.EventEmitter<void>();
  context.subscriptions.push(
    emitter,
    // Binary appears/changes → the definition (command path) may change.
    service.onDidChange(() => emitter.fire()),
  );

  try {
    context.subscriptions.push(
      register.call(host.lm, 'nika.mcp', {
        onDidChangeMcpServerDefinitions: emitter.event,
        provideMcpServerDefinitions: () => {
          if (!service.available || !service.caps.mcp || !service.binaryPath) { return []; }
          return [new Stdio('Nika', service.binaryPath, ['mcp'])];
        },
      }),
    );
    log('INFO', 'MCP definition provider registered — nika mcp is discoverable in agent mode with zero config');
  } catch (err) {
    // A host advertising the API but rejecting the call must not break
    // activation — the file-based path still works.
    log('WARN', `MCP definition provider registration failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
