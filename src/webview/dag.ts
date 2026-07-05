// dag.ts — ELK.js layered layout + D3.js SVG rendering for Nika DAG visualization
//
// Runs inside VS Code webview (browser context). Bundled as IIFE by esbuild.
// elkjs/lib/elk.bundled.js is aliased by esbuild — no Web Worker needed.
//
// D3 imports are selective (d3-selection, d3-zoom, d3-shape, d3-transition)
// to keep the bundle under 700 KB instead of 1.5 MB with the full d3 package.

import ELK, {
  type ElkNode,
  type ElkExtendedEdge,
  type ElkPoint,
} from 'elkjs';

import { select, type Selection } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type D3ZoomEvent } from 'd3-zoom';
import { line, curveMonotoneY, type Line } from 'd3-shape';
// Side-effect import: patches Selection.prototype with .transition()
import 'd3-transition';

import { topoWaves, criticalPath } from '../core/cliContract';
import { frameAt, timelineBounds, type FrameEntry } from '../core/replayFrame';
import { runPlanSummary } from '../core/runPlan';
import { nextFocus, type NavDir } from '../core/canvasNav';
import { filterVerbs } from '../core/verbPalette';
import type { TimelineEntry } from '../core/traceFold';
import { analyzeDag, type DagInsights } from '../core/dagAnalysis';

// Every animation in this view is gated on the user's motion preference.
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// d3-zoom's programmatic methods are typed against a Selection; calling
// them on a Transition is the documented pattern but needs a variance-
// erasing cast — the ONE sanctioned `any` in this bundle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D3ZoomCall = any;

// ─── Export helpers ─────────────────────────────────────────────────────────

/** The bundled font as a data URI, fetched once (CSP: our assets only). */
let fontDataUri: string | null = null;
async function inlineFontDataUri(): Promise<string | null> {
  if (fontDataUri) { return fontDataUri; }
  const face = Array.from(document.styleSheets)
    .flatMap((s) => {
      try {
        return Array.from(s.cssRules);
      } catch {
        return [];
      }
    })
    .find((r): r is CSSFontFaceRule => r instanceof CSSFontFaceRule);
  const url = face?.style.getPropertyValue('src').match(/url\("?([^")]+)"?\)/)?.[1];
  if (!url) { return null; }
  try {
    const buf = await (await fetch(url)).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    fontDataUri = `data:font/woff2;base64,${btoa(bin)}`;
    return fontDataUri;
  } catch {
    return null;
  }
}

// ─── Verb cmdk · the drop-a-port palette (opens at the cursor) ──────────────
// A tiny command palette: 4 verbs, type-to-filter (filterVerbs ranks
// them), ↑↓ to move, Enter to pick, Esc to cancel. The renderer opens it
// on a port-drop onto empty canvas; the callback posts the pre-wired add.

class VerbCmdk {
  private readonly el = document.getElementById('verb-cmdk');
  private readonly input = document.getElementById('cmdk-input') as HTMLInputElement | null;
  private readonly list = document.getElementById('cmdk-list');
  private items: ReturnType<typeof filterVerbs> = [];
  private active = 0;
  private onPick: ((verb: string) => void) | undefined;

  constructor() {
    this.input?.addEventListener('input', () => this.render());
    this.input?.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') { this.close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); this.pick(this.active); }
    });
    // A click outside the palette dismisses it.
    document.addEventListener('mousedown', (e: MouseEvent) => {
      if (this.isOpen && this.el && !this.el.contains(e.target as Node)) { this.close(); }
    });
  }

  get isOpen(): boolean {
    return this.el?.hasAttribute('hidden') === false;
  }

  open(clientX: number, clientY: number, onPick: (verb: string) => void): void {
    if (!this.el || !this.input) { return; }
    this.onPick = onPick;
    // Clamp so the palette never spills past the viewport edges.
    const W = 220, H = 190;
    const x = Math.min(clientX, window.innerWidth - W - 8);
    const y = Math.min(clientY, window.innerHeight - H - 8);
    this.el.style.left = `${Math.max(8, x)}px`;
    this.el.style.top = `${Math.max(8, y)}px`;
    this.el.removeAttribute('hidden');
    this.input.value = '';
    this.active = 0;
    this.render();
    this.input.focus();
  }

  close(): void {
    this.el?.setAttribute('hidden', '');
    this.onPick = undefined;
  }

  private move(delta: number): void {
    if (this.items.length === 0) { return; }
    this.active = (this.active + delta + this.items.length) % this.items.length;
    this.paintActive();
  }

  private pick(index: number): void {
    const item = this.items[index];
    if (!item) { return; }
    const cb = this.onPick;
    this.close();
    cb?.(item.verb);
  }

  private render(): void {
    if (!this.list) { return; }
    this.items = filterVerbs(this.input?.value ?? '');
    this.active = Math.min(this.active, Math.max(this.items.length - 1, 0));
    this.list.replaceChildren();
    this.items.forEach((item, i) => {
      const row = document.createElement('button');
      row.className = `cmdk-row verb-${item.verb}`;
      row.dataset.i = String(i);
      const glyph = document.createElement('span');
      glyph.className = 'cmdk-glyph';
      glyph.textContent = item.glyph;
      const name = document.createElement('span');
      name.className = 'cmdk-name';
      name.textContent = item.verb;
      const blurb = document.createElement('span');
      blurb.className = 'cmdk-blurb';
      blurb.textContent = item.blurb;
      row.append(glyph, name, blurb);
      row.addEventListener('mouseenter', () => { this.active = i; this.paintActive(); });
      row.addEventListener('click', () => this.pick(i));
      this.list!.appendChild(row);
    });
    this.paintActive();
  }

  private paintActive(): void {
    const rows = this.list?.querySelectorAll('.cmdk-row');
    rows?.forEach((r, i) => r.classList.toggle('active', i === this.active));
  }
}

const verbCmdk = new VerbCmdk();

// ─── Edge aurora · run-verdict signal (nika skin only) ──────────────────────
// One bright hue-travel on a clean close, a red flash on failure — the
// nika.sh drum, whispering. CSS owns the visuals; this only flips state.
let auroraTimer: ReturnType<typeof setTimeout> | undefined;
function auroraSignal(kind: 'sweep' | 'danger'): void {
  if (document.body.dataset.nkTheme !== 'nika') { return; }
  if (auroraTimer) { clearTimeout(auroraTimer); }
  document.body.dataset.aurora = kind;
  auroraTimer = setTimeout(() => {
    delete document.body.dataset.aurora;
    auroraTimer = undefined;
  }, REDUCED_MOTION ? 600 : 1500);
}

// ─── Types (mirrored from dagPanel.ts — no shared import in webview) ────────

type TaskStatus = 'pending' | 'running' | 'retrying' | 'success' | 'failed' | 'skipped' | 'cancelled';
// The 4 verbs are locked forever (D-2026-05-22-N18) — fetch is the
// `nika:fetch` BUILTIN under invoke, not a verb. Unknown strings render
// with a neutral icon (forward-compat with future graph projections).
type Verb = 'infer' | 'exec' | 'invoke' | 'agent';

interface DagNode {
  id: string;
  label: string;
  verb: string;
  status: TaskStatus;
  durationMs?: number;
  provider?: string;
  model?: string;
  tool?: string;
  when?: string;
  fanOutKind?: string;
  fanOutCount?: number;
  costMin?: number;
  costMax?: number;
  dependsOn: string[];
  bindingsIn?: Array<{ alias: string; from: string; path: string }>;
  promptPreview?: string;
  commandPreview?: string;
  argsPreview?: string;
  avgMs?: number;
  avgRuns?: number;
  stale?: boolean;
  staleUpstream?: boolean;
  auditCount?: number;
  auditWorst?: 'error' | 'warning' | 'info';
}

interface DagEdge {
  id: string;
  source: string;
  target: string;
  isDataEdge: boolean;
  label?: string;
  ghost?: boolean;
}

interface DagRegion {
  name: string;
  taskIds: string[];
}

interface DagGraph {
  workflowName: string;
  workflowUri?: string;
  nodes: DagNode[];
  edges: DagEdge[];
  regions?: DagRegion[];
}

type ExtToWebviewMessage =
  | { kind: 'dag:load'; graph: DagGraph }
  | { kind: 'dag:updateStatus'; taskId: string; status: TaskStatus; durationMs?: number }
  | { kind: 'dag:batchUpdateStatus'; updates: Array<{ taskId: string; status: TaskStatus; durationMs?: number }> }
  | { kind: 'dag:focus'; taskId: string }
  | { kind: 'dag:cursorHint'; taskId: string | null }
  | { kind: 'dag:note'; icon: string; text: string; taskId?: string; cls?: string }
  | { kind: 'dag:clear' }
  | { kind: 'dag:fitToView' }
  | { kind: 'theme:changed' }
  | { kind: 'theme:mode'; mode: 'nika' | 'editor' }
  | { kind: 'run:state'; running: boolean }
  | { kind: 'dag:stale'; stale: string[]; direct: string[] }
  | { kind: 'dag:audit'; audits: Array<{ taskId: string; count: number; worst: 'error' | 'warning' | 'info' }> }
  | { kind: 'dag:replayLoad'; timeline: TimelineEntry[]; label: string; speed: number }
  | { kind: 'dag:replayEnd' };

// ─── VS Code API ────────────────────────────────────────────────────────────

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): WebviewState | undefined;
  setState(state: WebviewState): void;
}

interface WebviewState {
  graph?: DagGraph;
  zoom?: number;
  panX?: number;
  panY?: number;
  showWaves?: boolean;
  smoothEdges?: boolean;
  showFeed?: boolean;
  seenHint?: boolean;
}

declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

// ─── Constants ──────────────────────────────────────────────────────────────

const NODE_WIDTH = 248;
const NODE_HEIGHT = 56; // minimum — content grows the card (Flows anatomy)
const NODE_RADIUS = 8;
const PADDING = 40;

// Card anatomy metrics (must mirror the .nc-* CSS so ELK gets true boxes:
// padding 8+9 · head 17 · sub 13 · 3px flex gaps · body 15/line · params 21).
const CARD_PAD_Y = 8.5;
const HEAD_H = 17;
const SUB_H = 16;
const BODY_LINE_H = 15;
const PARAMS_H = 24;

/** Body preview text for a node (verb decides which fact leads). */
function bodyTextOf(node: DagNode): { kind: 'prompt' | 'cmd' | 'args'; text: string } | undefined {
  if (node.promptPreview) { return { kind: 'prompt', text: node.promptPreview }; }
  if (node.commandPreview) { return { kind: 'cmd', text: node.commandPreview }; }
  if (node.argsPreview) { return { kind: 'args', text: node.argsPreview }; }
  return undefined;
}

/** Whether the params row (model chip · cost · avg) has anything to show. */
function hasParamsRow(node: DagNode): boolean {
  return node.model !== undefined || node.tool !== undefined
    || (node.costMin != null && node.costMax != null)
    || node.avgMs !== undefined;
}

/** Card height from content — the layout must know the TRUE box. */
function nodeHeightOf(node: DagNode): number {
  let h = CARD_PAD_Y * 2 + HEAD_H + SUB_H;
  const body = bodyTextOf(node);
  if (body) {
    const lines = body.kind === 'prompt'
      ? Math.min(body.text.split('\n').length, 3)
      : 1;
    // Prompt wraps: budget by character count too (≈34 chars/line).
    const wrapLines = body.kind === 'prompt'
      ? Math.max(lines, Math.min(3, Math.ceil(body.text.replace(/\n/g, ' ').length / 34)))
      : lines;
    h += 3 + wrapLines * BODY_LINE_H;
  }
  if (hasParamsRow(node)) { h += 3 + PARAMS_H; }
  return Math.max(h, NODE_HEIGHT);
}

/** Verb -> icon (simple Unicode — no font dependency) */
// The nika.sh canon glyph set (still plain Unicode \u2014 no font dependency).
const VERB_ICONS: Record<Verb, string> = {
  infer: '\u25C7',  // \u25C7 diamond outline
  exec: '\u25B7',   // \u25B7 play triangle
  invoke: '\u25C6', // \u25C6 filled diamond
  agent: '\u2726',  // \u2726 four-point star
};

/** ONE class string for a node group — status, verb, staleness. */
function nodeClassOf(node: DagNode): string {
  return `dag-node status-${node.status} verb-${node.verb}`
    + (node.stale ? ' is-stale' : '')
    + (node.staleUpstream ? ' stale-up' : '')
    + (node.auditCount ? ` has-audit audit-${node.auditWorst ?? 'error'}` : '');
}

