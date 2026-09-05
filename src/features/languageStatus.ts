// languageStatus.ts — the native language-status flyout ({} icon) for Nika.
//
// Three honest items scoped to the nika selector, rust-analyzer-style:
//   engine  · binary version + capability rung (warning when missing)
//   check   · the ACTIVE file's verdict — busy while a pass runs, severity
//             mirrors the worst finding, click opens the report
//   server  · LSP lifecycle (running · client-side · failed)
//
// The status BAR item stays (global, capability ladder); these are the
// per-language, per-file precision layer the editor surfaces natively.

import * as vscode from 'vscode';
import type { DiagnosticsController } from './diagnostics';
import { NIKA_DIAG_SOURCE } from './diagnostics';
import { checkLaneTruth } from '../core/statusTruth';
import type { NikaService } from '../nikaService';

const SELECTOR: vscode.DocumentSelector = [
  { language: 'nika' },
  { pattern: '**/*.nika.yaml' },
];

const NIKA_FILE_RE = /\.nika\.ya?ml$/;

function activeNikaUri(): vscode.Uri | undefined {
  const doc = vscode.window.activeTextEditor?.document;
  return doc && (doc.languageId === 'nika' || NIKA_FILE_RE.test(doc.fileName)) ? doc.uri : undefined;
}

export class NikaLanguageStatus implements vscode.Disposable {
  private readonly engineItem: vscode.LanguageStatusItem;
  private readonly checkItem: vscode.LanguageStatusItem;
  private readonly serverItem: vscode.LanguageStatusItem;
  /** Lazily created on the first grade seen — pre-0.107 binaries carry
   * no risk_grade and the chip simply never exists (the spec's
   * undefined-safe law). */
  private riskItem: vscode.LanguageStatusItem | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  /** Uris with a lint pass in flight (busy spinner on the check item). */
  private readonly running = new Set<string>();
  private lspState: 'off' | 'starting' | 'running' | 'failed' = 'off';

