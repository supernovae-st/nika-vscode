import * as path from 'path';
import * as vscode from 'vscode';

/** Resume an announced journal, or an explicitly chosen file; never guess. */
export async function chooseResumeJournal(workflowPath: string, announcedPath?: string): Promise<string | undefined> {
  if (announcedPath !== undefined && path.isAbsolute(announcedPath)) { return announcedPath; }
  const selected = await vscode.window.showOpenDialog({
    title: 'Choose the engine journal to resume',
    openLabel: 'Resume from journal',
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    defaultUri: vscode.Uri.file(path.join(path.dirname(workflowPath), '.nika', 'traces')),
    filters: { 'Nika journal': ['ndjson'] },
  });
  if (!selected || selected.length === 0) { return undefined; }
  if (selected.length !== 1 || selected[0].scheme !== 'file' || !path.isAbsolute(selected[0].fsPath)) {
    void vscode.window.showWarningMessage('Nika: resume requires one local engine journal.');
    return undefined;
  }
  // The engine judges project binding, liveness and resumability. Choosing
  // a file is not a client-side integrity or admission verdict.
  return selected[0].fsPath;
}
