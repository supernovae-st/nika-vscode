// dagPanel.ts — WebviewPanel provider for DAG visualization
//
// Manages the VS Code webview panel lifecycle: creation, CSP, nonce generation,
// asset URIs, postMessage typed protocol, state serialization/restoration.

import * as vscode from 'vscode';
import * as crypto from 'crypto';

// ─── Typed Message Protocol ──────────────────────────────────────────────────
// Discriminated union: every message has a `kind` field.
// Extension -> Webview messages:
//
// The DAG shapes live in core/cliContract.ts (ONE contract across the CLI
// `graph --format json` adapter, this panel, and the webview mirror).

import type { DagGraph, TaskStatus, ToolMeta } from './core/cliContract';
import type { TraceTimeline } from './core/traceTimeline';
import type { TimelineEntry } from './core/traceFold';

export type { DagEdge, DagGraph, DagNode, TaskStatus } from './core/cliContract';

// Extension -> Webview
export type ExtToWebviewMessage =
  | { kind: 'dag:load'; graph: DagGraph; toolCats?: Record<string, ToolMeta> }
  // Recorded media artifacts landing ON the cards (run close · replay) —
  // `src` is webview-safe, `path` host-absolute for the open jump.
  | { kind: 'dag:artifacts'; artifacts: CardArtifact[] }
  | { kind: 'dag:updateStatus'; taskId: string; status: TaskStatus; durationMs?: number; usd?: number; cached?: boolean; recoveredFrom?: string; outputPreview?: string; failPreview?: string; whyWhen?: string; blockedBy?: string; pausedQuestion?: string; agent?: import('./core/traceFold').AgentFacts }
  | { kind: 'dag:timeline'; data: import('./core/timelineModel').TimelineData }
  | { kind: 'dag:batchUpdateStatus'; updates: Array<{ taskId: string; status: TaskStatus; durationMs?: number; usd?: number; cached?: boolean; recoveredFrom?: string; outputPreview?: string; failPreview?: string; whyWhen?: string; blockedBy?: string; pausedQuestion?: string; agent?: import('./core/traceFold').AgentFacts }> }
  | { kind: 'dag:focus'; taskId: string }
  | { kind: 'dag:cursorHint'; taskId: string | null }
  | { kind: 'dag:lineage'; taskId: string | null }
  | { kind: 'dag:preflight'; chip: { text: string; cls: string; tip: string } | null }
  | { kind: 'dag:note'; icon: string; text: string; taskId?: string; cls?: string }
  | { kind: 'dag:clear' }
  | { kind: 'dag:fitToView' }
  | { kind: 'theme:changed' }
  | { kind: 'theme:mode'; mode: 'nika' | 'editor' | 'phosphor' | 'auto' }
  // The platine: a normalized trace timeline the webview transport
  // plays/scrubs LOCALLY — zero round-trips per frame.
  | { kind: 'transport:load'; timeline: TraceTimeline; speed?: number; autoPlay?: boolean }
  | { kind: 'transport:clear' }
  // Run-diff: per-task verdicts painted over the CURRENT graph (data-attrs,
  // so live status repaints never wipe them). Badges are pre-formatted
  // extension-side -- the webview stays dumb about diff semantics.
  | { kind: 'diff:load'; entries: Array<{ taskId: string; verdict: string; badge: string }> }
  | { kind: 'diff:clear' }
  // Live-run heartbeat — `■ 3/7` on the stop button while tasks settle.
  | { kind: 'run:progress'; done: number; total: number }
  // Run close — the verdict banner (the summary made visible without
  // opening the feed): icon + one summarizeRun line + status class.
  | { kind: 'run:verdict'; icon: string; text: string; cls: string }
  // Live-run lifecycle — the toolbar flips ▶/■ on this (replayed on
  // dag:ready so a reloaded panel keeps the truthful state).
  | { kind: 'run:state'; running: boolean }
  // Dirty-nodes refresh (badges only — run statuses stay painted).
  | { kind: 'dag:stale'; stale: string[]; direct: string[] }
  // Per-card audit rollup from a completed check (⚠N badges).
  | { kind: 'dag:audit'; audits: Array<{ taskId: string; count: number; worst: 'error' | 'warning' | 'info' }> }
  // Static cost forecast for the run pill (label · tooltip · unbounded).
  | { kind: 'dag:cost'; forecast: { label: string; tooltip: string; unbounded: boolean; delta?: { label: string; tooltip: string; up: boolean } } | null }
  // Time-travel: hand the whole timeline to the webview scrubber (it
  // computes DAG state at any instant locally — 60fps, zero round-trips).
  | { kind: 'dag:replayLoad'; timeline: TimelineEntry[]; label: string; speed: number }
  // Dismiss the scrubber (a fresh graph load or a live run supersedes it).
  | { kind: 'dag:replayEnd' }
  // The welcome (empty canvas): recent workflows for the resume list.
  | { kind: 'welcome:data'; recent: Array<{ name: string; uri: string; rel: string }>; binaryMissing?: boolean };