function verbIcon(verb: string): string {
  return (VERB_ICONS as Record<string, string>)[verb] ?? '\u25CB'; // \u25CB unknown
}

function usd(n: number): string {
  return `$${n.toFixed(n < 0.1 ? 4 : 2)}`;
}

// ─── ELK Layout Engine ──────────────────────────────────────────────────────

const elk = new ELK();

/** Convert DagGraph into ELK input, run layout, return positioned result */
async function computeLayout(graph: DagGraph): Promise<ElkNode> {
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.spacing.edgeNodeBetweenLayers': '20',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '15',
      'elk.padding': `[top=${PADDING},left=${PADDING},bottom=${PADDING},right=${PADDING}]`,
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    },
    children: graph.nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: nodeHeightOf(node),
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  return elk.layout(elkGraph);
}

// ─── D3 SVG Renderer ────────────────────────────────────────────────────────

class DagRenderer {
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private rootGroup: Selection<SVGGElement, unknown, null, undefined>;
  private bandGroup: Selection<SVGGElement, unknown, null, undefined>;
  private regionGroup: Selection<SVGGElement, unknown, null, undefined>;
  private edgeGroup: Selection<SVGGElement, unknown, null, undefined>;
  private nodeGroup: Selection<SVGGElement, unknown, null, undefined>;
  private zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;
  private currentGraph: DagGraph | undefined;
  private nodeMap: Map<string, DagNode> = new Map();
  private container: HTMLElement;
  private hoverCard: HTMLElement | null;
  /** Use smooth curves instead of orthogonal segments for edges */
  public smoothEdges = false;
  /** Wave bands (topological levels) visible */
  public showWaves = true;
  /** Adjacency for focus mode + edge flow (edge id → endpoints). */
  private edgeEnds = new Map<string, { source: string; target: string }>();
  private upstreamOf = new Map<string, string[]>();
  private downstreamOf = new Map<string, string[]>();
  /** Edge ids on the critical path. */
  private criticalEdges = new Set<string>();
  /** Ghost edge ids (never flow · never critical · click = fix). */
  private ghostIds = new Set<string>();
  private focusedId: string | null = null;
  /** All nodes terminal at last look — the aurora fires on the flip only. */
  private wasAllTerminal = false;
  /** node id → wave index (entrance stagger + bands). */
  private waveOf = new Map<string, number>();
  /** node id → laid-out box (centerOn · editor-driven focus). */
  private layoutBox = new Map<string, { x: number; y: number; w: number; h: number }>();
  /** Live zoom transform (kept to preserve scale while centering). */
  private currentZoom = 1;
  private currentTx = 0;
  private currentTy = 0;
  /** Graph extent in root coords (minimap scale). */
  private graphW = 1;
  private graphH = 1;
  /** Alt-drag edge creation state. */
  private connectFrom: string | null = null;
  private tempEdge: Selection<SVGPathElement, unknown, null, undefined> | null = null;
  /** Structural DAG read, cached per load (hover-card blast/pinch rows). */
  private structuralInsights: DagInsights | undefined;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
    this.hoverCard = document.getElementById('hover-card');

    this.svg = select(this.container)
      .append<SVGSVGElement>('svg')
      .attr('class', 'dag-svg')
      .attr('width', '100%')
      .attr('height', '100%');

    // SVG defs: arrowhead markers + glow filter
    const defs = this.svg.append('defs');
    this.createArrowMarkers(defs);
    this.createGlowFilter(defs);

    // Root group receives all zoom/pan transforms
    this.rootGroup = this.svg.append<SVGGElement>('g').attr('class', 'dag-root');
    // Wave bands at the very back — the parallelism explained visually
    this.bandGroup = this.rootGroup.append<SVGGElement>('g').attr('class', 'dag-bands');
    // Author regions above bands, still behind edges + nodes
    this.regionGroup = this.rootGroup.append<SVGGElement>('g').attr('class', 'dag-regions');
    // Edges below nodes
    this.edgeGroup = this.rootGroup.append<SVGGElement>('g').attr('class', 'dag-edges');
    // Nodes on top
    this.nodeGroup = this.rootGroup.append<SVGGElement>('g').attr('class', 'dag-nodes');

    // Background click clears focus mode.
    this.svg.on('click', (event: MouseEvent) => {
      if ((event.target as Element).closest('.dag-node')) { return; }
      this.applyFocus(null);
    });

    // Alt-drag edge creation: track the rubber edge + drop target.
    this.svg.on('mousemove.connect', (event: MouseEvent) => {
      if (!this.connectFrom || !this.tempEdge) { return; }
      const from = this.layoutBox.get(this.connectFrom);
      if (!from) { return; }
      const [px, py] = this.screenToRoot(event.clientX, event.clientY);
      this.tempEdge.attr('d', `M ${from.x + from.w / 2} ${from.y + from.h} L ${px} ${py}`);
    });
    this.svg.on('mouseup.connect', (event: MouseEvent) => {
      if (!this.connectFrom) { return; }
      const from = this.connectFrom;
      this.endConnect();
      const targetEl = (event.target as Element).closest('.dag-node');
      const to = targetEl?.getAttribute('data-id');
      if (to && to !== from) {
        vscode.postMessage({
          kind: 'dag:connect',
          from,
          to,
          workflowUri: this.currentGraph?.workflowUri,
        });
        return;
      }
      // Dropped on EMPTY canvas — the Flows gesture: open a verb cmdk AT
      // the cursor to pick the new task's verb; insertTaskSkeleton then
      // declares depends_on: [from] extension-side.
      if (!targetEl) {
        verbCmdk.open(event.clientX, event.clientY, (verb) => {
          vscode.postMessage({
            kind: 'dag:addTask',
            verb,
            afterTaskId: from,
            workflowUri: this.currentGraph?.workflowUri,
          });
        });
      }
    });

