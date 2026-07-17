// statusBar.ts — one honest pixel-row: binary · capability rung · file state.
//
// The ladder the engine climbs (static suite → +run → +lsp → +mcp) is
// visible at a glance, and the click opens the whole command surface as
// a quick-pick menu.

import * as vscode from 'vscode';
import { journeyPlaceholder } from '../core/journey';
import { describeCapabilities } from '../core/capabilities';
import type { NikaService } from '../nikaService';

export class NikaStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private lspState: 'off' | 'starting' | 'running' | 'failed' = 'off';

  constructor(
    private readonly service: NikaService,
    /** The journey SSOT (core/journey) — computed by the extension seam,
     *  consumed here for the head row + placeholder (one truth, never a
     *  second findFiles). */
    private readonly getJourney: () => import('../core/journey').Journey,
  ) {
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

    // JOURNEY-DRIVEN and SECTIONED (Rams #2 killed the 18-row wall; the
    // journey SSOT killed the four independent state probes). The head
    // section is THE next step for the user's stage; the active file
    // leads when working; Author · Prove · Understand · Machine follow;
    // the earned ask closes.
    const j = this.getJourney();
    const activeDoc = vscode.window.activeTextEditor?.document;
    const active = activeDoc?.languageId === 'nika'
      ? activeDoc.uri.path.split('/').pop() ?? 'this workflow'
      : undefined;
    const sep = (label: string): Item =>
      ({ label, kind: vscode.QuickPickItemKind.Separator } as Item);

    // ── The next step, per stage — exactly one head section.
    if (j.stage === 'noBinary') {
      add(true, sep('Next step'));
      add(true, { label: '$(zap) Finish setup — install engine + wire everything', description: 'verified download · MCP · LSP · one gesture', command: 'nika.finishSetup' });
    } else if (j.stage === 'unequipped') {
      add(true, sep('Next step'));
      add(true, { label: '$(rocket) Init this project', description: 'scaffold + agent rules + MCP — one gesture, skip-if-exists', command: 'nika.initProject' });
      add(caps.examples, { label: '$(play) Run the 10-second proof', description: '01-hello · mock/echo · offline · zero keys', command: 'nika.runProof' });
    } else if (j.stage === 'empty') {
      add(true, sep('Next step'));
      add(caps.examples, { label: '$(play) Run the 10-second proof', description: '01-hello · mock/echo · offline · zero keys', command: 'nika.runProof' });
      add(true, { label: '$(comment-discussion) New session', description: 'wizard · describe · templates — the guided first workflow', command: 'nika.newSession' });
    } else if (active) {
      add(true, sep(active));
      add(caps.run, { label: '$(play) Run', description: active, command: 'nika.runWorkflow' });
      add(caps.check, { label: '$(check) Check', description: 'the audit, before a token is spent', command: 'nika.checkWorkflow' });
      add(caps.inspect, { label: '$(type-hierarchy) Graph', description: 'the DAG canvas', command: 'nika.showDag' });
      add(!caps.run && caps.trace, { label: '$(play-circle) Watch demo replay', description: 'run ships with the engine runtime', command: 'nika.watchDemo' });
    }

    add(true, sep('Author'));
    add(true, { label: '$(comment-discussion) New session', description: 'wizard · describe · templates · examples', command: 'nika.newSession' });
    add(true, { label: '$(new-file) New workflow', command: 'nika.newWorkflow' });
    add(caps.examples, { label: '$(book) Browse embedded examples', command: 'nika.browseExamples' });
    add(!j.equipped && j.workspaceOpen, { label: '$(rocket) Init this project', description: 'agent rules · MCP · schema wiring', command: 'nika.initProject' });
    add(true, { label: '$(copilot) Copy AI authoring prompt', description: 'template → check → repair, for any agent', command: 'nika.copyAiPrompt' });

    add(caps.test || caps.trace, sep('Prove'));
    add(caps.test, { label: '$(beaker) Golden test', description: 'mock provider · offline · compares <file>.golden.json', command: 'nika.testWorkflow' });
    add(caps.test, { label: '$(beaker) Update the golden', description: 'test --update — (re)writes the pin from this run', command: 'nika.testUpdate' });
    add(caps.trace, { label: '$(history) Replay a trace', command: 'nika.replayTrace' });

    add(caps.inspect || caps.check || caps.spec, sep('Understand'));
    add(caps.inspect, { label: '$(list-tree) Inspect anatomy', description: 'tasks · verbs · cost · permits', command: 'nika.inspectWorkflow' });
    add(caps.check, { label: '$(output) Open check report', description: 'check --json projection', command: 'nika.showReport' });
    add(caps.check, { label: '$(shield) Insert inferred permits boundary', command: 'nika.inferPermits' });
    add(caps.spec, { label: '$(file-text) Open embedded spec', command: 'nika.openSpec' });
    add(caps.schema, { label: '$(json) Open JSON schema', command: 'nika.openSchema' });

    add(true, sep('Machine'));
    add(true, { label: '$(radio-tower) Station — engine · agents · doctor', description: 'the cockpit view: what is wired, what to fix, what it costs', command: 'nika.showStation' });
    add(caps.doctor, { label: '$(pulse) Doctor — diagnose environment', description: 'binary · config · keys · never mutates (--ping in a terminal probes local ports)', command: 'nika.doctor' });
    add(this.service.available, { label: '$(plug) Re-wire MCP + agent rules', description: 'idempotent — auto-ran once at first activation', command: 'nika.setupMcp' });
    add(caps.lsp, { label: '$(refresh) Restart language server', command: 'nika.restartServer' });
    add(true, { label: '$(output) Show output channel', command: 'nika.showOutput' });

    add(true, sep(''));
    // The one earned ask — a quiet footer, never a toast (#498 doctrine).
    add(true, { label: '$(star) Star nika on GitHub', description: 'supernovae-st/nika — it helps others find it', command: 'nika.starOnGitHub' });

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Nika',
      placeHolder: journeyPlaceholder(j.stage, active),
    });
    if (picked?.command) {
      await vscode.commands.executeCommand(picked.command, ...(picked.args ?? []));
    }
  }

  dispose(): void {
    for (const d of this.disposables) { d.dispose(); }
  }
}
