// runsView.ts — the flight-recorder surface: traces tree + DAG replay.
//
// Lists `.nika/traces/*.ndjson` (workspace-wide), folds each into a run
// card (status · tasks · duration · cost), and replays a selected run
// through the DAG webview — replay = re-render, NEVER re-execute (the
// engine's own `trace replay` law).

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { foldTrace, summarizeRun, type RunModel } from '../core/traceFold';
import type { DagGraph, DagPanel, TaskStatus } from '../dagPanel';
import type { NikaService } from '../nikaService';

interface TraceFile {
  uri: vscode.Uri;
  mtimeMs: number;
  model: RunModel;
}

/**
 * Mean SUCCESS duration per task across recorded traces of THIS graph.
 * Traces carry no workflow name — membership uses the same majority-
 * overlap gate as the live overlay (≥60% of a trace's task ids exist in
 * the graph). Newest 12 traces only; the canvas card shows `avg · n`.
 */
export async function collectTaskAverages(
  graphIds: Set<string>,
): Promise<Map<string, { avgMs: number; runs: number }>> {
  const out = new Map<string, { avgMs: number; runs: number }>();
  if (graphIds.size === 0) { return out; }
  const glob = vscode.workspace.getConfiguration('nika').get<string>('traces.glob', '**/.nika/traces/*.ndjson');
  let files: vscode.Uri[];
  try {
    files = await vscode.workspace.findFiles(glob, '**/node_modules/**', 60);
  } catch {
    return out;
  }
  const newest = files
    .map((uri) => {
      try {
        return { uri, mtimeMs: fs.statSync(uri.fsPath).mtimeMs };
      } catch {
        return undefined;
      }
    })
    .filter((f): f is { uri: vscode.Uri; mtimeMs: number } => f !== undefined)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 12);

  const sums = new Map<string, { total: number; n: number }>();
  for (const f of newest) {
    let model: RunModel;
    try {
      model = foldTrace(fs.readFileSync(f.uri.fsPath, 'utf-8'));
    } catch {
      continue;
    }
    const ids = [...model.tasks.keys()];
    if (ids.length === 0) { continue; }
    const overlap = ids.filter((id) => graphIds.has(id)).length / ids.length;
    if (overlap < 0.6) { continue; }
    for (const [id, task] of model.tasks) {
      if (task.status !== 'success' || task.durationMs === undefined) { continue; }
      const cur = sums.get(id) ?? { total: 0, n: 0 };
      cur.total += task.durationMs;
      cur.n += 1;
      sums.set(id, cur);
    }
  }
  for (const [id, { total, n }] of sums) {
    if (n > 0) { out.set(id, { avgMs: Math.round(total / n), runs: n }); }
  }
  return out;
}

class TraceItem extends vscode.TreeItem {
  constructor(readonly trace: TraceFile) {
    super(path.basename(trace.uri.fsPath), vscode.TreeItemCollapsibleState.Collapsed);
    this.description = summarizeRun(trace.model);
    this.contextValue = 'nikaTrace';
    this.iconPath = new vscode.ThemeIcon(
      trace.model.workflowStatus === 'completed' ? 'pass-filled'
      : trace.model.workflowStatus === 'failed' ? 'error'
      : trace.model.workflowStatus === 'cancelled' ? 'circle-slash'
      : 'pulse',
    );
    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(`**${path.basename(trace.uri.fsPath)}** — ${trace.model.workflowStatus}\n\n`);
    const tasks = [...trace.model.tasks.values()];
    const ok = tasks.filter((t) => t.status === 'success').length;
    const bad = tasks.filter((t) => t.status === 'failed').length;
    md.appendMarkdown(`${summarizeRun(trace.model)}\n\n`);
    if (ok > 0) { md.appendMarkdown(`$(check) ${ok} succeeded  `); }
    if (bad > 0) { md.appendMarkdown(`$(x) ${bad} failed  `); }
    const retries = tasks.reduce((acc, t) => acc + t.retries, 0);
    if (retries > 0) { md.appendMarkdown(`$(sync) ${retries} retr${retries === 1 ? 'y' : 'ies'}  `); }
    if (trace.model.unknownLines > 0) {
      md.appendMarkdown(`\n\n$(warning) ${trace.model.unknownLines} unparsed line${trace.model.unknownLines === 1 ? '' : 's'} (foreign dialect?)`);
    }
    md.appendMarkdown(`\n\n_click to replay — re-render, never re-execute_`);
    this.tooltip = md;
    this.command = {
      command: 'nika.replayTrace',
      title: 'Replay',
      arguments: [trace.uri],
    };
  }
}

