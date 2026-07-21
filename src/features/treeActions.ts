// treeActions.ts · the tree action panel (the K grammar for the trees).
//
// ⌘K ⌘. on any nika tree opens ONE curated QuickPick for the focused
// row: every action the hover icons and the context menu hold, now
// keyboard-reachable (Raycast law 4 · no dead ends). Rows print their
// chord when one exists (core/chordLabels); the unavailable ones stay
// visible, greyed with their reason (the canvas openNodeActions read:
// never hide, explain). Enter runs the SAME command with the SAME
// argument the inline icon would pass.
//
// FOCUS, honestly: an extension cannot read `focusedView`, and a global
// command receives no tree item. The truthful chain is: the KEYBINDING
// resolver reads `focusedView` (four when-scoped rows of one command,
// each passing its view id in `args`) → the per-view TreeView handle →
// `selection[0]`, which tracks keyboard focus in our single-select
// trees. Without the arg (programmatic call), the door falls back to
// the first visible tree holding a selection, then the first visible.
//
// The picks feed the ROOT search's habit store (`nika.search.frecency.v1`
// · one store, never a second): an action you keep taking rises in the
// item section. View rows keep curated order · a stable short menu.

import * as vscode from 'vscode';
import {
  buildTreeActionPanel,
  rankTreeRows,
  VIEW_NAME,
  type TreeActionRow,
  type TreeItemFacts,
  type TreeViewId,
} from '../core/treeActions';
import { FRECENCY_KEY } from '../core/searchCatalog';
import { visit, type FrecencyStore } from '../core/rootSearch';
import type { HistoryRow } from '../core/runHistory';
import type { StationRow } from '../core/stationModel';
import type { NikaService } from '../nikaService';

/** The read seat of a TreeView (structural: `TreeView<T>` is invariant,
 *  the panel only ever READS · selection covariance stays legal). */
export interface SelectionSource<T> {
  readonly selection: readonly T[];
  readonly visible: boolean;
}

/** The four handles the door reads selections from. */
export interface TreeActionViews {
  readonly workflows: SelectionSource<vscode.TreeItem>;
  readonly runs: SelectionSource<vscode.TreeItem>;
  readonly history: SelectionSource<HistoryRow>;
  readonly station: SelectionSource<StationRow>;
  /** The history view's workflow handle (its rows navigate with it). */
  readonly historyDocUri: () => vscode.Uri | undefined;
}

interface ActionQuickPickItem extends vscode.QuickPickItem {
  row?: TreeActionRow;
}

/** TreeItem label → plain string (labels can be TreeItemLabel). */
function labelText(label: string | vscode.TreeItemLabel | undefined, fallback: string): string {
  if (typeof label === 'string') { return label; }
  if (label !== undefined && typeof label.label === 'string') { return label.label; }
  return fallback;
}

/** A TreeItem's own click, replicated verbatim (open · reveal · go-to). */
function clickOf(item: vscode.TreeItem): TreeItemFacts['click'] {
  return item.command !== undefined
    ? { command: item.command.command, args: item.command.arguments ?? [] }
    : undefined;
}

/** Workflows / Runs elements ARE TreeItems · the contextValue names the kind. */
function factsFromTreeItem(el: vscode.TreeItem): TreeItemFacts {
  const label = labelText(el.label, 'this row');
  const click = clickOf(el);
  const base = { label, element: el as unknown, ...(click !== undefined ? { click } : {}) };
  switch (el.contextValue) {
    case 'workflowFile': return { kind: 'workflowFile', ...base };
    case 'workflowTask': return { kind: 'workflowTask', ...base };
    case 'workflowUnparseable': return { kind: 'workflowUnparseable', ...base };
    case 'nikaTrace': {
      const traceUri = (el as { trace?: { uri?: unknown } }).trace?.uri;
      return { kind: 'trace', ...base, traceUri };
    }
    case 'nikaTraceTask': return { kind: 'traceTask', ...base };
    case 'nikaArtifact': return { kind: 'artifact', ...base };
    case 'nikaUnreadableTrace': return { kind: 'unreadableTrace', ...base };
    case 'nikaWorkflowsSection':
    case 'nikaRunsSection':
      return { kind: 'section', label };
    default:
      return { kind: 'other', label };
  }
}

/** History elements are PURE rows · the kind carries the story. */
function factsFromHistoryRow(rowEl: HistoryRow, docUri: vscode.Uri | undefined): TreeItemFacts {
  if (rowEl.kind === 'cell') {
    const hasTrace = typeof rowEl.traceFsPath === 'string' && rowEl.traceFsPath.length > 0;
    const traceUri = hasTrace ? vscode.Uri.file(rowEl.traceFsPath!) : undefined;
    return {
      kind: 'historyCell',
      label: rowEl.label,
      element: rowEl,
      hasTrace,
      // The cell's own Enter (§7e) + the replay row's handle.
      ...(traceUri !== undefined
        ? {
          click: { command: 'nika.runDetail', args: [traceUri] },
          traceUri,
        }
        : {}),
    };
  }
  if (rowEl.kind === 'task') {
    return {
      kind: 'historyTask',
      label: rowEl.label,
      element: rowEl,
      ...(rowEl.taskId !== undefined && docUri !== undefined
        ? { click: { command: 'nika.focusTaskInDag', args: [docUri, rowEl.taskId] } }
        : {}),
    };
  }
  return { kind: 'section', label: rowEl.label };
}

