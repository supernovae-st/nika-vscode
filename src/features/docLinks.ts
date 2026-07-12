// Ctrl-clickable teaching links — every construct points at its page
// (PAGE-level targets only: docs.nika.sh/concepts/verbs · nika.sh/tools ·
// docs.nika.sh/concepts/security — no invented anchors, the no-phantom
// law). Quiet by design: DocumentLinks underline on hover, zero chrome.
import * as vscode from 'vscode';

const VERB_RE = /^\s+(infer|exec|invoke|agent):/;
const TOOL_RE = /"(nika:[a-z_]+)"/g;
const PERMITS_RE = /^permits:/;

export class NikaDocLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    const cap = Math.min(document.lineCount, 2000);
    for (let i = 0; i < cap; i++) {
      const text = document.lineAt(i).text;
      const verb = VERB_RE.exec(text);
      if (verb) {
        const start = text.indexOf(verb[1]);
        const link = new vscode.DocumentLink(
          new vscode.Range(i, start, i, start + verb[1].length),
          vscode.Uri.parse('https://docs.nika.sh/concepts/verbs'),
        );
        link.tooltip = `The ${verb[1]} verb — execution model, fields, examples`;
        links.push(link);
      }
      if (PERMITS_RE.test(text)) {
        const link = new vscode.DocumentLink(
          new vscode.Range(i, 0, i, 'permits'.length),
          vscode.Uri.parse('https://docs.nika.sh/concepts/security'),
        );
        link.tooltip = 'The capability boundary — default-deny once declared';
        links.push(link);
      }
      for (const m of text.matchAll(TOOL_RE)) {
        const start = (m.index ?? 0) + 1;
        const link = new vscode.DocumentLink(
          new vscode.Range(i, start, i, start + m[1].length),
          vscode.Uri.parse('https://nika.sh/tools'),
        );
        link.tooltip = `${m[1]} — the builtin library register`;
        links.push(link);
      }
    }
    return links;
  }
}