class TraceTaskItem extends vscode.TreeItem {
  constructor(taskId: string, status: string, durationMs?: number, retries?: number) {
    super(taskId, vscode.TreeItemCollapsibleState.None);
    const dur = durationMs !== undefined
      ? durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`
      : undefined;
    this.description = [status, dur, retries ? `↻${retries}` : undefined]
      .filter(Boolean)
      .join(' · ');
    this.iconPath = new vscode.ThemeIcon(
      status === 'success' ? 'check'
      : status === 'failed' ? 'x'
      : status === 'skipped' ? 'debug-step-over'
      // §3.1: cancelled is a decision, not a defect — never the error icon.
      : status === 'cancelled' ? 'circle-slash'
      : status === 'retrying' ? 'sync'
      : status === 'running' ? 'sync'
      : 'circle-outline',
    );
  }
}

export class RunsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element instanceof TraceItem) {
      return [...element.trace.model.tasks.values()].map(
        (t) => new TraceTaskItem(t.id, t.status, t.durationMs, t.retries),
      );
    }
    if (element) { return []; }

    const glob = vscode.workspace.getConfiguration('nika').get<string>(
      'traces.glob',
      '**/.nika/traces/*.ndjson',
    );
    const files = await vscode.workspace.findFiles(glob, '**/node_modules/**', 100);
    const traces: TraceFile[] = [];
    for (const uri of files) {
      try {
        const stat = fs.statSync(uri.fsPath);
        const content = fs.readFileSync(uri.fsPath, 'utf-8');
        traces.push({ uri, mtimeMs: stat.mtimeMs, model: foldTrace(content) });
      } catch {
        // unreadable trace — skip, never fail the tree
      }
    }
    traces.sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (traces.length === 0) {
      const empty = new vscode.TreeItem('No traces yet — runs write .nika/traces/*.ndjson');
      empty.iconPath = new vscode.ThemeIcon('info');
      return [empty];
    }
    return traces.map((t) => new TraceItem(t));
  }
}

// One replay at a time: starting a new one cancels the previous timers —
// otherwise two replays interleave status updates on the same panel.
let activeReplayTimers: Array<ReturnType<typeof setTimeout>> = [];

export function cancelActiveReplay(): void {
  for (const t of activeReplayTimers) { clearTimeout(t); }
  activeReplayTimers = [];
}

/**
 * LIVE overlay: fold the (growing) trace and paint current statuses onto
 * the open DAG — no animation, the trace IS the present. Fired by the
 * traces watcher while an engine writes a run. Returns false when the
 * trace does not match the displayed graph (majority-id overlap rule).
 */
export function overlayTraceOntoDag(dagPanel: DagPanel, traceUri: vscode.Uri): boolean {
  if (!dagPanel.hasPanel) { return false; }
  const ids = dagPanel.currentGraphIds();
  if (!ids || ids.size === 0) { return false; }

  let model: RunModel;
  try {
    model = foldTrace(fs.readFileSync(traceUri.fsPath, 'utf-8'));
  } catch {
    return false;
  }
  if (model.tasks.size === 0) { return false; }

  const overlap = [...model.tasks.keys()].filter((id) => ids.has(id)).length;
  if (overlap < Math.ceil(model.tasks.size / 2)) { return false; }

  // Live state wins over any replay animation in progress.
  cancelActiveReplay();
  dagPanel.batchUpdateStatus(
    [...model.tasks.values()].map((t) => ({
      taskId: t.id,
      status: t.status as TaskStatus,
      durationMs: t.durationMs,
    })),
  );
  return true;
}

/**
 * Animate a folded run through the DAG panel. Timeline timestamps are
 * compressed by `speed` (engine default: 6× faster than recorded) and the
 * whole replay is clamped to ~20s so giant runs stay watchable.
 */
export async function replayIntoDag(
  dagPanel: DagPanel,
  service: NikaService,
  traceUri: vscode.Uri,
  activeDoc: vscode.TextDocument | undefined,
): Promise<void> {
  const content = fs.readFileSync(traceUri.fsPath, 'utf-8');
  const model = foldTrace(content);
  if (model.tasks.size === 0) {
    void vscode.window.showWarningMessage('Nika: this trace contains no task events.');
    return;
  }

  // Prefer the active workflow's real DAG when its task ids overlap the
  // trace; otherwise synthesize nodes from the trace itself (edges unknown).
  let graph: DagGraph | undefined;
  if (activeDoc) {
    const candidate = await service.dagForDocument(activeDoc);
    const ids = new Set(candidate.nodes.map((n) => n.id));
    const overlap = [...model.tasks.keys()].filter((id) => ids.has(id)).length;
    if (overlap >= Math.ceil(model.tasks.size / 2)) {
      graph = candidate;
    }
  }
  graph ??= {
    workflowName: path.basename(traceUri.fsPath).replace(/\.ndjson$/, ''),
    nodes: [...model.tasks.values()].map((t) => ({
      id: t.id,
      label: t.id,
      verb: 'invoke',
      status: 'pending' as TaskStatus,
      dependsOn: [] as string[],
    })),
    edges: [],
  };

  // Reset all node states to pending, show, then hand the timeline to
  // the webview SCRUBBER: the user scrubs/plays (LangGraph time-travel),
  // the DAG state at any instant computed locally — no timer round-trips.
  cancelActiveReplay();
  for (const n of graph.nodes) { n.status = 'pending'; n.durationMs = undefined; }
  dagPanel.show(graph);

  if (model.timeline.length === 0) {
    void vscode.window.showWarningMessage('Nika: this trace has no timeline to replay.');
    return;
  }
  const speed = vscode.workspace.getConfiguration('nika').get<number>('replay.speed', 6);
  dagPanel.loadReplay(model.timeline, path.basename(traceUri.fsPath).replace(/\.ndjson$/, ''), speed);
}
