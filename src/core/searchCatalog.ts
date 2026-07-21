// searchCatalog.ts · the gate's pure half (zero vscode).
//
// The door (features/searchGate.ts) stays a thin wire; every decision
// it renders is decided here, testable without an extension host:
//
//   · the two synchronous families — F1 manifest commands (palette-
//     hidden rows excluded · the door and its menu alias excluded ·
//     the command id rides as a keyword so muscle memory finds
//     `showdag`) and F2 the add-task vocabulary (4 verbs + builtins,
//     each running the existing add command with its verb/tool pinned);
//   · the two ASYNC families the door appends when they land — F3 the
//     workflow files (the watcher-cached scan · newest first · a row
//     opens the file) and F4 the recorded runs (the flight recorder's
//     facts · paused leads, needs-you outranks working · a row replays
//     the journal);
//   · declOrder assigned GLOBALLY (F1 F2, then the async F3 F4 via
//     mergeCatalog), so family precedence holds inside every match tier
//     whatever order the async families LANDED in;
//   · the resting screen — the old journey menu head under one `Now`
//     separator, the whole catalog habits-first below, the quiet
//     footer (lenses · the earned ask) closing;
//   · the accept step — visit the id, then run (the history fallback
//     carries its query since PR-3 taught that view the argument).

import type { AddTaskPick } from './addTaskPicks';
import type { JourneyStage } from './journey';
import { bucketOf, type RunBucket, type RunStatus } from './runsModel';
import {
  SEARCH_COMMAND,
  fallbacksFor,
  rankSearch,
  visit,
  type FrecencyStore,
  type SearchItem,
} from './rootSearch';

/** The command surface of `contributes` the catalog reads. */
export interface ManifestLike {
  contributes?: {
    commands?: Array<{ command: string; title: string; category?: string }>;
    menus?: { commandPalette?: Array<{ command: string; when?: string }> };
  };
}

/** The menu alias — kept registered for the palette, redirects to the gate. */
export const MENU_COMMAND = 'nika.showMenu';

/** The escape hatch (Raycast law 2: the ranking is learned, never trapped). */
export const RESET_COMMAND = 'nika.search.resetRanking';

/** The workspaceState key the gate owns (the Memento pattern). */
export const FRECENCY_KEY = 'nika.search.frecency.v1';

/** Palette-hidden commands (`when: "false"`) — context-bound rows
 *  (canvas cards · tree inline) that make no sense as launches. */
export function hiddenPaletteCommands(pkg: ManifestLike): Set<string> {
  const hidden = new Set<string>();
  for (const e of pkg.contributes?.menus?.commandPalette ?? []) {
    if (e.when === 'false') { hidden.add(e.command); }
  }
  return hidden;
}

/**
 * F1 · one row per launchable manifest command, declaration order
 * preserved. The label is the palette title; the chord (core/
 * chordLabels) rides the description seat; the raw command id joins
 * as a keyword. The two doors stay out — a gate must not list itself.
 */
export function buildCommandItems(
  pkg: ManifestLike,
  chords: ReadonlyMap<string, string>,
): SearchItem[] {
  const hidden = hiddenPaletteCommands(pkg);
  const items: SearchItem[] = [];
  for (const c of pkg.contributes?.commands ?? []) {
    if (hidden.has(c.command)) { continue; }
    if (c.command === SEARCH_COMMAND || c.command === MENU_COMMAND) { continue; }
    const chord = chords.get(c.command);
    items.push({
      id: c.command,
      family: 'command',
      label: c.title,
      ...(chord !== undefined ? { chord } : {}),
      keywords: [c.command],
      declOrder: items.length,
      run: { command: c.command },
    });
  }
  return items;
}

/**
 * F2 · the add-task vocabulary as launch rows. Separators drop; every
 * row runs the existing `nika.addTask` with its verb/tool pinned, so
 * the gate inserts the exact skeleton the task palette would. The bare
 * tool name rides as a keyword (`jq` beats `◆ jq` for typing and for
 * did-you-mean alike).
 */
