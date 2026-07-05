// structureNav.ts — structural navigation: smart-expand selection ranges
// and linked editing for task ids (type once, every reference follows).
//
// Both derive from the shared regex parser (workflowParser) and the
// 4-home reference scanner (renameRefs) — the same substrate rename and
// find-references trust, so the surfaces can never disagree.

import * as vscode from 'vscode';
import { findTaskRefs } from '../core/renameRefs';
import { parseRichWorkflow } from '../workflowParser';

const SELECTOR: vscode.DocumentSelector = [
  { language: 'nika' },
  { pattern: '**/*.nika.yaml' },
];

/** Task ids are locked to this shape by the engine grammar. */
const TASK_ID_RE = /[a-z][a-z0-9_]*/;

class NikaSelectionRangeProvider implements vscode.SelectionRangeProvider {
  provideSelectionRanges(
    document: vscode.TextDocument,
    positions: readonly vscode.Position[],
  ): vscode.SelectionRange[] {
    const wf = parseRichWorkflow(document.getText());
    const lines = document.getText().split('\n');
    const tasksLine = lines.findIndex((l) => /^tasks\s*:/.test(l));
    const lastTaskEnd = wf.tasks.reduce((acc, t) => Math.max(acc, t.endLine), tasksLine);

    return positions.map((pos) => {
      // Containment ladder, innermost first; each parent must contain its
      // child or VS Code rejects the chain.
      const ladder: vscode.Range[] = [];
      const word = document.getWordRangeAtPosition(pos, TASK_ID_RE)
        ?? document.getWordRangeAtPosition(pos);
      if (word) { ladder.push(word); }
      ladder.push(document.lineAt(pos.line).range);

      const task = wf.tasks.find((t) => pos.line >= t.line && pos.line <= t.endLine);
      if (task) {
        ladder.push(new vscode.Range(
          task.line, 0,
          Math.min(task.endLine, document.lineCount - 1), lines[Math.min(task.endLine, lines.length - 1)]?.length ?? 0,
        ));
      }
      if (tasksLine !== -1 && pos.line >= tasksLine && pos.line <= lastTaskEnd) {
        ladder.push(new vscode.Range(
          tasksLine, 0,
          Math.min(lastTaskEnd, document.lineCount - 1), lines[Math.min(lastTaskEnd, lines.length - 1)]?.length ?? 0,
        ));
      }
      ladder.push(new vscode.Range(0, 0, document.lineCount - 1, lines[lines.length - 1]?.length ?? 0));

      // Fold the ladder into a nested chain, dropping non-containing steps.
      let chain: vscode.SelectionRange | undefined;
      for (let i = ladder.length - 1; i >= 0; i--) {
        const range = ladder[i];
        if (chain && !chain.range.contains(range)) { continue; }
        if (chain && chain.range.isEqual(range)) { continue; }
        chain = new vscode.SelectionRange(range, chain);
      }
      return chain ?? new vscode.SelectionRange(document.lineAt(pos.line).range);
    });
  }
}

class NikaLinkedEditingProvider implements vscode.LinkedEditingRangeProvider {
  provideLinkedEditingRanges(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.LinkedEditingRanges | undefined {
    const wordRange = document.getWordRangeAtPosition(position, TASK_ID_RE);
    if (!wordRange) { return undefined; }
    const word = document.getText(wordRange);
    const text = document.getText();
    const wf = parseRichWorkflow(text);
    if (!wf.tasks.some((t) => t.id === word)) { return undefined; }

    const ranges = findTaskRefs(text, word).map((r) => new vscode.Range(
      document.positionAt(r.start),
      document.positionAt(r.end),
    ));
    // Offer linking only when the cursor sits in one of the scanned homes
    // (a stray same-named word elsewhere must not rewrite the workflow).
    if (!ranges.some((r) => r.contains(position))) { return undefined; }
    return new vscode.LinkedEditingRanges(ranges, TASK_ID_RE);
  }
}

// ─── Call hierarchy ≙ task dependency hierarchy ─────────────────────────────
// The editor's native hierarchy UI, mapped onto the DAG: outgoing calls =
// what this task NEEDS (upstream depends_on) · incoming calls = what it
// UNLOCKS (downstream dependents). Same peek/tree affordances users know
// from functions, zero new UI to learn.

interface TaskShape {
  id: string;
  verb: string;
  line: number;
  endLine: number;
  dependsOn: string[];
}

function hierarchyItem(document: vscode.TextDocument, task: TaskShape): vscode.CallHierarchyItem {
  const declLine = Math.min(task.line, document.lineCount - 1);
  const lineText = document.lineAt(declLine).text;
  // Search AFTER the `id:` colon — a task literally named `id` would
  // otherwise match the key token itself.
  const colon = lineText.indexOf(':');
  const idCol = Math.max(lineText.indexOf(task.id, colon + 1), 0);
  return new vscode.CallHierarchyItem(
    vscode.SymbolKind.Function,
    task.id,
    task.verb,
    document.uri,
    new vscode.Range(declLine, 0, Math.min(task.endLine, document.lineCount - 1), 0),
    new vscode.Range(declLine, idCol, declLine, idCol + task.id.length),
  );
}

class NikaTaskHierarchyProvider implements vscode.CallHierarchyProvider {
  prepareCallHierarchy(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CallHierarchyItem | undefined {
    const wordRange = document.getWordRangeAtPosition(position, TASK_ID_RE);
    if (!wordRange) { return undefined; }
    const word = document.getText(wordRange);
    const wf = parseRichWorkflow(document.getText());
    const task = wf.tasks.find((t) => t.id === word);
    return task ? hierarchyItem(document, task) : undefined;
  }

  async provideCallHierarchyOutgoingCalls(
    item: vscode.CallHierarchyItem,
  ): Promise<vscode.CallHierarchyOutgoingCall[]> {
    const document = await vscode.workspace.openTextDocument(item.uri);
    const wf = parseRichWorkflow(document.getText());
    const self = wf.tasks.find((t) => t.id === item.name);
    if (!self) { return []; }
    return self.dependsOn
      .map((dep) => wf.tasks.find((t) => t.id === dep))
      .filter((t): t is NonNullable<typeof t> => t !== undefined)
      .map((dep) => new vscode.CallHierarchyOutgoingCall(
        hierarchyItem(document, dep),
        [new vscode.Range(self.line, 0, Math.min(self.endLine, document.lineCount - 1), 0)],
      ));
  }

  async provideCallHierarchyIncomingCalls(
    item: vscode.CallHierarchyItem,
  ): Promise<vscode.CallHierarchyIncomingCall[]> {
    const document = await vscode.workspace.openTextDocument(item.uri);
    const wf = parseRichWorkflow(document.getText());
    return wf.tasks
      .filter((t) => t.dependsOn.includes(item.name))
      .map((dependent) => new vscode.CallHierarchyIncomingCall(
        hierarchyItem(document, dependent),
        [new vscode.Range(dependent.line, 0, Math.min(dependent.endLine, document.lineCount - 1), 0)],
      ));
  }
}

export function registerStructureNav(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerSelectionRangeProvider(SELECTOR, new NikaSelectionRangeProvider()),
    vscode.languages.registerLinkedEditingRangeProvider(SELECTOR, new NikaLinkedEditingProvider()),
    vscode.languages.registerCallHierarchyProvider(SELECTOR, new NikaTaskHierarchyProvider()),
  );
}