// Webview -> Extension
// nodeClicked carries the workflowUri from the webview's OWN persisted
// graph — node-jumps keep working on panels restored across restarts,
// where the extension-side closure URI no longer exists.
export type WebviewToExtMessage =
  | { kind: 'dag:ready' }
  | { kind: 'dag:nodeClicked'; taskId: string; workflowUri?: string }
  | { kind: 'dag:nodeDoubleClicked'; taskId: string; workflowUri?: string }
  | { kind: 'dag:requestRefresh' }
  | { kind: 'dag:showActive' }
  // A card's ⚠N badge was clicked — open the full pre-flight report.
  | { kind: 'dag:openReport' }
  // Empty-state actions — scaffold a workflow · open the walkthrough.
  | { kind: 'dag:newWorkflow' }
  | { kind: 'dag:openWalkthrough' }
  | { kind: 'transport:tick'; running: string[] }
  | { kind: 'dag:openPreflight' }
  // Graph editing (the n8n loop) — every edit lands in the YAML source.
  | { kind: 'dag:addTask'; afterTaskId: string | null; workflowUri?: string; verb?: string; tool?: string }
  | { kind: 'dag:connect'; from: string; to: string; workflowUri?: string }
  | { kind: 'dag:disconnect'; from: string; to: string; workflowUri?: string }
  | { kind: 'dag:deleteTask'; taskId: string; workflowUri?: string }
  | { kind: 'dag:duplicateTask'; taskId: string; workflowUri?: string }
  // Insert-on-edge (the + riding a hovered dependency wire): splice a
  // new task INTO from→to — skeleton after `from`, edge rerouted.
  | { kind: 'dag:insertOnEdge'; from: string; to: string; workflowUri?: string; verb?: string; tool?: string }
  // Canvas params bar — the model chip edits the YAML via QuickPick.
  | { kind: 'dag:editModel'; taskId: string; workflowUri?: string }
  // Omnibar — `+ verb [after id]` adds; anything else routes to generate.
  | { kind: 'dag:omni'; text: string; workflowUri?: string }
  // Run controls — the canvas drives the run without leaving the panel.
  | { kind: 'dag:runRequest'; preview?: boolean; resume?: boolean; workflowUri?: string }
  // Run ONE task + its upstream cone (hover-card ▶ · engine `run --task`).
  | { kind: 'dag:runTask'; taskId: string; workflowUri?: string }
  | { kind: 'dag:explainCode'; code: string }
  // The webview's error seam — a canvas exception, said out loud.
  | { kind: 'dag:wall'; message: string }
  // Composition door — a workflow-call chip opens its child file.
  | { kind: 'dag:openSub'; path: string; workflowUri?: string }
  | { kind: 'timeline:request'; workflowUri?: string }
  | { kind: 'dag:forkFromTask'; taskId: string; workflowUri?: string }
  | { kind: 'dag:cancelRun' }
  // Image export — the webview serializes (styles embedded), we save.
  | { kind: 'dag:export'; format: 'svg' | 'png'; data: string; name: string }
  // A card's artifact preview was clicked — open the real file.
  | { kind: 'dag:openArtifact'; path: string }
  // The welcome surface — open a recent file · run a WHITELISTED nika
  // command · describe → the oracle-checked generate flow.
  | { kind: 'welcome:open'; uri: string }
  | { kind: 'welcome:cmd'; command: string }
  | { kind: 'welcome:describe'; text: string };

/** Edit requests bubbled to the extension (applied as YAML text edits). */
export type DagEditRequest = Extract<
  WebviewToExtMessage,
  { kind: 'dag:addTask' | 'dag:connect' | 'dag:disconnect' | 'dag:deleteTask' | 'dag:duplicateTask' | 'dag:insertOnEdge' | 'dag:editModel' | 'dag:omni' }
>;

// ─── Nonce Generator ─────────────────────────────────────────────────────────
function getNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/** The wire shape of one card artifact (webview-safe src + host path). */
export type CardArtifact = NonNullable<DagGraph['nodes'][number]['artifact']> & { taskId: string };

