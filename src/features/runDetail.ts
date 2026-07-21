// runDetail.ts — the run detail page (the stack's Detail · DESIGN.md §7e).
//
// `nika-run:` documents render ONE recorded run at a glance — verdict ·
// per-task breakdown · artifacts · the paused question — through the
// report's own vehicle: a virtual markdown document shown as a preview
// (never a new webview class; the #206/#207 security surface stays
// closed). The provider re-renders the page while an engine writes the
// journal (the traces watcher calls `refresh`), so a live run's detail
// breathes; the exact same page serves Runs rows, History cells, the
// omnibar's run family and the tree action panel — one primary, one door.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { foldTrace } from '../core/traceFold';
import { extractRunArtifacts } from '../core/artifacts';
import { verifyChain } from '../core/chainVerify';
import { renderRunDetail, renderUnreadableDetail } from '../core/runDetail';
import { UNREADABLE_DESCRIPTION } from '../core/runsModel';

export const RUN_SCHEME = 'nika-run';

/** The one uri per journal — deterministic, so a re-Enter lands on the
 *  same tab and the watcher can address an open page without a map.
 *  The path names the tab (`<base>.md` rides the markdown language
 *  association); the query carries the journal's absolute path. */
export function detailUri(fsPath: string): vscode.Uri {
  const base = path.basename(fsPath).replace(/\.ndjson$/, '');
  return vscode.Uri.from({
    scheme: RUN_SCHEME,
    path: `/${base}.md`,
    query: encodeURIComponent(fsPath),
  });
}

class RunDetailProvider implements vscode.TextDocumentContentProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  fire(uri: vscode.Uri): void {
    this.emitter.fire(uri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const fsPath = decodeURIComponent(uri.query);
    let ndjson: string;
    let mtimeMs: number;
    try {
      ndjson = fs.readFileSync(fsPath, 'utf-8');
      mtimeMs = fs.statSync(fsPath).mtimeMs;
    } catch {
      // The honest page, one voice with the Runs view's unreadable row.
      return renderUnreadableDetail(fsPath, UNREADABLE_DESCRIPTION);
    }
    // Artifact paths are as-recorded (often run-cwd relative) — resolve
    // the report's way: absolute-and-exists · run cwd (the trace dir's
    // grandparent) · workspace roots. Unresolved renders as the gap.
    const runCwd = path.dirname(path.dirname(path.dirname(fsPath)));
    const resolvePath = (p: string): string | undefined => {
      const candidates = path.isAbsolute(p)
        ? [p]
        : [
          path.join(runCwd, p),
          ...(vscode.workspace.workspaceFolders ?? []).map((f) => path.join(f.uri.fsPath, p)),
        ];
      return candidates.find((c) => { try { return fs.existsSync(c); } catch { return false; } });
    };
    return renderRunDetail({
      traceName: path.basename(fsPath).replace(/\.ndjson$/, ''),
      fsPath,
      mtimeMs,
      nowMs: Date.now(),
      model: foldTrace(ndjson),
      artifacts: extractRunArtifacts(ndjson),
      resolvePath,
      chain: verifyChain(ndjson),
    });
  }
}

export interface RunDetailController {
  /** The traces watcher's hook — a growing journal re-renders its open
   *  page (debounced per file; a page nobody opened costs nothing). */
  refresh(fsPath: string): void;
}

export function registerRunDetail(context: vscode.ExtensionContext): RunDetailController {
  const provider = new RunDetailProvider();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(RUN_SCHEME, provider),
    { dispose: () => { for (const t of timers.values()) { clearTimeout(t); } } },
    // The one primary every run item shares (Runs row · History cell ·
    // omnibar run family · the ⌘K ⌘. row). Args are explicit (the Q4
    // socle): a Uri, or a tree/history element carrying one — garbage
    // in → silent no-op, never a throw (the wrapper law).
    vscode.commands.registerCommand('nika.runDetail', async (arg?: unknown) => {
      const uri = arg instanceof vscode.Uri
        ? arg
        : (() => {
          const t = (arg as { trace?: { uri?: unknown } } | undefined)?.trace?.uri;
          if (t instanceof vscode.Uri) { return t; }
          const p = (arg as { traceFsPath?: unknown } | undefined)?.traceFsPath;
          return typeof p === 'string' && p.length > 0 ? vscode.Uri.file(p) : undefined;
        })();
      if (uri === undefined) { return; }
      const doc = await vscode.workspace.openTextDocument(detailUri(uri.fsPath));
      await vscode.languages.setTextDocumentLanguage(doc, 'markdown');
      // The report's vehicle, verbatim: rendered preview first, the
      // text tab as the honest fallback.
      try {
        await vscode.commands.executeCommand('markdown.showPreview', doc.uri);
      } catch {
        await vscode.window.showTextDocument(doc, { preview: true });
      }
    }),
  );

  return {
    refresh(fsPath: string): void {
      const pending = timers.get(fsPath);
      if (pending) { clearTimeout(pending); }
      timers.set(fsPath, setTimeout(() => {
        timers.delete(fsPath);
        provider.fire(detailUri(fsPath));
      }, 300));
    },
  };
}
