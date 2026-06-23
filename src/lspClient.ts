// lspClient.ts — LSP client lifecycle management
//
// Creates, starts, and manages the Nika language server connection.
// State is owned by extension.ts and passed via the ClientState interface.

import {
  workspace,
  ExtensionContext,
  window,
  commands,
  env,
  Uri,
  Position,
  Range,
} from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { execFile } from 'child_process';
import { DagPanel, TaskStatus } from './dagPanel';
import { type LogFn } from './mcpConfig';

export type { LogFn } from './mcpConfig';

/** Shared mutable state owned by extension.ts, passed by reference. */
export interface ClientState {
  client: LanguageClient | undefined;
  statusBarItem: import('vscode').StatusBarItem | undefined;
  statusPollInterval: ReturnType<typeof setInterval> | undefined;
  activeDagPanel: DagPanel | undefined;
  resolvedServerPath: string | undefined;
  /** Lifecycle sink for the status bar (extension.ts wires it). */
  statusSink?: (state: 'starting' | 'running' | 'failed') => void;
  /** Canon-derived provider groups for generated rules (extension wires it). */
  rulesIntel?: () => import('./mcpConfig').RulesIntel | undefined;
}

export function getNikaPath(): string {
  return workspace.getConfiguration('nika').get<string>('server.path', 'nika');
}

export function runNikaCommand(resolvedServerPath: string | undefined, subcmd: string, filePath: string): void {
  const nika = resolvedServerPath ?? getNikaPath();
  const terminal = window.createTerminal({ name: `Nika: ${subcmd}` });
  terminal.show();
  if (filePath.length === 0) {
    terminal.sendText(`"${nika}" ${subcmd}`);
    return;
  }
  const escaped = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  terminal.sendText(`"${nika}" ${subcmd} "${escaped}"`);
}

/** Compare extension version with LSP server version and warn on mismatch. */
export function checkVersionMismatch(context: ExtensionContext, log: LogFn, resolvedPath?: string): void {
  const extVersion = context.extension.packageJSON.version as string;
  const serverPath = resolvedPath ?? getNikaPath();

  execFile(serverPath, ['--version'], { timeout: 5000 }, (error, stdout) => {
    if (error) { return; }
    // Output format: "nika 0.58.0" or "0.58.0-dev (abc1234, built 2h ago)"
    const match = stdout.match(/(\d+\.\d+)\.\d+/);
    if (!match) { return; }

    const serverMajorMinor = match[1]; // e.g. "0.58"
    const extMatch = extVersion.match(/(\d+\.\d+)\.\d+/);
    if (!extMatch) { return; }
    const extMajorMinor = extMatch[1]; // e.g. "0.42"

    if (extMajorMinor !== serverMajorMinor) {
      log('WARN', `Version mismatch: extension v${extVersion}, server v${stdout.trim()}`);
      const extParts = extMajorMinor.split('.').map(Number);
      const srvParts = serverMajorMinor.split('.').map(Number);
      // Only warn if extension is BEHIND the server (not ahead, which is dev)
      if (extParts[0] < srvParts[0] || (extParts[0] === srvParts[0] && extParts[1] < srvParts[1])) {
        window.showWarningMessage(
          `Nika extension v${extVersion} is outdated (server is v${serverMajorMinor}.x). ` +
          `Update for the best experience.`,
          'Update Extension',
        ).then((choice) => {
          if (choice === 'Update Extension') {
            commands.executeCommand(
              'workbench.extensions.installExtension',
              'supernovae.nika-lang',
            ).then(undefined, () => {
              // Cursor and other hosts may not support this command — open marketplace
              env.openExternal(Uri.parse(
                'https://marketplace.visualstudio.com/items?itemName=supernovae.nika-lang'
              ));
            });
          }
        });
      }
    } else {
      log('INFO', `Version match: extension v${extVersion}, server v${stdout.trim()}`);
    }
  });
}