// ─── DAG Panel ───────────────────────────────────────────────────────────────
export class DagPanel implements vscode.Disposable {
  public static readonly viewType = 'nika.dagView';

  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];
  private currentGraph: DagGraph | undefined;
  /** A replay is showing — the webview holds the timeline (retainContext).
   *  Guards the re-show handler from clobbering it with a stale dag:load. */
  private replayActive = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onNodeClicked?: (taskId: string, workflowUri?: string) => void,
    private readonly onNodeDoubleClicked?: (taskId: string, workflowUri?: string) => void,
    private readonly onEditRequest?: (request: DagEditRequest) => void,
    private readonly onShowActive?: () => void,
    /** Remembered panel column (per-workspace · best-extension manners). */
    private readonly columnStore?: {
      get(): vscode.ViewColumn | undefined;
      set(column: vscode.ViewColumn): void;
    },
    /** Canvas run controls (▶/▶mock/■ in the panel toolbar). */
    private readonly onRunRequest?: (preview: boolean, workflowUri?: string, resume?: boolean) => void,
    private readonly onCancelRun?: () => void,
    /** Hover-card ▶ — run ONE task + its upstream cone (`run --task`). */
    private readonly onRunTask?: (taskId: string, workflowUri?: string) => void,
    /** The red teaches (wave G): a failed card's code chip → explain. */
    private readonly onExplainCode?: (code: string) => void,
    /** Failed hover ⑂ — fork from this task (upstream rehydrates). */
    private readonly onForkFromTask?: (taskId: string, workflowUri?: string) => void,
    /** The timeline lens asks for the run's truth (L1 slice 2). */
    private readonly onTimelineRequest?: (workflowUri?: string) => void,
    /** Welcome surface — open recent · whitelisted command · describe. */
    private readonly onWelcome?: (msg: Extract<WebviewToExtMessage,
      { kind: 'welcome:open' | 'welcome:cmd' | 'welcome:describe' }>) => void,
    /** Empty canvas became visible — refresh the welcome's recent list. */
    private readonly onWelcomeReady?: () => void,
    /** Composition chip ⎘ — open the child workflow file. */
    private readonly onOpenSub?: (path: string, workflowUri?: string) => void,
  ) {}

  /** Live-run lifecycle flag — mirrored to the webview, replayed on ready. */
  private runState = false;

  /** Called by the live runner at spawn/close — flips the toolbar ▶/■. */
  public setRunState(running: boolean): void {
    this.runState = running;
    this.postMessage({ kind: 'run:state', running });
  }

  /** Live-run heartbeat: `done` settled of `total` scheduled tasks. */
  public runProgress(done: number, total: number): void {
    this.postMessage({ kind: 'run:progress', done, total });
  }

  /** Run-close verdict banner — the summary, visible without the feed. */
  public runVerdict(icon: string, text: string, cls: string): void {
    this.postMessage({ kind: 'run:verdict', icon, text, cls });
  }

  /** Load a recorded run into the webview scrubber (time-travel). */
  public loadReplay(timeline: TimelineEntry[], label: string, speed: number): void {
    this.replayActive = true;
    this.postMessage({ kind: 'dag:replayLoad', timeline, label, speed });
  }

  /** The live/replay overlay ended — clear the replay guard. */
  public endReplay(): void {
    this.replayActive = false;
    this.postMessage({ kind: 'dag:replayEnd' });
    // A closed replay leaves no « currently executing » — the YAML
    // highlight must not survive the timeline it came from.
    this.onTransportTick?.([]);
  }

  /** Push the static cost forecast for the run pill (null clears it).
   *  `delta` (optional) rides the Infracost lesson: the CHANGE vs the
   *  last commit is the review signal — pushed as a second enrichment
   *  pass once the git baseline resolves. */
  public costUpdate(forecast: { label: string; tooltip: string; unbounded: boolean; delta?: { label: string; tooltip: string; up: boolean } } | null): void {
    this.postMessage({ kind: 'dag:cost', forecast });
  }

  /** Push per-card audit badges from a completed check (⚠N). */
  public auditUpdate(audits: Array<{ taskId: string; count: number; worst: 'error' | 'warning' | 'info' }>): void {
    if (this.currentGraph) {
      const byId = new Map(audits.map((a) => [a.taskId, a]));
      for (const node of this.currentGraph.nodes) {
        const a = byId.get(node.id);
        node.auditCount = a?.count;
        node.auditWorst = a?.worst;
      }
    }
    this.postMessage({ kind: 'dag:audit', audits });
  }

  /** Refresh stale badges in place (statuses stay painted post-run). */
  public staleUpdate(stale: string[], direct: string[]): void {
    if (this.currentGraph) {
      const staleSet = new Set(stale);
      const directSet = new Set(direct);
      for (const node of this.currentGraph.nodes) {
        node.stale = staleSet.has(node.id) ? true : undefined;
        node.staleUpstream = node.stale && !directSet.has(node.id) ? true : undefined;
      }
    }
    this.postMessage({ kind: 'dag:stale', stale, direct });
  }

  /** Drop a panel that died without (or before) its onDidDispose. */
  private releaseDisposedPanel(): void {
    this.panel = undefined;
    this.pendingFocus = undefined;
    this.pendingTransport = undefined;
    const toDispose = this.disposables;
    this.disposables = [];
    for (const d of toDispose) {
      try { d.dispose(); } catch { /* already gone */ }
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /** Show the DAG panel (create if needed, reveal if exists) */
  public show(graph?: DagGraph): void {
    if (this.panel) {
      // A panel can be disposed UNDER us with onDidDispose never having fired
      // (window reload races · serializer restores · host quirks — proven
      // live: close the tab, click the graph again, « Webview is
      // disposed » forever). WebviewPanel exposes no isDisposed: the
      // documented shape is try/reveal, and on the throw we drop the
      // corpse and fall through to a fresh panel.
      try {
        this.panel.reveal(this.panel.viewColumn ?? vscode.ViewColumn.Beside);
        if (graph) {
          this.loadGraph(graph);
        }
        return;
      } catch {
        this.releaseDisposedPanel();
      }
    }

    const panel = vscode.window.createWebviewPanel(
      DagPanel.viewType,
      'Nika DAG',
      { viewColumn: this.columnStore?.get() ?? vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true, // Keep state when panel is backgrounded
        localResourceRoots: DagPanel.resourceRoots(this.extensionUri),
      },
    );

    // Store graph BEFORE wiring — the webview fires dag:ready as soon as
    // its script runs and expects currentGraph to be answerable.
    if (graph) {
      this.currentGraph = graph;
    }

    this.adopt(panel);
  }

  /**
   * Take ownership of a webview panel — the shared wiring for freshly
   * created panels AND panels restored by the serializer across restarts
   * (a restored panel without adoption has NO message handler: every
   * node click would die silently).
   */
  public adopt(panel: vscode.WebviewPanel): void {
    if (this.panel && this.panel !== panel) {
      // A second panel (e.g. serializer restore racing a fresh show):
      // keep the newest, drop the old one.
      this.panel.dispose();
    }
    this.panel = panel;

    // Serializer-restored panels arrive with their ORIGINAL options —
    // re-assert so the logo/font/artifact URIs stay readable after
    // upgrades AND workspace-folder changes.
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: DagPanel.resourceRoots(this.extensionUri),
    };

    panel.iconPath = {
      light: vscode.Uri.joinPath(this.extensionUri, 'icons', 'nika-light.svg'),
      dark: vscode.Uri.joinPath(this.extensionUri, 'icons', 'nika-dark.svg'),
    };

    // Listener BEFORE html: the webview script posts dag:ready at the end
    // of its synchronous run — wiring after html assignment can lose it.
    this.disposables.push(
      panel.webview.onDidReceiveMessage(
        (msg: WebviewToExtMessage) => this.handleMessage(msg),
      ),
    );

    panel.webview.html = this.getHtml(panel.webview);

    // Clean up on dispose — NOT tracked in this.disposables to avoid
    // double-dispose: onDidDispose fires when panel closes, then we
    // clean up all other disposables. If this listener were in the
    // array, it would try to dispose itself during iteration.
    panel.onDidDispose(() => {
      // Remember where the user kept the panel — next open lands there.
      if (panel.viewColumn !== undefined) {
        this.columnStore?.set(panel.viewColumn);
      }
      if (this.panel === panel) {
        this.panel = undefined;
      }
      // A focus queued for THIS panel must not replay on the next one
      // (close → reopen would zoom to a task the user left behind).
      this.pendingFocus = undefined;
      this.pendingTransport = undefined;
      const toDispose = this.disposables;
      this.disposables = [];
      toDispose.forEach((d) => d.dispose());
    });

    // Re-send graph when panel becomes visible again (skip initial show)
    let hasBeenHidden = false;
    this.disposables.push(
      panel.onDidChangeViewState((e) => {
        if (!e.webviewPanel.visible) {
          hasBeenHidden = true;
          return;
        }
        // retainContextWhenHidden keeps the webview's state (including an
        // open replay) alive while backgrounded — re-sending dag:load
        // would close the replay and blank to the stale seed graph.
        if (hasBeenHidden && this.currentGraph && !this.replayActive) {
          this.postMessage({ kind: 'dag:load', graph: this.mapArtifacts(this.currentGraph), toolCats: this.toolCats });
        }
      }),
    );

    // React to theme changes
    this.disposables.push(
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.postMessage({ kind: 'theme:changed' });
      }),
    );

    // Skin flip is live — no panel reload needed.
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('nika.dag.theme')) {
          this.postMessage({ kind: 'theme:mode', mode: DagPanel.themeMode() });
        }
      }),
    );
  }

  /** The configured webview skin — brand · editor-adaptive · phosphor ·
   *  auto (auto resolves WEBVIEW-side against the live body theme class,
   *  so a theme switch re-resolves without a panel reload). */
  private static themeMode(): 'nika' | 'editor' | 'phosphor' | 'auto' {
    const raw = vscode.workspace.getConfiguration('nika').get<string>('dag.theme', 'nika');
    return raw === 'editor' || raw === 'auto' || raw === 'phosphor' ? raw : 'nika';
  }

  /** Whether a webview panel currently exists (visible or backgrounded). */
  public get hasPanel(): boolean {
    return this.panel !== undefined;
  }

  /** Source workflow URI of the displayed graph (undefined when synthesized
   *  from a bare trace) — guards check-driven pushes from landing on an
   *  outgoing graph mid-switch · lets the overlay key its fold to the FILE. */
  public currentWorkflowUri(): string | undefined {
    return this.currentGraph?.workflowUri;
  }

  /** Task ids of the currently loaded graph — overlap tests for live overlay. */
  public currentGraphIds(): Set<string> | undefined {
    if (!this.currentGraph) { return undefined; }
    return new Set(this.currentGraph.nodes.map((n) => n.id));
  }

  /** Scheduling edges of the loaded graph — the timeline's wave order. */
  public currentGraphEdges(): Array<{ source: string; target: string }> {
    return (this.currentGraph?.edges ?? []).map((e) => ({ source: e.source, target: e.target }));
  }

  /** BARE builtin → category from `nika tools --json` — rides every
   *  dag:load so the canvas glyphs speak the binary's vocabulary. */
  private toolCats: Record<string, ToolMeta> | undefined;

  public setToolCats(cats: Record<string, ToolMeta> | undefined): void {
    this.toolCats = cats;
  }

  /** Everything the webview may read: our bundles + the workspace (the
   *  recorded artifacts live there — .nika/ outputs, media files). */
  private static resourceRoots(extensionUri: vscode.Uri): vscode.Uri[] {
    return [
      vscode.Uri.joinPath(extensionUri, 'out', 'webview'),
      vscode.Uri.joinPath(extensionUri, 'icons'),
      vscode.Uri.joinPath(extensionUri, 'fonts'),
      ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri),
    ];
  }

  /** Map a host-absolute artifact src to a webview URI (post-time only —
   *  the stored graph keeps host paths so re-posts stay re-mappable). */
  private mapArtifacts(graph: DagGraph): DagGraph {
    const webview = this.panel?.webview;
    if (!webview) { return graph; }
    return {
      ...graph,
      nodes: graph.nodes.map((n) => n.artifact
        ? {
          ...n,
          artifact: {
            ...n.artifact,
            src: webview.asWebviewUri(vscode.Uri.file(n.artifact.src)).toString(),
          },
        }
        : n),
    };
  }

  private pendingArtifacts: CardArtifact[] | undefined;

  /** Push recorded artifacts onto the cards (run close · replay). */
  public artifactsUpdate(artifacts: CardArtifact[]): void {
    this.pendingArtifacts = artifacts.length > 0 ? artifacts : undefined;
    const webview = this.panel?.webview;
    if (!webview) { return; }
    this.postMessage({
      kind: 'dag:artifacts',
      artifacts: artifacts.map((a) => ({
        ...a,
        src: webview.asWebviewUri(vscode.Uri.file(a.src)).toString(),
      })),
    });
  }

  /** Load a new graph (replaces current) */
  public loadGraph(graph: DagGraph): void {
    this.currentGraph = graph;
    // A new graph orphans any queued timeline (the webview side also
    // deactivates its transport on dag:load) AND any queued artifact
    // delta — the fresh graph carries its own recorded artifacts.
    this.pendingArtifacts = undefined;
    this.pendingTransport = undefined;
    // A fresh graph supersedes any replay (the webview's dag:load handler
    // closes the Replayer); keep the extension-side guard in step.
    this.replayActive = false;
    if (this.panel?.visible) {
      this.postMessage({ kind: 'dag:load', graph: this.mapArtifacts(graph), toolCats: this.toolCats });
    }
  }

  /** Update a single task's status (during execution) */
  public updateTaskStatus(taskId: string, status: TaskStatus, durationMs?: number, cached?: boolean, outputPreview?: string, recoveredFrom?: string, usd?: number): void {
    this.pendingTransport = undefined; // live wins — never resurrect a replay
    if (this.currentGraph) {
      const node = this.currentGraph.nodes.find((n) => n.id === taskId);
      if (node) {
        node.status = status;
        node.durationMs = durationMs;
        // Assign, never accumulate — a fresh run's paint must clear the
        // ↻ a previous resume left on the mirrored graph (ADR-099).
        node.cached = cached === true;
        node.recoveredFrom = recoveredFrom;
        node.outputPreview = outputPreview;
      }
    }
    this.postMessage({ kind: 'dag:updateStatus', taskId, status, durationMs, usd, cached, recoveredFrom, outputPreview });
  }

  /** Batch update multiple task statuses at once */
  /** L1 — hand the timeline lens its rows (webview renders dumbly). */
  public postTimeline(data: import('./core/timelineModel').TimelineData): void {
    this.postMessage({ kind: 'dag:timeline', data });
  }

  public batchUpdateStatus(updates: Array<{ taskId: string; status: TaskStatus; durationMs?: number; usd?: number; cached?: boolean; recoveredFrom?: string; outputPreview?: string; failPreview?: string; whyWhen?: string; blockedBy?: string; pausedQuestion?: string; agent?: import('./core/traceFold').AgentFacts }>): void {
    this.pendingTransport = undefined; // live wins — never resurrect a replay
    if (this.currentGraph) {
      for (const u of updates) {
        const node = this.currentGraph.nodes.find((n) => n.id === u.taskId);
        if (node) {
          node.status = u.status;
          node.durationMs = u.durationMs;
          node.cached = u.cached === true;
          node.recoveredFrom = u.recoveredFrom;
          node.outputPreview = u.outputPreview;
        }
      }
    }
    this.postMessage({ kind: 'dag:batchUpdateStatus', updates });
  }

  private pendingTransport:
    | { timeline: TraceTimeline; speed?: number; autoPlay?: boolean }
    | undefined;

  /**
   * Hand a normalized trace timeline to the webview transport (the
   * platine). Queued like pendingFocus: a freshly created panel loses
   * messages posted before its script runs — dag:ready re-sends.
   */
  public loadTransport(timeline: TraceTimeline, opts?: { speed?: number; autoPlay?: boolean }): void {
    this.pendingTransport = { timeline, speed: opts?.speed, autoPlay: opts?.autoPlay };
    this.postMessage({
      kind: 'transport:load',
      timeline,
      speed: opts?.speed,
      autoPlay: opts?.autoPlay,
    });
  }

  /** Paint per-task run-diff verdicts over the current graph. */
  public loadDiff(entries: Array<{ taskId: string; verdict: string; badge: string }>): void {
    this.postMessage({ kind: 'diff:load', entries });
  }

  /** Remove any diff paint (new graph · new run · user clear). */
  public clearDiff(): void {
    this.postMessage({ kind: 'diff:clear' });
  }

  /** Drop any replay transport — a live run supersedes the platine. */
  public clearTransport(): void {
    this.pendingTransport = undefined;
    this.postMessage({ kind: 'transport:clear' });
    this.onTransportTick?.([]);
  }

  /** Recent workflows for the welcome (empty canvas resume list). */
  public welcomeData(recent: Array<{ name: string; uri: string; rel: string }>, binaryMissing = false): void {
    this.postMessage({ kind: 'welcome:data', recent, binaryMissing });
  }

  /** Fit the view to show all nodes */
  public fitToView(): void {
    this.postMessage({ kind: 'dag:fitToView' });
  }

  private pendingFocus: string | undefined;

  /** Focus + center a task in the graph (driven from editor code lenses). */
  public focusNode(taskId: string): void {
    this.pendingFocus = taskId;
    this.postMessage({ kind: 'dag:focus', taskId });
  }

  /** Soft cursor-position hint (editor caret inside a task · null clears). */
  public cursorHint(taskId: string | null): void {
    this.postMessage({ kind: 'dag:cursorHint', taskId });
  }

  /** Data-lineage illumination (caret inside `${{ tasks.X… }}` · null clears). */
  public lineage(taskId: string | null): void {
    this.postMessage({ kind: 'dag:lineage', taskId });
  }

  /** Preflight verdict chip on the run pill (null hides). */
  public preflightUpdate(chip: { text: string; cls: string; tip: string } | null): void {
    this.postMessage({ kind: 'dag:preflight', chip });
  }

  /** Session narration line for the activity feed (check · edits · …). */
  public note(icon: string, text: string, taskId?: string, cls?: string): void {
    this.postMessage({ kind: 'dag:note', icon, text, taskId, cls });
  }

  /** Whether the panel is currently visible (cursor sync gates on this). */
  public get isVisible(): boolean {
    return this.panel?.visible === true;
  }

  /** Clear the DAG display */
  public clear(): void {
    this.currentGraph = undefined;
    this.postMessage({ kind: 'dag:clear' });
  }

  public dispose(): void {
    // panel.dispose() triggers onDidDispose which cleans up all disposables
    this.panel?.dispose();
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private postMessage(msg: ExtToWebviewMessage): void {
    try {
      this.panel?.webview.postMessage(msg);
    } catch {
      // Disposed under us — release so the next show() builds fresh.
      this.releaseDisposedPanel();
    }
  }

  /** Fires when the webview's running-task set changes (live · replay). */
  public onTransportTick?: (running: string[]) => void;
  /** Fires when the preflight chip is clicked (→ open the flight plan). */
  public onOpenPreflight?: () => void;

  private handleMessage(msg: WebviewToExtMessage): void {
    switch (msg.kind) {
      case 'transport:tick':
        this.onTransportTick?.(msg.running);
        break;
      case 'dag:openPreflight':
        this.onOpenPreflight?.();
        break;
      case 'dag:ready':
        // Webview has initialized — send the graph if we have one
        if (this.currentGraph) {
          this.postMessage({ kind: 'dag:load', graph: this.mapArtifacts(this.currentGraph), toolCats: this.toolCats });
        } else {
          // Empty canvas → the welcome wants its resume list.
          this.onWelcomeReady?.();
        }
        if (this.pendingFocus) {
          this.postMessage({ kind: 'dag:focus', taskId: this.pendingFocus });
          this.pendingFocus = undefined;
        }
        if (this.pendingTransport) {
          // After dag:load, in-order — the webview resyncs post-layout.
          this.postMessage({ kind: 'transport:load', ...this.pendingTransport });
        }
        if (this.pendingArtifacts) {
          // Artifact deltas queued while the panel booted replay too.
          this.artifactsUpdate(this.pendingArtifacts);
        }
        // A reloaded panel mid-run must keep showing the truthful ■.
        if (this.runState) {
          this.postMessage({ kind: 'run:state', running: true });
        }
        break;

      case 'dag:nodeClicked':
        this.onNodeClicked?.(msg.taskId, msg.workflowUri);
        break;

      case 'dag:openSub':
        this.onOpenSub?.(msg.path, msg.workflowUri);
        break;

      // The canvas hit an internal wall (webview exception). The webview
      // already painted its strip; here the user gets ONE actionable
      // toast — walls are bugs, and silence is how they stay bugs.
      case 'dag:wall':
        void vscode.window
          .showWarningMessage(`Nika: the canvas hit a wall — ${msg.message}`, 'Copy details')
          .then((pick) => {
            if (pick === 'Copy details') {
              void vscode.env.clipboard.writeText(`nika-vscode canvas wall: ${msg.message}`);
            }
          });
        break;

      case 'dag:nodeDoubleClicked':
        this.onNodeDoubleClicked?.(msg.taskId, msg.workflowUri);
        break;

      case 'dag:requestRefresh':
        // Extension can re-parse workflow and send updated graph
        if (this.currentGraph) {
          this.postMessage({ kind: 'dag:load', graph: this.mapArtifacts(this.currentGraph), toolCats: this.toolCats });
        }
        break;

      case 'dag:addTask':
      case 'dag:connect':
      case 'dag:disconnect':
      case 'dag:deleteTask':
      case 'dag:duplicateTask':
      case 'dag:insertOnEdge':
      case 'dag:editModel':
      case 'dag:omni':
        this.onEditRequest?.(msg);
        break;

      case 'dag:showActive':
        this.onShowActive?.();
        break;

      case 'dag:openArtifact':
        // The recorded file, opened for real (image tab · audio player);
        // an unopenable path falls back to the OS reveal.
        void (async () => {
          try {
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(msg.path));
          } catch {
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(msg.path));
          }
        })();
        break;

      case 'dag:openReport':
        void vscode.commands.executeCommand('nika.showReport');
        break;

      case 'dag:newWorkflow':
        void vscode.commands.executeCommand('nika.newWorkflow');
        break;

      case 'dag:openWalkthrough':
        void vscode.commands.executeCommand(
          'workbench.action.openWalkthrough',
          'supernovae.nika-lang#nika.gettingStarted',
        );
        break;

      case 'dag:export':
        void this.saveExport(msg.format, msg.data, msg.name);
        break;

      case 'dag:runRequest':
        this.onRunRequest?.(msg.preview === true, msg.workflowUri, msg.resume === true);
        break;

      case 'dag:explainCode':
        this.onExplainCode?.(msg.code);
        break;
      case 'timeline:request':
        this.onTimelineRequest?.(msg.workflowUri);
        break;
      case 'dag:forkFromTask':
        this.onForkFromTask?.(msg.taskId, msg.workflowUri);
        break;
      case 'dag:runTask':
        this.onRunTask?.(msg.taskId, msg.workflowUri);
        break;

      case 'welcome:open':
      case 'welcome:cmd':
      case 'welcome:describe':
        this.onWelcome?.(msg);
        break;

      case 'dag:cancelRun':
        this.onCancelRun?.();
        break;
    }
  }

  /** Save a webview-serialized image (SVG text or PNG data URL) to disk. */
  private async saveExport(format: 'svg' | 'png', data: string, name: string): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const target = await vscode.window.showSaveDialog({
      defaultUri: folder ? vscode.Uri.joinPath(folder, name) : undefined,
      filters: format === 'png' ? { 'PNG image': ['png'] } : { 'SVG image': ['svg'] },
      title: `Export DAG as ${format.toUpperCase()}`,
    });
    if (!target) { return; }
    try {
      const bytes = format === 'png'
        ? Buffer.from(data.slice(data.indexOf(',') + 1), 'base64')
        : Buffer.from(data, 'utf-8');
      await vscode.workspace.fs.writeFile(target, bytes);
      const choice = await vscode.window.showInformationMessage(
        `Nika: DAG exported → ${vscode.workspace.asRelativePath(target)}`,
        'Reveal',
      );
      if (choice === 'Reveal') {
        await vscode.commands.executeCommand('revealFileInOS', target);
      }
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Nika: DAG export failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── HTML Generation ─────────────────────────────────────────────────────

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();

    // Resolve webview-safe URIs for our bundled assets
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'dag.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'dag.css'),
    );
    const logoDark = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'icons', 'nika-dark.svg'),
    );
    const logoLight = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'icons', 'nika-light.svg'),
    );
    // Martian Mono variable (OFL · fonts/OFL.txt) — the brand mono for the
    // nika skin; the editor skin keeps the user's editor font untouched.
    const monoFont = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'fonts', 'martian-mono-variable.woff2'),
    );
    const themeMode = DagPanel.themeMode();

    // CSP: lock down everything except what we explicitly need.
    // - default-src 'none'          — block all by default
    // - style-src ${cspSource}      — allow our bundled CSS + VS Code theme vars
    //          'unsafe-inline'       — needed for D3 inline styles (transform, etc.)
    // - script-src 'nonce-${nonce}' — only our script with the nonce can execute
    // - img-src ${cspSource} data:  — allow our assets + inline SVG data URIs
    // - font-src ${cspSource}       — allow VS Code's codicon font
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
      // Recorded audio artifacts play ON the card (workspace-rooted).
      `media-src ${webview.cspSource}`,
      // Image export inlines the bundled font into the serialized SVG —
      // the ONLY fetch target is our own extension assets.
      `connect-src ${webview.cspSource}`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${styleUri}">
  <style>
    @font-face {
      font-family: 'Martian Mono';
      src: url('${monoFont}') format('woff2');
      font-weight: 100 800;
      font-style: normal;
      font-display: swap;
    }
  </style>
  <title>Nika DAG</title>
