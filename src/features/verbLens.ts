// verbLens.ts — the verb line becomes a door: one lens above every bare
// `<verb>:` key. infer/exec/agent offer the spec's oracle-proven
// starters (verbStarters.generated — SSOT nika-spec, projected); invoke
// opens the richer register: starters + every builtin THIS binary's
// catalog carries, args skeleton derived from the tool's own schema.
// Picking REPLACES the verb block — one WorkspaceEdit, one undo.

import * as vscode from 'vscode';
import { verbDoorTitle } from '../core/lensVocab';
import { invokeBodyFor, findVerbLines, verbBlockEdit } from '../core/verbBlocks';
import { NIKA_VERB_STARTERS, type NikaVerb } from '../core/verbStarters.generated';
import { VERB_ITEMS } from '../core/verbPalette';
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
    for (const v of findVerbLines(document.getText().split('\n'))) {
      lenses.push(new vscode.CodeLens(new vscode.Range(v.line, 0, v.line, 0), {
        command: 'nika.pickVerbBody',
        title: verbDoorTitle(v.verb, VERB_GLYPH[v.verb] ?? ''),
        tooltip: v.verb === 'invoke'
          ? 'Choose the tool — proven starters + every builtin in this binary (replaces this invoke: block)'
          : `Insert a proven ${v.verb}: starter — the spec's canonical shapes (replaces this block)`,
        arguments: [document.uri, v.line, v.verb],
      }));
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
