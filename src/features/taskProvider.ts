// taskProvider.ts — the provider behind the `nika` task type.
//
// package.json declares `taskDefinitions: [{ type: "nika", ... }]`; without
// a registered provider every tasks.json entry of type "nika" errors with
// « no task provider ». Auto-provides check (and run, once the engine ships
// it) per workflow file, and resolves user-authored definitions. The shared
// process boundary never turns workflow paths into shell expressions.

import * as vscode from 'vscode';
import type { NikaService } from '../nikaService';
import { nikaProcessExecution } from '../nikaTerminal';

interface NikaTaskDefinition extends vscode.TaskDefinition {
  type: 'nika';
  /** The nika subcommand (check · run · graph · inspect …). */
  command: string;
  /** Workflow file, workspace-relative or absolute (optional). */
  file?: string;
}

function buildTask(
  def: NikaTaskDefinition,
  scope: vscode.WorkspaceFolder | vscode.TaskScope,
  name: string,
  binary: string,
): vscode.Task | undefined {
  const args: string[] = [def.command];
  if (def.file) { args.push(def.file); }
  let execution: vscode.ProcessExecution;
  try { execution = nikaProcessExecution(binary, args); }
  catch {
    void vscode.window.showWarningMessage('Nika: task arguments must be literal values without NUL or VS Code variable expressions.');
    return undefined;
  }
  const task = new vscode.Task(
    def,
    scope,
    name,
    'nika',
    execution,
    '$nika',
  );
  if (def.command === 'check') { task.group = vscode.TaskGroup.Test; }
  if (def.command === 'run') { task.group = vscode.TaskGroup.Build; }
  return task;
}

export function registerNikaTaskProvider(
  context: vscode.ExtensionContext,
  service: NikaService,
): void {
  context.subscriptions.push(
    vscode.tasks.registerTaskProvider('nika', {
      async provideTasks(): Promise<vscode.Task[]> {
        if (!service.available) { return []; }
        const files = await vscode.workspace.findFiles(
          '**/*.nika.yaml',
          '**/node_modules/**',
          25,
        );
        const binary = service.binaryPath;
        if (!service.available || !binary) { return []; }
        const tasks: vscode.Task[] = [];
        for (const uri of files) {
          if (uri.scheme !== 'file') { continue; }
          // Multi-root display paths include the folder name. They are not
          // executable paths relative to that same folder: keep argv absolute.
          const rel = vscode.workspace.asRelativePath(uri);
          const folder = vscode.workspace.getWorkspaceFolder(uri) ?? vscode.TaskScope.Workspace;
          if (service.caps.check) {
            const task = buildTask(
              { type: 'nika', command: 'check', file: uri.fsPath },
              folder,
              `check ${rel}`,
              binary,
            );
            if (task) { tasks.push(task); }
          }
          if (service.caps.run) {
            const task = buildTask(
              { type: 'nika', command: 'run', file: uri.fsPath },
              folder,
              `run ${rel}`,
              binary,
            );
            if (task) { tasks.push(task); }
          }
        }
        return tasks;
      },

      resolveTask(task: vscode.Task): vscode.Task | undefined {
        const binary = service.binaryPath;
        if (!service.available || !binary) {
          if (service.supportError) { void vscode.window.showWarningMessage(`Nika: ${service.supportError}`); }
          return undefined;
        }
        const def = task.definition as NikaTaskDefinition;
        if (def.type !== 'nika' || typeof def.command !== 'string' || def.command.length === 0) {
          return undefined;
        }
        return buildTask(
          def,
          task.scope ?? vscode.TaskScope.Workspace,
          task.name,
          binary,
        );
      },
    }),
  );
}
