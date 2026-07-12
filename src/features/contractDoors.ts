// contractDoors.ts — the callable-contract pickers behind the V1 doors:
// « type its output » (schema shape onto an infer/agent) · « choose
// what it publishes » (outputs: as a multi-pick over the DAG) ·
// « declare an input » / « make it callable » (vars: growth +
// untyped→typed promotion). Every edit is a core-module pure function
// (schemaEdit · outputsEdit · varsEdit) — this file is only the
// QuickPick choreography and the one WorkspaceEdit per gesture.

import * as vscode from 'vscode';
import { SCHEMA_SHAPES, schemaInsert, type SchemaShape } from '../core/schemaEdit';
import { findOutputsBlock, outputsRewrite, parseOutputs } from '../core/outputsEdit';
import {
  declareInput, findVarsBlock, parseVarEntries, promoteVar, type VarType,
} from '../core/varsEdit';
import { VERB_ITEMS } from '../core/verbPalette';
import type { NikaVerb } from '../core/verbStarters.generated';
import { parseRichWorkflow } from '../workflowParser';

const VERB_GLYPH: Record<string, string> = Object.fromEntries(
  VERB_ITEMS.map((v) => [v.verb, v.glyph]),
);

/** Replace the whole document — the one-undo move every door shares. */
async function applyFullRewrite(doc: vscode.TextDocument, next: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), next);
  await vscode.workspace.applyEdit(edit);
}

async function activeOrOpen(uri?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  if (uri) { return vscode.workspace.openTextDocument(uri); }
  const doc = vscode.window.activeTextEditor?.document;
  if (doc && (doc.languageId === 'nika' || /\.nika\.ya?ml$/.test(doc.fileName))) { return doc; }
  void vscode.window.showInformationMessage('Nika: open a .nika.yaml file first.');
  return undefined;
}

// ─── « type its output » ─────────────────────────────────────────────────────

type ShapePick = vscode.QuickPickItem & { shape: SchemaShape };

export async function typeOutputForLine(
  uri: vscode.Uri,
  lineNo: number,
  verb: NikaVerb,
): Promise<void> {
  const picked = await vscode.window.showQuickPick<ShapePick>(
    SCHEMA_SHAPES.map((s) => ({
      label: `$(symbol-structure) ${s.label}`,
      description: s.hint,
      shape: s,
    })),
    {
      placeHolder: verb === 'agent'
        ? 'the shape the FINAL message must match — appended to this agent: block'
        : 'the shape the response must match — appended to this infer: block',
    },
  );
  if (!picked) { return; }
  const doc = await vscode.workspace.openTextDocument(uri);
  const ins = schemaInsert(doc.getText(), lineNo, verb, picked.shape);
  if (!ins) { return; } // the line moved under us — refuse a blind write
  const at = ins.atLine >= doc.lineCount
    ? doc.positionAt(doc.getText().length)
    : new vscode.Position(ins.atLine, 0);
  const text = ins.atLine >= doc.lineCount && !doc.getText().endsWith('\n')
    ? `\n${ins.text}`
    : ins.text;
  const edit = new vscode.WorkspaceEdit();
  edit.insert(uri, at, text);
  await vscode.workspace.applyEdit(edit);
}

// ─── « choose what it publishes » ────────────────────────────────────────────

type TaskPick = vscode.QuickPickItem & { id: string };

export async function pickOutputsFor(uri?: vscode.Uri): Promise<void> {
  const doc = await activeOrOpen(uri);
  if (!doc) { return; }
  const text = doc.getText();
  const wf = parseRichWorkflow(text);
  if (wf.tasks.length === 0) {
    void vscode.window.showInformationMessage('Nika: no tasks to publish yet — add a task first.');
    return;
  }
  const lines = text.split('\n');
  const block = findOutputsBlock(lines);
  const published = new Set(block ? parseOutputs(lines, block).published : []);
  const picked = await vscode.window.showQuickPick<TaskPick>(
    wf.tasks.map((t) => ({
      label: `${VERB_GLYPH[t.verb] ?? ''} ${t.id}`.trim(),
      description: `outputs.${t.id} = \${{ tasks.${t.id}.output }}`,
      picked: published.has(t.id),
      id: t.id,
    })),
    {
      canPickMany: true,
      placeHolder: 'what this workflow returns — callers (CLI · MCP · compose) read exactly these',
    },
  );
  if (!picked) { return; }
  const next = outputsRewrite(text, picked.map((p) => p.id));
  if (next === undefined) {
    void vscode.window.showWarningMessage('Nika: this outputs: block is flow-style — edit it in place (refusing a blind rewrite).');
    return;
  }
  if (next === text) { return; }
  await applyFullRewrite(doc, next);
}

