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

import { matchWorkflowFiles, replayConfig, workflowNameOf } from '../core/debugConfig';
import { foldTrace } from '../core/traceFold';

/** The engine binary serves the session: `nika dap` over stdio. */
class NikaDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  constructor(private readonly binary: () => string | undefined) {}

  createDebugAdapterDescriptor(): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    const bin = this.binary();
    if (!bin) {
      void vscode.window.showErrorMessage('Nika: no engine binary — install nika to debug runs.');
      return undefined;
    }
    return new vscode.DebugAdapterExecutable(bin, ['dap']);
  }
}

/** F5 without a launch.json: workflow = the active editor, replay = the
 *  newest recorded run of THAT workflow (falling back to newest overall). */
class NikaDebugConfigProvider implements vscode.DebugConfigurationProvider {
  async resolveDebugConfiguration(
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

    const replay =
      typeof config.replay === 'string' && config.replay.length > 0
        ? config.replay
        : await newestTraceFor(workflowNameOf(safeRead(workflow) ?? '') ?? '');
    if (!replay) {
      void vscode.window.showInformationMessage(
        'Nika: no recorded run to replay — run the workflow once, then F5.',
      );
      return undefined;
    }
    return { ...replayConfig(workflow, replay), ...config, type: 'nika', request: 'launch' };
  }
}

/** Newest journal whose folded workflow name matches (else newest overall). */
async function newestTraceFor(workflowName: string): Promise<string | undefined> {
  const glob = vscode.workspace.getConfiguration('nika').get<string>('traces.glob', '**/.nika/traces/*.ndjson');
  const files = await vscode.workspace.findFiles(glob, '**/node_modules/**', 100);
  const dated = files
    .map((f) => {
      try { return { f, m: fs.statSync(f.fsPath).mtimeMs }; } catch { return undefined; }
    })
    .filter((x): x is { f: vscode.Uri; m: number } => x !== undefined)
    .sort((a, b) => b.m - a.m);
  if (workflowName) {
    for (const { f } of dated) {
      const text = safeRead(f.fsPath);
      if (text && foldTrace(text).workflowName === workflowName) { return f.fsPath; }
    }
  }
  return dated[0]?.f.fsPath;
}

function safeRead(p: string): string | undefined {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return undefined; }
}

export function registerDebugReplay(
  context: vscode.ExtensionContext,
  binary: () => string | undefined,
): void {
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('nika', new NikaDebugAdapterFactory(binary)),
    vscode.debug.registerDebugConfigurationProvider('nika', new NikaDebugConfigProvider()),

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
