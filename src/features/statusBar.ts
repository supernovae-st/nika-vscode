// statusBar.ts — one honest pixel-row: binary · capability rung · file state.
//
// The ladder the engine climbs (static suite → +run → +lsp → +mcp) is
// visible at a glance, and the click opens the whole command surface as
// a quick-pick menu.

import * as vscode from 'vscode';
import { describeCapabilities } from '../core/capabilities';
import type { NikaService } from '../nikaService';

export class NikaStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private lspState: 'off' | 'starting' | 'running' | 'failed' = 'off';

  constructor(private readonly service: NikaService) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'nika.showMenu';
    this.item.show();
    this.disposables.push(
      this.item,
      service.onDidChange(() => this.render()),
      vscode.window.onDidChangeActiveTextEditor(() => this.render()),
    );
    this.render();
  }

  setLspState(state: 'off' | 'starting' | 'running' | 'failed'): void {
    this.lspState = state;
    this.render();
  }

  private render(): void {
    const caps = this.service.caps;
    if (!this.service.available) {
      this.item.text = '$(zap) nika: no binary';
      this.item.tooltip = 'Click for install options';
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      return;
    }
    this.item.backgroundColor = undefined;

    const version = caps.version.match(/(\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?)/)?.[1] ?? caps.version;
    const rung = caps.lsp && this.lspState === 'running' ? '$(check) lsp'
      : caps.run ? '$(play) run'
      : 'static';
    this.item.text = `$(zap) nika ${version} · ${rung}`;
    this.item.tooltip = new vscode.MarkdownString(
      [
        `**nika** \`${this.service.binaryPath ?? ''}\``,
        '',
        `surface: ${describeCapabilities(caps)}`,
        caps.lsp ? `LSP: ${this.lspState}` : 'LSP: unavailable from this binary; client-side intelligence active',
        '',
        '_click for the command menu_',
      ].join('  \n'),
    );
  }

  async showMenu(): Promise<void> {
    const caps = this.service.caps;
    interface Item extends vscode.QuickPickItem { command?: string; args?: unknown[] }
    const items: Item[] = [];
    const add = (cond: boolean, item: Item): void => { if (cond) { items.push(item); } };

    add(caps.check, { label: '$(check) Check workflow', description: 'static pre-flight (ADR-092 ladder)', command: 'nika.checkWorkflow' });
    add(caps.check, { label: '$(output) Open check report', description: 'check --json projection', command: 'nika.showReport' });
    add(caps.graph, { label: '$(type-hierarchy) Show DAG', command: 'nika.showDag' });
    add(caps.inspect, { label: '$(list-tree) Inspect anatomy', description: 'tasks · verbs · cost · permits', command: 'nika.inspectWorkflow' });
    add(caps.check, { label: '$(shield) Insert inferred permits boundary', command: 'nika.inferPermits' });
    add(caps.run, { label: '$(play) Run workflow', command: 'nika.runWorkflow' });
    add(!caps.run && caps.trace, { label: '$(play-circle) Watch demo replay', description: 'run ships with the L3 runtime', command: 'nika.watchDemo' });
    add(caps.trace, { label: '$(history) Replay a trace', command: 'nika.replayTrace' });
    add(true, { label: '$(new-file) New workflow', command: 'nika.newWorkflow' });
    add(caps.examples, { label: '$(book) Browse embedded examples', command: 'nika.browseExamples' });
    add(caps.spec, { label: '$(file-text) Open embedded spec', command: 'nika.openSpec' });
    add(caps.schema, { label: '$(json) Open JSON schema', command: 'nika.openSchema' });
    add(true, { label: '$(copilot) Copy AI authoring prompt', description: 'deterministic template→check→repair protocol', command: 'nika.copyAiPrompt' });
    add(true, { label: '$(plug) Setup MCP + agent rules', command: 'nika.setupMcp' });
    add(caps.doctor, { label: '$(pulse) Doctor — diagnose environment', description: 'binary · config · provider keys · never mutates', command: 'nika.doctor' });
    add(caps.lsp, { label: '$(refresh) Restart language server', command: 'nika.restartServer' });
    add(true, { label: '$(verified) Verify engine binary', command: 'nika.checkBinary' });
    add(true, { label: '$(output) Show output channel', command: 'nika.showOutput' });

    const picked = await vscode.window.showQuickPick(items, { title: 'Nika' });
    if (picked?.command) {
      await vscode.commands.executeCommand(picked.command, ...(picked.args ?? []));
    }
  }

  dispose(): void {
    for (const d of this.disposables) { d.dispose(); }
  }
}