export function buildTaskItems(
  picks: readonly AddTaskPick[],
  startOrder: number,
): SearchItem[] {
  const items: SearchItem[] = [];
  for (const p of picks) {
    if (p.kind === 'separator' || p.verb === undefined) { continue; }
    const bare = p.tool?.replace(/^nika:/, '');
    items.push({
      id: p.tool !== undefined ? `task.add.${p.tool}` : `task.add.${p.verb}`,
      family: 'task',
      label: p.label,
      ...(p.description !== '' ? { detail: p.description } : {}),
      keywords: bare !== undefined ? [bare] : [p.verb],
      declOrder: startOrder + items.length,
      run: {
        command: 'nika.addTask',
        args: p.tool !== undefined ? [p.verb, p.tool] : [p.verb],
      },
    });
  }
  return items;
}

/** The full synchronous catalog · F1 then F2, one global declOrder. */
export function buildCatalog(
  pkg: ManifestLike,
  chords: ReadonlyMap<string, string>,
  picks: readonly AddTaskPick[],
): SearchItem[] {
  const commands = buildCommandItems(pkg, chords);
  return [...commands, ...buildTaskItems(picks, commands.length)];
}

// ─── The async families (F3 workflows · F4 runs — appended when ready) ─────

/** F3 rows the door offers · the mtime head of the one cached scan. */
export const WORKFLOWS_SEARCH_CAP = 50;

/** F4 rows the door offers · the cut hits the TAIL of the Runs-view
 *  order, so a paused run (which leads) always survives it. */
export const RUNS_SEARCH_CAP = 40;

/** What the door knows about one workflow file — facts only. The model
 *  never mints a Uri: `openArg` carries the door's handle opaquely into
 *  the accept step. */
export interface WorkflowSearchFact {
  fsPath: string;
  /** Workspace-relative (the door's asRelativePath) — the extra match
   *  surface for folder-qualified typing. */
  relPath: string;
  mtimeMs: number;
  /** The cached check verdict (the workflows tree's badge) — absent =
   *  unchecked, and the row claims nothing. */
  badge?: { kind: 'clean' } | { kind: 'findings'; count: number };
  openArg: unknown;
}

/** What the door knows about one recorded run — the runsView facts. */
export interface RunSearchFact {
  fsPath: string;
  mtimeMs: number;
  status: RunStatus;
  /** The journal's own workflow name, when the fold recovered one. */
  workflowName?: string;
  openArg: unknown;
}

function searchBasename(fsPath: string): string {
  const parts = fsPath.split(/[\\/]/);
  return parts[parts.length - 1] ?? fsPath;
}

/**
 * F3 · one row per workflow file, newest first (the mtime IS the
 * relevance prior — same law as the welcome recents). The detail
 * speaks the groupWorkflows state only when a check verdict is KNOWN
 * (`clean` · `N findings`); unchecked claims nothing. The row opens
 * the file.
 */
export function buildWorkflowItems(facts: readonly WorkflowSearchFact[]): SearchItem[] {
  return [...facts]
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((f, i) => ({
      id: `workflow.${f.fsPath}`,
      family: 'workflow' as const,
      label: searchBasename(f.fsPath),
      ...(f.badge !== undefined
        ? {
          detail: f.badge.kind === 'clean'
            ? 'clean'
            : `${f.badge.count} finding${f.badge.count === 1 ? '' : 's'}`,
        }
        : {}),
      keywords: [f.relPath],
      declOrder: i,
      run: { command: 'vscode.open', args: [f.openArg] },
    }));
}

const BUCKET_RANK: Record<RunBucket, number> = { now: 0, today: 1, yesterday: 2, earlier: 3 };

/**
 * F4 · the Runs view's own order, flattened: Now leads with paused
 * before running (needs-you outranks working — the bucketOf pin, so a
 * paused run from last week still tops the list), the calendar follows
 * newest-first. The status and the workflow name ride as keywords:
 * typing `paused` or the workflow's name finds the run. The row
 * replays the journal.
 */
