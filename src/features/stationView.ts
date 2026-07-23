// stationView.ts — the Station: the cockpit tree (engine · doctor ·
// agents · providers · workspace).
//
// A DUMB renderer over `core/stationModel.buildStationRows` — every
// decision (ordering · icons · levels · click actions) is derived
// pure and unit-tested there. The view owns only: the refresh cycle,
// the tree plumbing, and the container badge (doctor fails — calm,
// loud only when something is actually broken).
//
// One journey law (§3bis): the Station is where the machine state
// LIVES — no toast ever repeats what a Station row already says.

import * as vscode from 'vscode';
import { NikaService } from '../nikaService';
import {
  buildStationRows,
  deriveStationBadge,
  type StationRow,
  type StationSnapshot,
} from '../core/stationModel';

const LEVEL_COLOR: Record<string, string | undefined> = {
  ok: 'testing.iconPassed',
  warn: 'list.warningForeground',
  fail: 'list.errorForeground',
};

class StationItem extends vscode.TreeItem {
  constructor(readonly row: StationRow) {
    super(
      row.label,
      row.kind === 'section'
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );
    this.id = row.id;
    this.description = row.description;
    if (row.tooltipMarkdown) {
      // Breakdown tables — untrusted markdown, no HTML, no command links.
      const md = new vscode.MarkdownString(row.tooltipMarkdown);
      md.isTrusted = false;
      this.tooltip = md;
    } else if (row.tooltip) { this.tooltip = row.tooltip; }
    if (row.icon) {
      const color = row.level ? LEVEL_COLOR[row.level] : undefined;
      this.iconPath = new vscode.ThemeIcon(
        row.icon,
        color ? new vscode.ThemeColor(color) : undefined,
      );
    }
    if (row.command) {
      this.command = {
        command: row.command.id,
        title: row.label,
        arguments: row.command.args,
      };
    }
    // `fixable` targets the inline wrench (view/item/context); the
    // doctor head rows carry the full-report inline action instead.
    this.contextValue = row.fix ? 'fixable' : row.context ?? `nikaStation.${row.kind}`;
  }
}

export class StationTreeProvider implements vscode.TreeDataProvider<StationRow> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private rows: StationRow[] = [];
  private snapshotSeq = 0;
  private lspState: StationSnapshot['lspState'] = 'off';

  constructor(
    private readonly service: NikaService,
    private readonly extensionVersion: string,
    private readonly onSnapshot: (snap: StationSnapshot) => void,
  ) {}

  /** The status bar sink mirrors into the Station's engine section. */
  setLspState(state: StationSnapshot['lspState']): void {
    if (this.lspState === state) { return; }
    this.lspState = state;
    void this.refresh();
  }

  /** Re-derive the whole snapshot — engine truth, one sweep. The seq
   *  guard drops a stale sweep that resolves after a newer one. */
  async refresh(): Promise<void> {
    const seq = ++this.snapshotSeq;
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const snap: StationSnapshot = {
      binaryPath: this.service.binaryPath,
      engineVersion: this.service.caps.version || undefined,
      extensionVersion: this.extensionVersion,
      lspState: this.lspState,
    };
    if (this.service.available) {
      // The wait lives ON the view (annexe A): the Station's own
      // progress bar while the doctor sweep runs — never a toast.
      const [doctor, deep, grammar, models] = await vscode.window.withProgress(
        { location: { viewId: 'nikaStation' } },
        () => Promise.all([
          this.service.doctorJson(cwd),
          this.service.welcomeDeep(cwd),
          this.service.speaksGrammar(),
          this.service.modelList(),
        ]),
      );
      if (seq !== this.snapshotSeq) { return; }
      // Probe → snapshot: ok lands the value; a probe that ANSWERED
      // and broke lands its story (honest row); unsupported stays
      // absent (the « predates the station surfaces » row owns it).
      if (doctor.kind === 'ok') { snap.doctor = doctor.value; }
      else if (doctor.kind === 'no-output') { snap.doctorBroke = 'the engine answered nothing'; }
      else if (doctor.kind === 'unparseable') { snap.doctorBroke = doctor.detail; }
      if (deep.kind === 'ok') { snap.deep = deep.value; }
      else if (deep.kind === 'no-output') { snap.deepBroke = 'the engine answered nothing'; }
      else if (deep.kind === 'unparseable') { snap.deepBroke = deep.detail; }
      snap.speaksGrammar = grammar;
      if (models.length > 0) { snap.models = models; }
    }
    this.rows = buildStationRows(snap);
    this.onSnapshot(snap);
    this.changeEmitter.fire();
  }

  getTreeItem(row: StationRow): vscode.TreeItem {
    return new StationItem(row);
  }

  getChildren(row?: StationRow): StationRow[] {
    return row ? row.children ?? [] : this.rows;
  }
}