    // Zoom + pan
    this.zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        this.currentZoom = event.transform.k;
        this.currentTx = event.transform.x;
        this.currentTy = event.transform.y;
        this.updateMinimapViewport();
        this.updateZoomChrome();
        this.rootGroup.attr('transform', event.transform.toString());
        this.saveState({
          zoom: event.transform.k,
          panX: event.transform.x,
          panY: event.transform.y,
        });
        vscode.postMessage({
          kind: 'dag:viewportChanged',
          zoom: event.transform.k,
          panX: event.transform.x,
          panY: event.transform.y,
        });
      });

    this.svg.call(this.zoomBehavior);

    // Restore saved viewport
    const savedState = vscode.getState();
    if (savedState?.zoom != null && savedState.panX != null && savedState.panY != null) {
      const t = zoomIdentity
        .translate(savedState.panX, savedState.panY)
        .scale(savedState.zoom);
      this.svg.call(this.zoomBehavior.transform, t);
    }
  }

  private createArrowMarkers(defs: Selection<SVGDefsElement, unknown, null, undefined>): void {
    // Data edge arrow (solid, blue)
    defs
      .append('marker')
      .attr('id', 'arrow-data')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 10)
      .attr('refY', 5)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('class', 'arrow-data');

    // Dependency arrow (subtle, gray)
    defs
      .append('marker')
      .attr('id', 'arrow-dep')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 10)
      .attr('refY', 5)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('class', 'arrow-dep');
  }

  private createGlowFilter(defs: Selection<SVGDefsElement, unknown, null, undefined>): void {
    const filter = defs
      .append('filter')
      .attr('id', 'glow-running')
      .attr('x', '-20%')
      .attr('y', '-20%')
      .attr('width', '140%')
      .attr('height', '140%');

    filter
      .append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', '3')
      .attr('result', 'blur');

    const merge = filter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');
  }

  // ─── Render Pipeline ────────────────────────────────────────────────────

  async render(graph: DagGraph): Promise<void> {
    this.currentGraph = graph;
    this.nodeMap.clear();
    graph.nodes.forEach((n) => this.nodeMap.set(n.id, n));

    // Adjacency (focus mode · edge flow) + waves (bands · stagger).
    this.edgeEnds.clear();
    this.upstreamOf.clear();
    this.downstreamOf.clear();
    this.ghostIds.clear();
    for (const e of graph.edges) {
      this.edgeEnds.set(e.id, { source: e.source, target: e.target });
      if (e.ghost) { this.ghostIds.add(e.id); }
      (this.upstreamOf.get(e.target) ?? this.upstreamOf.set(e.target, []).get(e.target)!).push(e.source);
      (this.downstreamOf.get(e.source) ?? this.downstreamOf.set(e.source, []).get(e.source)!).push(e.target);
    }
    this.waveOf.clear();
    const waves = topoWaves(graph.nodes, graph.edges);
    waves.forEach((wave, i) => wave.forEach((id) => this.waveOf.set(id, i)));
    // A graph that ARRIVES complete (restored panel · finished trace) must
    // not fire the aurora — only a LIVE transition to complete does.
    this.wasAllTerminal = graph.nodes.length > 0 && graph.nodes.every(
      (n) => n.status !== 'pending' && n.status !== 'running' && n.status !== 'retrying',
    );
    this.recomputeCritical();
    // Structural read (width · pinch · blast radius) — durations don't
    // change structure, so this caches per load; the explainer recomputes
    // fresh at open for the duration-sensitive numbers.
    this.structuralInsights = analyzeDag(graph.nodes, graph.edges);

    this.saveState({ graph });

    const layoutResult = await computeLayout(graph);

    // Update toolbar
    const titleEl = document.getElementById('dag-title');
    if (titleEl) titleEl.textContent = graph.workflowName;

    // Loaded → the empty state yields to the canvas.
    document.getElementById('empty-state')?.setAttribute('hidden', '');

    // Remember laid-out boxes for editor-driven centerOn.
    this.layoutBox.clear();
    for (const n of layoutResult.children ?? []) {
      this.layoutBox.set(n.id, {
        x: n.x ?? 0, y: n.y ?? 0,
        w: n.width ?? NODE_WIDTH, h: n.height ?? NODE_HEIGHT,
      });
    }

    // Wave bands at the back, then edges, then nodes.
    this.renderWaveBands(layoutResult.children ?? [], waves.length);
    this.renderRegions();
    this.renderEdges(layoutResult.edges ?? [], graph.edges);
    this.renderNodes(layoutResult.children ?? [], graph.nodes);

    // A focus carried over from a DIFFERENT workflow (follow-mode
    // retarget) would dim the entire new graph — drop it.
    if (this.focusedId && !this.nodeMap.has(this.focusedId)) {
      this.focusedId = null;
    }
    // Same for the live filter: its match set points at the OLD graph's
    // ids — recompute against the new one (the query survives, the
    // stale set must not dim everything).
    const search = document.getElementById('dag-search') as HTMLInputElement | null;
    if (search && !search.hidden && search.value.trim().length > 0) {
      this.applyFilter(search.value.trim());
    } else {
      this.filterMatches = null;
    }
    this.applyFocus(this.focusedId);
    this.updateEdgeFlow();
    this.updateStatusDisplay();

    // Auto-fit on first render if no saved viewport
    const savedState = vscode.getState();
    if (!savedState?.zoom) {
      this.fitToView(layoutResult);
    }

    this.renderMinimap();

    // A focus request that raced the layout replays now that boxes exist.
    if (this.pendingCenter) {
      const target = this.pendingCenter;
      this.pendingCenter = undefined;
      this.focusAndCenter(target);
    }
  }

  /**
   * Fresh full analysis (durations included) — the explainer's numbers.
   * Recomputed at open so a finished run upgrades the read from unit
   * weights to measured milliseconds.
   */
  computeInsights(): DagInsights | undefined {
    if (!this.currentGraph || this.currentGraph.nodes.length === 0) { return undefined; }
    return analyzeDag(this.currentGraph.nodes, this.currentGraph.edges);
  }

  /** Longest chain (durations when known, else hops) → edge highlight set. */
  private recomputeCritical(): void {
    this.criticalEdges.clear();
    if (!this.currentGraph || this.currentGraph.nodes.length < 2) { return; }
    // Ghost edges are MISSING wires — they must not define the wall-clock.
    const path = criticalPath(
      this.currentGraph.nodes,
      this.currentGraph.edges.filter((e) => !e.ghost),
    );
    for (let i = 0; i + 1 < path.length; i++) {
      this.criticalEdges.add(`${path[i]}->${path[i + 1]}`);
    }
  }

  /**
   * Author regions (`# nika:region`) as labeled background boxes behind
   * the member cards — the bounding box of the region's laid-out nodes.
   * A tiny palette cycles by index so adjacent regions read apart.
   */
  private renderRegions(): void {
    this.regionGroup.selectAll('*').remove();
    const regions = this.currentGraph?.regions;
    if (!regions || regions.length === 0) { return; }
    const PAD = 16;
    const LABEL_H = 16;
    regions.forEach((region, i) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let members = 0;
      for (const id of region.taskIds) {
        const b = this.layoutBox.get(id);
        if (!b) { continue; }
        members += 1;
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w);
        maxY = Math.max(maxY, b.y + b.h);
      }
      if (members === 0) { return; }
      const g = this.regionGroup.append('g').attr('class', `region region-hue-${i % 6}`);
      g.append('rect')
        .attr('class', 'region-box')
        .attr('x', minX - PAD)
        .attr('y', minY - PAD - LABEL_H)
        .attr('width', maxX - minX + PAD * 2)
        .attr('height', maxY - minY + PAD * 2 + LABEL_H)
        .attr('rx', 10);
      g.append('text')
        .attr('class', 'region-label')
        .attr('x', minX - PAD + 10)
        .attr('y', minY - PAD - LABEL_H + 11)
        .text(region.name);
    });
  }

  /** Background bands per topological wave — parallelism made visible. */
  private renderWaveBands(elkNodes: ElkNode[], waveCount: number): void {
    this.bandGroup.selectAll('*').remove();
    if (!this.showWaves || waveCount < 2) { return; }

    const byWave = new Map<number, { top: number; bottom: number }>();
    let maxX = 0;
    for (const n of elkNodes) {
      const wave = this.waveOf.get(n.id);
      if (wave === undefined || n.y === undefined) { continue; }
      const top = n.y;
      const bottom = n.y + (n.height ?? NODE_HEIGHT);
      const cur = byWave.get(wave);
      byWave.set(wave, {
        top: cur ? Math.min(cur.top, top) : top,
        bottom: cur ? Math.max(cur.bottom, bottom) : bottom,
      });
      maxX = Math.max(maxX, (n.x ?? 0) + (n.width ?? NODE_WIDTH));
    }

    for (const [wave, ext] of byWave) {
      const band = this.bandGroup.append('g').attr('class', 'wave-band-group');
      band.append('rect')
        .attr('class', `wave-band ${wave % 2 === 0 ? 'even' : 'odd'}`)
        .attr('x', -PADDING / 2)
        .attr('y', ext.top - 10)
        .attr('width', maxX + PADDING)
        .attr('height', ext.bottom - ext.top + 20)
        .attr('rx', 6);
      band.append('text')
        .attr('class', 'wave-label')
        .attr('x', -PADDING / 2 + 8)
        .attr('y', ext.top + 4)
        .text(`wave ${wave + 1}`);
    }
  }

  /**
   * Focus mode: dim everything not on the selected node's lineage; the
   * upstream chain and downstream cone stay lit — « what feeds this ·
   * what it unlocks », the DAG explaining itself.
   */
  /** Focus lineage set (null = no focus) — one input to the dim truth. */
  private focusRelated: Set<string> | null = null;
  /** Live `/`-filter matches (null = no filter) — the other input. */
  private filterMatches: Set<string> | null = null;

  private applyFocus(id: string | null): void {
    this.focusedId = id;
    if (id === null) {
      this.focusRelated = null;
    } else {
      const related = new Set<string>();
      const walk = (start: string, adj: Map<string, string[]>): void => {
        const queue = [start];
        while (queue.length > 0) {
          const cur = queue.pop()!;
          for (const next of adj.get(cur) ?? []) {
            if (!related.has(next)) { related.add(next); queue.push(next); }
          }
        }
      };
      related.add(id);
      walk(id, this.upstreamOf);
      walk(id, this.downstreamOf);
      this.focusRelated = related;
    }
    this.refreshDim();
  }

  /** Focus lineage ∧ filter matches — ONE dimming truth for nodes+edges. */
  private refreshDim(): void {
    const dimNode = (nid: string): boolean =>
      (this.focusRelated !== null && !this.focusRelated.has(nid))
      || (this.filterMatches !== null && !this.filterMatches.has(nid));
    this.nodeGroup.selectAll<SVGGElement, DagNode>('.dag-node')
      .classed('dimmed', (d) => dimNode(d.id))
      .classed('selected', (d) => d.id === this.focusedId);
    this.edgeGroup.selectAll<SVGPathElement, ElkExtendedEdge>('.dag-edge')
      .classed('dimmed', (d) => {
        const ends = this.edgeEnds.get(d.id);
        if (!ends) { return this.focusRelated !== null || this.filterMatches !== null; }
        return dimNode(ends.source) || dimNode(ends.target);
      });
  }

  /** Live text filter (`/`): non-matching fades; returns the match count. */
  applyFilter(query: string | null): number {
    if (!query || !this.currentGraph) {
      this.filterMatches = null;
      this.refreshDim();
      return 0;
    }
    const q = query.toLowerCase();
    this.filterMatches = new Set(
      this.currentGraph.nodes
        .filter((n) =>
          n.id.toLowerCase().includes(q)
          || n.verb.toLowerCase().includes(q)
          || (n.model ?? '').toLowerCase().includes(q)
          || (n.tool ?? '').toLowerCase().includes(q)
          || (n.provider ?? '').toLowerCase().includes(q))
        .map((n) => n.id),
    );
    this.refreshDim();
    return this.filterMatches.size;
  }

  /** Current filter matches in node order (Enter cycles these). */
  filteredIds(): string[] {
    const matches = this.filterMatches;
    if (!matches || !this.currentGraph) { return []; }
    return this.currentGraph.nodes.filter((n) => matches.has(n.id)).map((n) => n.id);
  }

  /** Public escape hatch for the Esc key. */
  clearFocus(): void {
    this.applyFocus(null);
  }

  /** The focused node id (Delete-key target · add-task anchor). */
  get focused(): string | null {
    return this.focusedId;
  }

  /** Screen → root-group coordinates (inverts the live zoom transform). */
  private screenToRoot(clientX: number, clientY: number): [number, number] {
    const rect = this.svg.node()?.getBoundingClientRect();
    if (!rect) { return [0, 0]; }
    return [
      (clientX - rect.left - this.currentTx) / this.currentZoom,
      (clientY - rect.top - this.currentTy) / this.currentZoom,
    ];
  }

  startConnect(fromId: string): void {
    this.connectFrom = fromId;
    this.tempEdge = this.rootGroup.append<SVGPathElement>('path').attr('class', 'temp-edge');
    this.svg.classed('connecting', true);
  }

  private endConnect(): void {
    this.connectFrom = null;
    this.tempEdge?.remove();
    this.tempEdge = null;
    this.svg.classed('connecting', false);
  }

  /** Cancel an in-flight connect (Esc). Returns true when one was live. */
  cancelConnect(): boolean {
    if (!this.connectFrom) { return false; }
    this.endConnect();
    return true;
  }

  /** Delete-key entry: ask the extension to remove the focused task. */
  requestDeleteFocused(): void {
    if (!this.focusedId) { return; }
    vscode.postMessage({
      kind: 'dag:deleteTask',
      taskId: this.focusedId,
      workflowUri: this.currentGraph?.workflowUri,
    });
  }

  // ─── Minimap ──────────────────────────────────────────────────────────────

  private renderMinimap(): void {
    const mm = document.getElementById('minimap-svg');
    const host = document.getElementById('minimap');
    if (!mm || !host || !this.currentGraph) { return; }
    const PAD = 6;
    // The card is responsive (CSS shrinks it on narrow panels) — measure
    // the live box; hardcoded dims would misplace the viewport rect.
    const W = host.clientWidth || 148;
    const H = host.clientHeight || 96;
    while (mm.firstChild) { mm.removeChild(mm.firstChild); }
    mm.setAttribute('width', String(W));
    mm.setAttribute('height', String(H));

    let maxX = 1;
    let maxY = 1;
    for (const b of this.layoutBox.values()) {
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    this.graphW = maxX;
    this.graphH = maxY;
    const s = Math.min((W - PAD * 2) / maxX, (H - PAD * 2) / maxY);

    const ns = 'http://www.w3.org/2000/svg';
    for (const [id, b] of this.layoutBox) {
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', String(PAD + b.x * s));
      r.setAttribute('y', String(PAD + b.y * s));
      r.setAttribute('width', String(Math.max(b.w * s, 2)));
      r.setAttribute('height', String(Math.max(b.h * s, 2)));
      r.setAttribute('rx', '1');
      r.setAttribute('data-id', id);
      const status = this.nodeMap.get(id)?.status ?? 'pending';
      r.setAttribute('class', `mm-node st-${status}`);
      mm.appendChild(r);
    }
    (mm.dataset as { scale?: string; pad?: string }).scale = String(s);
    mm.dataset.pad = String(PAD);
    this.updateMinimapViewport();
  }

  private updateMinimapViewport(): void {
    const mm = document.getElementById('minimap-svg');
    const vp = document.getElementById('minimap-viewport');
    const host = document.getElementById('minimap');
    const svgEl = this.svg.node();
    if (!mm || !vp || !host || !svgEl) { return; }
    const s = Number(mm.dataset.scale ?? 0);
    const pad = Number(mm.dataset.pad ?? 0);
    if (s <= 0) { return; }
    const { width: svgW, height: svgH } = svgEl.getBoundingClientRect();
    // Visible root-rect = the svg viewport pushed through the inverse zoom.
    const x0 = (-this.currentTx) / this.currentZoom;
    const y0 = (-this.currentTy) / this.currentZoom;
    const w = svgW / this.currentZoom;
    const h = svgH / this.currentZoom;
    vp.style.left = `${pad + x0 * s}px`;
    vp.style.top = `${pad + y0 * s}px`;
    vp.style.width = `${Math.max(w * s, 8)}px`;
    vp.style.height = `${Math.max(h * s, 8)}px`;
  }

  /**
   * Scrubber frame: set every node to its status at the scrub instant —
   * NO feed narration (scrubbing back and forth must not spam the feed).
   * The graph-wide consequences (critical path · flow · legend) run once.
   */
  paintFrame(frames: FrameEntry[]): void {
    for (const f of frames) {
      const node = this.nodeMap.get(f.taskId);
      if (!node) { continue; }
      node.status = f.status as TaskStatus;
      node.durationMs = f.durationMs;
      const el = this.nodeGroup.select(`[data-id="${CSS.escape(f.taskId)}"]`);
      el.attr('class', nodeClassOf(node));
      el.select('.nc-sub').text(this.getSubtitle(node));
      document.querySelector(`#minimap-svg rect[data-id="${CSS.escape(f.taskId)}"]`)
        ?.setAttribute('class', `mm-node st-${f.status}`);
    }
    this.recomputeCritical();
    this.updateEdgeFlow();
    this.refreshDim();
    this.updateStatusDisplay();
  }

  /** dag:audit — refresh the ⚠N chips in place (rebuild the card body). */
  applyAudit(audits: Array<{ taskId: string; count: number; worst: 'error' | 'warning' | 'info' }>): void {
    const byId = new Map(audits.map((a) => [a.taskId, a]));
    for (const node of this.nodeMap.values()) {
      const a = byId.get(node.id);
      node.auditCount = a?.count;
      node.auditWorst = a?.worst;
      const el = this.nodeGroup.select(`[data-id="${CSS.escape(node.id)}"]`);
      el.attr('class', nodeClassOf(node));
      const host = el.select<HTMLElement>('.nc').node();
      if (host) { this.buildCardHtml(host, node); }
    }
    this.refreshDim();
  }

  /** dag:stale — refresh badges in place; run statuses stay painted. */
  applyStale(stale: string[], direct: string[]): void {
    const staleSet = new Set(stale);
    const directSet = new Set(direct);
    for (const node of this.nodeMap.values()) {
      node.stale = staleSet.has(node.id) ? true : undefined;
      node.staleUpstream = node.stale && !directSet.has(node.id) ? true : undefined;
    }
    this.nodeGroup.selectAll<SVGGElement, DagNode>('.dag-node')
      .attr('class', (d) => nodeClassOf(this.nodeMap.get(d.id) ?? d));
    // attr('class') wiped the overlay classes — restore dim/selection.
    this.refreshDim();
    this.saveState({ graph: this.currentGraph });
  }

  /** Current graph's nodes (stale flags · the run pill chip reads these). */
  currentNodes(): DagNode[] {
    return this.currentGraph?.nodes ?? [];
  }

  /** Current graph's node ids — the scrubber seeds complete frames. */
  nodeIds(): string[] {
    return [...this.nodeMap.keys()];
  }

  /** Re-measure + redraw the minimap (panel resize re-scales the card). */
  refreshMinimap(): void {
    this.renderMinimap();
  }

  /**
   * Zoom-dependent chrome: the % chip + semantic level-of-detail. Far
   * out, cards collapse to id+status (the graph reads like a map);
   * mid drops the params row; near shows everything.
   */
  private updateZoomChrome(): void {
    const pct = document.getElementById('zoom-pct');
    if (pct) { pct.textContent = `${Math.round(this.currentZoom * 100)}%`; }
    const lod = this.currentZoom < 0.55 ? 'lod-far' : this.currentZoom < 0.85 ? 'lod-mid' : 'lod-near';
    if (!document.body.classList.contains(lod)) {
      document.body.classList.remove('lod-far', 'lod-mid', 'lod-near');
      document.body.classList.add(lod);
    }
  }

  // ─── Image export · the WHOLE graph, styles + font embedded ──────────────

  async exportImage(format: 'svg' | 'png'): Promise<void> {
    const svgEl = this.svg.node();
    if (!svgEl || !this.currentGraph || this.layoutBox.size === 0) { return; }

    // Export frame = the graph extent, never the live viewport.
    let maxX = 1;
    let maxY = 1;
    for (const b of this.layoutBox.values()) {
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    const W = Math.ceil(maxX + PADDING);
    const H = Math.ceil(maxY + PADDING);

    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(W));
    clone.setAttribute('height', String(H));
    clone.setAttribute('viewBox', `0 0 ${W} ${H}`);
    clone.querySelector('g.dag-root')?.removeAttribute('transform');

    // Styles travel INSIDE the file; skin rules re-anchor on :root so the
    // exported image keeps the active register.
    const nikaSkin = document.body.dataset.nkTheme === 'nika';
    let css = '';
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRule[];
      try {
        rules = Array.from(sheet.cssRules);
      } catch {
        continue;
      }
      for (const r of rules) { css += `${r.cssText}\n`; }
    }
    if (nikaSkin) {
      css = css.replace(/body\[data-nk-theme=["']nika["']\]/g, ':root');
    }
    // Bake the LIVE token values: the editor injects --vscode-* on a DOM
    // ancestor that never travels with the file, so var() chains would
    // collapse to their hardcoded fallbacks — the exported image must
    // keep the user's actual theme.
    const live = getComputedStyle(document.body);
    const baked = [
      'nk-accent', 'nk-data', 'nk-border', 'nk-surface', 'nk-page',
      'nk-ink', 'nk-ink-dim', 'nk-mono', 'nk-st-running', 'nk-st-success',
      'nk-st-failed', 'nk-st-retrying', 'nk-st-muted', 'nk-critical',
      'nk-verb-infer', 'nk-verb-exec', 'nk-verb-invoke', 'nk-verb-agent',
    ]
      .map((t) => ({ t, v: live.getPropertyValue(`--${t}`).trim() }))
      .filter(({ v }) => v.length > 0)
      .map(({ t, v }) => `--${t}: ${v};`)
      .join(' ');
    css += `\n:root { ${baked} }`;
    const font = await inlineFontDataUri();
    if (font) {
      css += `@font-face{font-family:'Martian Mono';src:url('${font}') format('woff2');font-weight:100 800;}`;
    }
    const ns = 'http://www.w3.org/2000/svg';
    const style = document.createElementNS(ns, 'style');
    style.textContent = css;
    clone.insertBefore(style, clone.firstChild);

    // Background plate — the pool behind the graph.
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(W));
    bg.setAttribute('height', String(H));
    bg.setAttribute('fill', getComputedStyle(document.body).backgroundColor);
    clone.insertBefore(bg, style.nextSibling);

    const svgText = new XMLSerializer().serializeToString(clone);
    const name = `${this.currentGraph.workflowName || 'workflow'}-dag`;
    if (format === 'svg') {
      vscode.postMessage({ kind: 'dag:export', format, data: svgText, name: `${name}.svg` });
      return;
    }

    // PNG · rasterize at 2× through an image element (data: URL — the CSP
    // allows data: images; blob: would be refused).
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg rasterization failed'));
    });
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
    try {
      await loaded;
    } catch {
      // Fall back to the vector form rather than failing the gesture.
      vscode.postMessage({ kind: 'dag:export', format: 'svg', data: svgText, name: `${name}.svg` });
      return;
    }
    // Raster scale clamps to Chromium's safe canvas ceiling — a huge
    // graph exports at reduced DPI instead of a silent blank PNG.
    const scale = Math.min(2, 8192 / W, 8192 / H);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(W * scale);
    canvas.height = Math.ceil(H * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) { return; }
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    let data: string;
    try {
      data = canvas.toDataURL('image/png');
    } catch {
      // Rasterization refused (taint/size edge) — ship the vector form.
      vscode.postMessage({ kind: 'dag:export', format: 'svg', data: svgText, name: `${name}.svg` });
      return;
    }
    vscode.postMessage({ kind: 'dag:export', format, data, name: `${name}.png` });
  }

  /** Click the minimap → center the main view on that point. */
  minimapNavigate(clientX: number, clientY: number): void {
    const mm = document.getElementById('minimap-svg');
    const svgEl = this.svg.node();
    if (!mm || !svgEl) { return; }
    const s = Number(mm.dataset.scale ?? 0);
    const pad = Number(mm.dataset.pad ?? 0);
    if (s <= 0) { return; }
    const rect = mm.getBoundingClientRect();
    const rootX = (clientX - rect.left - pad) / s;
    const rootY = (clientY - rect.top - pad) / s;
    const { width: svgW, height: svgH } = svgEl.getBoundingClientRect();
    const k = this.currentZoom;
    const t = zoomIdentity.translate(svgW / 2 - rootX * k, svgH / 2 - rootY * k).scale(k);
    this.svg
      .transition().duration(REDUCED_MOTION ? 0 : 240)
      .call(this.zoomBehavior.transform as D3ZoomCall, t);
  }

  /**
   * Soft editor-caret hint: a gentle halo on the node whose YAML the
   * cursor is in. Distinct from selection/focus — it never dims others,
   * it just whispers « you are here ».
   */
  cursorHint(taskId: string | null): void {
    this.nodeGroup.selectAll<SVGGElement, DagNode>('.dag-node')
      .classed('cursor-hint', (d) => taskId !== null && d.id === taskId);
  }

  /** Focus queued while ELK is still laying out (race: focus ≺ layout). */
  private pendingCenter: string | undefined;

  /** Keyboard nav: move focus by direction over the DAG structure. */
  navFocus(dir: NavDir): void {
    if (!this.currentGraph) { return; }
    const target = nextFocus(this.currentGraph.nodes, this.currentGraph.edges, this.focusedId ?? undefined, dir);
    if (target) { this.focusAndCenter(target); }
  }

  /** Editor-driven focus: light the lineage AND glide the node to center. */
  focusAndCenter(taskId: string): void {
    if (!this.nodeMap.has(taskId)) { return; }
    this.applyFocus(taskId);
    const box = this.layoutBox.get(taskId);
    const svgEl = this.svg.node();
    if (!box) {
      // dag:focus can land mid-render (layout is async) — replay after.
      this.pendingCenter = taskId;
      return;
    }
    if (!svgEl) { return; }
    const { width: svgW, height: svgH } = svgEl.getBoundingClientRect();
    const k = Math.max(this.currentZoom, 0.6);
    const t = zoomIdentity
      .translate(svgW / 2 - (box.x + box.w / 2) * k, svgH / 2 - (box.y + box.h / 2) * k)
      .scale(k);
    this.svg
      .transition().duration(REDUCED_MOTION ? 0 : 420)
      .call(this.zoomBehavior.transform as D3ZoomCall, t);
  }

  /** Data flows: edges whose source completed get the animated current. */
  private updateEdgeFlow(): void {
    this.edgeGroup.selectAll<SVGPathElement, ElkExtendedEdge>('.dag-edge')
      .classed('flowing', (d) => {
        if (this.ghostIds.has(d.id)) { return false; } // nothing crosses a missing wire
        const ends = this.edgeEnds.get(d.id);
        return ends ? this.nodeMap.get(ends.source)?.status === 'success' : false;
      })
      .classed('critical', (d) => this.criticalEdges.has(d.id));
  }

  private renderNodes(elkNodes: ElkNode[], dagNodes: DagNode[]): void {
    const elkMap = new Map(elkNodes.map((n) => [n.id, n]));

    // D3 data join keyed by task ID
    const groups = this.nodeGroup
      .selectAll<SVGGElement, DagNode>('g.dag-node')
      .data(dagNodes, (d) => d.id);

    // EXIT
    groups.exit()
      .transition().duration(200)
      .attr('opacity', 0)
      .remove();

    // ENTER — the Flows-grade card: an SVG frame (status ring · LED spine
    // · spinner live in SVG so every status/skin rule keeps working) with
    // a foreignObject body (real HTML: wrapping prompt text, chips, the
    // model button). The node IS the content.
    const enter = groups
      .enter()
      .append('g')
      .attr('class', (d) => nodeClassOf(d))
      .attr('data-id', (d) => d.id)
      .attr('opacity', 0);

    // Node background rect (variable height — the card grows with content)
    enter
      .append('rect')
      .attr('class', 'node-bg')
      .attr('width', NODE_WIDTH)
      .attr('height', (d) => nodeHeightOf(d))
      .attr('rx', NODE_RADIUS)
      .attr('ry', NODE_RADIUS);

    // Status/verb LED spine (left edge)
    enter
      .append('rect')
      .attr('class', 'node-status-bar')
      .attr('width', 4)
      .attr('height', (d) => nodeHeightOf(d) - 8)
      .attr('x', 4)
      .attr('y', 4)
      .attr('rx', 2)
      .attr('ry', 2);

    // HTML card content
    enter
      .append('foreignObject')
      .attr('class', 'node-fo')
      .attr('x', 8)
      .attr('y', 0)
      .attr('width', NODE_WIDTH - 14)
      .attr('height', (d) => nodeHeightOf(d))
      .append('xhtml:div')
      .attr('class', 'nc')
      .each((d, i, els) => this.buildCardHtml(els[i] as HTMLElement, d));

    // Running spinner (animated via CSS) — header-right corner.
    enter
      .append('circle')
      .attr('class', 'node-spinner')
      .attr('cx', NODE_WIDTH - 18)
      .attr('cy', 19)
      .attr('r', 6);

    // Ports — the visible connect affordance (drag out-port → card).
    enter
      .append('circle')
      .attr('class', 'nc-port nc-port-in')
      .attr('cx', NODE_WIDTH / 2)
      .attr('cy', 0)
      .attr('r', 4);
    enter
      .append('circle')
      .attr('class', 'nc-port nc-port-out')
      .attr('cx', NODE_WIDTH / 2)
      .attr('cy', (d) => nodeHeightOf(d))
      .attr('r', 4)
      .on('mousedown', (event: MouseEvent, d: DagNode) => {
        event.preventDefault();
        event.stopPropagation();
        this.startConnect(d.id);
      });

    // Alt-drag from a node = create a dependency edge (the n8n gesture).
    enter.on('mousedown', (event: MouseEvent, d: DagNode) => {
      if (!event.altKey) { return; }
      event.preventDefault();
      event.stopPropagation();
      this.startConnect(d.id);
    });

    // Click = focus the lineage + jump to YAML (workflowUri rides along
    // from the webview's OWN persisted graph, so jumps work even on
    // restored panels where the extension side has no closure URI).
    enter.on('click', (event: MouseEvent, d: DagNode) => {
      event.stopPropagation(); // keep the background click-to-clear away
      if (event.altKey) { return; } // alt belongs to edge creation
      this.applyFocus(this.focusedId === d.id ? null : d.id);
      vscode.postMessage({
        kind: 'dag:nodeClicked',
        taskId: d.id,
        workflowUri: this.currentGraph?.workflowUri,
      });
    });

    // Double-click handler
    enter.on('dblclick', (_event: MouseEvent, d: DagNode) => {
      vscode.postMessage({
        kind: 'dag:nodeDoubleClicked',
        taskId: d.id,
        workflowUri: this.currentGraph?.workflowUri,
      });
    });

    // Rich hover card (replaces the native <title> tooltip)
    enter
      .on('mouseenter', (event: MouseEvent, d: DagNode) => this.showHoverCard(event, d))
      .on('mousemove', (event: MouseEvent) => this.moveHoverCard(event))
      .on('mouseleave', () => this.hideHoverCard());

    // Entering nodes appear AT their position (no fly-in from origin);
    // the wave-staggered fade does the reveal.
    const enteringIds = new Set(enter.data().map((d) => d.id));
    enter.attr('transform', (d) => {
      const elk = elkMap.get(d.id);
      return elk ? `translate(${elk.x},${elk.y})` : '';
    });

    // MERGE: enter + update
    const merged = enter.merge(groups);

    // Animate into position — entrance staggered by topological wave
    // (the DAG explains its own execution order as it appears).
    merged
      .transition()
      .duration(REDUCED_MOTION ? 0 : 300)
      .delay((d) => (REDUCED_MOTION || !enteringIds.has(d.id)) ? 0 : (this.waveOf.get(d.id) ?? 0) * 80)
      .attr('opacity', 1)
      .attr('transform', (d) => {
        const elk = elkMap.get(d.id);
        return elk ? `translate(${elk.x},${elk.y})` : '';
      });

    // Update classes + dynamic card facts (status line · duration).
    merged.attr('class', (d) => nodeClassOf(d));
    merged.select('.nc-sub').text((d) => this.getSubtitle(d));
  }

  /** Build the HTML card body (safe DOM construction — never innerHTML). */
  private buildCardHtml(host: HTMLElement, node: DagNode): void {
    host.replaceChildren();

    const header = document.createElement('div');
    header.className = 'nc-head';
    const glyph = document.createElement('span');
    glyph.className = 'nc-glyph';
    glyph.textContent = verbIcon(node.verb);
    const id = document.createElement('span');
    id.className = 'nc-id';
    id.textContent = node.label;
    id.title = node.label;
    // Stale chip pre-rendered ALWAYS, shown by the group's is-stale
    // class — dag:stale refreshes badges without rebuilding cards.
    const staleChip = document.createElement('span');
    staleChip.className = 'nc-stale';
    staleChip.textContent = '△ stale';
    staleChip.title = 'Edited since its last successful run (or downstream of such an edit) — a run will re-execute this.';
    // Audit chip — the static-check moat on the card (⚠N · worst
    // severity via the group class · click → the pre-flight report).
    const auditChip = document.createElement('button');
    auditChip.className = 'nc-audit';
    if (node.auditCount) {
      auditChip.textContent = `⚠ ${node.auditCount}`;
      auditChip.dataset.worst = node.auditWorst ?? 'error';
      auditChip.title = `${node.auditCount} static-check finding${node.auditCount === 1 ? '' : 's'} on this task — click for the pre-flight report`;
    }
    auditChip.addEventListener('mousedown', (e) => e.stopPropagation());
    auditChip.addEventListener('click', (e) => {
      e.stopPropagation();
      vscode.postMessage({ kind: 'dag:openReport' });
    });
    const badge = document.createElement('span');
    badge.className = 'nc-badge';
    badge.textContent = this.badgeText(node);
    header.append(glyph, id, auditChip, staleChip, badge);
    host.appendChild(header);

    const sub = document.createElement('div');
    sub.className = 'nc-sub';
    sub.textContent = this.getSubtitle(node);
    host.appendChild(sub);

    const body = bodyTextOf(node);
    if (body) {
      const el = document.createElement('div');
      el.className = `nc-body nc-body-${body.kind}`;
      el.textContent = body.kind === 'cmd' ? `$ ${body.text}` : body.text;
      el.title = body.text;
      host.appendChild(el);
    }

    if (hasParamsRow(node)) {
      const params = document.createElement('div');
      params.className = 'nc-params';
      const target = node.model ?? node.tool;
      if (target) {
        // The model chip EDITS (the Flows params-bar gesture): click →
        // provider/model QuickPick extension-side → YAML edit → reload.
        const chip = document.createElement('button');
        chip.className = 'nc-chip nc-model';
        chip.textContent = target;
        chip.title = node.model
          ? 'Change this task\'s model (edits the YAML · ⌘Z undoes)'
          : node.tool ?? '';
        if (node.model) {
          chip.addEventListener('mousedown', (e) => e.stopPropagation());
          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({
              kind: 'dag:editModel',
              taskId: node.id,
              workflowUri: this.currentGraph?.workflowUri,
            });
          });
        } else {
          chip.disabled = true;
        }
        params.appendChild(chip);
      }
      if (node.costMin != null && node.costMax != null) {
        const cost = document.createElement('span');
        cost.className = 'nc-fact';
        cost.textContent = `${usd(node.costMin)}–${usd(node.costMax)}`;
        cost.title = 'Static cost interval (min path → worst case) — audited before a single token is spent';
        params.appendChild(cost);
      }
      if (node.avgMs !== undefined && node.avgRuns) {
        const avg = document.createElement('span');
        avg.className = 'nc-fact nc-avg';
        avg.textContent = `⌀ ${node.avgMs >= 1000 ? `${(node.avgMs / 1000).toFixed(1)}s` : `${node.avgMs}ms`}`;
        avg.title = `Mean success duration over ${node.avgRuns} recorded run${node.avgRuns === 1 ? '' : 's'} (flight recorder)`;
        params.appendChild(avg);
      }
      host.appendChild(params);
    }
  }

  // ─── Hover card (safe DOM construction · explication riche) ──────────────

  private hcRow(label: string, value: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'hc-row';
    const k = document.createElement('span');
    k.className = 'hc-k';
    k.textContent = label;
    const v = document.createElement('span');
    v.className = 'hc-v';
    v.textContent = value;
    row.append(k, v);
    return row;
  }

  private showHoverCard(event: MouseEvent, node: DagNode): void {
    if (!this.hoverCard) { return; }
    // A pending delayed-hide (from leaving the PREVIOUS node) must not
    // kill the card we are about to show for this one.
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = undefined; }
    const live = this.nodeMap.get(node.id) ?? node;
    this.hoverCard.replaceChildren();

    const head = document.createElement('div');
    head.className = 'hc-head';
    const verb = document.createElement('span');
    verb.className = `hc-verb verb-${live.verb}`;
    verb.textContent = live.verb;
    const id = document.createElement('span');
    id.className = 'hc-id';
    id.textContent = live.id;
    const status = document.createElement('span');
    status.className = `hc-status st-${live.status}`;
    status.textContent = live.status;
    head.append(verb, id, status);
    this.hoverCard.appendChild(head);

    const add = (label: string, value: string | undefined): void => {
      if (value) { this.hoverCard!.appendChild(this.hcRow(label, value)); }
    };
    add('model', live.model);
    add('tool', live.tool);
    add('when', live.when);
    if (live.fanOutKind) {
      add('fan-out', live.fanOutCount != null ? `${live.fanOutKind} ×${live.fanOutCount}` : live.fanOutKind);
    }
    if (live.costMin != null && live.costMax != null) {
      add('cost (static)', `$${live.costMin.toFixed(live.costMin < 0.1 ? 4 : 2)} → $${live.costMax.toFixed(live.costMax < 0.1 ? 4 : 2)}`);
    }
    if (live.durationMs != null) {
      add('duration', live.durationMs >= 1000 ? `${(live.durationMs / 1000).toFixed(1)}s` : `${live.durationMs}ms`);
    }
    const wave = this.waveOf.get(live.id);
    if (wave !== undefined && this.waveOf.size > 0) {
      add('wave', `${wave + 1} of ${1 + Math.max(...this.waveOf.values())}`);
    }
    // The engineering read: what THIS task means for the whole graph.
    const ins = this.structuralInsights;
    if (ins) {
      const blocks = ins.blastRadius.get(live.id) ?? 0;
      if (blocks > 0) {
        add('on failure', `blocks ${blocks} downstream task${blocks === 1 ? '' : 's'}`);
      }
      if (ins.pinchPoints.includes(live.id) && ins.nodeCount > 1) {
        add('pinch point', 'nothing else can run while this runs');
      }
    }
    const neighborRow = (label: string, ids: string[]): void => {
      if (ids.length === 0) { return; }
      const row = document.createElement('div');
      row.className = 'hc-row';
      const k = document.createElement('span');
      k.className = 'hc-k';
      k.textContent = label;
      const v = document.createElement('span');
      v.className = 'hc-v hc-chips';
      for (const nid of ids) {
        const chip = document.createElement('button');
        chip.className = 'hc-chip';
        chip.textContent = nid;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hideHoverCard(true);
          this.focusAndCenter(nid);
        });
        v.appendChild(chip);
      }
      row.append(k, v);
      this.hoverCard!.appendChild(row);
    };
    neighborRow('needs', this.upstreamOf.get(live.id) ?? []);
    neighborRow('unlocks', this.downstreamOf.get(live.id) ?? []);

    // The wires, named: what data arrives here and under which alias.
    if (live.bindingsIn && live.bindingsIn.length > 0) {
      const row = document.createElement('div');
      row.className = 'hc-row hc-bindings';
      const k = document.createElement('span');
      k.className = 'hc-k';
      k.textContent = 'inputs';
      const v = document.createElement('span');
      v.className = 'hc-v';
      for (const b of live.bindingsIn) {
        const wire = document.createElement('div');
        wire.className = 'hc-wire';
        const alias = document.createElement('span');
        alias.className = 'hc-wire-alias';
        alias.textContent = b.alias || b.path;
        const arrow = document.createElement('span');
        arrow.className = 'hc-wire-arrow';
        arrow.textContent = '←';
        const src = document.createElement('button');
        src.className = 'hc-chip';
        src.textContent = `${b.from}.${b.path}`;
        src.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hideHoverCard(true);
          this.focusAndCenter(b.from);
        });
        wire.append(alias, arrow, src);
        v.appendChild(wire);
      }
      row.append(k, v);
      this.hoverCard.appendChild(row);
    }

    this.hoverCard.classList.add('visible');
    this.moveHoverCard(event);
  }

  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  private moveHoverCard(event: MouseEvent): void {
    if (!this.hoverCard) { return; }
    const pad = 14;
    const rect = this.hoverCard.getBoundingClientRect();
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + rect.width > window.innerWidth - 8) { x = event.clientX - rect.width - pad; }
    if (y + rect.height > window.innerHeight - 8) { y = event.clientY - rect.height - pad; }
    this.hoverCard.style.left = `${Math.max(8, x)}px`;
    this.hoverCard.style.top = `${Math.max(8, y)}px`;
  }

  /**
   * Delayed hide so the pointer can travel from node to card (the
   * needs/unlocks chips are clickable); immediate on explicit actions.
   */
  private hideHoverCard(now = false): void {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = undefined; }
    if (now) {
      this.hoverCard?.classList.remove('visible');
      return;
    }
    this.hideTimer = setTimeout(() => {
      if (!this.hoverCard?.matches(':hover')) {
        this.hoverCard?.classList.remove('visible');
      }
    }, 140);
  }

  /** Card hover keeps it alive; leaving the card closes it. */
  wireHoverCardPersistence(): void {
    this.hoverCard?.addEventListener('mouseleave', () => this.hideHoverCard(true));
  }

  private renderEdges(elkEdges: ElkExtendedEdge[], dagEdges: DagEdge[]): void {
    const dagEdgeMap = new Map(dagEdges.map((e) => [e.id, e]));

    const paths = this.edgeGroup
      .selectAll<SVGPathElement, ElkExtendedEdge>('path.dag-edge')
      .data(elkEdges, (d) => d.id);

    paths.exit()
      .transition().duration(200)
      .attr('opacity', 0)
      .remove();

    const enter = paths
      .enter()
      .append('path')
      .attr('class', (d) => {
        const meta = dagEdgeMap.get(d.id);
        if (meta?.ghost) { return 'dag-edge edge-ghost'; }
        return `dag-edge ${meta?.isDataEdge ? 'edge-data' : 'edge-dep'}`;
      })
      .attr('marker-end', (d) => {
        const meta = dagEdgeMap.get(d.id);
        return meta?.ghost ? '' : `url(#arrow-${meta?.isDataEdge ? 'data' : 'dep'})`;
      })
      .attr('opacity', 0);

    // Edge clicks: GHOST = one click declares the missing depends_on (the
    // beginner's #1 error becomes a repair gesture) · real edge ⌥click
    // removes the dependency.
    enter.on('click', (event: MouseEvent, d: ElkExtendedEdge) => {
      const ends = this.edgeEnds.get(d.id);
      if (!ends) { return; }
      const meta = dagEdgeMap.get(d.id);
      if (meta?.ghost) {
        event.stopPropagation();
        vscode.postMessage({
          kind: 'dag:connect',
          from: ends.source,
          to: ends.target,
          workflowUri: this.currentGraph?.workflowUri,
        });
        return;
      }
      if (!event.altKey) { return; }
      event.stopPropagation();
      vscode.postMessage({
        kind: 'dag:disconnect',
        from: ends.source,
        to: ends.target,
        workflowUri: this.currentGraph?.workflowUri,
      });
    });
    enter.append('title').text((d) => {
      const ends = this.edgeEnds.get(d.id);
      if (!ends) { return ''; }
      const meta = dagEdgeMap.get(d.id);
      if (meta?.ghost) {
        return `${ends.target} reads ${ends.source} (${meta.label ?? ''}) but never declares it\nNIKA-DAG-003 — data refs do NOT imply ordering\nCLICK to declare depends_on`;
      }
      const head = meta?.isDataEdge && meta.label
        ? `${ends.source} ── ${meta.label} ──▶ ${ends.target}\n(data travels here)`
        : `${ends.source} → ${ends.target}\n(ordering only — no binding crosses this edge)`;
      return `${head}\n⌥click to remove the dependency`;
    });

    // Binding labels — the wire's NAME riding the data edge midpoint.
    const labels = this.edgeGroup
      .selectAll<SVGTextElement, ElkExtendedEdge>('text.edge-label')
      .data(elkEdges.filter((e) => {
        const meta = dagEdgeMap.get(e.id);
        return meta?.isDataEdge === true && !!meta.label;
      }), (d) => d.id);
    labels.exit().remove();
    labels
      .enter()
      .append('text')
      .attr('class', 'edge-label')
      .merge(labels)
      .attr('x', (d) => this.edgeMidpoint(d)[0])
      .attr('y', (d) => this.edgeMidpoint(d)[1] - 5)
      .attr('text-anchor', 'middle')
      .text((d) => dagEdgeMap.get(d.id)?.label ?? '');

    enter
      .merge(paths)
      .transition().duration(300)
      .attr('opacity', 1)
      .attr('d', (d) => this.smoothEdges ? this.edgePathSmooth(d) : this.edgePath(d));
  }

  /** Midpoint of an edge's polyline (label anchor). */
  private edgeMidpoint(edge: ElkExtendedEdge): [number, number] {
    const pts: ElkPoint[] = [];
    for (const s of edge.sections ?? []) {
      pts.push(s.startPoint, ...(s.bendPoints ?? []), s.endPoint);
    }
    if (pts.length === 0) { return [0, 0]; }
    const mid = pts[Math.floor((pts.length - 1) / 2)];
    const next = pts[Math.min(Math.floor((pts.length - 1) / 2) + 1, pts.length - 1)];
    return [(mid.x + next.x) / 2, (mid.y + next.y) / 2];
  }

  /** Convert ELK edge sections into an SVG path string.
   *  Uses straight segments for orthogonal routing. */
  private edgePath(edge: ElkExtendedEdge): string {
    if (!edge.sections?.length) return '';

    const parts: string[] = [];
    for (const section of edge.sections) {
      parts.push(`M ${section.startPoint.x} ${section.startPoint.y}`);
      if (section.bendPoints?.length) {
        for (const bp of section.bendPoints) {
          parts.push(`L ${bp.x} ${bp.y}`);
        }
      }
      parts.push(`L ${section.endPoint.x} ${section.endPoint.y}`);
    }
    return parts.join(' ');
  }

  /** Alternative: smooth curves using d3-shape curveMonotoneY.
   *  Call this instead of edgePath() for a softer look. */
  private edgePathSmooth(edge: ElkExtendedEdge): string {
    if (!edge.sections?.length) return '';

    const points: ElkPoint[] = [];
    for (const section of edge.sections) {
      points.push(section.startPoint);
      if (section.bendPoints) points.push(...section.bendPoints);
      points.push(section.endPoint);
    }
    if (points.length < 2) return '';

    const lineGen: Line<ElkPoint> = line<ElkPoint>()
      .x((p) => p.x)
      .y((p) => p.y)
      .curve(curveMonotoneY);

    return lineGen(points) ?? '';
  }

  // ─── Status Updates ──────────────────────────────────────────────────────

  /** Mutate one node + its DOM (no graph-wide recompute — callers batch that). */
  private applyStatus(taskId: string, status: TaskStatus, durationMs?: number): boolean {
    const node = this.nodeMap.get(taskId);
    if (!node) return false;

    if (node.status !== status) {
      appendActivity(taskId, status, durationMs);
    }
    node.status = status;
    if (durationMs != null) node.durationMs = durationMs;

    const el = this.nodeGroup.select(`[data-id="${CSS.escape(taskId)}"]`);
    el.attr('class', nodeClassOf(node));
    el.select('.nc-sub').text(this.getSubtitle(node));

    // The minimap mirrors the run live (class-only touch, no re-render).
    document.querySelector(`#minimap-svg rect[data-id="${CSS.escape(taskId)}"]`)
      ?.setAttribute('class', `mm-node st-${status}`);
    return true;
  }

  /** Graph-wide consequences of status changes — once per update batch. */
  private afterStatusChange(): void {
    // Durations refine the critical path; completion lights the edge flow.
    this.recomputeCritical();
    this.updateEdgeFlow();
    if (this.focusedId) { this.applyFocus(this.focusedId); }

    this.saveState({ graph: this.currentGraph });
    this.updateStatusDisplay();
  }

  updateNodeStatus(taskId: string, status: TaskStatus, durationMs?: number): void {
    if (!this.applyStatus(taskId, status, durationMs)) return;
    this.afterStatusChange();
  }

  batchUpdateStatus(updates: Array<{ taskId: string; status: TaskStatus; durationMs?: number }>): void {
    let touched = false;
    for (const u of updates) {
      touched = this.applyStatus(u.taskId, u.status, u.durationMs) || touched;
    }
    if (touched) { this.afterStatusChange(); }
  }

  // ─── Viewport Controls ───────────────────────────────────────────────────

  fitToView(elkResult?: ElkNode): void {
    const svgEl = this.svg.node();
    if (!svgEl) return;

    const { width: svgW, height: svgH } = svgEl.getBoundingClientRect();
    if (svgW === 0 || svgH === 0) return;

    let graphW: number;
    let graphH: number;

    if (elkResult) {
      graphW = (elkResult.width ?? svgW) + PADDING * 2;
      graphH = (elkResult.height ?? svgH) + PADDING * 2;
    } else {
      const rootNode = this.rootGroup.node();
      if (!rootNode) return;
      const bbox = rootNode.getBBox();
      graphW = bbox.width + PADDING * 2;
      graphH = bbox.height + PADDING * 2;
    }

    const scale = Math.min(svgW / graphW, svgH / graphH, 1.5);
    const tx = (svgW - graphW * scale) / 2;
    const ty = (svgH - graphH * scale) / 2;

    const t = zoomIdentity.translate(tx, ty).scale(scale);
    this.svg
      .transition().duration(REDUCED_MOTION ? 0 : 500)
      .call(this.zoomBehavior.transform as D3ZoomCall, t);
  }

  zoomIn(): void {
    this.svg
      .transition().duration(REDUCED_MOTION ? 0 : 300)
      .call(this.zoomBehavior.scaleBy as D3ZoomCall, 1.3);
  }

  zoomOut(): void {
    this.svg
      .transition().duration(REDUCED_MOTION ? 0 : 300)
      .call(this.zoomBehavior.scaleBy as D3ZoomCall, 0.7);
  }

  clear(): void {
    this.bandGroup.selectAll('*').remove();
    this.regionGroup.selectAll('*').remove();
    this.edgeGroup.selectAll('*').remove();
    this.nodeGroup.selectAll('*').remove();
    this.currentGraph = undefined;
    this.nodeMap.clear();
    this.edgeEnds.clear();
    this.upstreamOf.clear();
    this.downstreamOf.clear();
    this.criticalEdges.clear();
    this.waveOf.clear();
    this.focusedId = null;
    this.focusRelated = null;
    this.filterMatches = null;
    this.wasAllTerminal = false;
    this.layoutBox.clear();
    this.hideHoverCard(true);
    document.getElementById('empty-state')?.removeAttribute('hidden');

    const titleEl = document.getElementById('dag-title');
    if (titleEl) titleEl.textContent = '';
    const statusEl = document.getElementById('dag-status');
    if (statusEl) statusEl.textContent = '';

    vscode.setState(undefined as unknown as WebviewState);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private getSubtitle(node: DagNode): string {
    if (node.status === 'running') return `${node.verb} ...`;
    if (node.durationMs != null) {
      const dur = node.durationMs >= 1000
        ? `${(node.durationMs / 1000).toFixed(1)}s`
        : `${node.durationMs}ms`;
      return `${node.verb} \u00B7 ${dur}`;
    }
    // Static facts ladder: tool (invoke) > provider > cost interval.
    if (node.tool) return `${node.verb} \u00B7 ${node.tool}`;
    if (node.provider) return `${node.verb} \u00B7 ${node.provider}`;
    if (node.costMin != null && node.costMax != null) {
      return `${node.verb} \u00B7 ${usd(node.costMin)}\u2013${usd(node.costMax)}`;
    }
    return node.verb;
  }

  private badgeText(node: DagNode): string {
    const parts: string[] = [];
    if (node.when) parts.push('\u2301');
    if (node.fanOutKind) parts.push(node.fanOutCount != null ? `\u00D7${node.fanOutCount}` : '\u00D7n');
    return parts.join(' ');
  }

  private updateStatusDisplay(): void {
    if (!this.currentGraph) return;

    const counts: Record<TaskStatus, number> = {
      pending: 0, running: 0, retrying: 0, success: 0, failed: 0, skipped: 0, cancelled: 0,
    };
    for (const node of this.currentGraph.nodes) {
      counts[node.status]++;
    }
    const total = this.currentGraph.nodes.length;
    const terminal = counts.success + counts.failed + counts.skipped + counts.cancelled;

    // Run verdict → the aurora speaks once, at the live close.
    const allTerminal = total > 0 && terminal === total;
    if (allTerminal && !this.wasAllTerminal) {
      auroraSignal(counts.failed > 0 ? 'danger' : 'sweep');
    }
    this.wasAllTerminal = allTerminal;

    const parts: string[] = [];
    if (counts.success > 0) parts.push(`${counts.success} done`);
    if (counts.running > 0) parts.push(`${counts.running} running`);
    if (counts.retrying > 0) parts.push(`${counts.retrying} retrying`);
    if (counts.failed > 0) parts.push(`${counts.failed} failed`);
    if (counts.pending > 0) parts.push(`${counts.pending} pending`);
    if (counts.skipped > 0) parts.push(`${counts.skipped} skipped`);
    if (counts.cancelled > 0) parts.push(`${counts.cancelled} cancelled`);

    const statusEl = document.getElementById('dag-status');
    if (statusEl) statusEl.textContent = parts.join(' \u00B7 ');

    // Legend chips + completion progress (the run, summarized at a glance).
    const chips = document.getElementById('legend-chips');
    if (chips) {
      chips.replaceChildren();
      const order: TaskStatus[] = ['running', 'retrying', 'success', 'failed', 'cancelled', 'skipped', 'pending'];
      for (const st of order) {
        if (counts[st] === 0) { continue; }
        const chip = document.createElement('span');
        chip.className = `legend-chip st-${st}`;
        const dot = document.createElement('span');
        dot.className = 'legend-dot';
        const label = document.createElement('span');
        label.textContent = `${counts[st]} ${st}`;
        chip.append(dot, label);
        chips.appendChild(chip);
      }
      if (this.criticalEdges.size > 0) {
        const chip = document.createElement('span');
        chip.className = 'legend-chip st-critical';
        const dot = document.createElement('span');
        dot.className = 'legend-dot';
        const label = document.createElement('span');
        label.textContent = 'critical path';
        chip.append(dot, label);
        chips.appendChild(chip);
      }
    }
    const fill = document.getElementById('progress-fill');
    if (fill) {
      const pct = total > 0 ? Math.round((terminal / total) * 100) : 0;
      fill.style.width = `${pct}%`;
      fill.classList.toggle('has-failure', counts.failed > 0);
      fill.classList.toggle('complete', terminal === total && total > 0);
    }
  }

  private saveState(partial: Partial<WebviewState>): void {
    const current = vscode.getState() ?? {};
    vscode.setState({ ...current, ...partial });
  }
}

