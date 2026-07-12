// flowDoors.ts — the flow pickers behind the V2 doors: « wire its
// inputs » (depends_on) · « choose a gate » (when:) · « choose the
// collection » (for_each:). The §219 law composes here: a gate or
// collection that reads `tasks.<id>` wires the depends_on edge FIRST
// (two chained pure edits, re-anchored by id between them) — the door
// can never write the parse rejection the spec promises.

import * as vscode from 'vscode';
import {
  dependsRewrite, fanoutRewrite, gateRewrite, gateShapes, upstreamCandidates,
  type CollectionRef, type GateShape, type TaskRange,
} from '../core/flowEdit';
import { findVarsBlock, parseVarEntries } from '../core/varsEdit';
import { VERB_ITEMS } from '../core/verbPalette';
import { parseRichWorkflow } from '../workflowParser';

const VERB_GLYPH: Record<string, string> = Object.fromEntries(
  VERB_ITEMS.map((v) => [v.verb, v.glyph]),
);

interface Anchored {
  doc: vscode.TextDocument;
  text: string;
  tasks: ReturnType<typeof parseRichWorkflow>['tasks'];
  task: ReturnType<typeof parseRichWorkflow>['tasks'][number];
  varsKeys: string[];
}

/** Re-anchor by id — the lens carried a taskId, never a line number. */
async function anchor(uri: vscode.Uri, taskId: string): Promise<Anchored | undefined> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const text = doc.getText();
  const wf = parseRichWorkflow(text);
  const task = wf.tasks.find((t) => t.id === taskId);
  if (!task) { return undefined; } // the task moved under us — refuse
  return { doc, text, tasks: wf.tasks, task, varsKeys: wf.varsKeys };
}

async function applyFullRewrite(doc: vscode.TextDocument, next: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), next);
  await vscode.workspace.applyEdit(edit);
}

/** The §219 compose: wire the edge first, re-anchor, then write the
 * key — one caller-visible gesture, two surgical edits. */
function withEdge(
  a: Anchored,
  needsTask: string | undefined,
  write: (text: string, task: TaskRange) => string | undefined,
): string | undefined {
  if (!needsTask || a.task.dependsOn.includes(needsTask)) {
    return write(a.text, a.task);
  }
  const wired = dependsRewrite(a.text, a.task, [...a.task.dependsOn, needsTask]);
  if (wired === undefined) { return undefined; }
  const again = parseRichWorkflow(wired).tasks.find((t) => t.id === a.task.id);
  if (!again) { return undefined; }
  return write(wired, again);
}

// ─── « wire its inputs » ─────────────────────────────────────────────────────

type InputPick = vscode.QuickPickItem & { id: string };

export async function wireInputsFor(uri: vscode.Uri, taskId: string): Promise<void> {
  const a = await anchor(uri, taskId);
  if (!a) { return; }
  const candidates = upstreamCandidates(a.tasks, taskId);
  if (candidates.length === 0) {
    void vscode.window.showInformationMessage(
      `Nika: nothing can feed \`${taskId}\` — every other task already depends on it.`,
    );
    return;
  }
  const current = new Set(a.task.dependsOn);
  const picked = await vscode.window.showQuickPick<InputPick>(
    candidates.map((t) => ({
      label: `${VERB_GLYPH[(t as { verb?: string }).verb ?? ''] ?? ''} ${t.id}`.trim(),
      description: current.has(t.id) ? 'wired today' : undefined,
      picked: current.has(t.id),
      id: t.id,
    })),
    {
      canPickMany: true,
      placeHolder: `what \`${taskId}\` waits for — descendants stay out (a cycle is never offered)`,
    },
  );
  if (!picked) { return; }
  const next = dependsRewrite(a.text, a.task, picked.map((p) => p.id));
  if (next === undefined || next === a.text) { return; }
  await applyFullRewrite(a.doc, next);
}

// ─── « choose a gate » ───────────────────────────────────────────────────────

type GatePick = vscode.QuickPickItem & { shape?: GateShape };

