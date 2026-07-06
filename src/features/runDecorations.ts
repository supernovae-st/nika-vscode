// runDecorations.ts — the run's verdict lands WHERE the task lives: an
// end-of-line badge per task (` ✓ 1.2s · $0.003` · failed in theme red ·
// ` ⊘` skipped) fed by the traceStore fold — live intermediates flip
// running→settled in place, the final fold is the resting truth.
//
// Task → line mapping is parseRichWorkflow's, the SAME source the task
// lens and gutter dots use — zero second parser, recomputed at apply time
// so lines are always current-text-fresh. Badges CLEAR on document edit
// (shifted positions would pin a verdict to the wrong task); the next
// fold publish or editor switch repaints from scratch.

import * as vscode from 'vscode';
import { formatRunBadge } from '../core/traceFold';
import { normalizeWorkflowKey, traceStore } from '../core/traceStore';
import { parseRichWorkflow } from '../workflowParser';

function isNikaDoc(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'nika' || /\.nika\.ya?ml$/.test(doc.fileName);
}

export class RunDecorations implements vscode.Disposable {
  // ONE decoration type; each instance carries its own `after` render
  // options (text + theme color) — failed reads errorForeground, every
  // other status the code-lens dim. Two types would double the churn.
  private readonly type = vscode.window.createTextEditorDecorationType({
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    /** Pre-run per-task estimate labels (from the check report) — painted
     *  gray-italic in the SAME slot until a real run replaces them with
     *  solid actuals (the est-vs-actual law: same place, honest weight). */
    private readonly estimates?: (docUriString: string) => Map<string, string> | undefined,
  ) {
    this.disposables.push(
      // A fold landed — repaint iff it belongs to the active document.
      traceStore.onDidUpdate((key) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && normalizeWorkflowKey(editor.document.uri.fsPath) === key) {
          this.apply(editor);
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) { this.apply(editor); }
      }),
      // An edit shifts lines under the badges — stale ranges would pin a
      // verdict to the wrong task. Clear everywhere the doc is visible.
      vscode.workspace.onDidChangeTextDocument((e) => {
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document === e.document) { editor.setDecorations(this.type, []); }
        }
      }),
    );
    if (vscode.window.activeTextEditor) { this.apply(vscode.window.activeTextEditor); }
  }

  private apply(editor: vscode.TextEditor): void {
    if (!isNikaDoc(editor.document)) { return; }
    if (!vscode.workspace.getConfiguration('nika').get<boolean>('editor.runDecorations', true)) {
      editor.setDecorations(this.type, []);
      return;
    }
    const record = traceStore.get(editor.document.uri.fsPath);
    if (!record) {
      this.applyEstimates(editor);
      return;
    }

    const wf = parseRichWorkflow(editor.document.getText());
    const decorations: vscode.DecorationOptions[] = [];
    for (const task of wf.tasks) {
      const folded = record.fold.tasks.get(task.id);
      if (!folded) { continue; }
      const contentText = formatRunBadge(folded);
      if (contentText === undefined) { continue; }
      const eol = editor.document.lineAt(Math.min(task.line, editor.document.lineCount - 1)).range.end;
      decorations.push({
        range: new vscode.Range(eol, eol),
        renderOptions: {
          after: {
            contentText,
            color: new vscode.ThemeColor(
              folded.status === 'failed' ? 'errorForeground' : 'editorCodeLens.foreground',
            ),
            margin: '0 0 0 1rem',
          },
        },
      });
    }
    editor.setDecorations(this.type, decorations);
  }

  /** A check landed — estimates may have changed (no-run docs only). */
  repaint(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor) { this.apply(editor); }
  }

  /** No run yet: the static forecast holds the slot, visibly tentative. */
  private applyEstimates(editor: vscode.TextEditor): void {
    const est = this.estimates?.(editor.document.uri.toString());
    if (!est || est.size === 0) {
      editor.setDecorations(this.type, []);
      return;
    }
    const wf = parseRichWorkflow(editor.document.getText());
    const decorations: vscode.DecorationOptions[] = [];
    for (const task of wf.tasks) {
      const contentText = est.get(task.id);
      if (contentText === undefined) { continue; }
      const eol = editor.document.lineAt(Math.min(task.line, editor.document.lineCount - 1)).range.end;
      decorations.push({
        range: new vscode.Range(eol, eol),
        renderOptions: {
          after: {
            contentText,
            color: new vscode.ThemeColor('editorCodeLens.foreground'),
            fontStyle: 'italic',
            margin: '0 0 0 1rem',
          },
        },
      });
    }
    editor.setDecorations(this.type, decorations);
  }

  dispose(): void {
    this.type.dispose();
    for (const d of this.disposables) { d.dispose(); }
  }
}
