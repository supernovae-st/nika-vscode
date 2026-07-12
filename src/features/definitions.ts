// Ctrl-click navigation for the spec's reference classes — pure logic
// in core/definitions, this file owns the vscode seam.
import * as vscode from 'vscode';
import { resolveDefinition } from '../core/definitions';

export class NikaDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Definition | undefined {
    const target = resolveDefinition(document.getText(), position.line, position.character);
    if (!target) { return undefined; }
    return new vscode.Location(
      document.uri,
      new vscode.Range(target.line, target.start, target.line, target.end),
    );
  }
}
