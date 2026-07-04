// workspaceLint.ts — Problems-panel coverage for CLOSED workflows.
//
// The DiagnosticsController lints open documents; this sweeps the REST of
// the workspace through `nika check --json`, so a broken workflow surfaces
// in the Problems panel (and stays honest across refactors) before anyone
// opens it. Ownership handshake: opening a file clears its entry here (the
// controller takes over), closing it re-queues a sweep pass for it.

import * as vscode from 'vscode';
import {
  byteOffsetToPosition,
  collectFindings,
  parseCheckReport,
} from '../core/cliContract';
import { applySeverityRemap, NIKA_DIAG_SOURCE } from './diagnostics';
import type { NikaService } from '../nikaService';

/** Hard cap per sweep — logged when hit, never silently truncated. */
const MAX_FILES = 300;
/** Parallel `nika check` spawns during a sweep. */
const CONCURRENCY = 2;

const NIKA_FILE_RE = /\.nika\.ya?ml$/;

function isOpen(uri: vscode.Uri): boolean {
  const key = uri.toString();
  return vscode.workspace.textDocuments.some((d) => d.uri.toString() === key);
}

export class WorkspaceLint implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('nika-workspace');
  private readonly disposables: vscode.Disposable[] = [];
  private sweepTimer: ReturnType<typeof setTimeout> | undefined;
  private sweeping = false;
  private sweepAgain = false;
  private disposed = false;

  constructor(
    private readonly service: NikaService,
    private readonly log: (level: string, msg: string) => void,
  ) {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.nika.yaml');
    this.disposables.push(
      this.collection,
      watcher,
      watcher.onDidCreate((uri) => { void this.lintOne(uri); }),
      watcher.onDidChange((uri) => { void this.lintOne(uri); }),
      watcher.onDidDelete((uri) => this.collection.delete(uri)),
      // Ownership handshake with the open-document controller.
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (NIKA_FILE_RE.test(doc.fileName)) { this.collection.delete(doc.uri); }
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        if (NIKA_FILE_RE.test(doc.fileName)) { void this.lintOne(doc.uri); }
      }),
      // Binary appeared / capabilities changed → the whole workspace view
      // may change. Config flips re-sweep or clear.
      this.service.onDidChange(() => this.scheduleSweep(800)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('nika.diagnostics')) { this.scheduleSweep(200); }
      }),
    );
    this.scheduleSweep(1500);
  }

  private enabled(): boolean {
    const cfg = vscode.workspace.getConfiguration('nika');
    return cfg.get<boolean>('diagnostics.workspace', true)
      && cfg.get<string>('diagnostics.runOn', 'type') !== 'off'
      && this.service.caps.check;
  }

  private scheduleSweep(delayMs: number): void {
    if (this.sweepTimer) { clearTimeout(this.sweepTimer); }
    this.sweepTimer = setTimeout(() => {
      this.sweepTimer = undefined;
      void this.sweep();
    }, delayMs);
  }

  private async sweep(): Promise<void> {
    if (this.disposed) { return; }
    if (!this.enabled()) {
      this.collection.clear();
      return;
    }
    if (this.sweeping) {
      // Coalesce: one follow-up sweep after the current pass finishes.
      this.sweepAgain = true;
      return;
    }
    this.sweeping = true;
    try {
      const files = await vscode.workspace.findFiles('**/*.nika.yaml', '**/node_modules/**', MAX_FILES + 1);
      if (files.length > MAX_FILES) {
        this.log('WARN', `workspace lint: ${files.length} workflows found — linting the first ${MAX_FILES} (cap)`);
        files.length = MAX_FILES;
      }
      const closed = files.filter((f) => !isOpen(f));
      // Small rolling pool — never a spawn storm.
      let next = 0;
      const worker = async (): Promise<void> => {
        while (next < closed.length && !this.disposed && this.enabled()) {
          const uri = closed[next];
          next += 1;
          await this.lintOne(uri);
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    } finally {
      this.sweeping = false;
      if (this.sweepAgain) {
        this.sweepAgain = false;
        this.scheduleSweep(300);
      }
    }
  }

  /** Lint one CLOSED workflow file; open files belong to the controller. */
  private async lintOne(uri: vscode.Uri): Promise<void> {
    if (this.disposed || !this.enabled()) { return; }
    if (uri.scheme !== 'file' || isOpen(uri)) { return; }

    const res = await this.service.runCli(['check', uri.fsPath, '--json']);
    if (this.disposed || isOpen(uri)) { return; } // opened mid-flight — controller owns it now

    let text: string;
    try {
      text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
    } catch {
      this.collection.delete(uri);
      return;
    }
    const lineOf = (offset: number): vscode.Range => {
      const pos = byteOffsetToPosition(text, offset);
      return new vscode.Range(pos.line, pos.character, pos.line, pos.character + 1);
    };

    const diagnostics: vscode.Diagnostic[] = [];
    const report = parseCheckReport(res.stdout);
    if (!report && res.code !== 0) {
      const firstLine = `${res.stdout}\n${res.stderr}`.split('\n').find((l) => l.trim().length > 0) ?? 'nika check failed';
      const d = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 1),
        firstLine.replace(/^PARSE\s*[✗x]\s*/i, ''),
        vscode.DiagnosticSeverity.Error,
      );
      d.source = NIKA_DIAG_SOURCE;
      d.code = 'nika.parse';
      if (applySeverityRemap(d)) { diagnostics.push(d); }
    }
    if (report) {
      for (const f of collectFindings(report)) {
        const range = f.span ? lineOf(f.span.start) : new vscode.Range(0, 0, 0, 1);
        const d = new vscode.Diagnostic(
          range,
          f.message,
          f.severity === 'error' ? vscode.DiagnosticSeverity.Error
            : f.severity === 'warning' ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information,
        );
        d.source = NIKA_DIAG_SOURCE;
        d.code = f.code.startsWith('NIKA-')
          ? { value: f.code, target: vscode.Uri.parse(`https://nika.sh/errors/${f.code}`) }
          : f.code;
        if (applySeverityRemap(d)) { diagnostics.push(d); }
      }
    }
    this.collection.set(uri, diagnostics);
  }

  dispose(): void {
    this.disposed = true;
    if (this.sweepTimer) { clearTimeout(this.sweepTimer); }
    for (const d of this.disposables) { d.dispose(); }
  }
}