// ─── « declare an input » · « make it callable » ─────────────────────────────

const VAR_TYPES: readonly VarType[] = ['string', 'number', 'integer', 'boolean', 'array', 'object'];

export async function declareInputFor(uri?: vscode.Uri): Promise<void> {
  const doc = await activeOrOpen(uri);
  if (!doc) { return; }
  const text = doc.getText();
  const lines = text.split('\n');
  const block = findVarsBlock(lines);
  const taken = new Set(block ? parseVarEntries(lines, block).map((e) => e.name) : []);

  const name = await vscode.window.showInputBox({
    prompt: 'input name — reachable as ${{ vars.<name> }}',
    placeHolder: 'topic',
    validateInput: (v) => {
      if (!/^[a-z][a-z0-9_]*$/i.test(v)) { return 'snake_case identifier'; }
      if (taken.has(v)) { return `\`${v}\` is already declared`; }
      return undefined;
    },
  });
  if (!name) { return; }

  type TypePick = vscode.QuickPickItem & { type?: VarType };
  const typePick = await vscode.window.showQuickPick<TypePick>(
    [
      ...VAR_TYPES.map((t) => ({
        label: `$(symbol-type-parameter) ${t}`,
        description: 'typed — validated at launch, part of the callable schema',
        type: t as VarType,
      })),
      {
        label: '$(dash) untyped',
        description: 'just a default value — simplest for a workflow you run yourself',
      },
    ],
    { placeHolder: `vars.${name} — typed inputs make the workflow a callable unit (MCP · UI)` },
  );
  if (!typePick) { return; }

  const def = await vscode.window.showInputBox({
    prompt: typePick.type
      ? `default for \`${name}\` — LEAVE EMPTY to make it required (the caller must pass it)`
      : `value for \`${name}\` — the untyped form IS its default`,
    placeHolder: typePick.type === 'string' || typePick.type === undefined ? '"Rust async 2026"' : '',
  });
  if (def === undefined) { return; } // esc — empty string is a real answer

  const next = declareInput(text, {
    name,
    type: typePick.type,
    def: def.trim().length > 0 ? def.trim() : (typePick.type ? undefined : '""'),
    required: typePick.type !== undefined && def.trim().length === 0,
  });
  if (next === undefined) {
    void vscode.window.showWarningMessage('Nika: could not declare here (flow-style vars: or no envelope to anchor).');
    return;
  }
  await applyFullRewrite(doc, next);
}

export async function promoteVarsFor(uri?: vscode.Uri): Promise<void> {
  const doc = await activeOrOpen(uri);
  if (!doc) { return; }
  const text = doc.getText();
  const lines = text.split('\n');
  const block = findVarsBlock(lines);
  const untyped = block
    ? parseVarEntries(lines, block).filter((e) => !e.typed && e.inline !== undefined)
    : [];
  if (untyped.length === 0) {
    void vscode.window.showInformationMessage('Nika: every input is already typed — the contract is callable.');
    return;
  }
  type VarPick = vscode.QuickPickItem & { name: string };
  const picked = await vscode.window.showQuickPick<VarPick>(
    untyped.map((e) => ({
      label: `$(symbol-variable) ${e.name}`,
      description: `default stays ${e.inline}`,
      picked: true,
      name: e.name,
    })),
    {
      canPickMany: true,
      placeHolder: 'promote to the typed form — type: inferred from each default, value preserved',
    },
  );
  if (!picked || picked.length === 0) { return; }
  let next = text;
  for (const p of picked) {
    next = promoteVar(next, p.name) ?? next;
  }
  if (next === text) { return; }
  await applyFullRewrite(doc, next);
}