// ─── Activity feed · every status transition, narrated live ────────────────

const ACTIVITY_ICONS: Record<TaskStatus, string> = {
  pending: '·',
  running: '▶',
  retrying: '↻',
  success: '✓',
  failed: '✗',
  skipped: '⤼',
  cancelled: '◼',
};

const MAX_ACTIVITY = 120;

/** One feed line — runtime transitions AND session notes share the shape. */
function pushActivityLine(icon: string, text: string, cls: string, taskId?: string): void {
  const host = document.getElementById('activity-list');
  if (!host) { return; }
  const entry = document.createElement('button');
  entry.className = `act-entry ${cls}`;

  const time = document.createElement('span');
  time.className = 'act-time';
  time.textContent = new Date().toLocaleTimeString(undefined, { hour12: false });

  const iconEl = document.createElement('span');
  iconEl.className = 'act-icon';
  iconEl.textContent = icon;

  const textEl = document.createElement('span');
  textEl.className = 'act-text';
  textEl.textContent = text;

  entry.append(time, iconEl, textEl);
  if (taskId) {
    entry.addEventListener('click', () => renderer.focusAndCenter(taskId));
  } else {
    entry.disabled = true;
  }
  host.appendChild(entry);

  while (host.childElementCount > MAX_ACTIVITY) {
    host.removeChild(host.firstChild!);
  }
  host.scrollTop = host.scrollHeight;

  // Pulse the toggle when the feed is closed — events don't go unseen.
  const panel = document.getElementById('activity');
  if (panel?.hasAttribute('hidden')) {
    document.getElementById('btn-feed')?.classList.add('pulse');
  }
}

