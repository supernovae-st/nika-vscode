// runsView.ts — the flight-recorder surface: traces tree + DAG replay.
//
// Lists `.nika/traces/*.ndjson` (workspace-wide), folds each into a run
// card (status · tasks · duration · cost), and replays a selected run
// through the DAG webview — replay = re-render, NEVER re-execute (the
// engine's own `trace replay` law).

import * as vscode from 'vscode';
import * as fs from 'fs';
import { createHash } from 'crypto';
import * as path from 'path';
import { foldTrace, humanizeDuration, summarizeRun, type RunModel } from '../core/traceFold';
import { verifyChain, type ChainVerdict } from '../core/chainVerify';
import { parseTraceOutputs } from '../core/xray';
import { extractRunArtifacts, humanBytes, type RunArtifact } from '../core/artifacts';
import { attemptLadders, renderLadder, type Attempt } from '../core/attempts';
import { diffRuns, summarizeDiff, type TaskDiff } from '../core/runDiff';
import { buildTraceTimeline } from '../core/traceTimeline';
import { traceStore } from '../core/traceStore';
import type { DagGraph, DagPanel, TaskStatus } from '../dagPanel';
import type { NikaService } from '../nikaService';

interface TraceFile {
  uri: vscode.Uri;
  mtimeMs: number;
  /** Cache-key twin of mtime — breaks same-mtime-tick append ties. */
  sizeBytes: number;
  /** The tamper-evidence walk (engine 0.96+ · client twin of
   *  `nika trace verify`) — broken gets marked, unchained stays silent. */
  chain: ChainVerdict;
  model: RunModel;
  /** Media/file outputs recovered from the raw trace (assets-not-blobs). */
  artifacts: Map<string, RunArtifact[]>;
  /** Per-task retry ladders — the « why did this fail » story. */
  ladders: Map<string, Attempt[]>;
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
    // A broken chain outranks the run verdict: an unverified journal's
    // "completed" is itself unverified (Proof Arc P2).
    this.iconPath = trace.chain.kind === 'broken'
      ? new vscode.ThemeIcon('shield', new vscode.ThemeColor('problemsWarningIcon.foreground'))
      : new vscode.ThemeIcon(
          trace.model.workflowStatus === 'completed' ? 'pass-filled'
          : trace.model.workflowStatus === 'failed' ? 'error'
          : trace.model.workflowStatus === 'cancelled' ? 'circle-slash'
          // ADR-099 durable pause — waiting on an answer, not live, not dead.
          : trace.model.workflowStatus === 'paused' ? 'debug-pause'
          : 'pulse',
        );
    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(`**${path.basename(trace.uri.fsPath)}** — ${trace.model.workflowStatus}\n\n`);
    if (trace.chain.kind === 'broken') {
      md.appendMarkdown(
        `$(shield) **chain BROKEN at line ${trace.chain.line}** — this journal fails \`nika trace verify\`; its claims are unverified\n\n`,
      );
    } else if (trace.chain.kind === 'intact' || trace.chain.kind === 'torn') {
      // The anchor UX: this head should MATCH the one the run printed
      // (`trace: … · chain <head16>`) — scrollback vs journal, closed.
      md.appendMarkdown(
        `$(verified-filled) chain intact — head \`${trace.chain.head.slice(0, 16)}\`${trace.chain.kind === 'torn' ? ' (final line torn — crash, not tampering)' : ''}\n\n`,
      );
    }
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
  constructor(
    readonly taskId: string,
    status: string,
    durationMs?: number,
    retries?: number,
    readonly artifacts: RunArtifact[] = [],
    /** The trace this row belongs to — fork-from-step needs both halves. */
    readonly traceUri?: vscode.Uri,
    /** The attempt story (retries · details) — tooltip when present. */
    ladder: Attempt[] = [],
    /** The 0.95+ WHY: `gate false: <cel>` or `blocked by <id>`. */
    why?: string,
  ) {
    super(
      taskId,
      artifacts.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    const dur = durationMs !== undefined
      ? durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`
      : undefined;
    this.description = [
      status,
      dur,
      retries ? `↻${retries}` : undefined,
      why,
      artifacts.length > 0 ? `${artifacts.length} artifact${artifacts.length > 1 ? 's' : ''}` : undefined,
    ]
      .filter(Boolean)
      .join(' · ');
    this.contextValue = 'nikaTraceTask';
    if (ladder.length > 0) {
      const md = new vscode.MarkdownString(undefined, true);
      md.appendMarkdown(`**${taskId}** — the attempt story\n\n`);
      for (const line of renderLadder(ladder)) {
        md.appendMarkdown(`${line}\n\n`);
      }
      md.appendMarkdown('_⑂ fork from here re-runs this task with upstream rehydrated._');
      this.tooltip = md;
    }
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

/**
 * One recovered output on disk — click opens it in the editor's own
 * viewer (image preview · audio player · text). The tooltip carries the
 * provenance link nobody ships: artifact ↔ producing task ↔ model.
 */
class ArtifactItem extends vscode.TreeItem {
  constructor(a: RunArtifact, traceUri?: vscode.Uri) {
    super(path.basename(a.path), vscode.TreeItemCollapsibleState.None);
    // Recorded paths are usually run-cwd relative. The run cwd for
    // `<cwd>/.nika/traces/x.ndjson` is the trace dir's grandparent —
    // try it first, then the workspace roots. An artifact that resolves
    // NOWHERE says so instead of opening a phantom.
    const candidates = path.isAbsolute(a.path)
      ? [a.path]
      : [
        ...(traceUri ? [path.join(path.dirname(path.dirname(path.dirname(traceUri.fsPath))), a.path)] : []),
        ...(vscode.workspace.workspaceFolders ?? []).map((f) => path.join(f.uri.fsPath, a.path)),
      ];
    const resolved = candidates.find((c) => {
      try { return fs.existsSync(c); } catch { return false; }
    });
    this.description = [
      a.label,
      a.bytes !== undefined ? humanBytes(a.bytes) : undefined,
      a.durationMs !== undefined ? `${(a.durationMs / 1000).toFixed(1)}s` : undefined,
      resolved === undefined ? 'missing on disk' : undefined,
    ].filter(Boolean).join(' · ');
    this.iconPath = new vscode.ThemeIcon(
      resolved === undefined ? 'warning'
      : a.kind === 'image' ? 'file-media'
      : a.kind === 'audio' ? 'music'
      : 'file',
    );
    this.contextValue = 'nikaArtifact';
    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(`**${path.basename(a.path)}**\n\n`);
    md.appendMarkdown(`produced by \`${a.taskId}\``);
    if (a.model || a.provider) {
      const origin = a.model && a.provider && !a.model.startsWith(`${a.provider}/`)
        ? `${a.provider}/${a.model}`
        : (a.model ?? a.provider);
      md.appendMarkdown(` · ${origin}`);
    }
    md.appendMarkdown(`\n\n\`${a.path}\``);
    if (resolved === undefined) {
      md.appendMarkdown('\n\n$(warning) recorded here, but not found on disk (moved or cleaned?)');
    }
    this.tooltip = md;
    if (resolved !== undefined) {
      this.resourceUri = vscode.Uri.file(resolved);
      this.command = { command: 'vscode.open', title: 'Open', arguments: [this.resourceUri] };
    }
  }
}