  constructor(
    private readonly service: NikaService,
    controller: DiagnosticsController,
  ) {
    this.engineItem = vscode.languages.createLanguageStatusItem('nika.status.engine', SELECTOR);
    this.engineItem.name = 'Nika engine';
    this.engineItem.command = { command: 'nika.showMenu', title: 'Menu' };

    this.checkItem = vscode.languages.createLanguageStatusItem('nika.status.check', SELECTOR);
    this.checkItem.name = 'Nika check';
    this.checkItem.command = { command: 'nika.showReport', title: 'Report' };

    this.serverItem = vscode.languages.createLanguageStatusItem('nika.status.server', SELECTOR);
    this.serverItem.name = 'Nika language server';
    this.serverItem.command = { command: 'nika.restartServer', title: 'Restart' };

    this.disposables.push(
      this.engineItem,
      this.checkItem,
      this.serverItem,
      service.onDidChangeEngine(() => this.renderAll()),
      vscode.window.onDidChangeActiveTextEditor(() => this.renderCheck()),
      vscode.languages.onDidChangeDiagnostics((e) => {
        const active = activeNikaUri();
        if (active && e.uris.some((u) => u.toString() === active.toString())) {
          this.renderCheck();
        }
      }),
      controller.onDidRunState(({ uri, running }) => {
        if (running) { this.running.add(uri); } else { this.running.delete(uri); }
        this.renderCheck();
        if (!running) { void this.renderRisk(); }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => { void this.renderRisk(); }),
    );
    this.renderAll();
  }

  setLspState(state: 'off' | 'starting' | 'running' | 'failed'): void {
    this.lspState = state;
    this.renderServer();
  }

  private renderAll(): void {
    this.renderEngine();
    this.renderCheck();
    this.renderServer();
    void this.renderRisk();
  }

  /** The readiness grade chip (0.107 · risk_grade rides EVERY check
   * payload): reads the version-cached outcome — a cache hit after the
   * lint pass, never an extra spawn on the hot path. */
  private async renderRisk(): Promise<void> {
    const uri = activeNikaUri();
    if (!uri || !this.service.caps.check) { this.riskItem?.dispose(); this.riskItem = undefined; return; }
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (!doc) { this.riskItem?.dispose(); this.riskItem = undefined; return; }
    const outcome = await this.service.checkDocument(doc);
    const grade = outcome?.report?.risk_grade;
    if (!grade) { this.riskItem?.dispose(); this.riskItem = undefined; return; }
    if (!this.riskItem) {
      this.riskItem = vscode.languages.createLanguageStatusItem('nika.status.risk', SELECTOR);
      this.riskItem.name = 'Nika risk';
      this.riskItem.command = { command: 'nika.showReport', title: 'Report' };
      this.disposables.push(this.riskItem);
    }
    this.riskItem.text = `$(shield) risk ${grade}`;
    this.riskItem.detail = grade === 'low'
      ? 'bounded spend · literal grants'
      : grade === 'supervised'
        ? 'a human gate rides the run'
        : grade === 'high'
          ? 'glob or wildcard grants · review the boundary'
          : 'uncapped spend — declare max_tokens / --max-cost-usd';
    this.riskItem.severity = grade === 'high' || grade === 'unbounded'
      ? vscode.LanguageStatusSeverity.Warning
      : vscode.LanguageStatusSeverity.Information;
  }

  private renderEngine(): void {
    if (!this.service.available) {
      this.engineItem.text = '$(zap) nika: no binary';
      this.engineItem.detail = 'install the engine or let the extension download it';
      this.engineItem.severity = vscode.LanguageStatusSeverity.Warning;
      return;
    }
    const caps = this.service.caps;
    const version = caps.version.match(/(\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?)/)?.[1] ?? caps.version;
    this.engineItem.text = `$(zap) nika ${version}`;
    this.engineItem.detail = this.service.binaryPath ?? undefined;
    this.engineItem.severity = vscode.LanguageStatusSeverity.Information;
  }

  private renderCheck(): void {
    const uri = activeNikaUri();
    this.checkItem.busy = uri !== undefined && this.running.has(uri.toString());

    // Count OUR findings on the active file — the client collection AND
    // the LSP-published ones both ride languages.getDiagnostics. The
    // server publishes source "nika" too (nika-lsp diagnostics.rs SOURCE
    // const — 'nika-lsp' is only the CLIENT's collection label, never a
    // wire value), so one source check + the code prefix covers all.
    const diags = uri === undefined ? [] : vscode.languages.getDiagnostics(uri).filter((d) => {
      const code = typeof d.code === 'object' ? String(d.code.value) : String(d.code ?? '');
      return d.source === NIKA_DIAG_SOURCE || code.startsWith('NIKA-');
    });
    // The pure lane truth (statusTruth.ts) — the trust illusion dies
    // here: zero squiggles WITHOUT an oracle never reads « clean ».
    const truth = checkLaneTruth({
      hasActiveDoc: uri !== undefined,
      available: this.service.available,
      checkCapable: this.service.caps.check,
      runOn: vscode.workspace.getConfiguration('nika').get<string>('diagnostics.runOn', 'type'),
      findings: diags.length,
      errors: diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).length,
    });
    this.checkItem.text = truth.text;
    this.checkItem.detail = truth.detail;
    this.checkItem.severity = truth.severity === 'error'
      ? vscode.LanguageStatusSeverity.Error
      : truth.severity === 'warn'
        ? vscode.LanguageStatusSeverity.Warning
        : vscode.LanguageStatusSeverity.Information;
    this.checkItem.command = truth.command === 'setup'
      ? { command: 'nika.finishSetup', title: 'Install' }
      : truth.command === 'settings'
        ? { command: 'workbench.action.openSettings', title: 'Settings', arguments: ['nika.diagnostics.runOn'] }
        : { command: 'nika.showReport', title: 'Report' };
  }

  private renderServer(): void {
    const caps = this.service.caps;
    if (!caps.lsp) {
      this.serverItem.text = '$(circuit-board) client-side intel';
      this.serverItem.detail = 'this binary predates `nika lsp` — expression intelligence stays on';
      this.serverItem.severity = vscode.LanguageStatusSeverity.Information;
      return;
    }
    switch (this.lspState) {
      case 'running':
        this.serverItem.text = '$(check) nika lsp';
        this.serverItem.detail = 'language server running (stdio)';
        this.serverItem.severity = vscode.LanguageStatusSeverity.Information;
        break;
      case 'starting':
        this.serverItem.text = '$(sync~spin) nika lsp starting';
        this.serverItem.detail = undefined;
        this.serverItem.severity = vscode.LanguageStatusSeverity.Information;
        break;
      case 'failed':
        this.serverItem.text = '$(error) nika lsp failed';
        this.serverItem.detail = 'client-side intelligence still active — see output';
        this.serverItem.severity = vscode.LanguageStatusSeverity.Error;
        break;
      default:
        this.serverItem.text = '$(circle-outline) nika lsp off';
        this.serverItem.detail = undefined;
        this.serverItem.severity = vscode.LanguageStatusSeverity.Information;
    }
  }

  dispose(): void {
    for (const d of this.disposables) { d.dispose(); }
  }
}
