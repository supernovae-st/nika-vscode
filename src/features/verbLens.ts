// verbLens.ts — the verb line becomes a door: one lens above every bare
// `<verb>:` key. infer/exec/agent offer the spec's oracle-proven
// starters (verbStarters.generated — SSOT nika-spec, projected); invoke
// opens the richer register: starters + every builtin THIS binary's
// catalog carries, args skeleton derived from the tool's own schema.
// Picking REPLACES the verb block — one WorkspaceEdit, one undo.

import * as vscode from 'vscode';
import { findAgentTools, ownedRef, toolsRewrite } from '../core/agentToolsEdit';
import { AGENT_TOOLS_DOOR, TYPE_OUTPUT_DOOR, verbDoorTitle } from '../core/lensVocab';
import { verbHasSchema, verbTakesSchema } from '../core/schemaEdit';
import { invokeBodyFor, findVerbLines, verbBlockEdit } from '../core/verbBlocks';
import { NIKA_VERB_STARTERS, type NikaVerb } from '../core/verbStarters.generated';
import { FALLBACK_TOOL_BLURBS, VERB_ITEMS } from '../core/verbPalette';
import type { NikaService } from '../nikaService';

function isNikaDoc(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'nika' || /\.nika\.ya?ml$/.test(doc.fileName);
}

const VERB_GLYPH: Record<string, string> = Object.fromEntries(
  VERB_ITEMS.map((v) => [v.verb, v.glyph]),
);

export class VerbLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!isNikaDoc(document)) { return []; }
    if (!vscode.workspace.getConfiguration('nika').get<boolean>('codeLens.enabled', true)) {
      return [];
    }
    const lenses: vscode.CodeLens[] = [];
    const lines = document.getText().split('\n');
    for (const v of findVerbLines(lines)) {
      lenses.push(new vscode.CodeLens(new vscode.Range(v.line, 0, v.line, 0), {
        command: 'nika.pickVerbBody',
        title: verbDoorTitle(v.verb, VERB_GLYPH[v.verb] ?? ''),
        tooltip: v.verb === 'invoke'
          ? 'Choose the tool — proven starters + every builtin in this binary (replaces this invoke: block)'
          : `Insert a proven ${v.verb}: starter — the spec's canonical shapes (replaces this block)`,
        arguments: [document.uri, v.line, v.verb],
      }));
      // The typed-unit door — only where the schema is missing (an
      // untyped infer is legitimate; a second schema never is).
      if (verbTakesSchema(v.verb) && !verbHasSchema(lines, v.line, v.indent)) {
        lenses.push(new vscode.CodeLens(new vscode.Range(v.line, 0, v.line, 0), {
          command: 'nika.typeOutput',
          title: TYPE_OUTPUT_DOOR,
          tooltip: v.verb === 'agent'
            ? 'schema: the FINAL message MUST match — appends a proven shape to this agent: block'
            : 'schema: the response MUST match — typed extraction, no prose parsing (appends to this block)',
          arguments: [document.uri, v.line, v.verb],
        }));
      }
      // The register door — on the agent's tools: line itself (the
      // starter always writes one; a tools-less agent is legitimate
      // pure reasoning, so its absence never grows a lens).
      if (v.verb === 'agent') {
        const tools = findAgentTools(lines, v.line, v.indent);
        if (tools) {
          lenses.push(new vscode.CodeLens(new vscode.Range(tools.line, 0, tools.line, 0), {
            command: 'nika.chooseAgentTools',
            title: AGENT_TOOLS_DOOR,
            tooltip: 'Re-pick the default-deny register from the catalog — MCP refs, globs and unknown names survive verbatim; an empty list is least privilege, not an error',
            arguments: [document.uri, v.line, v.indent],
          }));
        }
      }
    }
    return lenses;
  }
}

type BodyPick = vscode.QuickPickItem & { body?: string };

/** The picker: spec starters (every verb) + the binary's builtins
 * (invoke only · category-grouped), then the surgical block swap. */
