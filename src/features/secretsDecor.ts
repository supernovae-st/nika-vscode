// secretsDecor.ts — missing-requirement marks in the source.
//
// A red « ✗ not set » rides every `${{ env.X }}` the environment cannot
// satisfy (and the workflow `env:` block does not define). Silence when
// satisfied — only problems speak (the suggestion-timing law); the
// green story lives in the preflight chip/doc, not as line noise.

import * as vscode from 'vscode';
import { collectPreflightFacts } from '../core/preflight';
import { scanRefs } from '../core/expr';

const NIKA_RE = /\.nika\.ya?ml$/;

export function registerSecretsDecor(context: vscode.ExtensionContext): void {
  const deco = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ' ✗ not set',
      color: new vscode.ThemeColor('editorError.foreground'),
      fontStyle: 'italic',
    },
  });

  const paint = (ed: vscode.TextEditor | undefined): void => {
    if (!ed || !NIKA_RE.test(ed.document.fileName)) { return; }
    const text = ed.document.getText();
    const facts = collectPreflightFacts(text);
    const present = (n: string): boolean => (process.env[n] ?? '').length > 0;
    const ranges: vscode.Range[] = [];
    const marked = new Set<string>();
    for (const ref of scanRefs(text)) {
      if (ref.root !== 'env' || ref.path.length === 0) { continue; }
      // A ref living in a YAML comment is documentation, not a read.
      const lineStart = text.lastIndexOf('\n', ref.start) + 1;
      if (text.slice(lineStart, ref.start).trimStart().startsWith('#')) { continue; }
      const name = ref.path[0];
      if (facts.envDefined.includes(name) || present(name)) { continue; }
      // One mark per name — the first occurrence teaches, ten repeats nag.
      if (marked.has(name)) { continue; }
      marked.add(name);
      ranges.push(new vscode.Range(
        ed.document.positionAt(ref.start),
        ed.document.positionAt(ref.end),
      ));
    }
    ed.setDecorations(deco, ranges);
  };

  context.subscriptions.push(
    deco,
    vscode.window.onDidChangeActiveTextEditor((ed) => paint(ed)),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const ed = vscode.window.visibleTextEditors.find((e) => e.document === doc);
      paint(ed);
    }),
    // An edit shifts offsets under the marks — a « not set » pinned to
    // the wrong text is worse than none. Clear; the save repaints.
    vscode.workspace.onDidChangeTextDocument((e) => {
      for (const ed of vscode.window.visibleTextEditors) {
        if (ed.document === e.document) { ed.setDecorations(deco, []); }
      }
    }),
  );
  paint(vscode.window.activeTextEditor);
}
