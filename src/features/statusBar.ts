// statusBar.ts — one honest pixel-row: binary · capability rung · file state.
//
// The ladder the engine climbs (static suite → +run → +lsp → +mcp) is
// visible at a glance, and the click opens the whole command surface as
// a quick-pick menu.

import * as vscode from 'vscode';
import { describeCapabilities } from '../core/capabilities';
import { statusTruth, type Truth } from '../core/statusTruth';
import { isRunActive, onDidChangeRunActive } from './runLive';
import type { NikaService } from '../nikaService';

export class NikaStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private lspState: 'off' | 'starting' | 'running' | 'failed' = 'off';

  constructor(
    private readonly service: NikaService,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'nika.showMenu';
    this.item.show();
    this.disposables.push(
      this.item,
      service.onDidChange(() => this.render()),
      // The spin follows the live-run lifecycle (annexe A #10) — one
      // event, no handle threading through the run call sites.
      onDidChangeRunActive(() => this.render()),
      vscode.window.onDidChangeActiveTextEditor(() => this.render()),
    );
    this.render();
  }

  setLspState(state: 'off' | 'starting' | 'running' | 'failed'): void {
    this.lspState = state;
    this.render();
  }

  /** The one degradation snapshot (core/statusTruth) — render and the
   *  root search's resting head read the SAME truth, so the pill never
   *  contradicts the gate's `Now` row. */
  truth(): Truth {
    const caps = this.service.caps;
    const deep = this.service.deep;
    return statusTruth({
      available: this.service.available,
      version: caps.version.match(/(\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?)/)?.[1] ?? caps.version,
      lspCapable: caps.lsp,
      lspState: this.lspState,
      runCapable: caps.run,
      gen1: this.service.gen1,
      doctorFails: this.service.doctorFails,
      busy: isRunActive() || this.service.probing,
      ...(deep ? {
        workflowsTotal: deep.rollups.workflowsTotal,
        workflowsWithFindings: deep.rollups.workflowsWithFindings,
        costBoundedUsd: deep.rollups.costBoundedUsd,
        costIsFloor: deep.rollups.costIsFloor,
      } : {}),
    });
  }

  private render(): void {
    const caps = this.service.caps;
    const truth = this.truth();
    this.item.text = truth.text;
    this.item.backgroundColor = truth.severity === 'ok'
      ? undefined
      : new vscode.ThemeColor(truth.severity === 'error'
        ? 'statusBarItem.errorBackground'
        : 'statusBarItem.warningBackground');
    if (!this.service.available) {
      // The click keeps the tooltip's promise: engine-less lands straight
      // on Finish setup, not on a search the user must read first.
      this.item.command = 'nika.finishSetup';
      this.item.tooltip = 'Click for install options';
      return;
    }
    this.item.command = 'nika.showMenu';
    // Feed the canary once per binary (cached; a no-op after the first
    // verdict) — a gen-0 floor must not wait for the Station to open.
    if (this.service.gen1 === undefined && caps.check) {
      void this.service.speaksGrammar().then((v) => {
        if (v !== undefined) { this.render(); }
      });
    }
    const busyLine = isRunActive()
      ? '$(sync~spin) a run is live — the canvas narrates it'
      : this.service.probing
        ? '$(sync~spin) station sweep in flight (doctor · welcome)'
        : undefined;
    this.item.tooltip = new vscode.MarkdownString(
      [
        `**nika** \`${this.service.binaryPath ?? ''}\``,
        '',
        busyLine,
        ...truth.tooltip.map((line) => `⚠ ${line}`),
        ...truth.facts,
        busyLine !== undefined || truth.tooltip.length > 0 || truth.facts.length > 0 ? '' : undefined,
        `surface: ${describeCapabilities(caps)}`,
        caps.lsp ? `LSP: ${this.lspState}` : 'LSP: unavailable from this binary; client-side intelligence active',
        '',
        '_click for the command menu_',
      ].filter((line): line is string => line !== undefined).join('  \n'),
      true, // theme icons — the busy line spins in the tooltip too
    );
  }

  dispose(): void {
    for (const d of this.disposables) { d.dispose(); }
  }
}
