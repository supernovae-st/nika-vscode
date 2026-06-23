// virtualDocs.ts — read-only editor surfaces projected FROM the binary.
//
// `nika-doc:` documents render the engine's embedded knowledge (spec ·
// canon · JSON schema · examples · explain · check report) without the
// extension shipping a single duplicated byte of it. The binary is the
// vocabulary SSOT — these tabs are projections.

import * as vscode from 'vscode';
import type { NikaService } from '../nikaService';

export const SCHEME = 'nika-doc';

export class NikaDocProvider implements vscode.TextDocumentContentProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  constructor(private readonly service: NikaService) {
    // Re-render open report tabs whenever a fresh check lands for their
    // workflow — without this, a report tab is a snapshot frozen forever.
    service.onDidUpdateDocument((uriString) => {
      this.emitter.fire(docUri('report', uriString));
    });
    service.onDidChange(() => {
      // Binary swap invalidates every projected surface.
      for (const kind of ['spec', 'canon', 'schema'] as const) {
        this.emitter.fire(docUri(kind));
      }
    });
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const [kind, ...rest] = uri.path.replace(/^\//, '').split('/');
    const arg = decodeURIComponent(rest.join('/'));

    switch (kind) {
      case 'spec':
        return (await this.service.specText(false)) ?? this.missing('spec');
      case 'canon':
        return (await this.service.specText(true)) ?? this.missing('spec --canon');
      case 'schema':
        return (await this.service.schemaText()) ?? this.missing('schema');
      case 'example':
        return (await this.service.exampleShow(arg)) ?? this.missing(`examples show ${arg}`);
      case 'explain':
        return (await this.service.explain(arg)) ?? this.missing(`explain ${arg}`);
      case 'report': {
        try {
          const target = vscode.Uri.parse(arg);
          const doc = await vscode.workspace.openTextDocument(target);
          const outcome = await this.service.checkDocument(doc);
          if (!outcome) { return this.missing('check'); }
          return outcome.report
            ? JSON.stringify(outcome.report, null, 2)
            : outcome.raw;
        } catch (err) {
          return `check failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
      default:
        return `unknown nika-doc surface: ${kind}`;
    }
  }

  private missing(cmd: string): string {
    return [
      `The engine surface \`nika ${cmd}\` is not available from the resolved binary.`,
      '',
      `binary  : ${this.service.binaryPath ?? '(none)'}`,
      `version : ${this.service.caps.version || '(unknown)'}`,
      '',
      'Install or update the engine — the embedded spec/schema/examples ship',
      'inside the binary itself (self-contained · zero network).',
    ].join('\n');
  }
}

export function docUri(kind: 'spec' | 'canon' | 'schema', name?: string): vscode.Uri;
export function docUri(kind: 'example' | 'explain' | 'report', name: string): vscode.Uri;
export function docUri(kind: string, name?: string): vscode.Uri {
  const tail = name !== undefined ? `/${encodeURIComponent(name)}` : '';
  return vscode.Uri.parse(`${SCHEME}:/${kind}${tail}`);
}

export async function openNikaDoc(
  kind: 'spec' | 'canon' | 'schema' | 'example' | 'explain' | 'report',
  name?: string,
  language?: string,
): Promise<void> {
  const uri = name !== undefined
    ? docUri(kind as 'example', name)
    : docUri(kind as 'spec');
  const doc = await vscode.workspace.openTextDocument(uri);
  if (language) {
    await vscode.languages.setTextDocumentLanguage(doc, language);
  }
  await vscode.window.showTextDocument(doc, { preview: true });
}
