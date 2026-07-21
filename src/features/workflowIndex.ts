// workflowIndex.ts — the ONE workflow scan (watcher-cached wire).
//
// The thin vscode half of core/workflowScan: one FileSystemWatcher on
// the workflow glob invalidates one ScanCache, and every surface that
// used to run its own findFiles consumes this instead (the source
// belt pins the findFiles literal to THIS file alone). Construct it
// BEFORE any other watcher on the same glob: same-glob watchers fire
// in creation order, and the cache must drop before a consumer's
// handler reads it.

import * as vscode from 'vscode';
import { ScanCache, WORKFLOW_GLOB, WORKFLOW_SCAN_CAP, type Stamped } from '../core/workflowScan';

/** The consumer seam — each caller keeps its historical cap. */
export type WorkflowFilesOf = (cap: number) => Promise<vscode.Uri[]>;

export class WorkflowIndex {
  private readonly cache: ScanCache<vscode.Uri>;

  constructor(context: vscode.ExtensionContext) {
    this.cache = new ScanCache<vscode.Uri>({
      list: async () => {
        const found = await vscode.workspace.findFiles(WORKFLOW_GLOB, '**/node_modules/**', WORKFLOW_SCAN_CAP);
        // One physical file = one entry: overlapping/nested workspace
        // roots can hand findFiles the SAME fsPath twice.
        const byPath = new Map<string, vscode.Uri>();
        for (const uri of found) {
          if (!byPath.has(uri.fsPath)) { byPath.set(uri.fsPath, uri); }
        }
        return [...byPath.values()];
      },
      mtimeOf: async (uri) => {
        try {
          return (await vscode.workspace.fs.stat(uri)).mtime;
        } catch {
          return undefined;
        }
      },
    });
    const watcher = vscode.workspace.createFileSystemWatcher(WORKFLOW_GLOB);
    watcher.onDidCreate(() => this.cache.invalidate());
    watcher.onDidDelete(() => this.cache.invalidate());
    // A change moves mtimes, never membership — the list survives.
    watcher.onDidChange(() => this.cache.touch());
    context.subscriptions.push(watcher);
  }

  /** Every workflow file (deduped), head-sliced to the consumer's cap. */
  files(cap?: number): Promise<vscode.Uri[]> {
    return this.cache.files(cap);
  }

  /** mtime-newest-first head — welcome recents + the gate's F3. */
  recent(n: number): Promise<Array<Stamped<vscode.Uri>>> {
    return this.cache.recent(n);
  }
}
