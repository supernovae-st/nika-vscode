// debugReplay.ts — F5 over a recorded run: the DAP replay wiring.
//
// The adapter IS the engine (`nika dap`, stdio) — this file only
// describes where it lives (DebugAdapterDescriptorFactory), fills in
// launch configs (DebugConfigurationProvider: F5 on a .nika.yaml with
// no launch.json picks the latest recorded run), and gives the Runs
// view its "Debug this run" action. Time travel comes free: the
// adapter claims supportsStepBack, so VS Code renders the back-step
// buttons on its own.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { matchWorkflowFiles, mergeLaunchConfig, replayConfig, workflowNameOf } from '../core/debugConfig';
import { foldTrace } from '../core/traceFold';

/** The engine binary serves the session: `nika dap` over stdio. */
class NikaDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  constructor(
    private readonly binary: () => string | undefined,
    private readonly hasDap: () => boolean,
  ) {}

  createDebugAdapterDescriptor(): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    const bin = this.binary();
    if (!bin) {
      void vscode.window.showErrorMessage('Nika: no engine binary — install nika to debug runs.');
      return undefined;
    }
    // Probed from the binary's own --help (never a version table): an
    // engine without `nika dap` gets one clear sentence, not VS Code's
    // "adapter process terminated unexpectedly".
    if (!this.hasDap()) {
      void vscode.window.showErrorMessage(
        'Nika: this engine has no `dap` command — time-travel debugging needs nika ≥ 0.96 (brew upgrade nika).',
      );
      return undefined;
    }
    return new vscode.DebugAdapterExecutable(bin, ['dap']);
  }
}

/** F5 without a launch.json: workflow = the active editor, replay = the
 *  newest recorded run of THAT workflow. The real work runs in the
 *  SUBSTITUTED hook: the generated launch.json ships `workflow: "${file}"`,
 *  and the pre-substitution hook sees that literal string — resolving there
 *  read `${file}` as a real path, missed the name, and silently replayed
 *  the newest run of ANY workflow (the 0.97.2 review's F2). */
class NikaDebugConfigProvider implements vscode.DebugConfigurationProvider {
  resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
  ): vscode.DebugConfiguration | undefined {
    // Unsubstituted variables pass through untouched — VS Code substitutes
    // next, then the WithSubstitutedVariables hook completes the config.
    return config;
  }

  async resolveDebugConfigurationWithSubstitutedVariables(
    _folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
  ): Promise<vscode.DebugConfiguration | undefined> {
    if (config.type && config.request && config.workflow && config.replay) { return config; }

    const editor = vscode.window.activeTextEditor;
    const workflow =
      typeof config.workflow === 'string' && config.workflow.length > 0
        ? config.workflow
        : editor && /\.nika\.ya?ml$/.test(editor.document.uri.fsPath)
          ? editor.document.uri.fsPath
          : undefined;
    if (!workflow) {
      void vscode.window.showInformationMessage(
        'Nika: open a .nika.yaml (or add workflow/replay to launch.json) to debug a run.',
      );
      return undefined;
    }

    const docName = workflowNameOf(safeRead(workflow) ?? '');
    const replay =
      typeof config.replay === 'string' && config.replay.length > 0
        ? config.replay
        : await newestTraceFor(docName);
    if (!replay) {
      void vscode.window.showInformationMessage(
        docName !== undefined
          ? `Nika: no recorded run of \`${docName}\` to replay — run the workflow once, then F5.`
          : 'Nika: no recorded run to replay — run the workflow once, then F5.',
      );
      return undefined;
    }
    return mergeLaunchConfig(config, workflow, replay) as vscode.DebugConfiguration;
  }
}

/** Newest journal whose folded workflow name matches. The newest-overall
 *  fallback survives ONLY when the doc's name is unknown (nameless
 *  journals era) — a KNOWN name that matches nothing returns undefined
 *  and the caller says so: F5 must never silently debug a foreign run
 *  (the same never-silent-runs law fork got in 0.97.2). */
async function newestTraceFor(workflowName: string | undefined): Promise<string | undefined> {
  const glob = vscode.workspace.getConfiguration('nika').get<string>('traces.glob', '**/.nika/traces/*.ndjson');
  const files = await vscode.workspace.findFiles(glob, '**/node_modules/**', 500);
  const dated = files
    .map((f) => {
      try { return { f, m: fs.statSync(f.fsPath).mtimeMs }; } catch { return undefined; }
    })
    .filter((x): x is { f: vscode.Uri; m: number } => x !== undefined)
    .sort((a, b) => b.m - a.m);
  if (workflowName !== undefined) {
    for (const { f } of dated) {
      const text = safeRead(f.fsPath);
      if (text && foldTrace(text).workflowName === workflowName) { return f.fsPath; }
    }
    return undefined;
  }
  return dated[0]?.f.fsPath;
}

function safeRead(p: string): string | undefined {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return undefined; }
}

// Walkthrough completionEvent producer — a one-way session latch. The
// time-travel step completes on a NIKA debug session actually starting
// (any entry path: F5 · launch.json · the Runs-view action), replacing
// the old `onCommand:workbench.action.debug.start` event that checked
// the step on ANY debug session of any extension.
let replayStartedLatched = false;

export function registerDebugReplay(
  context: vscode.ExtensionContext,
  binary: () => string | undefined,
  hasDap: () => boolean,
): void {
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('nika', new NikaDebugAdapterFactory(binary, hasDap)),
    vscode.debug.registerDebugConfigurationProvider('nika', new NikaDebugConfigProvider()),
    vscode.debug.onDidStartDebugSession((session) => {
      if (session.type === 'nika' && !replayStartedLatched) {
        replayStartedLatched = true;
        void vscode.commands.executeCommand('setContext', 'nika.replayStarted', true);
      }
    }),

    // Runs view: debug THIS run — match the journal's workflow name back
    // to a source file (auto on a single hit, QuickPick on ambiguity).
    vscode.commands.registerCommand('nika.debugReplay', async (arg?: { trace?: { uri: vscode.Uri } }) => {
      const trace = arg?.trace?.uri;
      if (!trace) {
        void vscode.window.showInformationMessage('Nika: pick a run in the Runs view to debug.');
        return;
      }
      const text = safeRead(trace.fsPath);
      const name = text ? foldTrace(text).workflowName : undefined;
      const candidates = await vscode.workspace.findFiles('**/*.nika.{yaml,yml}', '**/node_modules/**', 200);
      const loaded = candidates
        .map((f) => ({ path: f.fsPath, text: safeRead(f.fsPath) ?? '' }))
        .filter((f) => f.text.length > 0);
      const hits = name ? matchWorkflowFiles(loaded, name) : [];
      let workflow = hits[0];
      if (hits.length !== 1) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
        const picked = await vscode.window.showQuickPick(
          (hits.length > 1 ? hits : loaded.map((f) => f.path)).map((p) => ({
            label: path.basename(p),
            description: path.relative(root, p),
            p,
          })),
          { placeHolder: `Which workflow file is “${name ?? 'this run'}”?` },
        );
        if (!picked) { return; }
        workflow = picked.p;
      }
      await vscode.debug.startDebugging(undefined, replayConfig(workflow, trace.fsPath));
    }),
  );
}