function appendActivity(taskId: string, status: TaskStatus, durationMs?: number): void {
  const dur = durationMs != null
    ? ` · ${durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`}`
    : '';
  pushActivityLine(ACTIVITY_ICONS[status], `${taskId} ${status}${dur}`, `st-${status}`, taskId);
}

function toggleActivity(): void {
  const panel = document.getElementById('activity');
  const btn = document.getElementById('btn-feed');
  if (!panel) { return; }
  const opening = panel.hasAttribute('hidden');
  if (opening) {
    panel.removeAttribute('hidden');
    btn?.classList.add('active');
    btn?.classList.remove('pulse');
    const list = document.getElementById('activity-list');
    if (list) { list.scrollTop = list.scrollHeight; }
  } else {
    panel.setAttribute('hidden', '');
    btn?.classList.remove('active');
  }
  vscode.setState({ ...(vscode.getState() ?? {}), showFeed: opening });
}

// ─── Explainer overlay · « what am I looking at? » ──────────────────────────

function buildExplainer(): void {
  const el = document.getElementById('explainer');
  if (!el || el.childElementCount > 0) { return; }

  const card = document.createElement('div');
  card.className = 'ex-card';

  const title = document.createElement('div');
  title.className = 'ex-title';
  title.textContent = 'Reading this graph';
  card.appendChild(title);

  // Dynamic per-graph engineering read — re-rendered at every open.
  const metrics = document.createElement('div');
  metrics.id = 'ex-insights';
  card.appendChild(metrics);

  const rows: Array<[string, string, string]> = [
    ['ex-glyph-wave', 'Wave bands', 'topological levels — every task in a band can run in parallel; a band starts when the one above completed'],
    ['ex-glyph-critical', 'Critical path', 'the longest chain (real durations when known) — it alone decides the wall-clock'],
    ['ex-glyph-flow', 'Flowing edges', 'the source task finished — its output is travelling to the next ones'],
    ['ex-glyph-focus', 'Click a node', 'focus its lineage: what it needs upstream, what it unlocks downstream · Esc to clear'],
    ['ex-glyph-hover', 'Hover a node', 'the full story — model · gates · fan-out · static cost · needs/unlocks (clickable)'],
    ['ex-glyph-connect', '⌥ drag node → node', 'create a dependency — the YAML gets the depends_on (⌘Z undoes) · ⌥click an edge removes it'],
    ['ex-glyph-add', '＋ Task · Delete · Enter', 'add a task after the focused one · Delete removes it (refused while referenced) · Enter opens its YAML'],
    ['ex-glyph-data', 'Blue labeled edges', 'data actually CROSSES here (the label is the binding alias) — gray dashed edges are ordering only'],
    ['ex-glyph-ghost', 'Red dashed edges', 'a task READS another without declaring depends_on (NIKA-DAG-003) — click the edge to declare it'],
  ];
  for (const [glyphClass, head, body] of rows) {
    const row = document.createElement('div');
    row.className = 'ex-row';
    const glyph = document.createElement('span');
    glyph.className = `ex-glyph ${glyphClass}`;
    const text = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = head;
    text.append(strong, document.createTextNode(` — ${body}`));
    row.append(glyph, text);
    card.appendChild(row);
  }

  const keys = document.createElement('div');
  keys.className = 'ex-keys';
  for (const [key, label] of [['Tab', 'next task'], ['↑↓', 'dep / dependent'], ['⏎', 'open YAML'], ['F', 'fit'], ['W', 'waves'], ['/', 'filter'], ['Esc', 'clear'], ['?', 'this card']]) {
    const kbd = document.createElement('kbd');
    kbd.textContent = key;
    const span = document.createElement('span');
    span.textContent = label;
    keys.append(kbd, span);
  }
  card.appendChild(keys);

  const foot = document.createElement('div');
  foot.className = 'ex-foot';
  foot.textContent = '🦋 auditable before it runs';
  card.appendChild(foot);

  el.appendChild(card);
  el.addEventListener('click', () => el.setAttribute('hidden', ''));
}

/** The graph, measured — width · speedup ceiling · k-worker wall-clock. */
function renderExplainerInsights(): void {
  const host = document.getElementById('ex-insights');
  if (!host) { return; }
  host.replaceChildren();
  const ins = renderer.computeInsights();
  if (!ins || ins.nodeCount === 0) { return; }

  const fmt = (v: number): string => {
    if (!ins.weighted) { return `${Math.round(v)} step${Math.round(v) === 1 ? '' : 's'}`; }
    return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
  };

  const section = document.createElement('div');
  section.className = 'ex-metrics';
  const line = (label: string, value: string, hint?: string): void => {
    const row = document.createElement('div');
    row.className = 'ex-metric';
    const k = document.createElement('span');
    k.className = 'ex-metric-k';
    k.textContent = label;
    const v = document.createElement('span');
    v.className = 'ex-metric-v';
    v.textContent = value;
    row.append(k, v);
    if (hint) {
      const h = document.createElement('span');
      h.className = 'ex-metric-hint';
      h.textContent = hint;
      row.appendChild(h);
    }
    section.appendChild(row);
  };

  line(
    'max parallelism',
    `${ins.width} task${ins.width === 1 ? '' : 's'}`,
    ins.widthWitness.length > 1 ? `e.g. ${ins.widthWitness.slice(0, 4).join(' · ')}${ins.widthWitness.length > 4 ? ' · …' : ''}` : undefined,
  );
  line(
    'speedup ceiling',
    `×${ins.parallelismCeiling.toFixed(1)}`,
    `work ${fmt(ins.work)} / longest path ${fmt(ins.span)}${ins.weighted ? ' (measured)' : ''}`,
  );
  if (ins.pinchPoints.length > 0 && ins.nodeCount > 1) {
    line('pinch points', ins.pinchPoints.join(' · '), 'the DAG narrows to width 1 there — nothing else runs');
  }
  if (ins.makespans.length > 1) {
    line(
      'est. wall-clock',
      ins.makespans.map((m) => `${m.workers}∥ ${fmt(m.makespan)}`).join('  ·  '),
      'list schedule by critical-path rank (within 2−1/k of optimal)',
    );
  }
  host.appendChild(section);
}

function toggleExplainer(): void {
  const el = document.getElementById('explainer');
  if (!el) { return; }
  buildExplainer();
  if (el.hasAttribute('hidden')) {
    renderExplainerInsights();
    el.removeAttribute('hidden');
  } else {
    el.setAttribute('hidden', '');
  }
}

// ─── Initialize ─────────────────────────────────────────────────────────────

const renderer = new DagRenderer('dag-container');
renderer.wireHoverCardPersistence();

// ─── Replay scrubber · time-travel over a recorded run ──────────────────────
// The extension hands the whole timeline; the webview owns playback — the
// handle position IS the truth, frameAt paints the DAG at that instant.

class Replayer {
  private timeline: TimelineEntry[] = [];
  private startMs = 0;
  private spanMs = 1;
  private speed = 6;
  private pos = 1; // 0..1 along the run
  private playing = false;
  private raf = 0;
  private lastTick = 0;
  private readonly el = document.getElementById('scrubber');
  private readonly track = document.getElementById('scrub-track');
  private readonly fill = document.getElementById('scrub-fill');
  private readonly handle = document.getElementById('scrub-handle');
  private readonly timeLabel = document.getElementById('scrub-time');
  private readonly playBtn = document.getElementById('scrub-play');
  private dragging = false;

  constructor() {
    this.playBtn?.addEventListener('click', () => this.toggle());
    document.getElementById('scrub-close')?.addEventListener('click', () => {
      this.close();
      vscode.postMessage({ kind: 'dag:requestRefresh' });
    });
    this.track?.addEventListener('mousedown', (e: MouseEvent) => {
      this.dragging = true;
      this.pause();
      this.seekToClientX(e.clientX);
    });
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.dragging) { this.seekToClientX(e.clientX); }
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
  }

  get active(): boolean {
    return this.el?.hasAttribute('hidden') === false;
  }

  load(timeline: TimelineEntry[], label: string, speed: number): void {
    this.timeline = timeline;
    this.speed = Math.max(speed, 1);
    const b = timelineBounds(timeline);
    this.startMs = b.startMs;
    this.spanMs = Math.max(b.endMs - b.startMs, 1);
    this.el?.removeAttribute('hidden');
    const title = document.getElementById('dag-title');
    if (title) { title.textContent = `↻ ${label}`; }
    // Land on the FINAL state (the outcome), ready to scrub back or replay.
    this.setPos(1);
  }

  close(): void {
    this.pause();
    this.el?.setAttribute('hidden', '');
    this.timeline = [];
  }

  private seekToClientX(clientX: number): void {
    const rect = this.track?.getBoundingClientRect();
    if (!rect || rect.width === 0) { return; }
    this.setPos((clientX - rect.left) / rect.width);
  }

  private setPos(pos: number): void {
    this.pos = Math.min(1, Math.max(0, pos));
    const pct = `${(this.pos * 100).toFixed(2)}%`;
    if (this.fill) { this.fill.style.width = pct; }
    if (this.handle) { this.handle.style.left = pct; }
    const atMs = this.startMs + this.pos * this.spanMs;
    if (this.timeLabel) {
      const elapsed = this.pos * this.spanMs;
      this.timeLabel.textContent = elapsed >= 1000 ? `${(elapsed / 1000).toFixed(1)}s` : `${Math.round(elapsed)}ms`;
    }
    renderer.paintFrame(frameAt(this.timeline, atMs, renderer.nodeIds()));
  }

  toggle(): void {
    if (this.playing) { this.pause(); } else { this.play(); }
  }

  private play(): void {
    if (this.timeline.length === 0) { return; }
    // Restart from the top when parked at the end.
    if (this.pos >= 1) { this.setPos(0); }
    this.playing = true;
    if (this.playBtn) { this.playBtn.textContent = '⏸'; }
    // Whole run in a watchable window (compressed by replay.speed-ish;
    // clamp so a long run stays ≤ ~8s and a short one isn't a blink).
    const budgetMs = Math.min(Math.max(this.spanMs / this.speed, 2500), 8000);
    this.lastTick = performance.now();
    const step = (now: number): void => {
      if (!this.playing) { return; }
      const dt = now - this.lastTick;
      this.lastTick = now;
      this.setPos(this.pos + dt / budgetMs);
      if (this.pos >= 1) { this.pause(); return; }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private pause(): void {
    this.playing = false;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    if (this.playBtn) { this.playBtn.textContent = '▶'; }
  }
}

const replayer = new Replayer();

// Restore from webview state (e.g., after being hidden and re-shown)
const savedState = vscode.getState();
if (savedState?.showWaves !== undefined) { renderer.showWaves = savedState.showWaves; }
if (savedState?.smoothEdges !== undefined) { renderer.smoothEdges = savedState.smoothEdges; }
if (savedState?.showFeed) { toggleActivity(); }
if (savedState?.graph) {
  renderer.render(savedState.graph);
  refreshStaleChip();
} else {
  document.getElementById('empty-state')?.removeAttribute('hidden');
}

// ─── Message Handler ────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent<ExtToWebviewMessage>) => {
  const msg = event.data;
  switch (msg.kind) {
    case 'dag:load':
      // Any graph load while a replay is up supersedes it (live run ·
      // follow-mode retarget · normal show). The replay's OWN graph
      // loads BEFORE the scrubber arms, so this never closes itself.
      if (replayer.active) { replayer.close(); }
      renderer.render(msg.graph);
      refreshStaleChip();
      break;
    case 'dag:updateStatus':
      renderer.updateNodeStatus(msg.taskId, msg.status, msg.durationMs);
      break;
    case 'dag:batchUpdateStatus':
      renderer.batchUpdateStatus(msg.updates);
      break;
    case 'dag:focus':
      renderer.focusAndCenter(msg.taskId);
      break;
    case 'dag:cursorHint':
      renderer.cursorHint(msg.taskId);
      break;
    case 'dag:note':
      pushActivityLine(msg.icon, msg.text, msg.cls ?? 'st-note', msg.taskId);
      break;
    case 'dag:clear':
      renderer.clear();
      break;
    case 'dag:fitToView':
      renderer.fitToView();
      break;
    case 'theme:changed':
      // CSS variables update automatically — nothing to do
      break;
    case 'theme:mode':
      // Skin flip (nika ⇄ editor) — tokens re-scope, no reload. A
      // pending aurora must not replay when flipping BACK to nika.
      document.body.dataset.nkTheme = msg.mode;
      if (auroraTimer) { clearTimeout(auroraTimer); auroraTimer = undefined; }
      delete document.body.dataset.aurora;
      break;
    case 'run:state':
      setRunUiState(msg.running);
      break;
    case 'dag:stale':
      renderer.applyStale(msg.stale, msg.direct);
      refreshStaleChip();
      break;
    case 'dag:audit':
      renderer.applyAudit(msg.audits);
      break;
    case 'dag:replayLoad':
      replayer.load(msg.timeline, msg.label, msg.speed);
      break;
    case 'dag:replayEnd':
      replayer.close();
      break;
  }
});

// ─── Run controls · the bottom-center pill (n8n/Windmill placement) ─────────

/** Truthful lifecycle from the extension; also ends the optimistic pulse. */
function setRunUiState(running: boolean): void {
  document.body.classList.toggle('running', running);
  document.body.classList.remove('run-starting');
  const run = document.getElementById('btn-run') as HTMLButtonElement | null;
  const mock = document.getElementById('btn-run-mock') as HTMLButtonElement | null;
  const stop = document.getElementById('btn-stop');
  if (run) { run.disabled = running; }
  if (mock) { mock.disabled = running; }
  stop?.toggleAttribute('hidden', !running);
}

function refreshStaleChip(): void {
  const chip = document.getElementById('run-stale');
  if (!chip) { return; }
  const summary = runPlanSummary(renderer.currentNodes());
  if (summary.total === 0) {
    chip.setAttribute('hidden', '');
    return;
  }
  chip.textContent = summary.label;
  chip.title = summary.tooltip ?? '';
  chip.removeAttribute('hidden');
}

function requestRun(preview: boolean): void {
  if (document.body.classList.contains('running')) { return; }
  // Optimistic latency masking: the click has a visible consequence
  // BEFORE the first engine event (pending cards shimmer) — cleared by
  // the first run:state, or by a 4s safety in case the spawn dies.
  document.body.classList.add('run-starting');
  setTimeout(() => document.body.classList.remove('run-starting'), 4000);
  vscode.postMessage({
    kind: 'dag:runRequest',
    preview,
    workflowUri: vscode.getState()?.graph?.workflowUri,
  });
}

document.getElementById('btn-run')?.addEventListener('click', () => requestRun(false));
document.getElementById('btn-run-mock')?.addEventListener('click', () => requestRun(true));
document.getElementById('btn-stop')?.addEventListener('click', () => {
  vscode.postMessage({ kind: 'dag:cancelRun' });
});

// ─── Toolbar Handlers ───────────────────────────────────────────────────────

document.getElementById('btn-fit')?.addEventListener('click', () => renderer.fitToView());
document.getElementById('btn-zoom-in')?.addEventListener('click', () => renderer.zoomIn());
document.getElementById('btn-zoom-out')?.addEventListener('click', () => renderer.zoomOut());
document.getElementById('zoom-pct')?.addEventListener('click', () => renderer.fitToView());

// ─── Verb palette + omnibar (the Flows bottom bar) ─────────────────────────

for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('.vp-btn'))) {
  btn.addEventListener('click', () => {
    vscode.postMessage({
      kind: 'dag:addTask',
      verb: btn.dataset.verb,
      afterTaskId: renderer.focused,
      workflowUri: vscode.getState()?.graph?.workflowUri,
    });
  });
}

const omniInput = document.getElementById('omni-input') as HTMLInputElement | null;

function runOmni(): void {
  const text = omniInput?.value.trim();
  if (!text) { return; }
  if (text.startsWith('/')) {
    // Filter mode — route into the search affordance.
    if (searchEl) {
      searchEl.hidden = false;
      searchEl.value = text.slice(1).trim();
      renderer.applyFilter(searchEl.value || null);
      searchEl.focus();
    }
    if (omniInput) { omniInput.value = ''; }
    return;
  }
  vscode.postMessage({
    kind: 'dag:omni',
    text,
    workflowUri: vscode.getState()?.graph?.workflowUri,
  });
  if (omniInput) { omniInput.value = ''; }
}

omniInput?.addEventListener('keydown', (e: KeyboardEvent) => {
  e.stopPropagation();
  if (e.key === 'Enter') { runOmni(); }
  if (e.key === 'Escape') { omniInput.blur(); }
});
document.getElementById('omni-go')?.addEventListener('click', () => runOmni());

const wavesBtn = document.getElementById('btn-waves');
const syncWavesBtn = (): void => { wavesBtn?.classList.toggle('active', renderer.showWaves); };
wavesBtn?.addEventListener('click', () => {
  renderer.showWaves = !renderer.showWaves;
  syncWavesBtn();
  vscode.setState({ ...(vscode.getState() ?? {}), showWaves: renderer.showWaves });
  const g = vscode.getState()?.graph;
  if (g) { renderer.render(g); }
});
syncWavesBtn();

const curveBtn = document.getElementById('btn-curve');
const syncCurveBtn = (): void => { curveBtn?.classList.toggle('active', renderer.smoothEdges); };
curveBtn?.addEventListener('click', () => {
  renderer.smoothEdges = !renderer.smoothEdges;
  syncCurveBtn();
  vscode.setState({ ...(vscode.getState() ?? {}), smoothEdges: renderer.smoothEdges });
  const g = vscode.getState()?.graph;
  if (g) { renderer.render(g); }
});
syncCurveBtn();

// ─── Search / filter (`/`) ──────────────────────────────────────────────────

const searchEl = document.getElementById('dag-search') as HTMLInputElement | null;
let searchCycle = 0;

function openSearch(): void {
  if (!searchEl) { return; }
  searchEl.hidden = false;
  searchEl.focus();
  searchEl.select();
  const q = searchEl.value.trim();
  if (q) { renderer.applyFilter(q); }
}

/** Close + clear the filter. Returns true when it WAS open (Esc laddering). */
function closeSearch(): boolean {
  if (!searchEl || searchEl.hidden) { return false; }
  searchEl.hidden = true;
  searchEl.value = '';
  searchCycle = 0;
  renderer.applyFilter(null);
  return true;
}

searchEl?.addEventListener('input', () => {
  searchCycle = 0;
  renderer.applyFilter(searchEl.value.trim() || null);
});

searchEl?.addEventListener('keydown', (e: KeyboardEvent) => {
  e.stopPropagation();
  if (e.key === 'Escape') { closeSearch(); }
  if (e.key === 'Enter') {
    const ids = renderer.filteredIds();
    if (ids.length > 0) {
      renderer.focusAndCenter(ids[searchCycle % ids.length]);
      searchCycle += 1;
    }
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e: KeyboardEvent) => {
  // Only handle if not in an input field
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === 'f' || e.key === 'F') renderer.fitToView();
  if (e.key === '+' || e.key === '=') renderer.zoomIn();
  if (e.key === '-') renderer.zoomOut();
  if (e.key === '/') {
    e.preventDefault();
    openSearch();
    return;
  }
  // Keyboard-first canvas nav (a11y + power): Tab cycles the topological
  // node order, ↑ walks to a dependency, ↓ to a dependent.
  if (e.key === 'Tab') {
    e.preventDefault();
    renderer.navFocus(e.shiftKey ? 'prev' : 'next');
    return;
  }
  if (e.key === 'ArrowUp') { e.preventDefault(); renderer.navFocus('up'); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); renderer.navFocus('down'); return; }
  if (e.key === 'Escape') {
    if (closeSearch()) { return; }
    if (renderer.cancelConnect()) { return; }
    const ex = document.getElementById('explainer');
    if (ex && !ex.hasAttribute('hidden')) { ex.setAttribute('hidden', ''); return; }
    renderer.clearFocus();
  }
  if (e.key === 'w' || e.key === 'W') wavesBtn?.dispatchEvent(new Event('click'));
  if (e.key === '?') toggleExplainer();
  if (e.key === 'l' || e.key === 'L') toggleActivity();
  if (e.key === ' ' && replayer.active) { e.preventDefault(); replayer.toggle(); }
  if (e.key === 'Delete' || e.key === 'Backspace') renderer.requestDeleteFocused();
  if (e.key === 'Enter' && renderer.focused) {
    // Open the YAML at the focused task — the graph hands you back to text.
    vscode.postMessage({
      kind: 'dag:nodeClicked',
      taskId: renderer.focused,
      workflowUri: vscode.getState()?.graph?.workflowUri,
    });
  }
});

document.getElementById('btn-help')?.addEventListener('click', () => toggleExplainer());
document.getElementById('btn-feed')?.addEventListener('click', () => toggleActivity());
document.getElementById('btn-export-svg')?.addEventListener('click', () => { void renderer.exportImage('svg'); });
document.getElementById('btn-export-png')?.addEventListener('click', () => { void renderer.exportImage('png'); });
document.getElementById('btn-add-task')?.addEventListener('click', () => {
  vscode.postMessage({
    kind: 'dag:addTask',
    afterTaskId: renderer.focused,
    workflowUri: vscode.getState()?.graph?.workflowUri,
  });
});
// Minimap: click navigates · DRAG pans continuously (the real-minimap feel).
const minimapEl = document.getElementById('minimap');
let minimapDragging = false;
minimapEl?.addEventListener('mousedown', (e: MouseEvent) => {
  minimapDragging = true;
  renderer.minimapNavigate(e.clientX, e.clientY);
  e.preventDefault();
});
window.addEventListener('mousemove', (e: MouseEvent) => {
  if (minimapDragging) { renderer.minimapNavigate(e.clientX, e.clientY); }
});
window.addEventListener('mouseup', () => { minimapDragging = false; });

document.getElementById('es-open')?.addEventListener('click', () => {
  vscode.postMessage({ kind: 'dag:showActive' });
});

// Panel resize re-scales the responsive minimap card (debounced).
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  if (resizeTimer) { clearTimeout(resizeTimer); }
  resizeTimer = setTimeout(() => renderer.refreshMinimap(), 150);
});

// First-contact hint: one discreet line, once ever — the gestures are
// taught by `?`, this just points at the door.
if (!vscode.getState()?.seenHint) {
  const onFirstGraph = (): void => {
    if (!vscode.getState()?.graph) { return; }
    const hint = document.createElement('div');
    hint.id = 'first-hint';
    const kbd = document.createElement('kbd');
    kbd.textContent = '?';
    hint.append('Press ', kbd, ' to learn this graph');
    document.body.appendChild(hint);
    setTimeout(() => hint.classList.add('fade'), 6000);
    setTimeout(() => hint.remove(), 7000);
    vscode.setState({ ...(vscode.getState() ?? {}), seenHint: true });
    window.removeEventListener('message', firstGraphListener);
  };
  const firstGraphListener = (event: MessageEvent<ExtToWebviewMessage>): void => {
    if (event.data.kind === 'dag:load') { setTimeout(onFirstGraph, 600); }
  };
  window.addEventListener('message', firstGraphListener);
}

// ─── Signal Ready ───────────────────────────────────────────────────────────
vscode.postMessage({ kind: 'dag:ready' });
