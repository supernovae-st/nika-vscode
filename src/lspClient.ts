// lspClient.ts — LSP client lifecycle management
//
// Creates, starts, and manages the Nika language server connection.
// State is owned by extension.ts and passed via the ClientState interface.

import * as path from 'path';
import {
  workspace,
  ExtensionContext,
  window,
  commands,
  env,
  Uri,
} from 'vscode';
import {
  CloseAction,
  ErrorAction,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  State,
  TransportKind,
} from 'vscode-languageclient/node';
import { execFile } from 'child_process';
import { DagPanel, TaskStatus } from './dagPanel';
import { type LogFn } from './mcpConfig';

export type { LogFn } from './mcpConfig';

/**
 * Stop the LSP client safely. `stop()` REJECTS when the client is still
 * `Starting` (proven in the real extension host at teardown — a window
 * closed mid-start throws "Client is not running and can't be stopped").
 * Dispose() is synchronous-safe in every state; stop() only when Running.
 */
export async function safeStopClient(client: LanguageClient | undefined): Promise<void> {
  if (!client) { return; }
  try {
    if (client.state === State.Running) {
      await client.stop();
    } else {
      // Starting / Stopped: stop() would throw — dispose the transport
      // instead (idempotent, state-independent).
      await client.dispose();
    }
  } catch {
    // A racing state change (Starting → Stopped) — the client is gone
    // either way; a teardown must never surface an unhandled rejection.
  }
}

/** Shared mutable state owned by extension.ts, passed by reference. */
export interface ClientState {
  client: LanguageClient | undefined;
  activeDagPanel: DagPanel | undefined;
  /** Welcome refresh (recent workflows) — wired by extension.ts. */
  pushWelcomeData?: () => Promise<void>;
  resolvedServerPath: string | undefined;
  /** Lifecycle sink for the status bar (extension.ts wires it). */
  statusSink?: (state: 'starting' | 'running' | 'failed') => void;
  /** Canon-derived provider groups for generated rules (extension wires it). */
  rulesIntel?: () => import('./mcpConfig').RulesIntel | undefined;
  /** The one-voice reconciler (#103): called with the server's
   * initialize capabilities on every (re)start — client twins the
   * server replaces are silenced; called with `undefined` when the
   * server dies, restoring full client intelligence. */
  reconcileIntel?: (
    caps: Readonly<Record<string, unknown>> | undefined,
  ) => import('./core/capabilityYield').ReconcileReport;
}

export function getNikaPath(): string {
  return workspace.getConfiguration('nika').get<string>('server.path', 'nika');
}

export function runNikaCommand(resolvedServerPath: string | undefined, subcmd: string, filePath: string): void {
  const nika = resolvedServerPath ?? getNikaPath();
  // The spawn-cwd law reaches the terminal twin: the engine journals at
  // the process CWD, so a terminal opened at the workspace root would
  // scatter a nested workflow's journals away from every surface that
  // looks beside the file (Runs tree · resume substrate · averages).
  const cwd = filePath.length > 0 ? path.dirname(filePath) : undefined;
  const terminal = window.createTerminal({ name: `Nika: ${subcmd}`, cwd });
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
          `Nika: extension v${extVersion} is behind the engine (v${serverMajorMinor}.x) — update to match.`,
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

  let closedCount = 0;
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
    // Who is calling — the server MAY read the host/version for
    // diagnostics (it reads none of it today; probed 0.102). The old
    // `capabilities: { enumCompletions: 'client', … }` hint block is
    // GONE: it was never read server-side, and after #105 it had
    // become a dormant lie — the client YIELDS meaning surfaces
    // capability-wise now (core/capabilityYield), so a future server
    // honoring « the client owns enums » while the client had already
    // yielded them would have orphaned the lane. The LSP capability
    // advertisement IS the partition protocol; no side-channel.
    initializationOptions: {
      client: {
        host: env.appName,
        extensionVersion: context.extension.packageJSON.version as string,
      },
    },
    markdown: {
      isTrusted: true,
      supportHtml: false,
    },
    // The dead-toast fix (operator live, 2026-07-12: « connection to
    // server is erroring. write EPIPE » with no way out): a couple of
    // transport hiccups restart quietly; a crash-loop STOPS cleanly and
    // offers one-click recovery instead of the raw upstream error.
    errorHandler: {
      // handled: true — WITHOUT it the upstream client still shows its
      // raw « connection to server is erroring. write EPIPE » toast on
      // every tolerated error (operator screenshot, post-#62: the binary
      // swap under a live server makes this an everyday event). Our
      // closed() path owns ALL the messaging.
      error: (_e, _m, count) => ({
        action: (count ?? 1) <= 3 ? ErrorAction.Continue : ErrorAction.Shutdown,
        handled: true,
      }),
      closed: () => {
        closedCount += 1;
        if (closedCount <= 2) {
          return { action: CloseAction.Restart };
        }
        // The toast below PROMISES client-side intelligence — make it
        // mechanically true: the dead server's capabilities no longer
        // own anything, restore every client voice (#103).
        state.reconcileIntel?.(undefined);
        void window.showWarningMessage(
          'Nika language server stopped (it may have crashed or the binary changed). Client-side intelligence stays active.',
          'Restart server',
        ).then((pick) => {
          if (pick === 'Restart server') {
            closedCount = 0;
            void commands.executeCommand('nika.restartServer');
          }
        });
        return { action: CloseAction.DoNotRestart, handled: true };
      },
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
    log('INFO', 'Language server started');
    state.statusSink?.('running');
    // One voice (#103): the server's advertised capabilities silence
    // their client twins — capability-gated, never version-gated; a
    // future server capability silences its twin with zero ext change.
    state.reconcileIntel?.(
      state.client?.initializeResult?.capabilities as Readonly<Record<string, unknown>> | undefined,
    );
    // A successful (re)start heals the crash budget: the binary-swap
    // routine (a sister build replacing the PATH binary mid-session)
    // kills servers repeatedly — each recovery must re-arm the two
    // quiet restarts instead of decaying to the stop-button state.
    closedCount = 0;

    // Forward execution events from LSP to DAG webview for live updates
    if (state.client) {
      state.client.onNotification('nika/executionEvent', (event: { taskId: string; status: string }) => {
        log('INFO', `Execution event: ${event.taskId} → ${event.status}`);
        if (state.activeDagPanel) {
          state.activeDagPanel.updateTaskStatus(event.taskId, event.status as TaskStatus);
        }
      });
    }

  }).catch((err: Error) => {
    log('ERROR', `LSP failed to start: ${err.message}`);
    state.statusSink?.('failed');
    void window
      .showErrorMessage(
        `Nika: the language server failed to start — ${err.message}`,
        'Retry', 'Set server path', 'Show log',
      )
      .then((pick) => {
        if (pick === 'Retry') { void commands.executeCommand('nika.restartServer'); }
        if (pick === 'Set server path') {
          void commands.executeCommand('workbench.action.openSettings', 'nika.server.path');
        }
        if (pick === 'Show log') { void commands.executeCommand('nika.showOutput'); }
      });
  });

  context.subscriptions.push({
    dispose: () => { void safeStopClient(state.client); },
  });
}
