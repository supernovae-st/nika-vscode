// treeActions.ts · the tree action panel model (pure · zero vscode).
//
// The four trees speak the canvas K grammar (DESIGN.md §7d): one CURATED
// registry per focused row · verbal labels · the chord printed when the
// action has one · the unavailable rows greyed WITH THEIR REASON, never
// hidden. This module decides everything the panel shows; the door
// (features/treeActions.ts) only renders and executes.
//
// The rows re-run the SAME commands the hover icons and context menus
// run, with the SAME argument (the live tree element, threaded through
// as an opaque payload) — the panel is a keyboard door onto the exact
// audited surface, never a second implementation.
//
// Ranking: learned habit inside the item section (the root-search
// frecency store · `tree.<command>` ids · an action you keep taking
// rises), curated order at parity. View rows keep their curated order:
// a short stable menu teaches better than a shuffling one.

import { frecencyScore, type FrecencyStore } from './rootSearch';

export type TreeViewId = 'nikaWorkflows' | 'nikaRuns' | 'nikaRunHistory' | 'nikaStation';

/** The contextValue vocabulary, folded to the panel's own kinds. */
export type TreeItemKind =
  | 'workflowFile'
  | 'workflowTask'
  | 'workflowUnparseable'
  | 'trace'
  | 'traceTask'
  | 'artifact'
  | 'unreadableTrace'
  | 'historyCell'
  | 'historyTask'
  | 'stationFixable'
  | 'stationDoctorHead'
  | 'section'
  | 'other';

/** What the door extracted from the focused element (opaque payloads:
 *  the core threads them, never reads them). */
export interface TreeItemFacts {
  readonly kind: TreeItemKind;
  readonly label: string;
  /** The live tree element · the exact arg the view/item/context menus pass. */
  readonly element?: unknown;
  /** The row's own click, when the panel replicates it (open · reveal · go-to). */
  readonly click?: { readonly command: string; readonly args: readonly unknown[] };
  /** The trace handle (Runs rows) · replay/diff take the Uri, not the element. */
  readonly traceUri?: unknown;
  /** History cell: a recorded trace path exists behind the row. */
  readonly hasTrace?: boolean;
}

/** The capability truths the reasons speak from. */
export interface TreeCaps {
  readonly available: boolean;
  readonly run: boolean;
  readonly check: boolean;
  readonly dap: boolean;
}

export interface TreeActionRow {
  /** Frecency id · `tree.<command>` — the habit is the ACTION, not the item. */
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly args: readonly unknown[];
  /** The command whose manifest chord this row teaches (defaults to `command`). */
  readonly teach?: string;
  /** Greyed reason · the row stays visible, explains, never runs. */
  readonly off?: string;
}

export interface TreeActionPanel {
  readonly title: string;
  /** The focused row's verbs · frecency-ranked by the door. */
  readonly itemRows: readonly TreeActionRow[];
  /** The view's own verbs · curated order, stable. */
  readonly viewRows: readonly TreeActionRow[];
}

export const VIEW_NAME: Record<TreeViewId, string> = {
  nikaWorkflows: 'Workflows',
  nikaRuns: 'Runs',
  nikaRunHistory: 'Run History',
  nikaStation: 'Station',
};

// One voice for the reasons (the station/status dialect).
const NEEDS_ENGINE = 'needs the engine · the Station installs it';
const reasonRun = (c: TreeCaps): string | undefined =>
  !c.available ? NEEDS_ENGINE : !c.run ? 'this engine predates `nika run`' : undefined;
const reasonCheck = (c: TreeCaps): string | undefined =>
  !c.available ? NEEDS_ENGINE : !c.check ? 'this engine predates `nika check`' : undefined;

function row(
  label: string,
  command: string,
  args: readonly unknown[],
  extra: { teach?: string; off?: string } = {},
): TreeActionRow {
  return {
    id: `tree.${command}`,
    label,
    command,
    args,
    ...(extra.teach !== undefined ? { teach: extra.teach } : {}),
    ...(extra.off !== undefined ? { off: extra.off } : {}),
  };
}

/** The per-item registry · the same commands the hover icons run, the
 *  same element as the argument. Curated order: primary verb first. */
