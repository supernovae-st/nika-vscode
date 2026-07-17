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
    if (row.tooltip) { this.tooltip = row.tooltip; }
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
    this.contextValue = `nikaStation.${row.kind}`;
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
      const [doctor, deep, grammar] = await Promise.all([
        this.service.doctorJson(cwd),
        this.service.welcomeDeep(cwd),
        this.service.speaksGrammar(),
      ]);
      if (seq !== this.snapshotSeq) { return; }
      snap.doctor = doctor;
      snap.deep = deep;
      snap.speaksGrammar = grammar;
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

export function registerStation(
  context: vscode.ExtensionContext,
  service: NikaService,
  resolvedPath: () => string | undefined,
): StationTreeProvider {
  const provider = new StationTreeProvider(
    service,
    context.extension.packageJSON.version as string,
    (snap) => {
      // The badge speaks only for BROKEN — a warn is a row, not a bell.
      const fails = snap.doctor?.summary.fail ?? 0;
      view.badge = fails > 0
        ? { value: fails, tooltip: `nika doctor: ${fails} failing` }
        : undefined;
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
    vscode.commands.registerCommand('nika.station.wire', (client: string) => {
      if (!/^[a-z-]+$/.test(client)) { return; }
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
  );

  // Engine truth changed (binary swap · caps re-probe) → re-derive.
  context.subscriptions.push(service.onDidChange(() => { void provider.refresh(); }));
  void provider.refresh();
  return provider;
}
