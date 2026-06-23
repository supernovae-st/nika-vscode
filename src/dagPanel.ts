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

import type { DagGraph, TaskStatus } from './core/cliContract';

export type { DagEdge, DagGraph, DagNode, TaskStatus } from './core/cliContract';

// Extension -> Webview
export type ExtToWebviewMessage =
  | { kind: 'dag:load'; graph: DagGraph }
  | { kind: 'dag:updateStatus'; taskId: string; status: TaskStatus; durationMs?: number }
  | { kind: 'dag:batchUpdateStatus'; updates: Array<{ taskId: string; status: TaskStatus; durationMs?: number }> }
  | { kind: 'dag:focus'; taskId: string }
  | { kind: 'dag:cursorHint'; taskId: string | null }
  | { kind: 'dag:note'; icon: string; text: string; taskId?: string; cls?: string }
  | { kind: 'dag:clear' }
  | { kind: 'dag:fitToView' }
  | { kind: 'theme:changed' };

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
  | { kind: 'dag:viewportChanged'; zoom: number; panX: number; panY: number }
  // Graph editing (the n8n loop) — every edit lands in the YAML source.
  | { kind: 'dag:addTask'; afterTaskId: string | null; workflowUri?: string }
  | { kind: 'dag:connect'; from: string; to: string; workflowUri?: string }
  | { kind: 'dag:disconnect'; from: string; to: string; workflowUri?: string }
  | { kind: 'dag:deleteTask'; taskId: string; workflowUri?: string };

/** Edit requests bubbled to the extension (applied as YAML text edits). */
export type DagEditRequest = Extract<
  WebviewToExtMessage,
  { kind: 'dag:addTask' | 'dag:connect' | 'dag:disconnect' | 'dag:deleteTask' }
>;

// ─── Nonce Generator ─────────────────────────────────────────────────────────
function getNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