export interface StationHandles {
  readonly provider: StationTreeProvider;
  /** The live tree handle · the action panel reads its selection. */
  readonly view: vscode.TreeView<StationRow>;
}

export function registerStation(
  context: vscode.ExtensionContext,
  service: NikaService,
  resolvedPath: () => string | undefined,
): StationHandles {
  const provider = new StationTreeProvider(
    service,
    context.extension.packageJSON.version as string,
    (snap) => {
      // The badge law lives in the model (fails only — a warn is a
      // row, not a bell); `undefined` clears it.
      view.badge = deriveStationBadge(snap);
    },
  );
  const view = vscode.window.createTreeView('nikaStation', {
    treeDataProvider: provider,
    showCollapseAll: false,
  });
  context.subscriptions.push(view);

  const inTerminal = (line: string): void => {
    const nika = resolvedPath() ?? 'nika';
    const terminal = vscode.window.createTerminal({ name: 'Nika: station' });
    terminal.show();
    // Only `nika …` lines run; anything else would be a doctor fix the
    // human must own (an export line carries a secret slot).
    terminal.sendText(line.replace(/^nika\b/, `"${nika}"`));
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('nika.showStation', async () => {
      await vscode.commands.executeCommand('nikaStation.focus');
    }),
    vscode.commands.registerCommand('nika.station.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('nika.station.wire', (client: unknown) => {
      // Palette invocation passes undefined — String coercion would run
      // `nika wire undefined` (the refuter's counterexample). Type first.
      if (typeof client !== 'string' || !/^[a-z-]+$/.test(client)) { return; }
      inTerminal(`nika wire ${client}`);
      setTimeout(() => { void provider.refresh(); }, 4000);
    }),
    vscode.commands.registerCommand('nika.station.applyFix', async (fix: string) => {
      if (typeof fix !== 'string' || fix.length === 0) { return; }
      if (/^nika\b/.test(fix)) {
        inTerminal(fix);
        setTimeout(() => { void provider.refresh(); }, 4000);
        return;
      }
      // `export X_API_KEY=…` and friends: the human owns secrets — we
      // hand the exact line to the clipboard, never run it, never ask
      // for the value (sovereignty Rule 1).
      await vscode.env.clipboard.writeText(fix);
      vscode.window.setStatusBarMessage(`$(clippy) copied — ${fix}`, 4000);
    }),
    vscode.commands.registerCommand('nika.station.doctorReport', () => {
      inTerminal('nika doctor');
    }),
    // Serve a pulled GGUF — a FOREGROUND OpenAI-compatible server, so
    // the terminal is the honest vehicle: the banner says how workflows
    // reach it, Ctrl-C stops it where it started. The picker reads the
    // engine's own list; ids are engine-validated on the other side.
    vscode.commands.registerCommand('nika.station.serveModel', async () => {
      const models = await service.modelList();
      if (models.length === 0) {
        void vscode.window.showInformationMessage(
          'Nika: no local models pulled yet — `nika model pull <owner/repo>` downloads one into the models dir.',
        );
        return;
      }
      const pick = await vscode.window.showQuickPick(
        models.map((m) => ({ label: m.id, description: `${m.size} · ${m.file}` })),
        { title: 'Serve a local model (foreground terminal · Ctrl-C stops it)' },
      );
      if (pick === undefined) { return; }
      inTerminal(`nika model serve --model ${pick.label}`);
    }),
    vscode.commands.registerCommand('nika.station.fix', async (row: unknown) => {
      // The inline wrench receives the tree row — typeof first (the
      // command is palette-hidden, but the guard is the law, not the
      // menu). It re-routes to the row's repair command, so the fix
      // behavior stays the audited one: `nika …` runs in a VISIBLE
      // terminal · `export …` goes to the clipboard, never executed.
      if (typeof row !== 'object' || row === null) { return; }
      const fix = (row as StationRow).fix;
      if (!fix || typeof fix.id !== 'string') { return; }
      await vscode.commands.executeCommand(fix.id, ...(fix.args ?? []));
    }),
  );

  // Engine truth changed (binary swap · caps re-probe) → re-derive.
  // Debounced: setBinary fires up to three pulses per resolution
  // (caps · intel · catalog) — one trailing refresh serves them all
  // instead of three doctor+welcome+canary spawn storms at boot.
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(service.onDidChange(() => {
    if (refreshTimer) { clearTimeout(refreshTimer); }
    refreshTimer = setTimeout(() => { void provider.refresh(); }, 300);
  }));
  context.subscriptions.push({ dispose: () => { if (refreshTimer) { clearTimeout(refreshTimer); } } });
  void provider.refresh();
  return { provider, view };
}
