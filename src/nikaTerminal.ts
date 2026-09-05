import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';

class TerminalInvocationError extends Error {}

/**
 * One literal-argv boundary for native tasks and interactive terminal commands.
 * ProcessExecution bypasses the shell but VS Code still resolves `${...}` in
 * task fields. Refuse that host language instead of evaluating workflow data.
 * Do not include argument values in errors: they can contain credentials.
 */
export function nikaProcessExecution(binary: string, args: readonly string[], cwd?: string): vscode.ProcessExecution {
  const fields = [binary, ...args, ...(cwd === undefined ? [] : [cwd])];
  if (!binary || args.length === 0 || !args[0] || fields.some((value) => value.includes('\0'))) {
    throw new TerminalInvocationError('Nika: the terminal invocation is empty or contains a NUL character.');
  }
  if (fields.some((value) => value.includes('${'))) {
    throw new TerminalInvocationError('Nika: VS Code variable expressions cannot be passed literally through native tasks. Use the CLI directly for these values.');
  }
  return new vscode.ProcessExecution(binary, [...args], { cwd });
}

/** Submit an interactive task, retaining output on exit; true is submission, not process success. */
export async function runNikaCommand(binary: string | undefined, args: readonly string[], filePath = ''): Promise<boolean> {
  if (!binary) { return false; }
  // Global tasks are not a supported API contract. A native empty-window
  // probe on VS Code 1.136.1 created a terminal but never started its process.
  // Keep a visible refusal instead of silently falling back to a shell.
  if (!vscode.workspace.workspaceFolders?.length) {
    void vscode.window.showWarningMessage('Nika: open a folder before launching an interactive terminal command. The CLI remains available in your own terminal.');
    return false;
  }
  let execution: vscode.ProcessExecution;
  try {
    execution = nikaProcessExecution(binary, filePath ? [...args, filePath] : args, filePath ? path.dirname(filePath) : undefined);
  } catch (error) {
    void vscode.window.showWarningMessage(error instanceof TerminalInvocationError ? error.message : 'Nika: invalid terminal invocation.');
    return false;
  }
  // A unique invocation avoids TaskSystem deduplication of two user gestures.
  // Neither the task identity nor its title repeats potentially secret argv.
  const scope = filePath ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath)) : undefined;
  const task = new vscode.Task(
    { type: 'nika', command: args[0], invocation: randomUUID() },
    scope ?? vscode.TaskScope.Workspace,
    `Nika: ${args[0]}`,
    'nika',
    execution,
    [],
  );
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, focus: true, echo: false, panel: vscode.TaskPanelKind.New, close: false };
  try { await vscode.tasks.executeTask(task); return true; }
  catch {
    void vscode.window.showWarningMessage('Nika: could not start the terminal task. Check the Tasks output for details.');
    return false;
  }
}