// ─── DAG Panel ───────────────────────────────────────────────────────────────
export class DagPanel implements vscode.Disposable {
  public static readonly viewType = 'nika.dagView';

  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];
  private currentGraph: DagGraph | undefined;

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
  ) {}

  // ─── Public API ──────────────────────────────────────────────────────────

  /** Show the DAG panel (create if needed, reveal if exists) */
  public show(graph?: DagGraph): void {
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn ?? vscode.ViewColumn.Beside);
      if (graph) {
        this.loadGraph(graph);
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DagPanel.viewType,
      'Nika DAG',
      { viewColumn: this.columnStore?.get() ?? vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true, // Keep state when panel is backgrounded
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
          vscode.Uri.joinPath(this.extensionUri, 'icons'),
        ],
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
    // re-assert so the logo URIs stay readable after upgrades.
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
        vscode.Uri.joinPath(this.extensionUri, 'icons'),
      ],
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
        if (hasBeenHidden && this.currentGraph) {
          this.postMessage({ kind: 'dag:load', graph: this.currentGraph });
        }
      }),
    );

    // React to theme changes
    this.disposables.push(
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.postMessage({ kind: 'theme:changed' });
      }),
    );
  }

  /** Whether a webview panel currently exists (visible or backgrounded). */
  public get hasPanel(): boolean {
    return this.panel !== undefined;
  }

  /** Task ids of the currently loaded graph — overlap tests for live overlay. */
  public currentGraphIds(): Set<string> | undefined {
    if (!this.currentGraph) { return undefined; }
    return new Set(this.currentGraph.nodes.map((n) => n.id));
  }

  /** Load a new graph (replaces current) */
  public loadGraph(graph: DagGraph): void {
    this.currentGraph = graph;
    if (this.panel?.visible) {
      this.postMessage({ kind: 'dag:load', graph });
    }
  }

  /** Update a single task's status (during execution) */
  public updateTaskStatus(taskId: string, status: TaskStatus, durationMs?: number): void {
    if (this.currentGraph) {
      const node = this.currentGraph.nodes.find((n) => n.id === taskId);
      if (node) {
        node.status = status;
        node.durationMs = durationMs;
      }
    }
    this.postMessage({ kind: 'dag:updateStatus', taskId, status, durationMs });
  }

  /** Batch update multiple task statuses at once */
  public batchUpdateStatus(updates: Array<{ taskId: string; status: TaskStatus; durationMs?: number }>): void {
    if (this.currentGraph) {
      for (const u of updates) {
        const node = this.currentGraph.nodes.find((n) => n.id === u.taskId);
        if (node) {
          node.status = u.status;
          node.durationMs = u.durationMs;
        }
      }
    }
    this.postMessage({ kind: 'dag:batchUpdateStatus', updates });
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
    this.panel?.webview.postMessage(msg);
  }

  private handleMessage(msg: WebviewToExtMessage): void {
    switch (msg.kind) {
      case 'dag:ready':
        // Webview has initialized — send the graph if we have one
        if (this.currentGraph) {
          this.postMessage({ kind: 'dag:load', graph: this.currentGraph });
        }
        if (this.pendingFocus) {
          this.postMessage({ kind: 'dag:focus', taskId: this.pendingFocus });
          this.pendingFocus = undefined;
        }
        break;

      case 'dag:nodeClicked':
        this.onNodeClicked?.(msg.taskId, msg.workflowUri);
        break;

      case 'dag:nodeDoubleClicked':
        this.onNodeDoubleClicked?.(msg.taskId, msg.workflowUri);
        break;

      case 'dag:requestRefresh':
        // Extension can re-parse workflow and send updated graph
        if (this.currentGraph) {
          this.postMessage({ kind: 'dag:load', graph: this.currentGraph });
        }
        break;

      case 'dag:viewportChanged':
        // Could persist viewport state here if needed
        break;

      case 'dag:addTask':
      case 'dag:connect':
      case 'dag:disconnect':
      case 'dag:deleteTask':
        this.onEditRequest?.(msg);
        break;

      case 'dag:showActive':
        this.onShowActive?.();
        break;
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
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${styleUri}">
  <title>Nika DAG</title>
</head>
<body>
  <div id="dag-toolbar">
    <span id="dag-mark" aria-hidden="true">
      <img class="logo-dark" src="${logoDark}" alt="" width="16" height="16">
      <img class="logo-light" src="${logoLight}" alt="" width="16" height="16">
    </span>
    <span id="dag-title"></span>
    <span class="tb-sep"></span>
    <div class="tb-group">
      <button id="btn-add-task" title="Add a task (wired after the focused one)">＋ Task</button>
    </div>
    <div class="tb-group">
      <button id="btn-fit" title="Fit to view">Fit<kbd>F</kbd></button>
      <button id="btn-zoom-in" title="Zoom in (+)">＋</button>
      <button id="btn-zoom-out" title="Zoom out (−)">−</button>
    </div>
    <div class="tb-group">
      <button id="btn-waves" title="Wave bands — topological execution levels">≋<kbd>W</kbd></button>
      <button id="btn-curve" title="Smooth edges">∿</button>
      <button id="btn-feed" title="Activity feed — every status transition, live">≣<kbd>L</kbd></button>
      <button id="btn-help" title="What am I looking at?">?<kbd>?</kbd></button>
    </div>
    <span id="dag-status"></span>
  </div>
  <div id="dag-container"></div>
  <div id="minimap"><svg id="minimap-svg"></svg><div id="minimap-viewport"></div></div>
  <div id="activity" hidden>
    <div id="activity-head">Activity</div>
    <div id="activity-list"></div>
  </div>
  <div id="empty-state" hidden>
    <div class="es-card">
      <img class="es-mark logo-dark" src="${logoDark}" alt="Nika" width="34" height="34">
      <img class="es-mark logo-light" src="${logoLight}" alt="Nika" width="34" height="34">
      <div class="es-title">No workflow loaded</div>
      <div class="es-sub">Open a <code>.nika.yaml</code>, then —</div>
      <button id="es-open" class="es-button">Show DAG for the active file</button>
      <div class="es-hint">or <kbd>⇧⌘P</kbd> → <span>nika dag</span></div>
    </div>
  </div>
  <div id="explainer" hidden></div>
  <div id="hover-card" role="tooltip"></div>
  <div id="dag-legend">
    <div id="legend-chips"></div>
    <div id="progress-track"><div id="progress-fill"></div></div>
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
