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
import { analyzeDag, type DagInsights } from '../core/dagAnalysis';

// Every animation in this view is gated on the user's motion preference.
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
}

interface DagEdge {
  id: string;
  source: string;
  target: string;
  isDataEdge: boolean;
  label?: string;
  ghost?: boolean;
}

interface DagGraph {
  workflowName: string;
  workflowUri?: string;
  nodes: DagNode[];
  edges: DagEdge[];
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
  | { kind: 'theme:changed' };

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

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;
const NODE_RADIUS = 8;
const PADDING = 40;

/** Verb -> icon (simple Unicode — no font dependency) */
const VERB_ICONS: Record<Verb, string> = {
  infer: '\u2728', // sparkles
  exec: '\u25B6',  // play triangle
  invoke: '\u2699', // gear
  agent: '\u267B',  // recycling (loop)
};

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
      height: NODE_HEIGHT,
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
    this.renderEdges(layoutResult.edges ?? [], graph.edges);
    this.renderNodes(layoutResult.children ?? [], graph.nodes);

    // A focus carried over from a DIFFERENT workflow (follow-mode
    // retarget) would dim the entire new graph — drop it.
    if (this.focusedId && !this.nodeMap.has(this.focusedId)) {
      this.focusedId = null;
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
  private applyFocus(id: string | null): void {
    this.focusedId = id;
    const related = new Set<string>();
    if (id) {
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
    }

    this.nodeGroup.selectAll<SVGGElement, DagNode>('.dag-node')
      .classed('dimmed', (d) => id !== null && !related.has(d.id))
      .classed('selected', (d) => d.id === id);
    this.edgeGroup.selectAll<SVGPathElement, ElkExtendedEdge>('.dag-edge')
      .classed('dimmed', (d) => {
        if (id === null) { return false; }
        const ends = this.edgeEnds.get(d.id);
        return !ends || !(related.has(ends.source) && related.has(ends.target));
      });
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

  private startConnect(fromId: string): void {
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
    if (!mm || !this.currentGraph) { return; }
    const PAD = 6;
    const W = 148;
    const H = 96;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .call(this.zoomBehavior.transform as any, t);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .call(this.zoomBehavior.transform as any, t);
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

    // ENTER
    const enter = groups
      .enter()
      .append('g')
      .attr('class', (d) => `dag-node status-${d.status} verb-${d.verb}`)
      .attr('data-id', (d) => d.id)
      .attr('opacity', 0);

    // Node background rect
    enter
      .append('rect')
      .attr('class', 'node-bg')
      .attr('width', NODE_WIDTH)
      .attr('height', NODE_HEIGHT)
      .attr('rx', NODE_RADIUS)
      .attr('ry', NODE_RADIUS);

    // Status indicator bar (left edge)
    enter
      .append('rect')
      .attr('class', 'node-status-bar')
      .attr('width', 4)
      .attr('height', NODE_HEIGHT - 8)
      .attr('x', 4)
      .attr('y', 4)
      .attr('rx', 2)
      .attr('ry', 2);

    // Verb icon chip (Raycast-style tinted square — the icon sits IN
    // something, the one tasteful skeuomorphic cue per node)
    enter
      .append('rect')
      .attr('class', 'node-icon-chip')
      .attr('x', 12)
      .attr('y', NODE_HEIGHT / 2 - 12)
      .attr('width', 24)
      .attr('height', 24)
      .attr('rx', 6);

    enter
      .append('text')
      .attr('class', 'node-icon')
      .attr('x', 24)
      .attr('y', NODE_HEIGHT / 2 + 1)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .text((d) => verbIcon(d.verb));

    // Task ID label
    enter
      .append('text')
      .attr('class', 'node-label')
      .attr('x', 44)
      .attr('y', NODE_HEIGHT / 2 - 7)
      .attr('dominant-baseline', 'central')
      .text((d) => d.label);

    // Subtitle (verb + provider/duration)
    enter
      .append('text')
      .attr('class', 'node-subtitle')
      .attr('x', 44)
      .attr('y', NODE_HEIGHT / 2 + 11)
      .attr('dominant-baseline', 'central')
      .text((d) => this.getSubtitle(d));

    // Running spinner (animated via CSS)
    enter
      .append('circle')
      .attr('class', 'node-spinner')
      .attr('cx', NODE_WIDTH - 20)
      .attr('cy', NODE_HEIGHT / 2)
      .attr('r', 6);

    // Static-audit badge (top-right): when-gate · fan-out — engine facts.
    enter
      .append('text')
      .attr('class', 'node-badge')
      .attr('x', NODE_WIDTH - 8)
      .attr('y', 12)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'central')
      .text((d) => this.badgeText(d));

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

    // Update classes
    merged.attr('class', (d) => `dag-node status-${d.status} verb-${d.verb}`);

    // Update dynamic text
    merged.select('.node-subtitle').text((d) => this.getSubtitle(d));
    merged.select('.node-badge').text((d) => this.badgeText(d));
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

  updateNodeStatus(taskId: string, status: TaskStatus, durationMs?: number): void {
    const node = this.nodeMap.get(taskId);
    if (!node) return;

    if (node.status !== status) {
      appendActivity(taskId, status, durationMs);
    }
    node.status = status;
    if (durationMs != null) node.durationMs = durationMs;

    const el = this.nodeGroup.select(`[data-id="${taskId}"]`);
    el.attr('class', `dag-node status-${status} verb-${node.verb}`);
    el.select('.node-subtitle').text(this.getSubtitle(node));

    // Durations refine the critical path; completion lights the edge flow.
    this.recomputeCritical();
    this.updateEdgeFlow();
    if (this.focusedId) { this.applyFocus(this.focusedId); }

    this.saveState({ graph: this.currentGraph });
    this.updateStatusDisplay();
  }

  batchUpdateStatus(updates: Array<{ taskId: string; status: TaskStatus; durationMs?: number }>): void {
    for (const u of updates) {
      this.updateNodeStatus(u.taskId, u.status, u.durationMs);
    }
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
      .transition().duration(500)
      .call(this.zoomBehavior.transform as any, t);
  }

  zoomIn(): void {
    this.svg
      .transition().duration(300)
      .call(this.zoomBehavior.scaleBy as any, 1.3);
  }

  zoomOut(): void {
    this.svg
      .transition().duration(300)
      .call(this.zoomBehavior.scaleBy as any, 0.7);
  }

  clear(): void {
    this.bandGroup.selectAll('*').remove();
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
  for (const [key, label] of [['F', 'fit'], ['W', 'waves'], ['+/−', 'zoom'], ['Esc', 'clear focus'], ['?', 'this card']]) {
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

// Restore from webview state (e.g., after being hidden and re-shown)
const savedState = vscode.getState();
if (savedState?.showWaves !== undefined) { renderer.showWaves = savedState.showWaves; }
if (savedState?.smoothEdges !== undefined) { renderer.smoothEdges = savedState.smoothEdges; }
if (savedState?.showFeed) { toggleActivity(); }
if (savedState?.graph) {
  renderer.render(savedState.graph);
} else {
  document.getElementById('empty-state')?.removeAttribute('hidden');
}

// ─── Message Handler ────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent<ExtToWebviewMessage>) => {
  const msg = event.data;
  switch (msg.kind) {
    case 'dag:load':
      renderer.render(msg.graph);
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
  }
});

// ─── Toolbar Handlers ───────────────────────────────────────────────────────

document.getElementById('btn-fit')?.addEventListener('click', () => renderer.fitToView());
document.getElementById('btn-zoom-in')?.addEventListener('click', () => renderer.zoomIn());
document.getElementById('btn-zoom-out')?.addEventListener('click', () => renderer.zoomOut());

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

// Keyboard shortcuts
document.addEventListener('keydown', (e: KeyboardEvent) => {
  // Only handle if not in an input field
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === 'f' || e.key === 'F') renderer.fitToView();
  if (e.key === '+' || e.key === '=') renderer.zoomIn();
  if (e.key === '-') renderer.zoomOut();
  if (e.key === 'Escape') {
    if (renderer.cancelConnect()) { return; }
    const ex = document.getElementById('explainer');
    if (ex && !ex.hasAttribute('hidden')) { ex.setAttribute('hidden', ''); return; }
    renderer.clearFocus();
  }
  if (e.key === 'w' || e.key === 'W') wavesBtn?.dispatchEvent(new Event('click'));
  if (e.key === '?') toggleExplainer();
  if (e.key === 'l' || e.key === 'L') toggleActivity();
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