</head>
<body data-nk-theme="${themeMode}">
  <div id="aurora" aria-hidden="true"></div>
  <input id="dag-search" type="text" placeholder="filter tasks — / to open · Esc to clear" hidden
         aria-label="Filter tasks">
  <div id="dag-toolbar">
    <span id="dag-mark" aria-hidden="true">
      <img class="logo-dark" src="${logoDark}" alt="" width="16" height="16">
      <img class="logo-light" src="${logoLight}" alt="" width="16" height="16">
    </span>
    <span id="dag-title"></span>
    <span class="tb-sep"></span>
    <div class="tb-group">
      <button id="btn-add-task" title="Add a task — the palette (N): a verb, or a builtin tool pre-wired">＋ Task</button>
      <button id="btn-new" title="New workflow — a fresh page (untitled .nika.yaml)">⧇ New</button>
    </div>
    <div class="tb-group">
      <button id="btn-zoom-out" title="Zoom out (−)">−</button>
      <button id="zoom-pct" title="Current zoom — click to fit">100%</button>
      <button id="btn-zoom-in" title="Zoom in (+)">＋</button>
      <span class="tb-inner-sep"></span>
      <button id="btn-fit" title="Fit to view">Fit<kbd>F</kbd></button>
      <button id="btn-relayout" title="Auto-layout — drop the dragged card positions">⌗<kbd>A</kbd></button>
    </div>
    <div class="tb-group">
      <button id="btn-waves" title="Wave bands — topological execution levels">≋<kbd>W</kbd></button>
      <button id="btn-timeline" title="Timeline — the run's truth as a Gantt (recorded clocks · retries · cost)">▤<kbd>T</kbd></button>
      <button id="btn-curve" title="Smooth edges">∿</button>
      <button id="btn-heat" title="Heatmap — tint cards by duration (or static cost before a run)">▥<kbd>H</kbd></button>
      <button id="btn-follow" title="Follow the run — the camera tracks the frontier (your pan pauses it)">⌖<kbd>G</kbd></button>
      <button id="btn-feed" title="Activity feed — every status transition, live">≣<kbd>L</kbd></button>
      <button id="btn-help" title="What am I looking at?">?<kbd>?</kbd></button>
    </div>
    <div class="tb-group">
      <button id="btn-export-svg" title="Export the graph as SVG (styles embedded)">⤓ svg</button>
      <button id="btn-export-png" title="Export the graph as PNG (2× raster)">⤓ png</button>
    </div>
    <span id="dag-status"></span>
  </div>
  <div id="dag-container"></div>
  <form id="canvas-describe" hidden autocomplete="off" aria-label="Describe this workflow">
    <div class="cd-pill">
      <span class="cd-mark" aria-hidden="true">✨</span>
      <input id="cd-input" type="text"
             placeholder="Describe this workflow — the tasks land checked by the engine…"
             aria-label="Describe the workflow to generate">
      <button id="cd-go" type="submit" title="Generate it (oracle-checked before it lands)">↵</button>
    </div>
    <div class="cd-hint">or press <kbd>N</kbd> — add a task from the palette (a verb, or a builtin tool)</div>
  </form>
  <nav id="plan-rail" hidden aria-label="Execution plan"></nav>
  <div id="minimap"><svg id="minimap-svg"></svg><div id="minimap-viewport"></div></div>
  <div id="activity" hidden>
    <div id="activity-head">Activity</div>
    <div id="activity-list"></div>
  </div>
  <div id="empty-state" hidden>
    <div class="es-card">
      <div class="es-hero">
        <img class="es-mark logo-dark" src="${logoDark}" alt="" width="44" height="44">
        <img class="es-mark logo-light" src="${logoLight}" alt="" width="44" height="44">
        <div class="es-word">Nika</div>
        <div class="es-tag">The workflow canvas — audited before a token is spent.</div>
      </div>
      <form id="es-describe" autocomplete="off">
        <input id="es-describe-input" type="text"
               placeholder="Describe your workflow — “fetch HN, rank, post the brief to Slack”…"
               aria-label="Describe the workflow to generate">
        <button id="es-describe-go" type="submit" title="Generate it (checked by the engine before it lands)">✨</button>
      </form>
      <div id="es-binary" hidden role="status">
        <span class="es-binary-mark" aria-hidden>⚠</span>
        <span class="es-binary-text">The nika engine is not on this machine — every check, graph
        and run needs it. <code>brew install supernovae-st/tap/nika</code> or let the extension
        fetch the official binary (HTTPS · SHA-256 verified · ~10 MB).</span>
        <button class="es-button es-cmd" data-cmd="nika.restartServer">⟳ Detect / download</button>
      </div>
      <div class="es-actions" role="toolbar" aria-label="Start">
        <button id="es-new" class="es-button">＋ New workflow</button>
        <button class="es-button es-button-ghost es-cmd" data-cmd="nika.browseExamples">▤ Examples</button>
        <button class="es-button es-button-ghost es-cmd" data-cmd="nika.replayTrace">↻ Replay a trace</button>
        <button class="es-button es-button-ghost es-cmd" data-cmd="nika.showMenu">⌘ All commands</button>
      </div>
      <div id="es-recent" hidden>
        <div class="es-sec">Recent in this workspace</div>
        <div id="es-recent-list"></div>
      </div>
      <div class="es-sec">What Nika does here</div>
      <div class="es-caps">
        <button class="es-cap es-cmd" data-cmd="nika.checkWorkflow"><span>✓</span>Check — static pre-flight</button>
        <button class="es-cap es-cmd" data-cmd="nika.preflightWorkflow"><span>🛡</span>Preflight — cost · secrets · keys</button>
        <button class="es-cap es-cmd" data-cmd="nika.runHistory"><span>▤</span>Run history — flaky · trends</button>
        <button class="es-cap es-cmd" data-cmd="nika.showReport"><span>≣</span>Pre-flight report</button>
        <button class="es-cap es-cmd" data-cmd="nika.inspectWorkflow"><span>⌕</span>Inspect anatomy</button>
        <button class="es-cap es-cmd" data-cmd="nika.inferPermits"><span>▦</span>Infer permits boundary</button>
        <button class="es-cap es-cmd" data-cmd="nika.explainWorkflow"><span>¶</span>Explain the workflow</button>
        <button class="es-cap es-cmd" data-cmd="nika.openSpec"><span>§</span>Embedded spec</button>
        <button class="es-cap es-cmd" data-cmd="nika.copyAiPrompt"><span>⧉</span>Copy AI authoring prompt</button>
        <button class="es-cap es-cmd" data-cmd="nika.setupMcp"><span>◇</span>Setup MCP + agent rules</button>
      </div>
      <button id="es-walkthrough" class="es-link">Get started with Nika →</button>
    </div>
  </div>
  <div id="explainer" hidden></div>
  <div id="verb-cmdk" hidden role="listbox" aria-label="Pick the new task's verb">
    <input id="cmdk-input" type="text" placeholder="add a task — verb or tool…" aria-label="Filter verbs and tools">
    <div id="cmdk-list"></div>
  </div>
  <div id="hover-card" role="tooltip"></div>
  <div id="run-verdict" role="status" hidden></div>
  <div id="omnibar">
    <div id="run-controls" role="toolbar" aria-label="Run controls">
      <button id="btn-run" class="rc-run" title="Run this workflow — the DAG lights live">▶ Run</button>
      <button id="run-preflight" hidden></button>
      <span id="run-cost" hidden></span>
      <span id="run-stale" hidden></span>
      <button id="btn-run-resume" class="rc-resume" title="Re-run what changed — unchanged tasks cache-hit their recorded output (engine --resume)" hidden>↻ changed</button>
      <button id="btn-run-mock" class="rc-mock" title="Preview run with mock/echo — deterministic · zero keys · zero network">▶ mock</button>
      <button id="btn-stop" class="rc-stop" title="Stop the live run" hidden>■ Stop</button>
    </div>
    <div id="verb-palette" role="toolbar" aria-label="Add a task">
      <button class="vp-btn vp-infer" data-verb="infer" title="Add an infer task (LLM call)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true"><path d="M21 12.5C14.75 12.5 12 15.4028 12 22C12 15.4028 9.25 12.5 3 12.5C9.25 12.5 12 9.59722 12 3C12 9.59722 14.75 12.5 21 12.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button>
      <button class="vp-btn vp-exec" data-verb="exec" title="Add an exec task (subprocess)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true"><path d="M7.5 8L9.25 9.75L7.5 11.5M12 11.5H14M7 20H17C18.6569 20 20 18.6569 20 17V7C20 5.34315 18.6569 4 17 4H7C5.34315 4 4 5.34315 4 7V17C4 18.6569 5.34315 20 7 20Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <button class="vp-btn vp-invoke" data-verb="invoke" title="Add an invoke task (builtin / MCP tool)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true"><path d="M4 12C4 16.4183 7.58172 20 12 20C14.9611 20 17.5465 18.3912 18.9297 16M4 12C4 7.58172 7.58172 4 12 4C14.9611 4 17.5465 5.60879 18.9297 8M4 12H2M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12ZM16 12H22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <button class="vp-btn vp-agent" data-verb="agent" title="Add an agent task (agent loop)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true"><circle cx="12" cy="6" r="2.5" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="18" r="2.5" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="18" r="2.5" stroke="currentColor" stroke-width="2"/><path d="M12 8.5V12M12 12H9C7.34315 12 6 13.3431 6 15V15.5M12 12H15C16.6569 12 18 13.3431 18 15V15.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </div>
    <input id="omni-input" type="text"
           placeholder="+ infer · + jq after gather · / filter · or describe a workflow…"
           aria-label="Canvas command bar">
    <button id="omni-go" title="Run the command (Enter)">↵</button>
  </div>
  <div id="scrubber" hidden>
    <button id="scrub-play" title="Play the run (Space)">▶</button>
    <div id="scrub-track"><div id="scrub-fill"></div><div id="scrub-handle"></div></div>
    <span id="scrub-time">0.0s</span>
    <button id="scrub-close" title="Exit replay">✕</button>
  </div>
  <div id="dag-legend">
    <span id="legend-heat" aria-hidden><i class="lh-bar"></i><span class="lh-label"></span></span>
    <div id="legend-chips"></div>
    <div id="progress-track"><div id="progress-fill"></div></div>
  </div>
  <div id="transport" hidden>
    <button id="tr-play" aria-label="Play" title="Play / Pause — Space">▶</button>
    <div id="tr-track">
      <div id="tr-ticks" aria-hidden="true"></div>
      <input id="tr-scrub" type="range" min="0" max="1000" step="1" value="0"
             aria-label="Trace timeline — arrows snap between events, Home/End jump">
    </div>
    <span id="tr-time">0:00.0 / 0:00.0</span>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

// ─── Serializer for webview persistence across VS Code restarts ─────────────
// Register with: vscode.window.registerWebviewPanelSerializer(DagPanel.viewType, ...)
// Delegates to DagPanel.adopt() so the restored panel gets the FULL wiring
// (message handler · dispose · view-state · theme) — a bare HTML restore
// renders the saved graph but every node click dies with no handler.
export class DagPanelSerializer implements vscode.WebviewPanelSerializer {
  constructor(
    private readonly dagPanel: DagPanel,
  ) {}

  async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown): Promise<void> {
    // The webview script restores its own zoom/pan/graph via getState();
    // node clicks carry workflowUri from that persisted graph.
    this.dagPanel.adopt(panel);
  }
}
