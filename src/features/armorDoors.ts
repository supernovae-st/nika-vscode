// armorDoors.ts — the resilience picker behind « make it resilient »:
// the spec's three error walls (retry · on_error · timeout) offered
// where they're absent, on the task that just proved it needs them.
// recover's fallback source honors acyclicity (NIKA-DAG-004) via
// upstreamCandidates — the picker cannot write the recovery deadlock.

import * as vscode from 'vscode';
import { ARMOR_SHAPES, armorWrite, wornArmor, type ArmorShape } from '../core/armorEdit';
import { upstreamCandidates } from '../core/flowEdit';
import { parseRichWorkflow, taskAtLine } from '../workflowParser';

async function applyFullRewrite(doc: vscode.TextDocument, next: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), next);
  await vscode.workspace.applyEdit(edit);
}

type ArmorPick = vscode.QuickPickItem & { shape: ArmorShape };

/** The lens path carries (uri, taskId); the palette path carries
 * neither — the task under the cursor is the subject. */
export async function makeResilientFor(uri?: vscode.Uri, taskId?: string): Promise<void> {
  let doc: vscode.TextDocument;
  if (uri) {
    doc = await vscode.workspace.openTextDocument(uri);
  } else {
    const active = vscode.window.activeTextEditor;
    if (!active || !(active.document.languageId === 'nika' || /\.nika\.ya?ml$/.test(active.document.fileName))) {
      void vscode.window.showInformationMessage('Nika: open a .nika.yaml file first.');
      return;
    }
    doc = active.document;
  }
  const text = doc.getText();
  const wf = parseRichWorkflow(text);
  const task = taskId
    ? wf.tasks.find((t) => t.id === taskId)
    : taskAtLine(wf, vscode.window.activeTextEditor?.selection.active.line ?? 0);
  if (!task) {
    void vscode.window.showInformationMessage('Nika: put the cursor on a task first.');
    return;
  }

  const lines = text.split('\n');
  const worn = wornArmor(lines, task);
  const rows = ARMOR_SHAPES
    .filter((s) => !worn.has(s.key))
    .map((s): ArmorPick => ({ label: `$(pulse) ${s.label}`, description: s.hint, shape: s }));
  if (rows.length === 0) {
    void vscode.window.showInformationMessage(`Nika: \`${task.id}\` already wears all three walls — tune them in place.`);
    return;
  }
  const picked = await vscode.window.showQuickPick(rows, {
    placeHolder: `the wall \`${task.id}\` needs — retry absorbs transient; recover/skip catch the rest; timeout bounds the wait`,
    matchOnDescription: true,
  });
  if (!picked) { return; }

  // recover asks for its source — an upstream output (acyclicity-safe)
  // or a literal SLOT the author fills.
  let recoverRef: string | undefined;
  if (picked.shape.id === 'recover') {
    type SourcePick = vscode.QuickPickItem & { ref?: string };
    const sources: SourcePick[] = [
      {
        label: '$(edit) a literal you name',
        description: 'a default value — 0 · [] · { stale: true }',
      },
      ...upstreamCandidates(wf.tasks, task.id).map((t): SourcePick => ({
        label: `$(symbol-value) tasks.${t.id}.output`,
        description: 'resolved at recovery time — not an execution edge (the spec carve-out)',
        ref: `\${{ tasks.${t.id}.output }}`,
      })),
    ];
    const src = await vscode.window.showQuickPick(sources, {
      placeHolder: `what \`${task.id}\` falls back to — keep recovery sources cheap and independent`,
    });
    if (!src) { return; }
    recoverRef = src.ref;
  }

  const next = armorWrite(text, task, picked.shape.id, recoverRef);
  if (next === undefined || next === text) { return; }
  await applyFullRewrite(doc, next);
}