function itemRowsFor(item: TreeItemFacts, caps: TreeCaps): TreeActionRow[] {
  const el = item.element;
  const click = item.click !== undefined
    ? (label: string, off?: string): TreeActionRow[] => [
      row(label, item.click!.command, item.click!.args, off !== undefined ? { off } : {}),
    ]
    : (): TreeActionRow[] => [];
  switch (item.kind) {
    case 'workflowFile': {
      const runOff = reasonRun(caps);
      const checkOff = reasonCheck(caps);
      return [
        row('$(play) Run this workflow', 'nika.workflows.run', [el], {
          teach: 'nika.runWorkflow', ...(runOff !== undefined ? { off: runOff } : {}),
        }),
        row('$(check) Check this workflow', 'nika.workflows.check', [el], {
          teach: 'nika.checkWorkflow', ...(checkOff !== undefined ? { off: checkOff } : {}),
        }),
        ...click('$(go-to-file) Open the file'),
      ];
    }
    case 'workflowTask': {
      const runOff = reasonRun(caps);
      return [
        row('$(debug-rerun) Re-run the task and its upstream', 'nika.workflows.rerunTask', [el],
          runOff !== undefined ? { off: runOff } : {}),
        row('$(type-hierarchy) Focus the task in the DAG', 'nika.workflows.focusTask', [el]),
        ...click('$(go-to-file) Go to the YAML line'),
      ];
    }
    case 'workflowUnparseable':
      return click('$(go-to-file) Open the file · the check squiggles mark the line');
    case 'trace': {
      const engineOff = caps.available ? undefined : NEEDS_ENGINE;
      return [
        row('$(play-circle) Replay onto the canvas', 'nika.replayTrace', [item.traceUri],
          { teach: 'nika.replayTrace' }),
        row('$(diff) Diff against another run', 'nika.diffTraces', [item.traceUri],
          { teach: 'nika.diffTraces' }),
        row('$(debug-alt) Debug this run · time travel', 'nika.debugReplay', [el],
          caps.dap ? {} : { off: 'this engine has no `nika dap`' }),
        row('$(verified) Verify the journal chain', 'nika.verifyTrace', [el], {
          teach: 'nika.verifyTrace', ...(engineOff !== undefined ? { off: engineOff } : {}),
        }),
        row('$(sync) Reproduce the run · determinism check', 'nika.reproduceRun', [el],
          engineOff !== undefined ? { off: engineOff } : {}),
        row('$(output) Run report · provable, from the trace', 'nika.runReport', [el]),
        row('$(export) Export to OpenTelemetry', 'nika.exportOtel', [el]),
      ];
    }
    case 'traceTask':
      return [
        row('$(type-hierarchy) Show the task in the DAG', 'nika.runs.showTaskInDag', [el]),
        row('$(git-branch) Fork from this task', 'nika.forkFromTask', [el], {
          teach: 'nika.forkFromTask',
          ...(caps.available ? {} : { off: NEEDS_ENGINE }),
        }),
      ];
    case 'artifact':
      return item.click !== undefined
        ? click('$(go-to-file) Open the artifact')
        // A greyed row never runs · the command seat is nominal.
        : [row('$(go-to-file) Open the artifact', 'vscode.open', [],
          { off: 'recorded here, but not found on disk' })];
    case 'unreadableTrace':
      return click('$(folder-opened) Reveal the file');
    case 'historyCell': {
      const off = item.hasTrace === true ? undefined : 'this run recorded no trace path';
      return [
        ...(item.click !== undefined
          ? click('$(play-circle) Replay this run', off)
          : []),
        row('$(output) Run report · provable, from the trace', 'nika.history.report', [el],
          off !== undefined ? { off } : {}),
      ];
    }
    case 'historyTask':
      return item.click !== undefined
        ? click('$(type-hierarchy) Focus the task in the DAG')
        : [];
    case 'stationFixable':
      return [row('$(tools) Apply the fix', 'nika.station.fix', [el])];
    case 'stationDoctorHead':
      return [row('$(output) Doctor full report · in the terminal', 'nika.station.doctorReport', [],
        caps.available ? {} : { off: NEEDS_ENGINE })];
    case 'section':
    case 'other':
      return [];
  }
}

/** The per-view registry · the view/title gestures, keyboard-reachable. */
function viewRowsFor(viewId: TreeViewId, caps: TreeCaps): TreeActionRow[] {
  switch (viewId) {
    case 'nikaWorkflows':
      return [row('$(new-file) New workflow', 'nika.newWorkflow', [])];
    case 'nikaRuns':
      return [
        row('$(refresh) Refresh runs', 'nika.refreshRuns', []),
        row('$(history) Run history · cross-run grid', 'nika.runHistory', []),
        row('$(diff) Diff two runs', 'nika.diffTraces', [], { teach: 'nika.diffTraces' }),
      ];
    case 'nikaRunHistory':
      return [
        row('$(markdown) Export history as a document', 'nika.history.exportDoc', []),
        row('$(close) Close run history', 'nika.history.close', []),
      ];
    case 'nikaStation':
      return [
        row('$(refresh) Refresh station', 'nika.station.refresh', []),
        row('$(output) Doctor full report · in the terminal', 'nika.station.doctorReport', [],
          caps.available ? {} : { off: NEEDS_ENGINE }),
      ];
  }
}

/**
 * The whole panel for one focused row (or none). No selection is a
 * screen, never a void: the view rows always answer, and the title
 * says what to do next.
 */
export function buildTreeActionPanel(
  viewId: TreeViewId,
  item: TreeItemFacts | undefined,
  caps: TreeCaps,
): TreeActionPanel {
  const itemRows = item !== undefined ? itemRowsFor(item, caps) : [];
  return {
    title: item !== undefined && itemRows.length > 0
      ? `${VIEW_NAME[viewId]} · ${item.label}`
      : VIEW_NAME[viewId],
    itemRows,
    viewRows: viewRowsFor(viewId, caps),
  };
}

/**
 * Habit ranking for the item section: frecency score first (the
 * root-search store · 7-day half-life), curated order at parity. A
 * greyed row cannot be accepted, so its habit never grows: it sinks
 * among the never-used on its own.
 */
export function rankTreeRows(
  rows: readonly TreeActionRow[],
  frec: FrecencyStore,
  nowMs: number,
): TreeActionRow[] {
  const score = (r: TreeActionRow): number => {
    const e = frec[r.id];
    return e === undefined ? 0 : frecencyScore(e, nowMs);
  };
  return rows
    .map((r, i) => ({ r, i, s: score(r) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r);
}
