import * as path from 'path';
import * as vscode from 'vscode';
import type { CliResult, NikaService } from '../nikaService';
import { traceVerificationDocument } from '../core/traceVerification';

/** Explicit, bounded proof request. Background scans never start verifiers. */
export function registerTraceVerification(context: vscode.ExtensionContext, service: NikaService): void {
  context.subscriptions.push(vscode.commands.registerCommand('nika.verifyTrace', async (arg?: { trace?: { uri: vscode.Uri } }) => {
    const trace = arg?.trace?.uri;
    if (!trace || trace.scheme !== 'file' || !path.isAbsolute(trace.fsPath)) {
      void vscode.window.showInformationMessage('Nika: pick a local run in the Runs view to verify.');
      return;
    }
    let result: CliResult | undefined;
    try {
      result = await service.runCli(['trace', 'verify', trace.fsPath, '--json'], 15000);
    } catch {
      // Transport failure is absence of a verdict, never a fallback parser.
    }
    const content = result && traceVerificationDocument(result, trace.fsPath);
    if (content === undefined) {
      void vscode.window.showWarningMessage('Nika: no complete, supported engine verification result was received. No integrity verdict is claimed.');
      return;
    }
    // Show ALL legs, gaps and refusal lines as data, not the old first-line
    // toast. Do not cache this observation as proof of a future file read.
    const doc = await vscode.workspace.openTextDocument({ language: 'json', content });
    await vscode.window.showTextDocument(doc, { preview: true });
  }));
}