export class RunsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  /** fsPath → parsed trace, keyed by mtime — a tree refresh must not
   *  re-read and re-fold every journal on disk (3 passes × N traces). */
  private readonly parsed = new Map<string, TraceFile>();

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element instanceof TraceItem) {
      return [...element.trace.model.tasks.values()].map(
        (t) => new TraceTaskItem(
          t.id, t.status, t.durationMs, t.retries,
          element.trace.artifacts.get(t.id) ?? [],
          element.trace.uri,
          element.trace.ladders.get(t.id) ?? [],
          t.whyWhen !== undefined ? `gate false: ${t.whyWhen}`
            : t.blockedBy !== undefined ? `blocked by ${t.blockedBy}` : undefined,
        ),
      );
    }
    if (element instanceof TraceTaskItem) {
      return element.artifacts.map((a) => new ArtifactItem(a, element.traceUri));
    }
    if (element) { return []; }

    const glob = vscode.workspace.getConfiguration('nika').get<string>(
      'traces.glob',
      '**/.nika/traces/*.ndjson',
    );
    const files = await vscode.workspace.findFiles(glob, '**/node_modules/**', 100);
    const traces: TraceFile[] = [];
    const seen = new Set<string>();
    for (const uri of files) {
      try {
        const stat = fs.statSync(uri.fsPath);
        seen.add(uri.fsPath);
        const cached = this.parsed.get(uri.fsPath);
        // mtime ALONE misses same-tick appends on coarse-mtime filesystems
        // (FAT/NFS/SMB · the final workflow_completed line landing within
        // the same second) — size breaks the tie for free.
        if (cached && cached.mtimeMs === stat.mtimeMs && cached.sizeBytes === stat.size) {
          traces.push(cached);
          continue;
        }
        const content = fs.readFileSync(uri.fsPath, 'utf-8');
        const entry: TraceFile = {
          uri,
          mtimeMs: stat.mtimeMs,
          sizeBytes: stat.size,
          chain: verifyChain(content),
          model: foldTrace(content),
          artifacts: extractRunArtifacts(content),
          ladders: attemptLadders(content),
        };
        this.parsed.set(uri.fsPath, entry);
        traces.push(entry);
      } catch {
        // unreadable trace — skip, never fail the tree
      }
    }
    // Deleted traces must not pin their parse forever.
    for (const key of [...this.parsed.keys()]) {
      if (!seen.has(key)) { this.parsed.delete(key); }
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

/**
 * LIVE overlay: fold the (growing) trace and paint current statuses onto
 * the open DAG — no animation, the trace IS the present. Fired by the
 * traces watcher while an engine writes a run. Returns false when the
 * trace does not match the displayed graph (majority-id overlap rule).
 */
let activeReplayTimers: Array<ReturnType<typeof setTimeout>> = [];

export function cancelActiveReplay(): void {
  for (const t of activeReplayTimers) { clearTimeout(t); }
  activeReplayTimers = [];
}

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

  // Live state wins over any replay transport in progress.
  dagPanel.clearTransport();
  // Live state wins over any replay in progress. cancelActiveReplay()
  // only stops the legacy extension-driven step timers — the webview's
  // own Replayer (the scrubber) must be ended too, or the next rAF tick
  // clobbers the live status back to the historical frame.
  cancelActiveReplay();
  dagPanel.endReplay();
  dagPanel.batchUpdateStatus(
    [...model.tasks.values()].map((t) => ({
      taskId: t.id,
      status: t.status as TaskStatus,
      durationMs: t.durationMs,
      cached: t.cached,
      outputPreview: t.outputPreview,
    })),
  );
  // The overlap gate just PROVED this trace belongs to the displayed
  // workflow — feed the editor surfaces the same fold, keyed on the file.
  // (Synthesized graphs carry no URI and publish nothing.)
  const workflowUri = dagPanel.currentWorkflowUri();
  if (workflowUri) {
    traceStore.set(vscode.Uri.parse(workflowUri).fsPath, model);
  }
  return true;
}