export function startClient(
  context: ExtensionContext,
  state: ClientState,
  log: LogFn,
  overridePath?: string,
): void {
  const config = workspace.getConfiguration('nika');
  const serverPath = overridePath ?? getNikaPath();
  const extraArgs = config.get<string[]>('server.extraArgs', []);

  // `nika lsp` (stdio) — the D-2026-06-10-N6 in-binary contract. Extra
  // flags stay user-side (`nika.server.extraArgs`) until the surface grows.
  const serverOptions: ServerOptions = {
    command: serverPath,
    args: ['lsp', ...extraArgs],
    transport: TransportKind.stdio,
  };

  // Owned watcher: a restart would otherwise leak the previous one (the
  // client does not dispose synchronize watchers it did not create).
  const fileWatcher = workspace.createFileSystemWatcher('**/*.nika.yaml');
  context.subscriptions.push(fileWatcher);

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'nika' },
      { scheme: 'file', pattern: '**/*.nika.yaml' },
      { scheme: 'untitled', language: 'nika' },
    ],
    synchronize: {
      fileEvents: fileWatcher,
      // Push our settings section to the server on change.
      configurationSection: 'nika',
    },
    outputChannelName: 'Nika Language Server',
    diagnosticCollectionName: 'nika-lsp',
    // Capability handshake: the server learns WHICH editor host it serves
    // (VS Code · Cursor · Windsurf report distinct appName/version) and
    // that the CLIENT keeps owning expression-level intel + enum
    // completions — its v0.1 structure surface must not double-report.
    initializationOptions: {
      client: {
        host: env.appName,
        extensionVersion: context.extension.packageJSON.version as string,
      },
      capabilities: {
        expressionIntel: 'client',
        enumCompletions: 'client',
        secretsLint: 'client',
      },
    },
    markdown: {
      isTrusted: true,
      supportHtml: false,
    },
  };

  state.client = new LanguageClient(
    'nika',
    'Nika Language Server',
    serverOptions,
    clientOptions,
  );

  log('INFO', `Starting LSP: ${serverPath} lsp ${extraArgs.join(' ')}`);
  state.statusSink?.('starting');

  state.client.start().then(() => {
    log('INFO', 'Language server started successfully');
    state.statusSink?.('running');
    if (state.statusBarItem) {
      state.statusBarItem.text = '$(zap) Nika: Ready';
      state.statusBarItem.backgroundColor = undefined;
    }

    // Check for version mismatch between extension and LSP server
    checkVersionMismatch(context, log, state.resolvedServerPath);

    // Forward execution events from LSP to DAG webview for live updates
    if (state.client) {
      state.client.onNotification('nika/executionEvent', (event: { taskId: string; status: string }) => {
        log('INFO', `Execution event: ${event.taskId} → ${event.status}`);
        if (state.activeDagPanel) {
          state.activeDagPanel.updateTaskStatus(event.taskId, event.status as TaskStatus);
        }
      });
    }

    // Poll daemon status every 30s — clear previous interval to prevent
    // accumulation; the disposable below covers host-driven deactivation
    // even when deactivate() never runs.
    if (state.statusPollInterval !== undefined) {
      clearInterval(state.statusPollInterval);
    }
    context.subscriptions.push({
      dispose: () => {
        if (state.statusPollInterval !== undefined) {
          clearInterval(state.statusPollInterval);
          state.statusPollInterval = undefined;
        }
      },
    });
    state.statusPollInterval = setInterval(async () => {
      if (!state.client || !state.client.isRunning()) {
        if (state.statusBarItem) {
          state.statusBarItem.text = '$(zap) Nika: LSP $(x)';
        }
        return;
      }
      try {
        const status = await state.client.sendRequest<{ connected: boolean }>('nika/daemonStatus');
        if (state.statusBarItem) {
          state.statusBarItem.text = status.connected
            ? '$(zap) Nika: LSP $(check) | Daemon $(check)'
            : '$(zap) Nika: LSP $(check) | Daemon $(x)';
          state.statusBarItem.backgroundColor = undefined;
        }
      } catch {
        if (state.statusBarItem) {
          state.statusBarItem.text = '$(zap) Nika: LSP $(check)';
        }
      }
    }, 30000);
  }).catch((err: Error) => {
    log('ERROR', `LSP failed to start: ${err.message}`);
    state.statusSink?.('failed');
    if (state.statusBarItem) {
      state.statusBarItem.text = '$(zap) Nika: LSP $(x)';
    }
    window.showErrorMessage(
      `Failed to start Nika language server: ${err.message}. ` +
      `Make sure 'nika' is installed and in your PATH, or set nika.server.path.`,
    );
  });

  context.subscriptions.push({
    dispose: () => {
      if (state.client) {
        state.client.stop();
      }
    },
  });
}
