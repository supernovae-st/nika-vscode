// historyView.ts — the Run History tree (native · when-gated).
//
// The stationView idiom: a DUMB renderer over `core/runHistory.
// buildHistoryRows` — sections, order, glyph strips, collapse state and
// the #k↔run mapping all derive pure and unit-tested. The view owns
// only the tree plumbing, the `nika.historyActive` context key and the
// export/close gestures. The markdown grid this tree replaced is one
// gesture away ($(markdown) in the view title): the document became
// the EXPORT — annexe R R13, `command:` links are dead in the preview.
//
// views.when — phantom-feature-recheck receipt (2026-07-20): verified
// against the installed runtime (VS Code 1.106.3, workbench.desktop.
// main.js) — a contributed view's `when` string is deserialized into a
// ContextKeyExpr onto the ViewDescriptor (`when:C.deserialize(g.when)`)
// and the ViewDescriptorService watches its keys, so the view appears
// and disappears with the context. The GitLens precedent holds; no
// fallback registration is needed.
//
// A window reload drops the context key, so the view disappears until
// the next `Nika: Run History` — BY DESIGN (persistence is a named
// owed, mega-plan §14 O8).

import * as vscode from 'vscode';
import {
  buildHistoryRows,
  historyFilterHits,
  renderHistory,
  type HistoryRow,
  type HistoryRun,
} from '../core/runHistory';

class HistoryItem extends vscode.TreeItem {
  constructor(row: HistoryRow, docUri: vscode.Uri | undefined) {
    super(
      row.label,
      row.kind === 'section'
        ? (row.collapsed
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.Expanded)
        : row.kind === 'task'
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
    );
    this.id = row.id;
    this.description = row.description;
    if (row.kind === 'section') {
      this.contextValue = 'nikaHistorySection';
    } else if (row.kind === 'task') {
      this.contextValue = 'nikaHistoryTask';
      if (row.taskId !== undefined && docUri !== undefined) {
        // Click = NAVIGATION (law 4) — the view KNOWS its workflow, so
        // the args are explicit (never « whatever editor is active »).
        this.command = {
          command: 'nika.focusTaskInDag',
          title: 'Focus Task in DAG',
          arguments: [docUri, row.taskId],
        };
      }
    } else {
      this.contextValue = 'nikaHistoryCell';
      if (row.traceFsPath !== undefined) {
        this.command = {
          command: 'nika.replayTrace',
          title: 'Replay',
          arguments: [vscode.Uri.file(row.traceFsPath)],
        };
      }
    }
  }
}

export class HistoryTreeProvider implements vscode.TreeDataProvider<HistoryRow> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private rows: HistoryRow[] = [];
  docUri: vscode.Uri | undefined;
  docName: string | undefined;
  runs: HistoryRun[] = [];

  load(
    docUri: vscode.Uri,
    docName: string,
    runs: HistoryRun[],
    nowMs = Date.now(),
    filter?: string,
  ): void {
    this.docUri = docUri;
    this.docName = docName;
    this.runs = runs;
    this.rows = buildHistoryRows(runs, nowMs, filter);
    this.changeEmitter.fire();
  }

  getTreeItem(row: HistoryRow): vscode.TreeItem {
    return new HistoryItem(row, this.docUri);
  }

  getChildren(row?: HistoryRow): HistoryRow[] {
    return row ? row.children ?? [] : this.rows;
  }
}

export interface HistoryController {
  /** Load the runs, raise the context key, focus the view. The optional
   *  filter (the gate's query) narrows task rows; the description says
   *  whether it bit. */
  show(docUri: vscode.Uri, docName: string, runs: HistoryRun[], filter?: string): Promise<void>;
  /** The live tree handle · the action panel reads its selection. */
  readonly view: vscode.TreeView<HistoryRow>;
  /** The loaded workflow · task rows navigate with it. */
  docUri(): vscode.Uri | undefined;
}

export function registerHistory(context: vscode.ExtensionContext): HistoryController {
  const provider = new HistoryTreeProvider();
  const view = vscode.window.createTreeView('nikaRunHistory', {
    treeDataProvider: provider,
    showCollapseAll: false,
  });
  context.subscriptions.push(view);
  const setActive = (on: boolean): Thenable<unknown> =>
    vscode.commands.executeCommand('setContext', 'nika.historyActive', on);

  context.subscriptions.push(
    // The document became the export (R13): today's render + preview
    // flow, verbatim — zero deletion, one gesture later.
    vscode.commands.registerCommand('nika.history.exportDoc', async () => {
      if (provider.docName === undefined) { return; }
      const md = renderHistory(provider.docName, provider.runs);
      const preview = await vscode.workspace.openTextDocument({ language: 'markdown', content: md });
      try {
        await vscode.commands.executeCommand('markdown.showPreview', preview.uri);
      } catch {
        await vscode.window.showTextDocument(preview, { preview: true });
      }
    }),
    vscode.commands.registerCommand('nika.history.close', () => {
      void setActive(false);
    }),
    // Inline $(output) on a cell — the row's run gets its provable
    // report. The menu passes the tree ELEMENT (a pure HistoryRow):
    // typeof first, then the recorded path becomes the Uri.
    vscode.commands.registerCommand('nika.history.report', (item: unknown) => {
      if (typeof item !== 'object' || item === null) { return; }
      const fsPath = (item as { traceFsPath?: unknown }).traceFsPath;
      if (typeof fsPath !== 'string' || fsPath.length === 0) { return; }
      void vscode.commands.executeCommand('nika.runReport', vscode.Uri.file(fsPath));
    }),
  );

  return {
    async show(docUri, docName, runs, filter) {
      provider.load(docUri, docName, runs, Date.now(), filter);
      // The description tells the filter's truth: it bit (`filter: q`),
      // or it matched nothing and the whole story stayed (never an
      // empty tree that looks like « no runs »).
      const q = filter?.trim() ?? '';
      const chip = q.length === 0
        ? ''
        : historyFilterHits(runs, q) > 0
          ? ` · filter: ${q}`
          : ` · "${q}" matches no task`;
      view.description = `${docName} · ${runs.length} run${runs.length === 1 ? '' : 's'}${chip}`;
      await setActive(true);
      // Focus AFTER the context key lands — a when-hidden view has no
      // seat to take focus in.
      await vscode.commands.executeCommand('nikaRunHistory.focus');
    },
    view,
    docUri: () => provider.docUri,
  };
}
