// flowDoors.ts — the flow pickers behind the V2 doors: « order on
// state » (after:) · « choose a gate » (when:) · « choose the
// collection » (for_each:). W2 « the flow » composes here: `when:` and
// `for_each:` read LOCAL namespaces only (a `tasks.*` ref there is
// NIKA-VAR-021), so a pick that reads an upstream VALUE hoists it
// through `with:` FIRST (the binding IS the edge) and a pick that
// reads upstream STATE becomes an `after:` entry — two chained pure
// edits, re-anchored by id between them: the doors can never write
// the parse rejection the spec promises.

import * as vscode from 'vscode';
import {
  afterRewrite, bindingInsert, fanoutRewrite, gateRewrite, gateShapes, upstreamCandidates,
  type CollectionRef, type GateShape,
} from '../core/flowEdit';
import { findVarsBlock, parseVarEntries } from '../core/varsEdit';
import { VERB_ITEMS } from '../core/verbPalette';
import { parseRichWorkflow, type RichTask } from '../workflowParser';

const VERB_GLYPH: Record<string, string> = Object.fromEntries(
  VERB_ITEMS.map((v) => [v.verb, v.glyph]),
);

interface Anchored {
  doc: vscode.TextDocument;
  text: string;
  tasks: RichTask[];
  task: RichTask;
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

/** The W2 hoist compose: bind the upstream value through `with:` first,
 * re-anchor, then write the local read — one caller-visible gesture,
 * two surgical edits. */
function withBinding(
  a: Anchored,
  producer: string,
  path: string,
  aliasBase: string,
  write: (text: string, task: RichTask, alias: string) => string | undefined,
): string | undefined {
  const already = a.task.withRefs.find((r) => r.from === producer && r.path === path);
  if (already) {
    return write(a.text, a.task, already.alias);
  }
  const bound = bindingInsert(
    a.text, a.task, aliasBase,
    `tasks.${producer}.${path}`,
    a.task.withAliases,
  );
  if (bound === undefined) { return undefined; }
  const again = parseRichWorkflow(bound.text).tasks.find((t) => t.id === a.task.id);
  if (!again) { return undefined; }
  return write(bound.text, again, bound.alias);
}

// ─── « order on state » (after:) ─────────────────────────────────────────────

type InputPick = vscode.QuickPickItem & { id: string };

export async function wireInputsFor(uri: vscode.Uri, taskId: string): Promise<void> {
  const a = await anchor(uri, taskId);
  if (!a) { return; }
  const candidates = upstreamCandidates(a.tasks, taskId);
  if (candidates.length === 0) {
    void vscode.window.showInformationMessage(
      `Nika: nothing can order \`${taskId}\` — every other task already runs after it.`,
    );
    return;
  }
  const current = a.task.after;
  const dataFed = new Set(a.task.withRefs.map((r) => r.from));
  const picked = await vscode.window.showQuickPick<InputPick>(
    candidates.map((t) => ({
      label: `${VERB_GLYPH[(t as { verb?: string }).verb ?? ''] ?? ''} ${t.id}`.trim(),
      description: t.id in current
        ? `after: ${current[t.id]}`
        : dataFed.has(t.id)
          ? 'already feeds it via with: (data edge) — pick to TIGHTEN the gate'
          : undefined,
      picked: t.id in current,
      id: t.id,
    })),
    {
      canPickMany: true,
      placeHolder: `what \`${taskId}\` waits for (control · state, never data) — descendants stay out (a cycle is never offered)`,
    },
  );
  if (!picked) { return; }
  // Kept picks keep their declared predicate; fresh picks gate on
  // succeeded (the strict default — terminal/failed/skipped are hand
  // tunings the lens leaves in place once written).
  const entries = picked.map((p) => [p.id, current[p.id] ?? 'succeeded'] as const);
  const next = afterRewrite(a.text, a.task, entries);
  if (next === undefined || next === a.text) { return; }
  await applyFullRewrite(a.doc, next);
}

// ─── « choose a gate » ───────────────────────────────────────────────────────

type GatePick = vscode.QuickPickItem & { shape?: GateShape };

function gateDetail(s: GateShape): string {
  switch (s.action.kind) {
    case 'when': return `when: \${{ ${s.action.expr} }}`;
    case 'after': return `after: { ${s.action.producer}: ${s.action.predicate} }`;
    case 'bind-when': {
      const alias = s.action.aliasBase;
      return `with: { ${alias}: \${{ tasks.${s.action.producer}.${s.action.path} }} } · when: \${{ ${s.action.exprOf(alias)} }}`;
    }
  }
}

export async function chooseGateFor(uri: vscode.Uri, taskId: string): Promise<void> {
  const a = await anchor(uri, taskId);
  if (!a) { return; }
  const upstream = upstreamCandidates(a.tasks, taskId);
  const shapes = gateShapes(a.varsKeys, a.task.withAliases, upstream);
  if (shapes.length === 0) {
    void vscode.window.showInformationMessage(
      'Nika: nothing to gate on yet — declare an input (vars:) or add an upstream task.',
    );
    return;
  }
  const rows: GatePick[] = [];
  let group: 'local' | 'tasks' | undefined;
  for (const s of shapes) {
    const g = s.action.kind === 'when' ? 'local' : 'tasks';
    if (g !== group) {
      rows.push({
        label: g === 'local' ? 'local reads (vars · with)' : 'upstream tasks (after: / hoist)',
        kind: vscode.QuickPickItemKind.Separator,
      });
      group = g;
    }
    rows.push({ label: `⌁ ${s.label}`, description: s.hint, detail: gateDetail(s), shape: s });
  }
  const picked = await vscode.window.showQuickPick(rows, {
    placeHolder: 'when: reads LOCAL values only — upstream state becomes after:, an upstream value crosses through with: first',
    matchOnDescription: true,
  });
  if (!picked?.shape) { return; }
  const action = picked.shape.action;
  let next: string | undefined;
  switch (action.kind) {
    case 'when':
      next = gateRewrite(a.text, a.task, action.expr);
      break;
    case 'after': {
      const entries: Array<readonly [string, string]> = Object.entries(a.task.after)
        .filter(([p]) => p !== action.producer);
      entries.push([action.producer, action.predicate]);
      next = afterRewrite(a.text, a.task, entries);
      break;
    }
    case 'bind-when':
      next = withBinding(a, action.producer, action.path, action.aliasBase,
        (t, task, alias) => gateRewrite(t, task, action.exprOf(alias)));
      break;
  }
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
  const bound = new Map(a.task.withRefs.map((r) => [`${r.from}.${r.path}`, r.alias]));
  if (upstream.length > 0) {
    rows.push({ label: 'upstream outputs (cross through with:)', kind: vscode.QuickPickItemKind.Separator });
    for (const t of upstream) {
      const alias = bound.get(`${t.id}.output`);
      rows.push({
        label: `${VERB_GLYPH[(t as { verb?: string }).verb ?? ''] ?? ''} tasks.${t.id}.output`.trim(),
        description: alias !== undefined
          ? `already bound as with.${alias} — for_each reads the binding`
          : 'binds with: { … } first — the binding IS the edge, for_each reads it',
        collection: {
          label: t.id,
          ref: `with.${alias ?? t.id}`,
          needsBinding: { producer: t.id, path: 'output', aliasBase: t.id },
        },
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
  const next = c.needsBinding
    ? withBinding(a, c.needsBinding.producer, c.needsBinding.path, c.needsBinding.aliasBase,
        (t, task, alias) => fanoutRewrite(t, task, `with.${alias}`))
    : fanoutRewrite(a.text, a.task, c.ref);
  if (next === undefined || next === a.text) { return; }
  await applyFullRewrite(a.doc, next);
}