/** Station elements are PURE rows · fixable and the doctor head lead. */
function factsFromStationRow(rowEl: StationRow): TreeItemFacts {
  if (rowEl.fix !== undefined) {
    return { kind: 'stationFixable', label: rowEl.label, element: rowEl };
  }
  if (rowEl.context === 'doctorHead') {
    return { kind: 'stationDoctorHead', label: rowEl.label, element: rowEl };
  }
  return { kind: rowEl.kind === 'section' ? 'section' : 'other', label: rowEl.label };
}

function focusedFacts(views: TreeActionViews, viewId: TreeViewId): TreeItemFacts | undefined {
  switch (viewId) {
    case 'nikaWorkflows': {
      const el = views.workflows.selection[0];
      return el !== undefined ? factsFromTreeItem(el) : undefined;
    }
    case 'nikaRuns': {
      const el = views.runs.selection[0];
      return el !== undefined ? factsFromTreeItem(el) : undefined;
    }
    case 'nikaRunHistory': {
      const el = views.history.selection[0];
      return el !== undefined ? factsFromHistoryRow(el, views.historyDocUri()) : undefined;
    }
    case 'nikaStation': {
      const el = views.station.selection[0];
      return el !== undefined ? factsFromStationRow(el) : undefined;
    }
  }
}

const VIEW_IDS: readonly TreeViewId[] = [
  'nikaWorkflows', 'nikaRuns', 'nikaRunHistory', 'nikaStation',
];

/** The programmatic fallback: first visible tree with a selection,
 *  then the first visible, then Workflows. */
function fallbackViewId(views: TreeActionViews): TreeViewId {
  const handle = (id: TreeViewId): { visible: boolean; selected: boolean } => {
    const v = id === 'nikaWorkflows' ? views.workflows
      : id === 'nikaRuns' ? views.runs
      : id === 'nikaRunHistory' ? views.history
      : views.station;
    return { visible: v.visible, selected: v.selection.length > 0 };
  };
  const states = VIEW_IDS.map((id) => ({ id, ...handle(id) }));
  return states.find((s) => s.visible && s.selected)?.id
    ?? states.find((s) => s.visible)?.id
    ?? 'nikaWorkflows';
}

export function registerTreeActions(
  context: vscode.ExtensionContext,
  service: NikaService,
  chords: ReadonlyMap<string, string>,
  views: TreeActionViews,
): void {
  const readStore = (): FrecencyStore =>
    context.workspaceState.get<FrecencyStore>(FRECENCY_KEY) ?? {};

  const toItem = (r: TreeActionRow): ActionQuickPickItem => {
    const chord = chords.get(r.teach ?? r.command);
    const description = r.off !== undefined
      ? `$(circle-slash) ${r.off}`
      : chord;
    return {
      label: r.label,
      ...(description !== undefined ? { description } : {}),
      alwaysShow: true,
      row: r,
    };
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('nika.treeActions', (viewIdArg?: unknown) => {
      const viewId: TreeViewId = typeof viewIdArg === 'string'
        && (VIEW_IDS as readonly string[]).includes(viewIdArg)
        ? viewIdArg as TreeViewId
        : fallbackViewId(views);
      const caps = service.caps;
      const panel = buildTreeActionPanel(viewId, focusedFacts(views, viewId), {
        available: service.available,
        run: caps.run,
        check: caps.check,
        dap: caps.dap,
      });
      const itemRows = rankTreeRows(panel.itemRows, readStore(), Date.now());

      const qp = vscode.window.createQuickPick<ActionQuickPickItem>();
      qp.title = panel.title;
      qp.placeholder = panel.itemRows.length > 0
        ? 'Every action of this row · Enter runs it'
        : 'Select a row first for its actions · these serve the view';
      const items: ActionQuickPickItem[] = [];
      if (itemRows.length > 0) {
        items.push(
          { label: 'This row', kind: vscode.QuickPickItemKind.Separator },
          ...itemRows.map(toItem),
        );
      }
      items.push(
        { label: `The ${VIEW_NAME[viewId]} view`, kind: vscode.QuickPickItemKind.Separator },
        ...panel.viewRows.map(toItem),
      );
      qp.items = items;
      qp.onDidAccept(() => {
        const row = qp.selectedItems[0]?.row;
        if (row === undefined) { return; }
        if (row.off !== undefined) {
          // Greyed rows explain, never run · the panel stays open (the
          // canvas law: readable, never landable). A breath, no toast.
          vscode.window.setStatusBarMessage(`Nika: ${row.off}`, 4000);
          return;
        }
        qp.hide();
        void context.workspaceState
          .update(FRECENCY_KEY, visit(readStore(), row.id, Date.now()))
          .then(() => vscode.commands.executeCommand(row.command, ...row.args));
      });
      qp.onDidHide(() => qp.dispose());
      qp.show();
    }),
  );
}