export function buildRunItems(
  facts: readonly RunSearchFact[],
  nowMs: number,
  cap = RUNS_SEARCH_CAP,
): SearchItem[] {
  const rank = (f: RunSearchFact): number =>
    BUCKET_RANK[bucketOf({ fsPath: f.fsPath, mtimeMs: f.mtimeMs, status: f.status }, nowMs)];
  const pausedFirst = (s: RunStatus): number => (s === 'paused' ? 0 : 1);
  return [...facts]
    .sort((a, b) =>
      rank(a) - rank(b)
      || pausedFirst(a.status) - pausedFirst(b.status)
      || b.mtimeMs - a.mtimeMs)
    .slice(0, cap)
    .map((f, i) => ({
      id: `run.${f.fsPath}`,
      family: 'run' as const,
      label: searchBasename(f.fsPath),
      detail: [f.status, f.workflowName].filter((v) => v !== undefined).join(' · '),
      keywords: [f.status, ...(f.workflowName !== undefined ? [f.workflowName] : [])],
      declOrder: i,
      run: { command: 'nika.replayTrace', args: [f.openArg] },
    }));
}

/**
 * The whole catalog re-numbered (F1 F2 then F3 then F4): the async
 * families land in ANY order, and each landing re-merges so family
 * precedence (declOrder inside a tier) never depends on arrival.
 */
export function mergeCatalog(
  sync: readonly SearchItem[],
  workflows: readonly SearchItem[],
  runs: readonly SearchItem[],
): SearchItem[] {
  return [...sync, ...workflows, ...runs].map((it, i) => ({ ...it, declOrder: i }));
}

// ─── The resting screen (Raycast law 4: the empty query is a screen) ───────

/** The degradation headline the pill promised (core/statusTruth). */
export interface RestingTruth {
  severity: 'ok' | 'warn' | 'error';
  headline?: { label: string; description?: string; command: string };
}

/** Everything the journey head needs, gathered by the gate. */
export interface RestingDeps {
  truth: RestingTruth;
  stage: JourneyStage;
  /** Active nika filename, when one is focused. */
  active?: string;
  caps: { run: boolean; check: boolean; inspect: boolean; trace: boolean; examples: boolean };
}

const headRow = (
  command: string,
  label: string,
  description: string | undefined,
  chords: ReadonlyMap<string, string>,
  declOrder: number,
): SearchItem => {
  const chord = chords.get(command);
  return {
    id: command,
    family: 'command',
    label,
    ...(description !== undefined ? { detail: description } : {}),
    ...(chord !== undefined ? { chord } : {}),
    declOrder,
    run: { command },
  };
};

/**
 * The journey head — the old status-bar menu's opening sections
 * (Fix first · the next step per stage · the active file), fused into
 * one `Now` section. Same rows, same capability gates, same teaching
 * descriptions; the rest of that menu lives on as the catalog itself.
 */
export function buildRestingHead(
  deps: RestingDeps,
  chords: ReadonlyMap<string, string>,
): SearchItem[] {
  const rows: SearchItem[] = [];
  const add = (cond: boolean, command: string, label: string, description?: string): void => {
    if (!cond) { return; }
    rows.push(headRow(command, label, description, chords, rows.length));
  };

  // Fix first — a degraded lane outranks every journey step: the pill
  // warned, the head row IS the exact move it promised.
  const { truth } = deps;
  if (truth.severity !== 'ok' && truth.headline !== undefined && deps.stage !== 'noBinary') {
    add(true, truth.headline.command, truth.headline.label, truth.headline.description);
  }

  if (deps.stage === 'noBinary') {
    add(true, 'nika.finishSetup', '$(zap) Finish setup — install engine + wire everything', 'verified download · MCP · LSP · one gesture');
  } else if (deps.stage === 'unequipped') {
    add(true, 'nika.initProject', '$(rocket) Init this project', 'scaffold + agent rules + MCP — one gesture, skip-if-exists');
    add(deps.caps.examples, 'nika.runProof', '$(play) Run the 10-second proof', '01-hello · mock/echo · offline · zero keys');
  } else if (deps.stage === 'empty') {
    add(deps.caps.examples, 'nika.runProof', '$(play) Run the 10-second proof', '01-hello · mock/echo · offline · zero keys');
    add(true, 'nika.newSession', '$(comment-discussion) New session', 'wizard · describe · templates — the guided first workflow');
  } else if (deps.active !== undefined) {
    add(deps.caps.run, 'nika.runWorkflow', '$(play) Run', deps.active);
    add(deps.caps.check, 'nika.checkWorkflow', '$(check) Check', 'the audit, before a token is spent');
    add(deps.caps.inspect, 'nika.showDag', '$(type-hierarchy) Graph', 'the DAG canvas');
    add(!deps.caps.run && deps.caps.trace, 'nika.watchDemo', '$(play-circle) Watch demo replay', 'run ships with the engine runtime');
  }
  return rows;
}

