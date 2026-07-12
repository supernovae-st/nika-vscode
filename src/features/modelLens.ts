// modelLens.ts — the model line becomes a DOOR: a code lens above every
// `model:` (envelope and per-task) offering the catalog picker (grouped
// local-first per the presentation-order doctrine). The choice a
// stranger makes most — which brain — stops being a string you have to
// already know.

import * as vscode from 'vscode';
import { MODEL_DOOR } from '../core/lensVocab';
import { insertDefaultModel } from '../core/modelEdit';
import type { NikaService } from '../nikaService';

function isNikaDoc(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'nika' || /\.nika\.ya?ml$/.test(doc.fileName);
}

/** `model: openai/gpt-5.2` (any indent · optional quotes/comment). */
const MODEL_LINE = /^(\s*)model:\s*["']?([A-Za-z0-9_./:-]*)["']?\s*(#.*)?$/;

/** The presentation-order doctrine (operator lock 2026-06-12): local &
 * open-weight lead, then Mistral (EU · open-weight), then the rest —
 * cloud incumbents never the first suggestion. */
const PROVIDER_ORDER = [
  'ollama', 'lmstudio', 'llamacpp', 'localai', 'vllm',
  'mistral', 'groq', 'deepseek', 'openrouter', 'huggingface', 'nvidia',
  'anthropic', 'openai', 'google', 'xai',
];

function providerRank(p: string): number {
  const i = PROVIDER_ORDER.indexOf(p);
  return i === -1 ? PROVIDER_ORDER.length : i;
}

export class ModelLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!isNikaDoc(document)) { return []; }
    if (!vscode.workspace.getConfiguration('nika').get<boolean>('codeLens.enabled', true)) {
      return [];
    }
    const lenses: vscode.CodeLens[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (!MODEL_LINE.test(line.text)) { continue; }
      lenses.push(new vscode.CodeLens(line.range, {
        command: 'nika.pickModel',
        title: MODEL_DOOR,
        tooltip: 'Pick a model from the embedded catalog (local-first) — writes this line',
        arguments: [document.uri, i],
      }));
    }
    return lenses;
  }
}

/** The catalog quick pick (provider-grouped · local-first) — the ONE
 * model chooser every door shares. Returns the `<provider>/<name>` ref. */
export async function showCatalogPicker(service: NikaService): Promise<string | undefined> {
  const models = service.catalogModels;
  if (!models || Object.keys(models).length === 0) {
    void vscode.window.showInformationMessage(
      'nika: the model catalog is not loaded yet — is the binary wired? (nika doctor)',
    );
    return undefined;
  }
  const items: vscode.QuickPickItem[] = [];
  const providers = Object.keys(models).sort(
    (a, b) => providerRank(a) - providerRank(b) || a.localeCompare(b),
  );
  for (const provider of providers) {
    items.push({ label: provider, kind: vscode.QuickPickItemKind.Separator });
    for (const m of models[provider]) {
      items.push({ label: `${provider}/${m.model}`, detail: m.desc || undefined });
    }
  }
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'model: <provider>/<name> — local-first · the catalog is embedded, keys are per-provider',
    matchOnDetail: true,
  });
  return picked?.label;
}

/** The lens path: pick, then surgically rewrite THAT `model:` line. */
export async function pickModelForLine(
  service: NikaService,
  uri: vscode.Uri,
  lineNo: number,
): Promise<void> {
  const ref = await showCatalogPicker(service);
  if (!ref) { return; }

  const doc = await vscode.workspace.openTextDocument(uri);
  const line = doc.lineAt(Math.min(lineNo, doc.lineCount - 1));
  const m = MODEL_LINE.exec(line.text);
  if (!m) { return; } // the line moved under us — refuse a blind write
  const indent = m[1] ?? '';
  const comment = m[3] ? `   ${m[3]}` : '';
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, line.range, `${indent}model: ${ref}${comment}`);
  await vscode.workspace.applyEdit(edit);
}

/** The status-row path (no model anywhere): pick, then insert the
 * envelope default at the spec's canonical slot. */
export async function chooseDefaultModelFor(
  service: NikaService,
  uri?: vscode.Uri,
): Promise<void> {
  const doc = uri
    ? await vscode.workspace.openTextDocument(uri)
    : vscode.window.activeTextEditor?.document;
  if (!doc || !isNikaDoc(doc)) {
    void vscode.window.showInformationMessage('Nika: open a .nika.yaml file first.');
    return;
  }
  const ref = await showCatalogPicker(service);
  if (!ref) { return; }
  const next = insertDefaultModel(doc.getText(), ref);
  if (next === undefined) { return; } // a model: appeared under us — the lens path owns it now
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), next);
  await vscode.workspace.applyEdit(edit);
}