/**
 * Replay a folded run through the DAG panel via the webview transport
 * (the platine): the trace is normalized once (core/traceTimeline) and
 * shipped whole — the webview plays/scrubs it LOCALLY, zero round-trips
 * per frame. Recorded time is compressed by `speed` (engine default 6×,
 * capped ~20s) at playback; every displayed fact stays the recorded one.
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
  let traceMatchesActiveDoc = false;
  if (activeDoc) {
    const candidate = await service.dagForDocument(activeDoc);
    const ids = new Set(candidate.nodes.map((n) => n.id));
    const overlap = [...model.tasks.keys()].filter((id) => ids.has(id)).length;
    if (overlap >= Math.ceil(model.tasks.size / 2)) {
      graph = candidate;
      traceMatchesActiveDoc = true;
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

  // Drift truth (0.95+ journals): the run recorded WHICH definition ran —
  // when the file on disk no longer matches, say so up front. The canvas
  // shows today's graph; the statuses tell that run's story.
  // Only when the trace BELONGS to the active doc (majority overlap) —
  // hashing an unrelated workflow's file against this run's sha would
  // claim drift on a surface whose whole point is truth.
  if (traceMatchesActiveDoc && model.workflowSha256 !== undefined && activeDoc?.uri.scheme === 'file') {
    try {
      const cur = createHash('sha256').update(fs.readFileSync(activeDoc.uri.fsPath)).digest('hex');
      if (cur !== model.workflowSha256) {
        dagPanel.note('≠', 'definition drifted since this run — the canvas shows today\'s file, the statuses show that run', undefined, 'st-retrying');
      }
    } catch {
      // unreadable file — no claim
    }
  }

  // Reset all node states to pending, show, then hand over the timeline.
  // Reset all node states to pending, show, then hand the timeline to
  // the webview SCRUBBER: the user scrubs/plays (LangGraph time-travel),
  // the DAG state at any instant computed locally — no timer round-trips.
  cancelActiveReplay();
  for (const n of graph.nodes) { n.status = 'pending'; n.durationMs = undefined; }
  dagPanel.show(graph);

  const timeline = buildTraceTimeline(model);
  if (!timeline) {
    // No usable real clock in the trace — paint the verdict directly.
    dagPanel.batchUpdateStatus(
      [...model.tasks.values()].map((t) => ({
        taskId: t.id,
        status: t.status as TaskStatus,
        durationMs: t.durationMs,
      })),
    );
    return;
  }

  const speed = vscode.workspace.getConfiguration('nika').get<number>('replay.speed', 6);
  dagPanel.loadTransport(timeline, { speed, autoPlay: true });
}

/**
 * Compare two recorded runs and paint the verdict on the DAG — the
 * "why is this run 3x slower" answer. BASE is the reference (usually
 * older), COMPARE is the run under scrutiny; badges read as
 * compare-vs-base. Same majority-overlap gate as the overlay: the diff
 * paints the graph the panel is SHOWING or nothing at all.
 */