/** The quiet footer — the lens deck taught where the canvas is
 *  offered, and the one earned ask (#498 doctrine: never a toast). */
export function buildRestingFoot(caps: { inspect: boolean }): SearchItem[] {
  const rows: SearchItem[] = [];
  if (caps.inspect) {
    rows.push({
      id: 'nika.showDag',
      family: 'command',
      label: '$(layers) Canvas lenses: T timeline · P audit · D dataflow · X what-if · H heatmap',
      detail: 'press the key on the canvas — one graph, five lenses',
      declOrder: 0,
      run: { command: 'nika.showDag' },
    });
  }
  rows.push({
    id: 'nika.starOnGitHub',
    family: 'command',
    label: '$(star) Star nika on GitHub',
    detail: 'supernovae-st/nika — it helps others find it',
    declOrder: rows.length,
    run: { command: 'nika.starOnGitHub' },
  });
  return rows;
}

// ─── The screen (what the QuickPick shows for a query) ─────────────────────

/** One display row · a separator or a launchable item. */
export type GateRow =
  | { kind: 'separator'; label: string }
  | { kind: 'item'; item: SearchItem };

const sep = (label: string): GateRow => ({ kind: 'separator', label });
const row = (item: SearchItem): GateRow => ({ kind: 'item', item });

/**
 * The whole screen for a query. Empty query = the resting screen (the
 * journey head under `Now`, the catalog habits-first under
 * `Everything`, the quiet footer). A typed query = the ranked list
 * alone. Zero matches = the ranked fallback rows, query as argument
 * (the no-dead-ends law) — did-you-mean corrects against every label
 * and keyword the catalog knows.
 */
export function gateScreen(
  q: string,
  catalog: readonly SearchItem[],
  head: readonly SearchItem[],
  foot: readonly SearchItem[],
  frec: FrecencyStore,
  nowMs: number,
): GateRow[] {
  const qn = q.trim();
  if (qn.length === 0) {
    const rows: GateRow[] = [];
    if (head.length > 0) {
      rows.push(sep('Now'), ...head.map(row));
    }
    rows.push(sep('Everything'), ...rankSearch('', catalog, frec, nowMs).map(row));
    if (foot.length > 0) {
      rows.push(sep(''), ...foot.map(row));
    }
    return rows;
  }
  const ranked = rankSearch(qn, catalog, frec, nowMs);
  if (ranked.length > 0) { return ranked.map(row); }
  const vocabulary = catalog.flatMap((it) => [it.label, ...(it.keywords ?? [])]);
  return fallbacksFor(qn, vocabulary).map(row);
}

/**
 * The accept step, pure: record the habit, name the launch. Every row
 * passes its args through — the history fallback included: since PR-3
 * `nika.runHistory` understands a string query (typeof-guarded), so
 * the q finally rides into the view as its initial filter.
 */
export function acceptPick(
  store: FrecencyStore,
  item: SearchItem,
  nowMs: number,
): { store: FrecencyStore; command: string; args: readonly unknown[] } {
  return {
    store: visit(store, item.id, nowMs),
    command: item.run.command,
    args: item.run.args ?? [],
  };
}
