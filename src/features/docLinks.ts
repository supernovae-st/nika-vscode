// Ctrl-clickable teaching links — every construct points at its page
// (PAGE-level targets only: docs.nika.sh/concepts/verbs · nika.sh/tools ·
// docs.nika.sh/concepts/security — no invented anchors, the no-phantom
// law). Quiet by design: DocumentLinks underline on hover, zero chrome.
import * as vscode from 'vscode';
import {
  PERMITS_LINE_RE,
  PERMITS_URL,
  TOOL_RE,
  TOOLS_URL,
} from '../core/linkTargets';

export class NikaDocLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    const cap = Math.min(document.lineCount, 2000);
    for (let i = 0; i < cap; i++) {
      const text = document.lineAt(i).text;
      if (PERMITS_LINE_RE.test(text)) {
        const link = new vscode.DocumentLink(
          new vscode.Range(i, 0, i, 'permits'.length),
          vscode.Uri.parse(PERMITS_URL),
        );
        link.tooltip = 'The capability boundary — default-deny once declared';
        links.push(link);
      }
      for (const m of text.matchAll(TOOL_RE)) {
        const start = (m.index ?? 0) + 1;
        const link = new vscode.DocumentLink(
          new vscode.Range(i, start, i, start + m[1].length),
          vscode.Uri.parse(TOOLS_URL),
        );
        link.tooltip = `${m[1]} — the builtin library register`;
        links.push(link);
      }
    }
    return links;
  }
}