export function diffTracesOntoDag(
  dagPanel: DagPanel,
  baseUri: vscode.Uri,
  compareUri: vscode.Uri,
): boolean {
  if (!dagPanel.hasPanel) { return false; }
  const ids = dagPanel.currentGraphIds();
  if (!ids || ids.size === 0) { return false; }

  let base: RunModel;
  let compare: RunModel;
  let baseOutputs: Map<string, unknown>;
  let compareOutputs: Map<string, unknown>;
  try {
    const baseRaw = fs.readFileSync(baseUri.fsPath, 'utf-8');
    const compareRaw = fs.readFileSync(compareUri.fsPath, 'utf-8');
    base = foldTrace(baseRaw);
    compare = foldTrace(compareRaw);
    baseOutputs = parseTraceOutputs(baseRaw);
    compareOutputs = parseTraceOutputs(compareRaw);
  } catch {
    return false;
  }
  if (base.tasks.size === 0 || compare.tasks.size === 0) { return false; }

  const seen = new Set([...base.tasks.keys(), ...compare.tasks.keys()]);
  const overlap = [...seen].filter((id) => ids.has(id)).length;
  if (overlap < Math.ceil(seen.size / 2)) { return false; }

  const diff = diffRuns(base, compare, { base: baseOutputs, compare: compareOutputs });

  // The COMPARE run's statuses become the painted state (its story), the
  // badges carry the movement vs base.
  dagPanel.clearTransport();
  dagPanel.batchUpdateStatus(
    [...compare.tasks.values()].map((t) => ({
      taskId: t.id,
      status: t.status as TaskStatus,
      durationMs: t.durationMs,
    })),
  );
  dagPanel.loadDiff(
    diff.tasks
      .filter((t) => t.kind !== 'same')
      .map((t) => ({ taskId: t.id, verdict: t.kind, badge: diffBadge(t) })),
  );

  const baseName = path.basename(baseUri.fsPath);
  const compareName = path.basename(compareUri.fsPath);
  dagPanel.note('Δ', `diff ${compareName} vs ${baseName} — ${summarizeDiff(diff)}`, undefined, 'st-note');
  // The debugging entry point: the FIRST task whose story changed —
  // everything downstream of it is suspect. Named and centered.
  if (diff.firstDivergentId !== undefined) {
    dagPanel.note('⟂', `first divergence: ${diff.firstDivergentId} — downstream is suspect`, diff.firstDivergentId, 'st-note');
    dagPanel.focusNode(diff.firstDivergentId);
  }
  // Narrate the top movers (the sorted head IS the ranking).
  for (const t of diff.tasks.slice(0, 3)) {
    if (t.kind === 'same') { break; }
    dagPanel.note('·', `${t.id} ${diffBadge(t)}`, t.id, 'st-note');
  }
  return true;
}

function diffBadge(t: TaskDiff): string {
  switch (t.kind) {
    case 'slower':
      return t.deltaPct !== undefined
        ? `+${Math.round(t.deltaPct)}%`
        : `+${humanizeDuration(t.deltaMs ?? 0)}`;
    case 'faster':
      return t.deltaPct !== undefined
        ? `${Math.round(t.deltaPct)}%`
        : `-${humanizeDuration(Math.abs(t.deltaMs ?? 0))}`;
    case 'status-changed':
      return `${t.statusFrom} to ${t.statusTo}`;
    case 'output-changed':
      return '≠ output';
    case 'added':
      return 'new';
    case 'removed':
      return 'gone';
    default:
      return '';
  }
}