export async function pickVerbBodyForLine(
  service: NikaService,
  uri: vscode.Uri,
  lineNo: number,
  verb: NikaVerb,
): Promise<void> {
  const glyph = VERB_GLYPH[verb] ?? '';
  const rows: BodyPick[] = [];

  const starters = NIKA_VERB_STARTERS[verb] ?? [];
  if (verb === 'invoke' && starters.length > 0) {
    rows.push({ label: 'starters', kind: vscode.QuickPickItemKind.Separator });
  }
  for (const s of starters) {
    rows.push({ label: `${glyph} ${s.label}`, description: s.hint, body: s.body });
  }

  if (verb === 'invoke') {
    const cats = service.toolCats;
    if (cats) {
      const sorted = Object.entries(cats)
        .map(([bare, m]) => ({ bare, ...m }))
        .sort((a, b) => (a.cat < b.cat ? -1 : a.cat > b.cat ? 1 : a.bare < b.bare ? -1 : 1));
      let lastCat: string | undefined;
      for (const r of sorted) {
        if (r.cat !== lastCat) {
          rows.push({ label: `${r.cat} · builtins`, kind: vscode.QuickPickItemKind.Separator });
          lastCat = r.cat;
        }
        rows.push({
          label: `◆ nika:${r.bare}`,
          description: r.desc ?? '',
          body: invokeBodyFor(`nika:${r.bare}`, r.args ?? []),
        });
      }
    }
  }

  if (rows.every((r) => r.body === undefined)) {
    void vscode.window.showInformationMessage(
      'nika: no starters available for this verb — is the binary wired? (nika doctor)',
    );
    return;
  }

  const picked = await vscode.window.showQuickPick(rows, {
    placeHolder: `${verb}: — pick a body · replaces the current block (one undo)`,
    matchOnDescription: true,
  });
  if (picked?.body === undefined) { return; }

  const doc = await vscode.workspace.openTextDocument(uri);
  const edit = verbBlockEdit(doc.getText(), lineNo, verb, picked.body);
  if (!edit) { return; } // the line moved under us — refuse a blind write
  const we = new vscode.WorkspaceEdit();
  we.replace(uri, new vscode.Range(edit.startLine, 0, edit.endLine, 0), edit.newText);
  await vscode.workspace.applyEdit(we);
}

// ─── « choose its tools » — the agent's default-deny register ────────────────

type ToolPick = vscode.QuickPickItem & { bare: string };

/** Multi-pick over the binary's catalog, pre-checked from the block.
 * Author sentences (MCP · globs · strangers) never enter the picker —
 * they survive the rewrite verbatim; their diagnostics belong to the
 * engine. An empty pick writes `tools: []` (least privilege). */
export async function chooseAgentToolsFor(
  service: NikaService,
  uri: vscode.Uri,
  agentLine: number,
  agentIndent: number,
): Promise<void> {
  const cats = service.toolCats;
  const doc = await vscode.workspace.openTextDocument(uri);
  const text = doc.getText();
  const lines = text.split('\n');
  const at = findAgentTools(lines, agentLine, agentIndent);
  if (!at) { return; } // the block moved under us — refuse a blind write

  const catalog = cats
    ? Object.entries(cats).map(([bare, m]) => ({ bare, cat: m.cat, desc: m.desc }))
    : Object.entries(FALLBACK_TOOL_BLURBS).map(([bare, desc]) => ({ bare, cat: 'builtins', desc }));
  const bares = new Set(catalog.map((c) => c.bare));
  const current = new Set(
    at.refs.filter((r) => ownedRef(r, bares)).map((r) => r.slice('nika:'.length)),
  );
  const kept = at.refs.filter((r) => !ownedRef(r, bares));

  const rows: ToolPick[] = [];
  let lastCat: string | undefined;
  for (const c of [...catalog].sort((a, b) => (a.cat < b.cat ? -1 : a.cat > b.cat ? 1 : a.bare < b.bare ? -1 : 1))) {
    if (c.cat !== lastCat) {
      rows.push({ label: c.cat, kind: vscode.QuickPickItemKind.Separator, bare: '' });
      lastCat = c.cat;
    }
    rows.push({
      label: `◆ nika:${c.bare}`,
      description: c.desc ?? '',
      picked: current.has(c.bare),
      bare: c.bare,
    });
  }
  const picked = await vscode.window.showQuickPick(rows, {
    canPickMany: true,
    placeHolder: kept.length > 0
      ? `the default-deny register — ${kept.join(' · ')} survive as written (the engine judges strangers)`
      : 'the default-deny register — grant the least set this mission needs; empty is a valid answer',
    matchOnDescription: true,
  });
  if (!picked) { return; }

  const next = toolsRewrite(text, agentLine, agentIndent, picked.map((p) => p.bare), bares);
  if (next === undefined || next === text) { return; }
  const we = new vscode.WorkspaceEdit();
  we.replace(uri, new vscode.Range(0, 0, doc.lineCount, 0), next);
  await vscode.workspace.applyEdit(we);
}