export async function chooseGateFor(uri: vscode.Uri, taskId: string): Promise<void> {
  const a = await anchor(uri, taskId);
  if (!a) { return; }
  const upstream = upstreamCandidates(a.tasks, taskId);
  const shapes = gateShapes(a.varsKeys, upstream);
  if (shapes.length === 0) {
    void vscode.window.showInformationMessage(
      'Nika: nothing to gate on yet — declare an input (vars:) or add an upstream task.',
    );
    return;
  }
  const rows: GatePick[] = [];
  let group: 'vars' | 'tasks' | undefined;
  for (const s of shapes) {
    const g = s.needsTask ? 'tasks' : 'vars';
    if (g !== group) {
      rows.push({ label: g === 'vars' ? 'inputs' : 'upstream tasks', kind: vscode.QuickPickItemKind.Separator });
      group = g;
    }
    rows.push({ label: `⌁ ${s.label}`, description: s.hint, detail: `when: \${{ ${s.expr} }}`, shape: s });
  }
  const picked = await vscode.window.showQuickPick(rows, {
    placeHolder: 'the CEL v0.1 gate this task runs behind — a tasks.* gate wires its depends_on edge too',
    matchOnDescription: true,
  });
  if (!picked?.shape) { return; }
  const next = withEdge(a, picked.shape.needsTask, (t, task) => gateRewrite(t, task, picked.shape!.expr));
  if (next === undefined || next === a.text) { return; }
  await applyFullRewrite(a.doc, next);
}

// ─── « choose the collection » ───────────────────────────────────────────────

type CollectionPick = vscode.QuickPickItem & { collection?: CollectionRef };

export async function chooseCollectionFor(uri: vscode.Uri, taskId: string): Promise<void> {
  const a = await anchor(uri, taskId);
  if (!a) { return; }
  const lines = a.text.split('\n');
  const varsBlock = findVarsBlock(lines);
  const entries = varsBlock ? parseVarEntries(lines, varsBlock) : [];
  const arrays = entries.filter((e) => e.varType === 'array');
  const others = entries.filter((e) => e.varType !== 'array');
  const upstream = upstreamCandidates(a.tasks, taskId);

  const rows: CollectionPick[] = [];
  if (arrays.length > 0) {
    rows.push({ label: 'array inputs', kind: vscode.QuickPickItemKind.Separator });
    for (const e of arrays) {
      rows.push({
        label: `$(symbol-array) vars.${e.name}`,
        description: 'typed array — one run per element',
        collection: { label: e.name, ref: `vars.${e.name}` },
      });
    }
  }
  if (upstream.length > 0) {
    rows.push({ label: 'upstream outputs', kind: vscode.QuickPickItemKind.Separator });
    for (const t of upstream) {
      rows.push({
        label: `${VERB_GLYPH[(t as { verb?: string }).verb ?? ''] ?? ''} tasks.${t.id}.output`.trim(),
        description: 'a prior task\'s array output — wires the depends_on edge too',
        collection: { label: t.id, ref: `tasks.${t.id}.output`, needsTask: t.id },
      });
    }
  }
  if (others.length > 0) {
    rows.push({ label: 'other inputs', kind: vscode.QuickPickItemKind.Separator });
    for (const e of others) {
      rows.push({
        label: `$(symbol-variable) vars.${e.name}`,
        description: 'runs if it holds a list at launch',
        collection: { label: e.name, ref: `vars.${e.name}` },
      });
    }
  }
  if (rows.length === 0) {
    void vscode.window.showInformationMessage(
      'Nika: no collection in sight — declare an array input (vars:) or add an upstream task.',
    );
    return;
  }
  const picked = await vscode.window.showQuickPick(rows, {
    placeHolder: 'the collection this task maps over — ${{ item }} is the element, ${{ index }} its position',
  });
  if (!picked?.collection) { return; }
  const c = picked.collection;
  const next = withEdge(a, c.needsTask, (t, task) => fanoutRewrite(t, task, c.ref));
  if (next === undefined || next === a.text) { return; }
  await applyFullRewrite(a.doc, next);
}
