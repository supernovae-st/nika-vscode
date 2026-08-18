// secretsDecor.ts — missing-declaration marks in the source.
//
// A red mark rides every `${{ inputs.X }}` · `${{ const.X }}` ·
// `${{ secrets.X }}` the envelope never declares under that authority.
// Silence when satisfied — only problems speak (the suggestion-timing
// law); the green story lives in the preflight chip/doc, not as line
// noise.
//
// It reads « not declared », not « not set », and it never probes the
// process environment: no value authority has an ambient fallback (spec
// 01 · a read resolves ONLY against its own envelope block; an
// undeclared one is NIKA-VAR-001). The mark used to guard `${{ config.X
// }}` reads — `config:` died with the nine-key envelope (nika 0.109); a
// deployment-supplied value is an `inputs:` entry now, with `required:
// false` and a `default:`, and gets the same mark when it is read
// before it is declared.

import * as vscode from 'vscode';
import { parseRichWorkflow } from '../workflowParser';
import { AUTHORITIES, scanRefs, type Authority } from '../core/expr';

const NIKA_RE = /\.nika\.ya?ml$/;

/** The keys declared under each live authority (one home per spelling). */
function declaredUnder(text: string): Record<Authority, string[]> {
  const wf = parseRichWorkflow(text);
  return { inputs: wf.inputsKeys, const: wf.constKeys, secrets: wf.secretsKeys };
}

export function registerSecretsDecor(context: vscode.ExtensionContext): void {
  const deco = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ' ✗ not declared in its authority block',
      color: new vscode.ThemeColor('editorError.foreground'),
      fontStyle: 'italic',
    },
  });

  const paint = (ed: vscode.TextEditor | undefined): void => {
    if (!ed || !NIKA_RE.test(ed.document.fileName)) { return; }
    const text = ed.document.getText();
    const declared = declaredUnder(text);
    const ranges: vscode.Range[] = [];
    const marked = new Set<string>();
    for (const ref of scanRefs(text)) {
      if (!(AUTHORITIES as readonly string[]).includes(ref.root) || ref.path.length === 0) { continue; }
      // A ref living in a YAML comment is documentation, not a read.
      const lineStart = text.lastIndexOf('\n', ref.start) + 1;
      if (text.slice(lineStart, ref.start).trimStart().startsWith('#')) { continue; }
      const name = ref.path[0];
      if (declared[ref.root as Authority].includes(name)) { continue; }
      // One mark per name — the first occurrence teaches, ten repeats nag.
      const key = `${ref.root}.${name}`;
      if (marked.has(key)) { continue; }
      marked.add(key);
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
    // An edit shifts offsets under the marks — a « not declared » pinned
    // to the wrong text is worse than none. Clear; the save repaints.
    vscode.workspace.onDidChangeTextDocument((e) => {
      for (const ed of vscode.window.visibleTextEditors) {
        if (ed.document === e.document) { ed.setDecorations(deco, []); }
      }
    }),
  );
  paint(vscode.window.activeTextEditor);
}
