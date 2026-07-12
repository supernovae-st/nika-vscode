// modelLens.ts — the model line becomes a DOOR: a code lens above every
// `model:` (envelope and per-task) offering the catalog picker (grouped
// local-first per the presentation-order doctrine). The choice a
// stranger makes most — which brain — stops being a string you have to
// already know.

import * as vscode from 'vscode';
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
        title: '$(arrow-swap) model',
        tooltip: 'Pick a model from the embedded catalog (local-first) — writes this line',
        arguments: [document.uri, i],
      }));
    }
    return lenses;
  }
}

/** The picker: catalog-fed quick pick (provider-grouped · local-first),
 * then a surgical edit of exactly the `model:` value on that line. */
export async function pickModelForLine(
  service: NikaService,
  uri: vscode.Uri,
  lineNo: number,
): Promise<void> {
  const models = service.catalogModels;
  if (!models || Object.keys(models).length === 0) {
    void vscode.window.showInformationMessage(
      'nika: the model catalog is not loaded yet — is the binary wired? (nika doctor)',
    );
    return;
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
  if (!picked) { return; }

  const doc = await vscode.workspace.openTextDocument(uri);
  const line = doc.lineAt(Math.min(lineNo, doc.lineCount - 1));
  const m = MODEL_LINE.exec(line.text);
  if (!m) { return; } // the line moved under us — refuse a blind write
  const indent = m[1] ?? '';
  const comment = m[3] ? `   ${m[3]}` : '';
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, line.range, `${indent}model: ${picked.label}${comment}`);
  await vscode.workspace.applyEdit(edit);
}
