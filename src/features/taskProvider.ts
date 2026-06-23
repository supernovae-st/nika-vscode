// taskProvider.ts — the provider behind the `nika` task type.
//
// package.json declares `taskDefinitions: [{ type: "nika", ... }]`; without
// a registered provider every tasks.json entry of type "nika" errors with
// « no task provider ». Auto-provides check (and run, once the engine ships
// it) per workflow file, and resolves user-authored definitions. Args go
// through the ShellExecution args array — VS Code owns the quoting.

import * as vscode from 'vscode';
import type { NikaService } from '../nikaService';

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
): vscode.Task {
  const args: string[] = [def.command];
  if (def.file) { args.push(def.file); }
  const task = new vscode.Task(
    def,
    scope,
    name,
    'nika',
    new vscode.ShellExecution(binary, args),
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
        const binary = service.binaryPath ?? 'nika';
        const files = await vscode.workspace.findFiles(
          '**/*.nika.yaml',
          '**/node_modules/**',
          25,
        );
        const tasks: vscode.Task[] = [];
        for (const uri of files) {
          const rel = vscode.workspace.asRelativePath(uri);
          const folder = vscode.workspace.getWorkspaceFolder(uri) ?? vscode.TaskScope.Workspace;
          tasks.push(buildTask(
            { type: 'nika', command: 'check', file: rel },
            folder,
            `check ${rel}`,
            binary,
          ));
          if (service.caps.run) {
            tasks.push(buildTask(
              { type: 'nika', command: 'run', file: rel },
              folder,
              `run ${rel}`,
              binary,
            ));
          }
        }
        return tasks;
      },

      resolveTask(task: vscode.Task): vscode.Task | undefined {
        const def = task.definition as NikaTaskDefinition;
        if (def.type !== 'nika' || typeof def.command !== 'string' || def.command.length === 0) {
          return undefined;
        }
        return buildTask(
          def,
          task.scope ?? vscode.TaskScope.Workspace,
          task.name,
          service.binaryPath ?? 'nika',
        );
      },
    }),
  );
}
