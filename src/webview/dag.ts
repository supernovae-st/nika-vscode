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
import { easeCubicOut } from 'd3-ease';
// Side-effect import: patches Selection.prototype with .transition()
import 'd3-transition';

import { topoWaves, criticalPath } from '../core/cliContract';
import { frameAt, timelineBounds, type FrameEntry } from '../core/replayFrame';
import { runPlanSummary } from '../core/runPlan';
import { nextFocus, type NavDir } from '../core/canvasNav';
import { FALLBACK_TOOL_BLURBS, filterTools, filterVerbs, type ToolItem } from '../core/verbPalette';
import type { TimelineEntry } from '../core/traceFold';
import { analyzeDag, type DagInsights } from '../core/dagAnalysis';
import type { TraceTimeline } from '../core/traceTimeline';
import { createTransport } from './transport';
import { makeCategoryGlyph, makeVerbGlyph } from './verbGlyphs';
import { lineageOf, type LineageView } from '../core/lineage';
import { afterglowVerdict, isFlowing } from '../core/edgeTruth';

// Every animation in this view is gated on the user's motion preference —
// read LIVE: runtime gates see an OS-level toggle without a panel reload
// (init-time captures keep their boot value; every new gesture respects
// the change immediately).
const MOTION_QUERY = window.matchMedia('(prefers-reduced-motion: reduce)');
let REDUCED_MOTION = MOTION_QUERY.matches;
MOTION_QUERY.addEventListener('change', (e) => { REDUCED_MOTION = e.matches; });

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

// ─── The task palette (cmdk) · add a task — verb or tool ────────────────────
// One searchable palette: the 4 verbs, then the builtin tools grouped
// by category (the binary's `tools --json` vocabulary when it ships).
// ↑↓ to move, Enter to pick, Esc to cancel. Opens on a port-drop onto
// empty canvas (pre-wired depends_on), on N, and from ＋ Task; picking
// a tool posts an `invoke` task pinned to that tool.

/** What the palette hands back: a verb, optionally with a pinned tool. */
interface PalettePick { verb: string; tool?: string }

type PaletteEntry =
  | { kind: 'verb'; verb: string; glyph: string; blurb: string }
  | { kind: 'tool'; tool: string; bare: string; cat: string };

class VerbCmdk {
  private readonly el = document.getElementById('verb-cmdk');
  private readonly input = document.getElementById('cmdk-input') as HTMLInputElement | null;
  private readonly list = document.getElementById('cmdk-list');
  private items: PaletteEntry[] = [];
  private active = 0;
  private onPick: ((pick: PalettePick) => void) | undefined;

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

  open(clientX: number, clientY: number, onPick: (pick: PalettePick) => void): void {
    if (!this.el || !this.input) { return; }
    this.onPick = onPick;
    // Clamp so the palette never spills past the viewport edges.
    const W = 280, H = 400;
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

  /** Open centered over the canvas (N · ＋ Task) — no cursor to anchor. */
  openCentered(onPick: (pick: PalettePick) => void): void {
    const rect = document.getElementById('dag-container')?.getBoundingClientRect();
    const W = 280, H = 400;
    const x = rect ? rect.left + rect.width / 2 - W / 2 : 120;
    const y = rect ? Math.max(rect.top + rect.height * 0.2, 60) : 80;
    this.open(x, Math.min(y, window.innerHeight - H - 8), onPick);
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
    const entry = this.items[index];
    if (!entry) { return; }
    const cb = this.onPick;
    this.close();
    if (entry.kind === 'verb') { cb?.({ verb: entry.verb }); }
    else { cb?.({ verb: 'invoke', tool: entry.tool }); }
  }

  private header(text: string): HTMLElement {
    const h = document.createElement('div');
    h.className = 'cmdk-cat';
    h.textContent = text;
    return h;
  }

  private render(): void {
    if (!this.list) { return; }
    const q = this.input?.value ?? '';
    const verbs = filterVerbs(q);
    const tools = filterTools(q, paletteTools());
    this.items = [
      ...verbs.map((v): PaletteEntry => ({ kind: 'verb', verb: v.verb, glyph: v.glyph, blurb: v.blurb })),
      ...tools.map((t): PaletteEntry => ({ kind: 'tool', ...t })),
    ];
    this.active = Math.min(this.active, Math.max(this.items.length - 1, 0));
    this.list.replaceChildren();

    // Group headers ride the flow: `verbs`, then each tool category.
    let lastHeader = '';
    this.items.forEach((entry, i) => {
      const wanted = entry.kind === 'verb' ? 'verbs' : entry.cat;
      if (wanted !== lastHeader) {
        this.list!.appendChild(this.header(wanted));
        lastHeader = wanted;
      }
      const row = document.createElement('button');
      row.dataset.i = String(i);
      const glyph = document.createElement('span');
      glyph.className = 'cmdk-glyph';
      const name = document.createElement('span');
      name.className = 'cmdk-name';
      const blurb = document.createElement('span');
      blurb.className = 'cmdk-blurb';
      if (entry.kind === 'verb') {
        row.className = `cmdk-row verb-${entry.verb}`;
        const rowSvg = makeVerbGlyph(entry.verb, 13);
        if (rowSvg) { glyph.appendChild(rowSvg); }
        else { glyph.textContent = entry.glyph; }
        name.textContent = entry.verb;
        blurb.textContent = entry.blurb;
      } else {
        row.className = 'cmdk-row cmdk-tool verb-invoke';
        // The category's house icon — the binary's description as the
        // teaching line (curated fallback offline).
        const catSvg = makeCategoryGlyph(entry.cat, 13);
        if (catSvg) { glyph.appendChild(catSvg); }
        else { glyph.textContent = CATEGORY_GLYPH[entry.cat] ?? '◆'; }
        name.textContent = entry.bare;
        blurb.textContent = toolDescOf(entry.bare) ?? `invoke · nika:${entry.bare}`;
        row.title = `invoke · nika:${entry.bare}${toolDescOf(entry.bare) ? ` — ${toolDescOf(entry.bare)}` : ''}`;
      }
      row.append(glyph, name, blurb);
      row.addEventListener('mouseenter', () => { this.active = i; this.paintActive(); });
      row.addEventListener('click', () => this.pick(i));
      this.list!.appendChild(row);
    });
    this.paintActive();
  }

  private paintActive(): void {
    const rows = this.list?.querySelectorAll<HTMLElement>('.cmdk-row');
    rows?.forEach((r) => {
      const on = Number(r.dataset.i) === this.active;
      r.classList.toggle('active', on);
      if (on) { r.scrollIntoView({ block: 'nearest' }); }
    });
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
/** Why a particle train exists: the live frontier, or a hover-traced lineage. */
type ParticleKind = 'run' | 'trace';
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
  /** ADR-099 resume — settled from the recorded output, NOT re-executed. */
  cached?: boolean;
  /** `on_error: recover` repaired this success — the absorbed NIKA code. */
  recoveredFrom?: string;
  /** Recorded per-task spend (engine terminal events) — the ticker's fuel. */
  usd?: number;
  /** One badge-safe line of the recorded output (hover-card fact). */
  outputPreview?: string;
  provider?: string;
  model?: string;
  tool?: string;
  when?: string;
  /** Per-task capability grants (engine #367 affirmative permits). */
  permits?: string[];
  fanOutKind?: string;
  fanOutCount?: number;
  costMin?: number;
  costMax?: number;
  dependsOn: string[];
  bindingsIn?: Array<{ alias: string; from: string; path: string }>;
  promptPreview?: string;
  commandPreview?: string;
  argsPreview?: string;
  /** `retry.max_attempts` — the declared retry budget (client YAML read). */
  retryMax?: number;
  /** `timeout` Go-duration string, as written (`30s`). */
  timeout?: string;
  /** `on_error` action — recover · skip · fail_workflow. */
  onError?: string;
  /** Named `output:` bindings the task PRODUCES (≤4). */
  outputNames?: string[];
  avgMs?: number;
  avgRuns?: number;
  stale?: boolean;
  staleUpstream?: boolean;
  auditCount?: number;
  auditWorst?: 'error' | 'warning' | 'info';
  /** The task's RECORDED media artifact (webview URI in `src`, host path
   *  in `path` for the open jump) — engine truth from the trace. */
  artifact?: {
    kind: 'image' | 'audio';
    src: string;
    path: string;
    name: string;
    tip?: string;
    count?: number;
    durationMs?: number;
  };
}

/** One artifact delta row (dag:artifacts — run close · replay). */
type CardArtifactMsg = NonNullable<DagNode['artifact']> & { taskId: string };

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
  resumeCapable?: boolean;
  workflowName: string;
  workflowUri?: string;
  nodes: DagNode[];
  edges: DagEdge[];
  regions?: DagRegion[];
}

type ExtToWebviewMessage =
  | { kind: 'dag:load'; graph: DagGraph; toolCats?: Record<string, { cat: string; desc?: string }> }
  | { kind: 'dag:artifacts'; artifacts: CardArtifactMsg[] }
  | { kind: 'dag:updateStatus'; taskId: string; status: TaskStatus; durationMs?: number; usd?: number; cached?: boolean; recoveredFrom?: string; outputPreview?: string }
  | { kind: 'dag:batchUpdateStatus'; updates: Array<{ taskId: string; status: TaskStatus; durationMs?: number; usd?: number; cached?: boolean; recoveredFrom?: string; outputPreview?: string }> }
  | { kind: 'dag:focus'; taskId: string }
  | { kind: 'dag:cursorHint'; taskId: string | null }
  | { kind: 'dag:lineage'; taskId: string | null }
  | { kind: 'dag:preflight'; chip: { text: string; cls: string; tip: string } | null }
  | { kind: 'dag:note'; icon: string; text: string; taskId?: string; cls?: string }
  | { kind: 'dag:clear' }
  | { kind: 'dag:fitToView' }
  | { kind: 'theme:changed' }
  | { kind: 'theme:mode'; mode: 'nika' | 'editor' | 'phosphor' | 'auto' }
  | { kind: 'transport:load'; timeline: TraceTimeline; speed?: number; autoPlay?: boolean }
  | { kind: 'transport:clear' }
  | { kind: 'diff:load'; entries: Array<{ taskId: string; verdict: string; badge: string }> }
  | { kind: 'diff:clear' }
  | { kind: 'run:state'; running: boolean }
  | { kind: 'dag:stale'; stale: string[]; direct: string[] }
  | { kind: 'dag:audit'; audits: Array<{ taskId: string; count: number; worst: 'error' | 'warning' | 'info' }> }
  | { kind: 'dag:cost'; forecast: { label: string; tooltip: string; unbounded: boolean; delta?: { label: string; tooltip: string; up: boolean } } | null }
  | { kind: 'run:progress'; done: number; total: number }
  | { kind: 'run:verdict'; icon: string; text: string; cls: string }
  | { kind: 'dag:replayLoad'; timeline: TimelineEntry[]; label: string; speed: number }
  | { kind: 'dag:replayEnd' }
  | { kind: 'welcome:data'; recent: Array<{ name: string; uri: string; rel: string }>; binaryMissing?: boolean };

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
  heatmap?: boolean;
  followRun?: boolean;
  /** Hand-dragged card positions per workflow (uri → id → root coords).
   *  Presentation ONLY — the YAML stays the single truth; positions live
   *  in webview state, never in the file. Bounded to the last 6 flows. */
  manualLayouts?: Record<string, Record<string, { x: number; y: number }>>;
}

declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

// ─── Constants ──────────────────────────────────────────────────────────────

const NODE_WIDTH = 248;
const NODE_HEIGHT = 72; // minimum — content grows the card (two-zone anatomy)
const NODE_RADIUS = 10;
const PADDING = 40;
/** Floating top rail clearance — fit parks the graph below it. */
const TOP_INSET = 54;

// Card anatomy metrics (must mirror the .nc-* CSS so ELK gets true boxes:
// DESIGN.md §1 — pad 10 · head 22 · divider 12 · preview 92 img / 30
// audio (+6 gap) · sub 15 · body 15/line (+4 gap) · io 15 (+5 gap) ·
// params 24 (+6 gap) · policy 20 (+6 gap)).
const CARD_PAD_Y = 10;
const HEAD_H = 22;
const DIVIDER_H = 12;
const SUB_H = 15;
const BODY_LINE_H = 15;
const BODY_GAP = 4;
const IO_H = 15;
const IO_GAP = 5;
const PARAMS_H = 24;
const PARAMS_GAP = 6;
const POLICY_H = 20;
const POLICY_GAP = 6;
/** The recorded-artifact preview zone (image thumb / audio row). */
const PREVIEW_IMG_H = 92;
const PREVIEW_AUD_H = 30;
const PREVIEW_GAP = 6;

/** Inbound wires shown ON the card (the rest counts into `+N`). */
const IO_MAX_WIRES = 2;

/** Body preview text for a node (verb decides which fact leads). */
function bodyTextOf(node: DagNode): { kind: 'prompt' | 'cmd' | 'args'; text: string } | undefined {
  if (node.promptPreview) { return { kind: 'prompt', text: node.promptPreview }; }
  if (node.commandPreview) { return { kind: 'cmd', text: node.commandPreview }; }
  if (node.argsPreview) { return { kind: 'args', text: node.argsPreview }; }
  return undefined;
}

/** Whether the params row (gate · model chip · cost · avg) shows. */
function hasParamsRow(node: DagNode): boolean {
  return node.model !== undefined || node.tool !== undefined
    || node.when !== undefined
    || (node.costMin != null && node.costMax != null)
    || node.avgMs !== undefined;
}

/** Whether the io row shows — inbound wires, named ON the card. */
function hasIoRow(node: DagNode): boolean {
  return (node.bindingsIn?.length ?? 0) > 0;
}

/** Whether the policy row shows — retry · timeout · on_error · outputs ·
 *  permits (declared facts only; an empty row never renders). */
function hasPolicyRow(node: DagNode): boolean {
  return node.retryMax !== undefined
    || node.timeout !== undefined
    || node.onError !== undefined
    || (node.outputNames?.length ?? 0) > 0
    || (node.permits?.length ?? 0) > 0;
}

/** Card height from content — the layout must know the TRUE box. */
function nodeHeightOf(node: DagNode): number {
  let h = CARD_PAD_Y * 2 + HEAD_H + DIVIDER_H + SUB_H;
  if (node.artifact) {
    h += PREVIEW_GAP + (node.artifact.kind === 'image' ? PREVIEW_IMG_H : PREVIEW_AUD_H);
  }
  const body = bodyTextOf(node);
  if (body) {
    const lines = body.kind === 'prompt'
      ? Math.min(body.text.split('\n').length, 3)
      : 1;
    // Prompt wraps: budget by character count too (≈31 chars/line at
    // 10px Martian Mono in the ~220px content column — conservative;
    // an optimistic 34 clipped the third line mid-glyph).
    const wrapLines = body.kind === 'prompt'
      ? Math.max(lines, Math.min(3, Math.ceil(body.text.replace(/\n/g, ' ').length / 31)))
      : lines;
    h += BODY_GAP + wrapLines * BODY_LINE_H;
  }
  if (hasIoRow(node)) { h += IO_GAP + IO_H; }
  if (hasParamsRow(node)) { h += PARAMS_GAP + PARAMS_H; }
  if (hasPolicyRow(node)) { h += POLICY_GAP + POLICY_H; }
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
    + (node.cached ? ' is-cached' : '')
    + (node.recoveredFrom !== undefined ? ' is-recovered' : '')
    + (node.auditCount ? ` has-audit audit-${node.auditWorst ?? 'error'}` : '');
}

function verbIcon(verb: string): string {
  return (VERB_ICONS as Record<string, string>)[verb] ?? '\u25CB'; // \u25CB unknown
}

function usd(n: number): string {
  return `$${n.toFixed(n < 0.1 ? 4 : 2)}`;
}

/** One glyph per builtin CATEGORY (`nika tools --json` vocabulary). */
const CATEGORY_GLYPH: Record<string, string> = {
  core: '◦', file: '▤', data: '⧉', network: '⇄', introspection: '⌕', media: '▣',
};

/** Category glyph per canonical builtin — the PRESENTATION FALLBACK for
 *  binaries older than `nika tools --json` (engine E1). When the
 *  extension feeds `toolCats` on dag:load, the binary's own vocabulary
 *  wins and this map goes unread. */
const BUILTIN_GLYPH: Record<string, string> = {
  log: '◦', emit: '◦', assert: '◦', prompt: '◦', done: '◦', wait: '◦',
  read: '▤', write: '▤', edit: '▤', glob: '▤', grep: '▤',
  jq: '⧉', json_diff: '⧉', validate: '⧉', json_merge_patch: '⧉',
  convert: '⧉', uuid: '⧉', date: '⧉', hash: '⧉',
  fetch: '⇄', notify: '⇄',
  inspect: '⌕', compose: '⌕',
  image_generate: '▣', tts_generate: '▣', image_fx: '▣', chart: '▣',
};

/** BARE name → category, pushed by the extension (undefined pre-E1). */
let toolCatsMap: Record<string, { cat: string; desc?: string }> | undefined;

/** Category of a bare builtin — binary vocabulary first, fallback map. */
function toolCatOf(bare: string): string | undefined {
  return toolCatsMap?.[bare]?.cat ?? FALLBACK_TOOL_CATS[bare];
}

/** One-line blurb — the binary's own description wins; curated fallback. */
function toolDescOf(bare: string): string | undefined {
  return toolCatsMap?.[bare]?.desc ?? FALLBACK_TOOL_BLURBS[bare];
}

/** Offline bare → category (inverted glyph map) — the palette's fallback
 *  vocabulary when the binary hasn't fed `tools --json` yet. */
const FALLBACK_TOOL_CATS: Record<string, string> = (() => {
  const glyphCat = Object.fromEntries(
    Object.entries(CATEGORY_GLYPH).map(([cat, glyph]) => [glyph, cat]),
  );
  return Object.fromEntries(
    Object.entries(BUILTIN_GLYPH).map(([bare, glyph]) => [bare, glyphCat[glyph] ?? 'core']),
  );
})();

/** Canonical category order for the task palette groups. */
const CATEGORY_ORDER = ['core', 'file', 'data', 'network', 'introspection', 'media'];

/** The palette's tool rows — the binary's vocabulary first, fallback map
 *  otherwise; grouped by category order, alphabetical within. */
function paletteTools(): ToolItem[] {
  const bares = Object.keys(toolCatsMap ?? FALLBACK_TOOL_CATS);
  // A category this build doesn't know (future binary vocabulary)
  // sorts AFTER the known families — never before core.
  const rank = (cat: string): number => {
    const i = CATEGORY_ORDER.indexOf(cat);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  return bares
    .map((bare) => ({ tool: `nika:${bare}`, bare, cat: toolCatOf(bare) ?? 'core' }))
    .sort((a, b) => (rank(a.cat) - rank(b.cat)) || a.bare.localeCompare(b.bare));
}

/** `nika:fetch` → `⇄ nika:fetch` — binary vocabulary first, fallback map. */
function toolWithGlyph(tool: string): string {
  const bare = tool.replace(/^nika:/, '');
  const cat = toolCatOf(bare);
  const glyph = (cat ? CATEGORY_GLYPH[cat] : undefined) ?? BUILTIN_GLYPH[bare];
  return glyph ? `${glyph} ${tool}` : tool;
}

/** Storage key for a workflow's hand-dragged layout (uri, else name). */
function layoutKeyOf(graph: DagGraph): string {
  return graph.workflowUri ?? graph.workflowName;
}

// ─── Card audio · ONE player, the recorded output, on demand ────────────────
// A single HTMLAudio plays the clicked card's recorded artifact; starting
// another card (or re-clicking) stops the first. User-initiated only —
// nothing autoplays, reduced-motion has nothing to opt out of.
let cardAudio: HTMLAudioElement | null = null;
let cardAudioBtn: HTMLButtonElement | null = null;

function stopCardAudio(): void {
  cardAudio?.pause();
  cardAudio = null;
  if (cardAudioBtn) {
    cardAudioBtn.textContent = '▶';
    cardAudioBtn.classList.remove('playing');
    cardAudioBtn = null;
  }
}

function toggleCardAudio(taskId: string, src: string, btn: HTMLButtonElement): void {
  if (cardAudioBtn === btn) { stopCardAudio(); return; }
  stopCardAudio();
  const audio = new Audio(src);
  cardAudio = audio;
  cardAudioBtn = btn;
  btn.textContent = '⏸';
  btn.classList.add('playing');
  audio.addEventListener('ended', () => { if (cardAudio === audio) { stopCardAudio(); } });
  audio.play().catch(() => { if (cardAudio === audio) { stopCardAudio(); } });
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
  private particleGroup: Selection<SVGGElement, unknown, null, undefined>;
  private nodeGroup: Selection<SVGGElement, unknown, null, undefined>;
  private zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;
  private currentGraph: DagGraph | undefined;
  private nodeMap: Map<string, DagNode> = new Map();
  private container: HTMLElement;
  private hoverCard: HTMLElement | null;
  /** Use smooth curves instead of orthogonal segments for edges */
  public smoothEdges = false;
  /** Heatmap overlay — tint cards by run duration (else static cost). */
  public heatmapOn = false;
  /** Follow-the-run — the camera tracks the frontier (G · a user pan
   *  pauses it for the session: the human hand always outranks). */
  public followRun = false;
  /** Throttle: at most one follow glide per 400ms (parallel starts). */
  private lastFollowTs = 0;
  /** Alignment guide lines (lazy — exist only mid-drag). */
  private guideV: Selection<SVGLineElement, unknown, null, undefined> | null = null;
  private guideH: Selection<SVGLineElement, unknown, null, undefined> | null = null;
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
  /** The one floating + riding a hovered dependency wire (insert-on-edge). */
  private edgePlus: Selection<SVGGElement, unknown, null, undefined> | null = null;
  private edgePlusEnds: { from: string; to: string } | null = null;
  private edgePlusHideTimer: number | undefined;
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
  /** Hand-dragged card positions for the CURRENT workflow (root coords). */
  private manualPos = new Map<string, { x: number; y: number }>();
  /** node id → edge ids touching it (live re-route on the drag hot path). */
  private nodeEdges = new Map<string, string[]>();
  /** edge id → live DOM elements (drag hot path — zero d3 scans per move). */
  private edgePathEl = new Map<string, SVGPathElement>();
  private edgeLabelEl = new Map<string, SVGTextElement>();
  private edgeHitEl = new Map<string, SVGPathElement>();
  private edgeDirEl = new Map<string, SVGPathElement>();
  /** Hidden measuring path (in defs) — chevron placement reads the FINAL
   *  geometry without touching the live wires mid-transition. */
  private measurePath: SVGPathElement | null = null;
  /** Live particle trains, per edge (what exists ↔ what is true). */
  private particleEdges = new Map<string, { kind: ParticleKind; el: SVGGElement; path: SVGPathElement }>();
  /** Unique DOM ids for edge paths (SMIL <mpath> needs an href anchor). */
  private edgeDomSeq = 0;
  /** One-shot afterglow window — cleared before any re-arm. */
  private afterglowTimer: number | undefined;
  /** rAF coalescing for the drag hot path (mousemove can outrun frames). */
  private dragRaf = 0;
  private dragLast: { x: number; y: number } | null = null;
  /** In-flight card drag (null = none). Threshold guards click vs drag. */
  private dragging: {
    id: string; startX: number; startY: number;
    origX: number; origY: number; moved: boolean;
  } | null = null;
  /** Swallow the click that ends a drag — a drop is not a select. */
  private suppressClick = false;
  /** Wave count of the current graph (post-drag band refresh). */
  private waveCount = 0;
  /** Per-wave vertical extents + member counts (the plan rail reads these). */
  private waveExtents = new Map<number, { top: number; bottom: number; count: number }>();
  /** Task id → performance.now() at the OBSERVED live start — the
   *  elapsed ticker's anchor (session-only, never restored: a revived
   *  panel cannot know when a task started). */
  private liveStart = new Map<string, number>();
  /** The 1Hz elapsed repaint (exists only while something runs). */
  private elapsedTimer: number | undefined;

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
    // The measuring path (defs = in-document but never painted).
    this.measurePath = defs.append<SVGPathElement>('path').node();

    // Root group receives all zoom/pan transforms
    this.rootGroup = this.svg.append<SVGGElement>('g').attr('class', 'dag-root');
    // Wave bands at the very back — the parallelism explained visually
    this.bandGroup = this.rootGroup.append<SVGGElement>('g').attr('class', 'dag-bands');
    // Author regions above bands, still behind edges + nodes
    this.regionGroup = this.rootGroup.append<SVGGElement>('g').attr('class', 'dag-regions');
    // Edges below nodes
    this.edgeGroup = this.rootGroup.append<SVGGElement>('g').attr('class', 'dag-edges');
    // Execution particles ride ABOVE the wires, UNDER the cards.
    this.particleGroup = this.rootGroup.append<SVGGElement>('g').attr('class', 'dag-particles');
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
      // Dropped on EMPTY canvas — the Flows gesture: open the task
      // palette AT the cursor (verb or tool); insertTaskSkeleton then
      // declares depends_on: [from] extension-side.
      if (!targetEl) {
        verbCmdk.open(event.clientX, event.clientY, (pick) => {
          vscode.postMessage({
            kind: 'dag:addTask',
            verb: pick.verb,
            tool: pick.tool,
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
        // A HUMAN gesture (sourceEvent set) while following → the camera
        // yields for the rest of the run; re-toggle G to re-arm.
        if (event.sourceEvent && this.followRun) {
          this.followRun = false;
          document.getElementById('btn-follow')?.classList.remove('active');
        }
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

    // Dragging a CARD moves the card, never the canvas: pan only starts
    // on background mousedown. Wheel semantics are the MODERN canvas
    // gesture set (n8n/Figma): plain wheel/two-finger = PAN, pinch (which
    // Chromium reports as ctrlKey wheel) or ⌘wheel = ZOOM.
    this.zoomBehavior.filter((event: MouseEvent | WheelEvent) => {
      // Card gestures own their events: mousedown arms the card DRAG,
      // dblclick opens the YAML — neither may double as a camera move
      // (d3's default dblclick.zoom used to zoom WHILE the file opened).
      if ((event.type === 'mousedown' || event.type === 'dblclick')
        && (event.target as Element | null)?.closest?.('.dag-node')) {
        return false;
      }
      if (event.type === 'wheel') {
        return event.ctrlKey || event.metaKey;
      }
      return !event.ctrlKey
        && !('button' in event && (event as MouseEvent).button);
    });

    this.svg.call(this.zoomBehavior);

    // Plain wheel pans (the zoom filter above refused it) — screen-space
    // deltas divided by the live scale so panning speed feels 1:1.
    this.svg.on('wheel.pan', (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) { return; }
      event.preventDefault();
      this.zoomBehavior.translateBy(
        this.svg as D3ZoomCall,
        -event.deltaX / this.currentZoom,
        -event.deltaY / this.currentZoom,
      );
    });

    // Card drag: move + settle (namespaced — never collides with connect).
    this.svg.on('mousemove.carddrag', (event: MouseEvent) => this.dragMove(event));
    this.svg.on('mouseup.carddrag', () => this.dragEnd());
    this.svg.on('mouseleave.carddrag', () => this.dragEnd());

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
    // Data edge arrow (solid — slender, not a traffic sign)
    defs
      .append('marker')
      .attr('id', 'arrow-data')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 9.5)
      .attr('refY', 5)
      .attr('markerWidth', 6.5)
      .attr('markerHeight', 6.5)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M 0 1 L 9.5 5 L 0 9 z')
      .attr('class', 'arrow-data');

    // Dependency arrow (subtle, gray)
    defs
      .append('marker')
      .attr('id', 'arrow-dep')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 9.5)
      .attr('refY', 5)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M 0 1 L 9.5 5 L 0 9 z')
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
    this.nodeEdges.clear();
    for (const e of graph.edges) {
      (this.nodeEdges.get(e.source) ?? this.nodeEdges.set(e.source, []).get(e.source)!).push(e.id);
      (this.nodeEdges.get(e.target) ?? this.nodeEdges.set(e.target, []).get(e.target)!).push(e.id);
    }
    this.waveOf.clear();
    const waves = topoWaves(graph.nodes, graph.edges);
    waves.forEach((wave, i) => wave.forEach((id) => this.waveOf.set(id, i)));
    this.waveCount = waves.length;
    // Restore this workflow's hand-dragged positions (ids may have moved
    // on since — renamed/deleted tasks silently drop their pin).
    this.manualPos = new Map(Object.entries(
      vscode.getState()?.manualLayouts?.[layoutKeyOf(graph)] ?? {},
    ));
    for (const id of [...this.manualPos.keys()]) {
      if (!this.nodeMap.has(id)) { this.manualPos.delete(id); }
    }
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

    // Hand-dragged positions override the ELK result — presentation only
    // (the YAML stays the truth); edges touching a moved card re-route as
    // direct curves since their ELK sections no longer apply.
    for (const child of layoutResult.children ?? []) {
      const m = this.manualPos.get(child.id);
      if (m) { child.x = m.x; child.y = m.y; }
    }

    // Update toolbar
    const titleEl = document.getElementById('dag-title');
    if (titleEl) titleEl.textContent = graph.workflowName;

    // Loaded → the empty state yields to the canvas, chrome comes back.
    document.getElementById('empty-state')?.setAttribute('hidden', '');
    document.body.classList.remove('welcome');

    // A workflow with ZERO tasks is an ARRIVAL, not a graph: the
    // centered describe bar takes the stage (type the intent, or add
    // the first task from the bar/N) and leaves as the first task lands.
    const describeHost = document.getElementById('canvas-describe');
    if (describeHost) {
      const arriving = graph.nodes.length === 0;
      const wasHidden = describeHost.hasAttribute('hidden');
      describeHost.toggleAttribute('hidden', !arriving);
      if (arriving && wasHidden) {
        (document.getElementById('cd-input') as HTMLInputElement | null)?.focus();
      }
    }

    // Remember laid-out boxes for editor-driven centerOn.
    this.layoutBox.clear();
    for (const n of layoutResult.children ?? []) {
      this.layoutBox.set(n.id, {
        x: n.x ?? 0, y: n.y ?? 0,
        w: n.width ?? NODE_WIDTH, h: n.height ?? NODE_HEIGHT,
      });
    }

    // Wave bands at the back, then edges, then nodes.
    this.renderWaveBands(waves.length);
    this.renderRegions();
    this.renderEdges(layoutResult.edges ?? [], graph.edges);
    this.renderNodes(layoutResult.children ?? [], graph.nodes);

    // A focus carried over from a DIFFERENT workflow (follow-mode
    // retarget) would dim the entire new graph — drop it (lineage too:
    // its sets point at the old graph's ids).
    if (this.focusedId && !this.nodeMap.has(this.focusedId)) {
      this.focusedId = null;
    }
    if (this.lineage && !this.nodeMap.has(this.lineage.focus)) {
      this.lineage = null;
      this.lineageFromEditor = false;
    }
    // A hover can't survive a graph swap (its sets point at old ids, and
    // the pointer's mouseenter will re-fire if it still rests on a card).
    this.hoverLin = null;
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

    this.applyHeatmap();

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

  /** Background bands per topological wave — parallelism made visible.
   *  Reads the LIVE layout boxes so bands follow hand-dragged cards. */
  private renderWaveBands(waveCount: number): void {
    this.bandGroup.selectAll('*').remove();
    if (waveCount < 2) { return; }

    const byWave = new Map<number, { top: number; bottom: number }>();
    let maxX = 0;
    for (const [id, b] of this.layoutBox) {
      const wave = this.waveOf.get(id);
      if (wave === undefined) { continue; }
      const top = b.y;
      const bottom = b.y + b.h;
      const cur = byWave.get(wave);
      byWave.set(wave, {
        top: cur ? Math.min(cur.top, top) : top,
        bottom: cur ? Math.max(cur.bottom, bottom) : bottom,
      });
      maxX = Math.max(maxX, b.x + b.w);
    }

    // Per-wave member counts — the caption speaks the site's grammar.
    const countOf = new Map<number, number>();
    for (const w of this.waveOf.values()) {
      countOf.set(w, (countOf.get(w) ?? 0) + 1);
    }

    // Publish extents for the plan rail + wave centering.
    this.waveExtents.clear();
    for (const [w, ext] of byWave) {
      this.waveExtents.set(w, { top: ext.top, bottom: ext.bottom, count: countOf.get(w) ?? 0 });
    }
    this.buildPlanRail();

    for (const [wave, ext] of byWave) {
      const band = this.bandGroup.append('g').attr('class', 'wave-band-group');
      // The caption is permanent plan grammar; the FILL is the W toggle.
      if (this.showWaves) {
        band.append('rect')
        .attr('class', `wave-band ${wave % 2 === 0 ? 'even' : 'odd'}`)
        .attr('x', -PADDING / 2)
        .attr('y', ext.top - 10)
        .attr('width', maxX + PADDING)
        .attr('height', ext.bottom - ext.top + 20)
        .attr('rx', 6);
      }
      // The nika.sh dv-cap grammar: `[ 01 ]  start · run together ×N · then`.
      const n = countOf.get(wave) ?? 0;
      const caption = n > 1 ? `run together ×${n}` : wave === 0 ? 'start' : 'then';
      const label = band.append('text')
        .attr('class', 'wave-label')
        .attr('x', -PADDING / 2 + 8)
        .attr('y', ext.top - 7); // above the band — the site's dv-cap position
      label.append('tspan')
        .attr('class', 'wave-label-n')
        .text(`[ ${String(wave + 1).padStart(2, '0')} ]`);
      label.append('tspan')
        .attr('dx', 7)
        .text(caption);
    }
  }

  // ─── The plan rail · the left column IS the execution plan ──────────────
  // Wide panels leave dead flanks around portrait DAGs; the rail fills
  // the left one with the graph's own story — every wave as a clickable
  // row, the viewport's wave tracked live (composition, not decoration).

  /** Rebuild the rail rows (called per render). */
  private buildPlanRail(): void {
    const rail = document.getElementById('plan-rail');
    if (!rail) { return; }
    rail.replaceChildren();
    if (this.waveExtents.size < 3) {
      rail.setAttribute('hidden', '');
      document.body.classList.remove('has-rail');
      return;
    }
    const waves = [...this.waveExtents.entries()].sort((a, b) => a[0] - b[0]);
    for (const [w, ext] of waves) {
      const row = document.createElement('button');
      row.className = 'pr-row';
      row.dataset.wave = String(w);
      const n = document.createElement('span');
      n.className = 'pr-n';
      n.textContent = `[ ${String(w + 1).padStart(2, '0')} ]`;
      const cap = document.createElement('span');
      cap.className = 'pr-cap';
      cap.textContent = ext.count > 1 ? `×${ext.count}` : w === 0 ? 'start' : 'then';
      row.append(n, cap);
      row.title = ext.count > 1
        ? `wave ${w + 1} — ${ext.count} tasks run together · click to center`
        : `wave ${w + 1} · click to center`;
      row.addEventListener('click', () => this.centerWave(w));
      rail.appendChild(row);
    }
    rail.removeAttribute('hidden');
    document.body.classList.add('has-rail');
    this.syncRailActive();
  }

  /** Glide the viewport to a wave's vertical center (zoom preserved). */
  private centerWave(wave: number): void {
    const ext = this.waveExtents.get(wave);
    const svgEl = this.svg.node();
    if (!ext || !svgEl) { return; }
    const { width: svgW, height: svgH } = svgEl.getBoundingClientRect();
    const k = this.currentZoom;
    const cx = this.graphW / 2;
    const cy = (ext.top + ext.bottom) / 2;
    const t = zoomIdentity
      .translate(svgW / 2 - cx * k, svgH / 2 - cy * k)
      .scale(k);
    this.svg
      .transition().duration(REDUCED_MOTION ? 0 : 360)
      .ease(easeCubicOut)
      .call(this.zoomBehavior.transform as D3ZoomCall, t);
  }

  /** Track which wave owns the viewport center (rail active state). */
  private syncRailActive(): void {
    if (!document.body.classList.contains('has-rail')) { return; }
    const svgEl = this.svg.node();
    if (!svgEl) { return; }
    const { height: svgH } = svgEl.getBoundingClientRect();
    const viewTop = (0 - this.currentTy) / this.currentZoom;
    const viewBottom = (svgH - this.currentTy) / this.currentZoom;
    const centerY = (viewTop + viewBottom) / 2;
    // The whole plan on screen → no arbitrary highlight.
    let minTop = Infinity;
    let maxBottom = -Infinity;
    for (const ext of this.waveExtents.values()) {
      minTop = Math.min(minTop, ext.top);
      maxBottom = Math.max(maxBottom, ext.bottom);
    }
    const allVisible = minTop >= viewTop - 4 && maxBottom <= viewBottom + 4;
    let best = -1;
    let bestDist = Infinity;
    if (!allVisible) {
    for (const [w, ext] of this.waveExtents) {
      const mid = (ext.top + ext.bottom) / 2;
      const dist = centerY >= ext.top && centerY <= ext.bottom ? 0 : Math.abs(centerY - mid);
      if (dist < bestDist) { bestDist = dist; best = w; }
    }
    }
    document.querySelectorAll<HTMLElement>('#plan-rail .pr-row').forEach((row) => {
      row.classList.toggle('active', Number(row.dataset.wave) === best);
    });
  }

  /**
   * Focus mode: dim everything not on the selected node's lineage; the
   * upstream chain and downstream cone stay lit — « what feeds this ·
   * what it unlocks », the DAG explaining itself.
   */
  /** Active lineage illumination (click-focus OR editor caret) — one input to the dim truth. */
  private lineage: LineageView | null = null;
  /** True when the caret (not a click) set the lineage — cleared on caret exit. */
  private lineageFromEditor = false;
  /** Pointer-driven lineage (hover-to-trace) — the WEAKEST intent: a click
   *  focus owns the stage; the caret lineage restores itself on unhover. */
  private hoverLin: LineageView | null = null;
  /** Last posted running-set signature — transport:tick fires on change only. */
  private lastRunTick = '';
  /** The editor-caret hinted task — restored after any class rewrite. */
  private cursorHintedId: string | null = null;
  /** Live `/`-filter matches (null = no filter) — the other input. */
  private filterMatches: Set<string> | null = null;

  private applyFocus(id: string | null): void {
    this.focusedId = id;
    this.lineage = id === null ? null : lineageOf(this.currentGraph?.edges ?? [], id);
    this.lineageFromEditor = false;
    this.refreshDim();
  }

  /**
   * Editor-driven lineage: the caret sits inside `${{ tasks.X… }}` —
   * trace X's data story WITHOUT stealing the selection or moving the
   * camera. An explicit canvas click is a stronger intent and wins.
   */
  editorLineage(taskId: string | null): void {
    if (this.focusedId !== null) { return; }
    const valid = taskId !== null && this.nodeMap.has(taskId) ? taskId : null;
    if (valid === null && !this.lineageFromEditor && this.lineage !== null) { return; }
    this.lineage = valid === null ? null : lineageOf(this.currentGraph?.edges ?? [], valid);
    this.lineageFromEditor = valid !== null;
    this.refreshDim();
  }

  /**
   * Hover-to-trace: the pointer rests on a card — light its REAL
   * up/downstream closure without stealing anything. Weakest intent of
   * the three lineage drivers (click > hover > caret): a click focus
   * suppresses it entirely; leaving the card restores whatever the
   * caret had lit. Class flips + a particle resync — nothing else.
   */
  hoverLineage(taskId: string | null): void {
    const next = taskId !== null && this.nodeMap.has(taskId)
      ? lineageOf(this.currentGraph?.edges ?? [], taskId)
      : null;
    if (next === null && this.hoverLin === null) { return; }
    if (next !== null && this.hoverLin?.focus === next.focus) { return; }
    this.hoverLin = next;
    this.refreshDim();
  }

  /** The lineage the canvas SHOWS right now (click > hover > caret). */
  private effectiveLineage(): LineageView | null {
    if (this.focusedId !== null) { return this.lineage; }
    return this.hoverLin ?? this.lineage;
  }

  /** Lineage illumination ∧ filter matches — ONE dimming truth for nodes+edges. */
  private refreshDim(): void {
    const lin = this.effectiveLineage();
    const lit = lin === null ? null : new Set(lin.lit);
    const direct = lin === null ? null : new Set([...lin.upDirect, ...lin.downDirect]);
    const litEdges = lin === null ? null : new Set(lin.litEdges);
    const dimNode = (nid: string): boolean =>
      (lit !== null && !lit.has(nid))
      || (this.filterMatches !== null && !this.filterMatches.has(nid));
    this.nodeGroup.selectAll<SVGGElement, DagNode>('.dag-node')
      .classed('dimmed', (d) => dimNode(d.id))
      .classed('selected', (d) => d.id === this.focusedId)
      .classed('lin-focus', (d) => lin !== null && d.id === lin.focus)
      .classed('lin-direct', (d) => direct !== null && direct.has(d.id))
      .classed('lin-cone', (d) =>
        lin !== null && lit!.has(d.id) && d.id !== lin.focus && !direct!.has(d.id))
      // cursor-hint lives outside nodeClassOf; a class rewrite (audit ·
      // status · frame) drops it — restore it here so the caret halo
      // survives every refresh.
      .classed('cursor-hint', (d) => d.id === this.cursorHintedId);
    const dimEdge = (d: ElkExtendedEdge): boolean => {
      const ends = this.edgeEnds.get(d.id);
      if (!ends) { return lit !== null || this.filterMatches !== null; }
      return dimNode(ends.source) || dimNode(ends.target);
    };
    this.edgeGroup.selectAll<SVGPathElement, ElkExtendedEdge>('.dag-edge')
      .classed('dimmed', dimEdge)
      .classed('lin-path', (d) => {
        if (litEdges === null) { return false; }
        const ends = this.edgeEnds.get(d.id);
        return ends !== undefined && litEdges.has(`${ends.source}->${ends.target}`);
      });
    // The chevrons tell the same dim story as their wires.
    this.edgeGroup.selectAll<SVGPathElement, ElkExtendedEdge>('.edge-dir')
      .classed('dimmed', dimEdge);
    // The minimap tells the same story (class-only touch, no re-render).
    for (const r of document.querySelectorAll<SVGRectElement>('#minimap-svg rect.mm-node')) {
      const id = r.dataset.id;
      r.classList.toggle('mm-dim', id !== undefined && dimNode(id));
    }
    this.syncParticles();
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

  // ─── Follow the run · the camera tracks the frontier (2040 gaze) ─────────

  /** Glide to a newly-running task IF it left the comfortable band —
   *  never recenter what the eye already holds. */
  private maybeFollow(taskId: string): void {
    if (!this.followRun || REDUCED_MOTION) { return; }
    const now = performance.now();
    if (now - this.lastFollowTs < 400) { return; }
    const box = this.layoutBox.get(taskId);
    const svgEl = this.svg.node();
    if (!box || !svgEl) { return; }
    const { width: svgW, height: svgH } = svgEl.getBoundingClientRect();
    const k = this.currentZoom;
    const sx = (box.x + box.w / 2) * k + this.currentTx;
    const sy = (box.y + box.h / 2) * k + this.currentTy;
    // The middle 60% is the comfort band — inside it, hold still.
    const inBand = sx > svgW * 0.2 && sx < svgW * 0.8
      && sy > svgH * 0.2 && sy < svgH * 0.8;
    if (inBand) { return; }
    this.lastFollowTs = now;
    const t = zoomIdentity
      .translate(svgW / 2 - (box.x + box.w / 2) * k, svgH / 2 - (box.y + box.h / 2) * k)
      .scale(k);
    this.svg
      .transition().duration(560)
      .ease(easeCubicOut)
      .call(this.zoomBehavior.transform as D3ZoomCall, t);
  }

  // ─── Failure shockwave · causality made physical ──────────────────────────

  /** A LIVE failure ripples its blast cone: every downstream card takes
   *  a transient hit, staggered by graph distance — you SEE what the
   *  failure just doomed, before the engine even reports the skips. */
  private failureShockwave(fromId: string): void {
    if (REDUCED_MOTION || !document.body.classList.contains('running')) { return; }
    const depth = new Map<string, number>();
    const queue: string[] = [fromId];
    depth.set(fromId, 0);
    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur === undefined) { break; }
      const d = depth.get(cur) ?? 0;
      for (const next of this.downstreamOf.get(cur) ?? []) {
        if (!depth.has(next)) {
          depth.set(next, d + 1);
          queue.push(next);
        }
      }
    }
    for (const [id, d] of depth) {
      if (id === fromId) { continue; }
      const el = document.querySelector<SVGGElement>(
        `.dag-node[data-id="${CSS.escape(id)}"]`,
      );
      const nc = el?.querySelector<HTMLElement>('.nc');
      if (!el || !nc) { continue; }
      nc.style.setProperty('--shock-delay', `${d * 70}ms`);
      el.classList.add('shock');
      setTimeout(() => el.classList.remove('shock'), d * 70 + 700);
    }
  }

  // ─── Heatmap · tint by measured time, else by static cost ────────────────
  // A projection toggle (LangSmith/Insights read): where does the run
  // SPEND? Live durations win; before any run the static cost ceiling
  // speaks. Normalized to the graph's max — the red IS the hotspot.

  applyHeatmap(): void {
    const nodes = [...this.nodeMap.values()];
    document.body.classList.toggle('heatmap', this.heatmapOn);
    if (!this.heatmapOn || nodes.length === 0) {
      this.nodeGroup.selectAll<SVGGElement, DagNode>('.dag-node')
        .each(function () {
          const nc = this.querySelector<HTMLElement>('.nc');
          nc?.style.removeProperty('--heat');
        });
      return;
    }
    const timed = nodes.some((n) => n.durationMs != null || n.avgMs != null);
    const metric = (n: DagNode): number => timed
      ? (n.durationMs ?? n.avgMs ?? 0)
      : (n.costMax ?? 0);
    const max = Math.max(...nodes.map(metric), 1e-9);
    // √ perceptual scale — long-tail metrics (one 14s agent over 100ms
    // tools) crush a linear ramp into a one-card show; sqrt spreads the
    // low end so the GRADIENT reads, while the max stays the hotspot.
    this.nodeGroup.selectAll<SVGGElement, DagNode>('.dag-node')
      .each(function (d) {
        const nc = this.querySelector<HTMLElement>('.nc');
        nc?.style.setProperty('--heat', Math.sqrt(metric(d) / max).toFixed(3));
      });
    // The legend key names the metric in play (time once measured,
    // static cost before) — CSS gates the chip on body.heatmap.
    document.body.dataset.heatMetric = timed ? 'measured time' : 'static cost';
  }

  // ─── Card drag · move the node, the wires follow (n8n-grade) ─────────────

  /** Drag hot path: past a 4px threshold the card follows the pointer.
   *  Coalesced to one move per animation frame (mousemove outruns 60Hz). */
  private dragMove(event: MouseEvent): void {
    const drag = this.dragging;
    if (!drag) { return; }
    const [rx, ry] = this.screenToRoot(event.clientX, event.clientY);
    if (!drag.moved) {
      if (Math.hypot(rx - drag.startX, ry - drag.startY) < 4) { return; }
      drag.moved = true;
      this.hideHoverCard(true);
      this.nodeGroup.select(`[data-id="${CSS.escape(drag.id)}"]`).classed('dragging', true);
    }
    let nx = drag.origX + (rx - drag.startX);
    let ny = drag.origY + (ry - drag.startY);
    // Magnetic alignment (the Figma/helper-lines read): edges + centers
    // of OTHER cards attract within 6 root-px; guides draw the agreement.
    // Alt bypasses (precision drag) — the convention everywhere.
    if (!event.altKey) {
      const snapped = this.snapToPeers(drag.id, nx, ny);
      nx = snapped.x;
      ny = snapped.y;
      this.showGuides(snapped.gx, snapped.gy);
    } else {
      this.showGuides(null, null);
    }
    this.dragLast = { x: nx, y: ny };
    if (this.dragRaf) { return; }
    this.dragRaf = requestAnimationFrame(() => {
      this.dragRaf = 0;
      const last = this.dragLast;
      const live = this.dragging;
      if (last && live?.moved) { this.moveCard(live.id, last.x, last.y); }
    });
  }

  /** Reposition one card + live re-route every wire touching it. */
  private moveCard(id: string, x: number, y: number): void {
    const box = this.layoutBox.get(id);
    if (!box) { return; }
    box.x = x;
    box.y = y;
    this.manualPos.set(id, { x, y }); // direct-curve routing reads this mid-drag
    this.nodeGroup.select(`[data-id="${CSS.escape(id)}"]`)
      .attr('transform', `translate(${x},${y})`);
    // Direct element writes through the id→element caches — the drag hot
    // path never scans the edge list (O(touched), not O(E) per frame).
    for (const eid of this.nodeEdges.get(id) ?? []) {
      const path = this.edgePathEl.get(eid);
      if (path) {
        const datum = select<SVGPathElement, ElkExtendedEdge>(path).datum();
        const d = this.edgePathFor(datum);
        path.setAttribute('d', d);
        this.edgeHitEl.get(eid)?.setAttribute('d', d);
      }
      const label = this.edgeLabelEl.get(eid);
      if (label) {
        const datum = select<SVGTextElement, ElkExtendedEdge>(label).datum();
        const [lx, ly] = this.edgeLabelPoint(datum);
        label.setAttribute('x', String(lx));
        label.setAttribute('y', String(ly - 5));
      }
      const dir = this.edgeDirEl.get(eid);
      if (dir) {
        const datum = select<SVGPathElement, ElkExtendedEdge>(dir).datum();
        const t = this.edgeDirTransformFor(datum);
        if (t === '') { dir.setAttribute('display', 'none'); }
        else {
          dir.removeAttribute('display');
          dir.setAttribute('transform', t);
        }
      }
    }
  }

  /** Edge/center magnetism against every OTHER card (O(N) per frame,
   *  rAF-coalesced — fine to a few hundred cards). Returns the snapped
   *  position + the agreed guide coordinates (null = no snap). */
  private snapToPeers(
    id: string, x: number, y: number,
  ): { x: number; y: number; gx: number | null; gy: number | null } {
    const box = this.layoutBox.get(id);
    if (!box) { return { x, y, gx: null, gy: null }; }
    const SNAP = 6;
    let bestDx = SNAP + 1;
    let snapX = x;
    let gx: number | null = null;
    let bestDy = SNAP + 1;
    let snapY = y;
    let gy: number | null = null;
    const myXs = (px: number): number[] => [px, px + box.w / 2, px + box.w];
    const myYs = (py: number): number[] => [py, py + box.h / 2, py + box.h];
    for (const [oid, b] of this.layoutBox) {
      if (oid === id) { continue; }
      for (const target of [b.x, b.x + b.w / 2, b.x + b.w]) {
        myXs(x).forEach((mine, i) => {
          const d = target - mine;
          if (Math.abs(d) < Math.abs(bestDx)) {
            bestDx = d;
            snapX = x + d;
            gx = i === 0 ? target : i === 1 ? target : target;
          }
        });
      }
      for (const target of [b.y, b.y + b.h / 2, b.y + b.h]) {
        myYs(y).forEach((mine, i) => {
          const d = target - mine;
          if (Math.abs(d) < Math.abs(bestDy)) {
            bestDy = d;
            snapY = y + d;
            gy = i === 0 ? target : i === 1 ? target : target;
          }
        });
      }
    }
    return {
      x: Math.abs(bestDx) <= SNAP ? snapX : x,
      y: Math.abs(bestDy) <= SNAP ? snapY : y,
      gx: Math.abs(bestDx) <= SNAP ? gx : null,
      gy: Math.abs(bestDy) <= SNAP ? gy : null,
    };
  }

  /** Draw/hide the alignment guides (two lazy lines, topmost). */
  private showGuides(gx: number | null, gy: number | null): void {
    if (gx != null) {
      this.guideV ??= this.rootGroup.append('line').attr('class', 'align-guide');
      this.guideV
        .attr('x1', gx).attr('x2', gx)
        .attr('y1', -PADDING).attr('y2', this.graphH + PADDING)
        .attr('opacity', 1);
    } else {
      this.guideV?.attr('opacity', 0);
    }
    if (gy != null) {
      this.guideH ??= this.rootGroup.append('line').attr('class', 'align-guide');
      this.guideH
        .attr('y1', gy).attr('y2', gy)
        .attr('x1', -PADDING).attr('x2', this.graphW + PADDING)
        .attr('opacity', 1);
    } else {
      this.guideH?.attr('opacity', 0);
    }
  }

  /** Settle a drag: persist the pin, refresh bands/regions/minimap. */
  private dragEnd(): void {
    const drag = this.dragging;
    this.dragging = null;
    if (!drag?.moved) { return; }
    this.nodeGroup.select(`[data-id="${CSS.escape(drag.id)}"]`).classed('dragging', false);
    this.showGuides(null, null);
    this.suppressClick = true; // the click firing on mouseup is the drop
    this.persistManualLayout();
    this.renderWaveBands(this.waveCount);
    this.renderRegions();
    this.renderMinimap();
  }

  /** Save this workflow's dragged positions (store bounded to 6 flows). */
  private persistManualLayout(): void {
    if (!this.currentGraph) { return; }
    const key = layoutKeyOf(this.currentGraph);
    const all = { ...(vscode.getState()?.manualLayouts ?? {}) };
    delete all[key]; // re-insert as the freshest entry (insertion order = age)
    if (this.manualPos.size > 0) {
      all[key] = Object.fromEntries(this.manualPos);
      const keys = Object.keys(all);
      for (let i = 0; i < keys.length - 6; i++) { delete all[keys[i]]; }
    }
    this.saveState({ manualLayouts: all });
  }

  /** Whether any card of the current graph is hand-pinned. */
  get hasManualLayout(): boolean {
    return this.manualPos.size > 0;
  }

  /** Drop every pin for the current workflow — back to the auto layout. */
  clearManualLayout(): void {
    this.manualPos.clear();
    this.persistManualLayout();
  }

  startConnect(fromId: string): void {
    this.connectFrom = fromId;
    this.tempEdge = this.rootGroup.append<SVGPathElement>('path').attr('class', 'temp-edge');
    this.svg.classed('connecting', true);
  }

  /** Lazily build the ONE floating + that rides a hovered dep wire. */
  private ensureEdgePlus(): Selection<SVGGElement, unknown, null, undefined> {
    if (this.edgePlus) { return this.edgePlus; }
    const g = this.rootGroup.append<SVGGElement>('g')
      .attr('class', 'edge-plus')
      .attr('display', 'none');
    g.append('circle').attr('class', 'edge-plus-rim').attr('r', 9.5);
    g.append('path')
      .attr('class', 'edge-plus-glyph')
      .attr('d', 'M -4.5 0 H 4.5 M 0 -4.5 V 4.5');
    g.append('title').text('Insert a task INTO this edge — the wire reroutes through it');
    g.on('mouseenter', () => { window.clearTimeout(this.edgePlusHideTimer); });
    g.on('mouseleave', () => this.hideEdgePlus());
    g.on('mousedown', (e: MouseEvent) => e.stopPropagation());
    g.on('click', (e: MouseEvent) => {
      e.stopPropagation();
      if (!this.edgePlusEnds) { return; }
      const { from, to } = this.edgePlusEnds;
      this.hideEdgePlus(true);
      // ONE palette everywhere: the splice picks a verb OR a tool at
      // the cursor — the same surface as ＋ Task / N / port-drop.
      verbCmdk.open(e.clientX, e.clientY, (pick) => {
        vscode.postMessage({
          kind: 'dag:insertOnEdge',
          from,
          to,
          verb: pick.verb,
          tool: pick.tool,
          workflowUri: this.currentGraph?.workflowUri,
        });
      });
    });
    this.edgePlus = g;
    return g;
  }

  /** Park the + at a hovered dep edge's midpoint (rootGroup space —
   *  the paths live there too, so no coordinate mapping). Scale is
   *  zoom-compensated: one FINGER-SIZED target at every distance. */
  private showEdgePlus(pathEl: SVGPathElement, from: string, to: string): void {
    if (document.body.classList.contains('lod-far')) { return; }
    window.clearTimeout(this.edgePlusHideTimer);
    const g = this.ensureEdgePlus();
    const mid = pathEl.getPointAtLength(pathEl.getTotalLength() / 2);
    const comp = Math.min(1 / this.currentZoom, 1.8);
    g.attr('transform', `translate(${mid.x}, ${mid.y}) scale(${comp})`)
      .attr('display', null);
    this.edgePlusEnds = { from, to };
  }

  /** Retire the + — after a grace lap unless immediate (the pointer
   *  needs time to travel from the wire onto the button). */
  private hideEdgePlus(immediate = false): void {
    window.clearTimeout(this.edgePlusHideTimer);
    if (immediate) {
      this.edgePlus?.attr('display', 'none');
      this.edgePlusEnds = null;
      return;
    }
    this.edgePlusHideTimer = window.setTimeout(() => {
      this.edgePlus?.attr('display', 'none');
      this.edgePlusEnds = null;
    }, 260);
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

  /** ⌘D entry: duplicate the focused task (fresh id · inbound wiring kept). */
  requestDuplicateFocused(): void {
    if (!this.focusedId) { return; }
    vscode.postMessage({
      kind: 'dag:duplicateTask',
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
      // Scrub = status time-travel: the ↻ follows the frame; the output
      // fact is a resting truth (live/overlay), not a scrub-frame one.
      node.cached = f.cached === true;
      node.recoveredFrom = undefined;
      node.outputPreview = undefined;
      const el = this.nodeGroup.select(`[data-id="${CSS.escape(f.taskId)}"]`);
      el.attr('class', nodeClassOf(node));
      el.select('.nc-sub-v').text(this.subValue(node));
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

  /** dag:artifacts — recorded outputs land on the cards (run close ·
   *  replay). The delta is a SNAPSHOT of its source trace: a task
   *  absent from it LOSES its preview (the fresh run produced none —
   *  an older generation must not sit beside newer statuses). A
   *  preview appearing, leaving or changing kind changes the card's
   *  TRUE box → full re-render (statuses live in the same nodes, so
   *  nothing is lost); a same-kind refresh just rebuilds the cards. */
  applyArtifacts(artifacts: CardArtifactMsg[]): void {
    if (!this.currentGraph) { return; }
    const byId = new Map(artifacts.map((a) => [a.taskId, a]));
    let relayout = false;
    const touched: DagNode[] = [];
    for (const node of this.nodeMap.values()) {
      const next = byId.get(node.id);
      const prevKind = node.artifact?.kind;
      if (next) {
        const { taskId: _taskId, ...fields } = next;
        node.artifact = fields;
        touched.push(node);
        if (prevKind !== next.kind) { relayout = true; }
      } else if (node.artifact) {
        node.artifact = undefined;
        touched.push(node);
        relayout = true;
      }
    }
    if (touched.length === 0) { return; }
    stopCardAudio();
    if (relayout) {
      void this.render(this.currentGraph);
      return;
    }
    for (const node of touched) {
      const host = this.nodeGroup
        .select<SVGGElement>(`[data-id="${CSS.escape(node.id)}"]`)
        .select<HTMLElement>('.nc').node();
      if (host) { this.buildCardHtml(host, node); }
    }
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
    // Zoom-compensated chrome (selection halo): same OPTICAL weight at
    // every zoom, clamped so far-out never grows comedy halos.
    document.body.style.setProperty(
      '--zoom-comp',
      String(Math.min(Math.max(1 / this.currentZoom, 1), 3)),
    );
    this.syncRailActive();
    this.applyLod(this.currentZoom);
  }

  /** Semantic zoom (DESIGN.md §6c). Thresholds sit BELOW the typical
   *  fit zoom (~0.42) — the first paint shows the FULL card; far is a
   *  deliberate zoom-out to the map read. Each boundary is a hysteresis
   *  BAND (enter low · leave high) so a pinch resting on a threshold
   *  never flaps the whole canvas. */
  private applyLod(k: number): void {
    const cls = document.body.classList;
    const state = cls.contains('lod-far') ? 'far' : cls.contains('lod-mid') ? 'mid' : 'near';
    let next: 'far' | 'mid' | 'near';
    if (k < (state === 'far' ? 0.34 : 0.3)) { next = 'far'; }
    else if (k < (state === 'mid' ? 0.46 : 0.42)) { next = 'mid'; }
    else { next = 'near'; }
    if (next !== state) {
      cls.remove('lod-far', 'lod-mid', 'lod-near');
      cls.add(`lod-${next}`);
      // The far read hides ports and shrinks hit surfaces — a hovered +
      // would float over a gesture that no longer exists.
      if (next === 'far') { this.hideEdgePlus(true); }
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
    // Live-run ephemera never travel with the file: particle trains would
    // keep animating inside an exported SVG, afterglow would replay on open.
    clone.querySelector('g.dag-particles')?.replaceChildren();
    // Artifact previews reference vscode-webview:// URIs that die outside
    // the panel — the exported file keeps the card box, sheds the bytes.
    for (const el of clone.querySelectorAll('.nc-preview, .nc-preview-audio')) {
      el.replaceChildren();
      el.classList.add('nc-preview-exported');
    }
    for (const p of clone.querySelectorAll('.dag-edge.afterglow, .dag-edge.afterglow-fail')) {
      p.classList.remove('afterglow', 'afterglow-fail');
    }

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
      'nk-card', 'nk-card-border', 'nk-card-shadow', 'nk-border-strong',
      'nk-border-soft', 'nk-radius-card',
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
      .ease(easeCubicOut)
      .call(this.zoomBehavior.transform as D3ZoomCall, t);
  }

  /**
   * Soft editor-caret hint: a gentle halo on the node whose YAML the
   * cursor is in. Distinct from selection/focus — it never dims others,
   * it just whispers « you are here ».
   */
  cursorHint(taskId: string | null): void {
    this.cursorHintedId = taskId;
    this.nodeGroup.selectAll<SVGGElement, DagNode>('.dag-node')
      .classed('cursor-hint', (d) => taskId !== null && d.id === taskId);
  }

  /** Focus queued while ELK is still laying out (race: focus ≺ layout). */
  private pendingCenter: string | undefined;

  /** Keyboard nav: move focus by direction over the DAG structure.
   *  Keyboard-initiated → the camera JUMPS (motion charter law 7). */
  navFocus(dir: NavDir): void {
    if (!this.currentGraph) { return; }
    const target = nextFocus(this.currentGraph.nodes, this.currentGraph.edges, this.focusedId ?? undefined, dir);
    if (target) { this.focusAndCenter(target, true); }
  }

  /** Editor-driven focus: light the lineage AND glide the node to center
   *  (`instant` = keyboard source — no glide, per the motion charter). */
  focusAndCenter(taskId: string, instant = false): void {
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
      .transition().duration(instant || REDUCED_MOTION ? 0 : 420)
      .ease(easeCubicOut)
      .call(this.zoomBehavior.transform as D3ZoomCall, t);
  }

  /** Edge life (the live-frontier discipline · DESIGN.md §6): an edge
   *  ANIMATES only while data travels NOW (source settled → target
   *  running/retrying); both-settled edges rest as a quiet success tint.
   *  Never the whole graph. */
  private updateEdgeFlow(): void {
    this.edgeGroup.selectAll<SVGPathElement, ElkExtendedEdge>('.dag-edge')
      .classed('flowing', (d) => {
        if (this.ghostIds.has(d.id)) { return false; } // nothing crosses a missing wire
        const ends = this.edgeEnds.get(d.id);
        if (!ends) { return false; }
        return isFlowing(
          this.nodeMap.get(ends.source)?.status,
          this.nodeMap.get(ends.target)?.status,
        );
      })
      .classed('done', (d) => {
        if (this.ghostIds.has(d.id)) { return false; }
        const ends = this.edgeEnds.get(d.id);
        if (!ends) { return false; }
        return this.nodeMap.get(ends.source)?.status === 'success'
          && this.nodeMap.get(ends.target)?.status === 'success';
      })
      .classed('critical', (d) => this.criticalEdges.has(d.id));
    this.syncParticles();
  }

  // ─── Execution particles · data crossing THIS wire, made visible ─────────
  // The Liam-ERD recipe: a handful of SMIL animateMotion dots riding the
  // edge path — the compositor animates them for 2-3 frames of layout
  // cost, where a dash-offset march re-rasterizes the stroke every frame
  // (Chromium 40958492). Existence IS the honesty gate: a train spawns
  // only while the wire is truly flowing (live frontier) or while YOU
  // hold a lineage under the pointer (hover-to-trace).

  /** Which edges deserve a particle train RIGHT NOW, and why. */
  private desiredParticles(): Map<string, ParticleKind> {
    const want = new Map<string, ParticleKind>();
    if (REDUCED_MOTION) { return want; }
    // Hover-to-trace: particles ride the hovered story ONLY (the rest of
    // the canvas is dimmed — a bright train on a dimmed wire would lie).
    const hov = this.focusedId === null ? this.hoverLin : null;
    if (hov !== null) {
      const lit = new Set(hov.litEdges);
      for (const [id, ends] of this.edgeEnds) {
        if (this.ghostIds.has(id)) { continue; }
        if (lit.has(`${ends.source}->${ends.target}`)) { want.set(id, 'trace'); }
      }
      return want;
    }
    // The live frontier: source settled → target computing, and the wire
    // is actually VISIBLE (a lineage/filter dim mutes its particles too).
    for (const [id, ends] of this.edgeEnds) {
      if (this.ghostIds.has(id)) { continue; }
      if (!isFlowing(this.nodeMap.get(ends.source)?.status, this.nodeMap.get(ends.target)?.status)) { continue; }
      if (this.edgePathEl.get(id)?.classList.contains('dimmed')) { continue; }
      want.set(id, 'run');
    }
    return want;
  }

  /** Reconcile living trains with the truth — spawn, retire, respawn. */
  private syncParticles(): void {
    const want = this.desiredParticles();
    for (const [id, entry] of [...this.particleEdges]) {
      const path = this.edgePathEl.get(id);
      // Retire when no longer true, when the reason changed, or when a
      // relayout replaced the path element the train was riding.
      if (want.get(id) !== entry.kind || path !== entry.path || !entry.path.isConnected) {
        entry.el.remove();
        this.particleEdges.delete(id);
      }
    }
    for (const [id, kind] of want) {
      if (!this.particleEdges.has(id)) { this.spawnParticles(id, kind); }
    }
  }

  /** One staggered train of ≤6 dots riding an edge path (SMIL mpath). */
  private spawnParticles(edgeId: string, kind: ParticleKind): void {
    const host = this.particleGroup.node();
    const path = this.edgePathEl.get(edgeId);
    if (!host || !path || !path.isConnected) { return; }
    const total = path.getTotalLength();
    if (total < 24) { return; } // too short for a train to read
    if (path.id === '') { path.id = `nk-ep-${this.edgeDomSeq++}`; }
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', `edge-particles ep-${kind}`);
    // Constant TRAVEL SPEED (~200 px/s), not constant duration — a long
    // wire must not read as faster data than a short one.
    const dur = Math.min(2.6, Math.max(1, total / 200));
    const count = Math.max(2, Math.min(6, Math.floor(total / 40)));
    for (let i = 0; i < count; i++) {
      const dot = document.createElementNS(ns, 'ellipse');
      dot.setAttribute('class', 'edge-particle');
      // ~2× the wire width — must READ at fit zoom (~0.4-0.8), not only
      // when zoomed in (the first harness pass shipped 2.4 and vanished).
      dot.setAttribute('rx', '4');
      dot.setAttribute('ry', '2.2');
      const am = document.createElementNS(ns, 'animateMotion');
      am.setAttribute('dur', `${dur.toFixed(3)}s`);
      am.setAttribute('repeatCount', 'indefinite');
      am.setAttribute('rotate', 'auto');
      // Negative stagger: the train is already spread on frame one.
      am.setAttribute('begin', `${(-(i * dur) / count).toFixed(3)}s`);
      const mp = document.createElementNS(ns, 'mpath');
      mp.setAttribute('href', `#${path.id}`);
      mp.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `#${path.id}`);
      am.appendChild(mp);
      dot.appendChild(am);
      g.appendChild(dot);
    }
    host.appendChild(g);
    this.particleEdges.set(edgeId, { kind, el: g, path });
  }

  /** OS motion preference flipped mid-session — re-arbitrate the trains. */
  motionPrefChanged(): void {
    this.syncParticles();
  }

  // ─── Post-run afterglow · the executed path holds heat, briefly ──────────
  // Unreal's recently-executed read: right as a LIVE run closes, every
  // wire that actually FIRED glows hot (success green · failure red) and
  // cools over ~2.4s to the resting tint. Pure opacity/glow decay — no
  // motion — so reduced-motion KEEPS it, shorter (CSS gates the duration).

  private runAfterglow(): void {
    if (this.afterglowTimer !== undefined) {
      window.clearTimeout(this.afterglowTimer);
      // Restart clean: a re-added class on the same element would not
      // replay the animation otherwise.
      this.edgeGroup.selectAll('.dag-edge')
        .classed('afterglow', false)
        .classed('afterglow-fail', false);
    }
    const verdictOf = (d: ElkExtendedEdge): 'hot-success' | 'hot-fail' | 'cold' => {
      if (this.ghostIds.has(d.id)) { return 'cold'; } // nothing fired a missing wire
      const ends = this.edgeEnds.get(d.id);
      if (!ends) { return 'cold'; }
      return afterglowVerdict(this.nodeMap.get(ends.source), this.nodeMap.get(ends.target));
    };
    this.edgeGroup.selectAll<SVGPathElement, ElkExtendedEdge>('.dag-edge')
      .classed('afterglow', (d) => verdictOf(d) === 'hot-success')
      .classed('afterglow-fail', (d) => verdictOf(d) === 'hot-fail');
    this.afterglowTimer = window.setTimeout(() => {
      this.afterglowTimer = undefined;
      this.edgeGroup.selectAll('.dag-edge')
        .classed('afterglow', false)
        .classed('afterglow-fail', false);
    }, 3000);
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

    // Fan-out DECK — a map ×N task reads as a stack of sheets (two ghost
    // layers behind the card · the parallel copies made visible).
    for (const off of [12, 6]) {
      enter.filter((d) => Boolean(d.fanOutKind))
        .append('rect')
        .attr('class', `node-stack node-stack-${off}`)
        .attr('x', off)
        .attr('y', off)
        .attr('width', NODE_WIDTH)
        .attr('height', (d) => nodeHeightOf(d))
        .attr('rx', NODE_RADIUS)
        .attr('ry', NODE_RADIUS);
    }

    // Node hit/status rect — geometry only: the .nc div paints the card
    // (background · border · shadows); this rect keeps the hit area, the
    // export frame and a mount for status rings (DESIGN.md §1).
    enter
      .append('rect')
      .attr('class', 'node-bg')
      .attr('width', NODE_WIDTH)
      .attr('height', (d) => nodeHeightOf(d))
      .attr('rx', NODE_RADIUS)
      .attr('ry', NODE_RADIUS);

    // HTML card content — the .nc div IS the card surface (background ·
    // border · shadows · the verb LED as an inset). Full-bleed over the
    // rect, which stays as the hit/status geometry (DESIGN.md §1).
    enter
      .append('foreignObject')
      .attr('class', 'node-fo')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', NODE_WIDTH)
      .attr('height', (d) => nodeHeightOf(d))
      .append('xhtml:div')
      .attr('class', 'nc nc-enter')
      // Entrance choreography: the card rises in, staggered by wave —
      // the DAG performs its own execution order (reduced-motion: none).
      .style('animation-delay', (d) => `${(this.waveOf.get(d.id) ?? 0) * 70}ms`)
      .each((d, i, els) => this.buildCardHtml(els[i] as HTMLElement, d));

    // Running spinner — a thin ring orbiting the status DOT (the dot is
    // flex-pinned to the head's right edge, so its center is fixed).
    enter
      .append('circle')
      .attr('class', 'node-spinner')
      .attr('cx', NODE_WIDTH - 15.5)
      .attr('cy', CARD_PAD_Y + HEAD_H / 2)
      .attr('r', 7);

    // Ports — the visible connect affordance (drag out-port → card).
    // The IN jack speaks the port grammar: it wears the data hue when
    // named wires actually plug in (Blender's socket read — the shape
    // teaches the semantics already in the schema), and its title says
    // exactly what arrives.
    const portsIn = enter
      .append('circle')
      .attr('class', (d) =>
        `nc-port nc-port-in${(d.bindingsIn?.length ?? 0) > 0 ? ' nc-port-data' : ''}`)
      .attr('cx', NODE_WIDTH / 2)
      .attr('cy', 0)
      .attr('r', 3.5);
    portsIn.append('title').text((d) => {
      const wires = d.bindingsIn?.length ?? 0;
      const deps = d.dependsOn.length;
      if (wires > 0) {
        return `${wires} named wire${wires === 1 ? '' : 's'} arrive${wires === 1 ? 's' : ''} here (alias ← producer — the card's io row)`;
      }
      if (deps > 0) {
        return `${deps} dependenc${deps === 1 ? 'y' : 'ies'} arrive${deps === 1 ? 's' : ''} here (ordering only)`;
      }
      return 'no inputs — a root task';
    });
    const portsOut = enter
      .append('circle')
      .attr('class', 'nc-port nc-port-out')
      .attr('cx', NODE_WIDTH / 2)
      .attr('cy', (d) => nodeHeightOf(d))
      .attr('r', 3.5)
      .on('mousedown', (event: MouseEvent, d: DagNode) => {
        event.preventDefault();
        event.stopPropagation();
        this.startConnect(d.id);
      });
    portsOut.append('title')
      .text('drag to connect — the drop target gains depends_on on this task (⌥drag from the card works too)');

    // Mousedown on a card: ⌥ starts a dependency edge (the n8n gesture);
    // plain primary button arms a CARD DRAG (threshold-gated so clicks
    // stay clicks). Interactive chips and ports keep their own gestures.
    enter.on('mousedown', (event: MouseEvent, d: DagNode) => {
      if (event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        this.startConnect(d.id);
        return;
      }
      if (event.button !== 0) { return; }
      if ((event.target as Element).closest('.nc-chip, .nc-audit, .nc-port')) { return; }
      const box = this.layoutBox.get(d.id);
      if (!box) { return; }
      // preventDefault kills text selection for the whole drag; the zoom
      // filter already refuses card mousedowns, so the canvas stays put.
      event.preventDefault();
      event.stopPropagation();
      const [rx, ry] = this.screenToRoot(event.clientX, event.clientY);
      this.dragging = {
        id: d.id, startX: rx, startY: ry,
        origX: box.x, origY: box.y, moved: false,
      };
    });

    // Click = focus the lineage + jump to YAML (workflowUri rides along
    // from the webview's OWN persisted graph, so jumps work even on
    // restored panels where the extension side has no closure URI).
    enter.on('click', (event: MouseEvent, d: DagNode) => {
      event.stopPropagation(); // keep the background click-to-clear away
      if (this.suppressClick) { this.suppressClick = false; return; } // a drop, not a select
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

    // Rich hover card (replaces the native <title> tooltip) + the
    // hover-to-trace lineage — one pointer, two reads. The card anchors
    // to the NODE box (never chases the cursor), so no mousemove hook.
    enter
      .on('mouseenter', (_event: MouseEvent, d: DagNode) => {
        this.showHoverCard(d);
        this.hoverLineage(d.id);
      })
      .on('mouseleave', () => {
        this.hideHoverCard();
        this.hoverLineage(null);
      });

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
      .delay((d) => (REDUCED_MOTION || !enteringIds.has(d.id)) ? 0 : (this.waveOf.get(d.id) ?? 0) * 70)
      .attr('opacity', 1)
      .attr('transform', (d) => {
        const elk = elkMap.get(d.id);
        return elk ? `translate(${elk.x},${elk.y})` : '';
      });

    // Update classes + dynamic card facts (status line · duration).
    merged.attr('class', (d) => nodeClassOf(d));
    merged.select('.nc-sub-v').text((d) => this.subValue(d));
    // Native right-click: VS Code reads data-vscode-context off the DOM
    // path and shows the contributed webview/context menu — refreshed on
    // every render so the workflowUri never goes stale on a switch.
    merged.attr('data-vscode-context', (d) => JSON.stringify({
      webviewSection: 'nikaTask',
      taskId: d.id,
      workflowUri: this.currentGraph?.workflowUri,
      preventDefaultContextMenuItems: true,
    }));
  }

  /** Build the HTML card body (safe DOM construction — never innerHTML). */
  private buildCardHtml(host: HTMLElement, node: DagNode): void {
    host.replaceChildren();

    const header = document.createElement('div');
    header.className = 'nc-head';
    // The verb TILE (n8n identity read · DESIGN.md §1): a tinted square
    // carrying the verb glyph — THE mark that survives every zoom.
    const glyph = document.createElement('span');
    glyph.className = 'nc-tile';
    // The house verb glyph (icon ontology · currentColor rides the keycap
    // hue); unknown verbs keep the unicode fallback.
    const tileSvg = makeVerbGlyph(node.verb, 13);
    if (tileSvg) { glyph.appendChild(tileSvg); }
    else { glyph.textContent = verbIcon(node.verb); }
    glyph.title = node.verb;
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
    // The status DOT (Well grammar · DESIGN.md §1) — resting gray ·
    // running verb-pulse · success green · failed red. Class-driven by
    // the group's status-* class; readable where text is not.
    const dot = document.createElement('span');
    dot.className = 'nc-dot';
    header.append(glyph, id, auditChip, staleChip, badge, dot);
    host.appendChild(header);

    // Full-bleed hairline between the identity zone and the fact zone.
    const divider = document.createElement('div');
    divider.className = 'nc-div';
    host.appendChild(divider);

    // The RECORDED artifact — the generation, ON the card (engine truth
    // from the trace: only a file a run actually wrote and that still
    // exists). Image = thumb (click opens the real file) · audio = a
    // playable row. Identity above, the output next, the facts below.
    if (node.artifact) {
      const a = node.artifact;
      if (a.kind === 'image') {
        const zone = document.createElement('button');
        zone.className = 'nc-preview';
        zone.title = `${a.name}${a.tip ? ` — ${a.tip}` : ''} · recorded output (click to open)`;
        const img = document.createElement('img');
        img.src = a.src;
        img.alt = a.name;
        img.draggable = false;
        const label = document.createElement('span');
        label.className = 'nc-preview-label';
        label.textContent = a.count ? `${a.name} · 1/${a.count}` : a.name;
        zone.append(img, label);
        zone.addEventListener('mousedown', (e) => e.stopPropagation());
        zone.addEventListener('click', (e) => {
          e.stopPropagation();
          vscode.postMessage({ kind: 'dag:openArtifact', path: a.path });
        });
        host.appendChild(zone);
      } else {
        const row = document.createElement('div');
        row.className = 'nc-preview-audio';
        const play = document.createElement('button');
        play.className = 'nc-audio-play';
        play.textContent = '▶';
        play.title = `Play ${a.name} (recorded output)`;
        play.addEventListener('mousedown', (e) => e.stopPropagation());
        play.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleCardAudio(node.id, a.src, play);
        });
        const name = document.createElement('button');
        name.className = 'nc-audio-name';
        name.textContent = a.name;
        name.title = `${a.name}${a.tip ? ` — ${a.tip}` : ''} · click to open the file`;
        name.addEventListener('mousedown', (e) => e.stopPropagation());
        name.addEventListener('click', (e) => {
          e.stopPropagation();
          vscode.postMessage({ kind: 'dag:openArtifact', path: a.path });
        });
        const dur = document.createElement('span');
        dur.className = 'nc-audio-dur';
        if (a.durationMs !== undefined) {
          dur.textContent = `${(a.durationMs / 1000).toFixed(1)}s`;
        }
        row.append(play, name, dur);
        host.appendChild(row);
      }
    }

    // The fact row (Well key→value): mechanism left, live verdict right.
    const sub = document.createElement('div');
    sub.className = 'nc-sub';
    const subK = document.createElement('span');
    subK.className = 'nc-sub-k';
    subK.textContent = this.subMechanism(node);
    const subV = document.createElement('span');
    subV.className = 'nc-sub-v';
    subV.textContent = this.subValue(node);
    sub.append(subK, subV);
    host.appendChild(sub);

    const body = bodyTextOf(node);
    if (body) {
      const el = document.createElement('div');
      el.className = `nc-body nc-body-${body.kind}`;
      const shown = body.kind === 'cmd' ? `$ ${body.text}` : body.text;
      el.textContent = shown;
      el.title = body.text;
      // The resting text — a success swaps in the RECORDED OUTPUT (the
      // data on the canvas); a re-run restores this base (DESIGN.md §1).
      el.dataset.base = shown;
      host.appendChild(el);
    }

    // The io row — the inbound wires, named ON the card (they used to
    // live hover-only): `alias ← from`, click focuses the producer.
    if (hasIoRow(node)) {
      const io = document.createElement('div');
      io.className = 'nc-io';
      const wires = node.bindingsIn ?? [];
      for (const b of wires.slice(0, IO_MAX_WIRES)) {
        const wire = document.createElement('button');
        wire.className = 'nc-io-wire';
        wire.title = `${b.alias || b.path} ← ${b.from}.${b.path} — click to focus the producer`;
        const alias = document.createElement('span');
        alias.className = 'nc-io-alias';
        alias.textContent = b.alias || b.path;
        const arr = document.createElement('span');
        arr.className = 'nc-io-arr';
        arr.textContent = '←';
        const from = document.createElement('span');
        from.className = 'nc-io-from';
        from.textContent = b.from;
        wire.append(alias, arr, from);
        wire.addEventListener('mousedown', (e) => e.stopPropagation());
        wire.addEventListener('click', (e) => {
          e.stopPropagation();
          this.focusAndCenter(b.from);
        });
        io.appendChild(wire);
      }
      if (wires.length > IO_MAX_WIRES) {
        const more = document.createElement('span');
        more.className = 'nc-io-more';
        more.textContent = `+${wires.length - IO_MAX_WIRES}`;
        more.title = wires.slice(IO_MAX_WIRES)
          .map((b) => `${b.alias || b.path} ← ${b.from}.${b.path}`)
          .join('\n');
        io.appendChild(more);
      }
      host.appendChild(io);
    }

    if (hasParamsRow(node)) {
      const params = document.createElement('div');
      params.className = 'nc-params';
      // The when: GATE leads the row — conditional execution is a
      // language pillar, not a footnote (DESIGN.md §1).
      if (node.when) {
        const gate = document.createElement('span');
        gate.className = 'nc-gate';
        const expr = node.when.length > 18 ? `${node.when.slice(0, 17)}\u2026` : node.when;
        gate.textContent = `\u2301 ${expr}`;
        gate.title = `Runs only when: ${node.when}`;
        params.appendChild(gate);
      }
      const target = node.model ?? node.tool;
      if (target) {
        // The model chip EDITS (the Flows params-bar gesture): click →
        // provider/model QuickPick extension-side → YAML edit → reload.
        const chip = document.createElement('button');
        chip.className = 'nc-chip nc-model';
        if (node.model) {
          chip.textContent = target;
        } else {
          // Tool chip wears the category's house icon (svg beats the
          // unicode approximation); the text stays the full tool ref.
          const cat = toolCatOf(target.replace(/^nika:/, ''));
          const icon = cat ? makeCategoryGlyph(cat, 11) : null;
          if (icon) {
            icon.classList.add('nc-chip-icon');
            chip.append(icon, document.createTextNode(target));
          } else {
            chip.textContent = toolWithGlyph(target);
          }
        }
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

    // The policy row — declared execution policy, ON the card (Temporal's
    // « high-value fields » clamp: curated chips, never prose). Facts only:
    // an undeclared policy renders nothing.
    if (hasPolicyRow(node)) {
      const policy = document.createElement('div');
      policy.className = 'nc-policy';
      const chip = (cls: string, text: string, title: string): void => {
        const el = document.createElement('span');
        el.className = `nc-pol ${cls}`;
        el.textContent = text;
        el.title = title;
        policy.appendChild(el);
      };
      if (node.retryMax !== undefined) {
        chip('nc-pol-retry', `↻×${node.retryMax}`,
          `Retries up to ${node.retryMax} attempt${node.retryMax === 1 ? '' : 's'} on failure (retry.max_attempts)`);
      }
      if (node.timeout !== undefined) {
        chip('nc-pol-timeout', `⏱ ${node.timeout}`,
          `Hard timeout — the task is cancelled past ${node.timeout}`);
      }
      if (node.onError === 'recover') {
        chip('nc-pol-recover', '✚ recover',
          'on_error: recover — a failure is absorbed with the declared recovery output (the card will say « recovered »)');
      } else if (node.onError === 'skip') {
        chip('nc-pol-skip', '⤼ skip',
          'on_error: skip — a failure skips this task; the error stays readable at tasks.X.error');
      } else if (node.onError === 'fail_workflow') {
        chip('nc-pol-fail', '⛔ fail',
          'on_error: fail_workflow — a failure here stops the whole run');
      }
      const outs = node.outputNames ?? [];
      if (outs.length > 0) {
        chip('nc-pol-outs',
          outs.length === 1 ? `⤳ ${outs[0]}` : `⤳ ${outs.length} outs`,
          `Produces named outputs: ${outs.join(' · ')} (output: jq bindings — \${{ tasks.${node.id}.<name> }})`);
      }
      const grants = node.permits ?? [];
      if (grants.length > 0) {
        chip('nc-pol-permits', `▦ ${grants.length}`,
          `Allowed capabilities (engine-projected · affirmative permits):\n${grants.join('\n')}`);
      }
      host.appendChild(policy);
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

  private showHoverCard(node: DagNode): void {
    if (!this.hoverCard) { return; }
    if (this.dragging?.moved) { return; } // no tooltips mid-drag
    // A pending delayed-hide (from leaving the PREVIOUS node) must not
    // kill the card we are about to show for this one.
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = undefined; }
    // Already open → GLIDE to the next anchor (left/top transition);
    // a fresh open snaps into place and rises (no cross-canvas flight).
    this.hoverCard.classList.toggle(
      'gliding',
      this.hoverCard.classList.contains('visible'),
    );
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
    // ▶ run from here — ONE task + its upstream cone (engine `run
    // --task` through the extension's rerunTask flow · research #2).
    const runBtn = document.createElement('button');
    runBtn.className = 'hc-run';
    runBtn.textContent = '\u25B8 run';
    runBtn.title = 'Run THIS task and its upstream cone only (nika run --task) — upstream cache-hits stay cache-hits';
    runBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    runBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideHoverCard(true);
      vscode.postMessage({
        kind: 'dag:runTask',
        taskId: live.id,
        workflowUri: this.currentGraph?.workflowUri,
      });
    });
    // ⧉ duplicate — the n8n most-loved move, one click from the card.
    const dupBtn = document.createElement('button');
    dupBtn.className = 'hc-run';
    dupBtn.textContent = '⧉ dup';
    dupBtn.title = 'Duplicate this task (⌘D) — fresh id, inbound wiring kept';
    dupBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    dupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideHoverCard(true);
      vscode.postMessage({
        kind: 'dag:duplicateTask',
        taskId: live.id,
        workflowUri: this.currentGraph?.workflowUri,
      });
    });
    head.append(verb, id, status, dupBtn, runBtn);
    this.hoverCard.appendChild(head);

    // The hover is the RUN STORY + the jumps — never a mirror of the
    // card. Mechanism facts (model · tool · gate · fan-out · cost · the
    // inbound wires) live ON the card now; repeating them here was the
    // old duplication this slimming removed.
    const add = (label: string, value: string | undefined): void => {
      if (value) { this.hoverCard!.appendChild(this.hcRow(label, value)); }
    };
    if (live.usd !== undefined && (live.status !== 'success' || live.durationMs == null)) {
      // Recorded spend that the card verdict does NOT already show
      // (a failed/cancelled task still spent before it stopped).
      add('spent', `$${live.usd.toFixed(live.usd < 0.1 ? 4 : 2)} recorded`);
    }
    if (live.cached) {
      add('resume', '↻ cache hit — recorded output reused, not re-executed');
    }
    if (live.recoveredFrom) {
      add('repaired', `✚ recovered from ${live.recoveredFrom} — on_error.recover absorbed the failure`);
    }
    add('output', live.outputPreview);
    const wave = this.waveOf.get(live.id);
    if (wave !== undefined && this.waveOf.size > 0) {
      add('wave', `${wave + 1} of ${1 + Math.max(...this.waveOf.values())}`);
    }
    // The engineering read: what THIS task means for the whole graph.
    const ins = this.structuralInsights;
    if (ins) {
      const blocks = ins.blastRadius.get(live.id) ?? 0;
      if (blocks > 0) {
        add('blast', `blocks ${blocks} downstream task${blocks === 1 ? '' : 's'}`);
      }
      if (ins.pinchPoints.includes(live.id) && ins.nodeCount > 1) {
        // One word — 'pinch point' wrapped the 76px k-column in two.
        add('pinch', 'nothing else can run while this runs');
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

    this.hoverCard.classList.add('visible');
    this.anchorHoverCard(live.id);
  }

  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Anchor the hover card to the NODE's screen box (right flank, flips
   * left, viewport-clamped) instead of chasing the cursor — a steady
   * inspector with a predictable pointer path to its ▸/⧉ buttons (the
   * 2026-07-09 harness trap class: a cursor-following card intercepts
   * the very pointer travel it invites).
   */
  private anchorHoverCard(nodeId: string): void {
    if (!this.hoverCard) { return; }
    const box = this.layoutBox.get(nodeId);
    const svgRect = this.svg.node()?.getBoundingClientRect();
    if (!box || !svgRect) { return; }
    const k = this.currentZoom;
    const left = svgRect.left + box.x * k + this.currentTx;
    const top = svgRect.top + box.y * k + this.currentTy;
    const w = box.w * k;
    const rect = this.hoverCard.getBoundingClientRect();
    const GAP = 12;
    let x = left + w + GAP;
    if (x + rect.width > window.innerWidth - 8) { x = left - rect.width - GAP; }
    x = Math.max(8, x);
    let y = top;
    if (y + rect.height > window.innerHeight - 8) {
      y = window.innerHeight - rect.height - 8;
    }
    y = Math.max(8, y);
    this.hoverCard.style.left = `${x}px`;
    this.hoverCard.style.top = `${y}px`;
  }

  /**
   * Delayed hide so the pointer can travel from node to card (the
   * needs/unlocks chips are clickable); immediate on explicit actions.
   */
  private hideHoverCard(now = false): void {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = undefined; }
    if (now) {
      this.hoverCard?.classList.remove('visible', 'gliding');
      return;
    }
    this.hideTimer = setTimeout(() => {
      if (!this.hoverCard?.matches(':hover')) {
        this.hoverCard?.classList.remove('visible', 'gliding');
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
      // Entering wires get their geometry AT ONCE (they fade in in place,
      // like the cards) — particles measure/ride the path immediately;
      // only UPDATING wires tween `d` (the relayout re-route).
      .attr('d', (d) => this.edgePathFor(d))
      .attr('opacity', 0);
    // Wires join the entrance choreography: each fades in just after its
    // SOURCE card's wave (REDUCED_MOTION collapses the stagger to zero).
    const enteringEdgeIds = new Set(enter.data().map((d) => d.id));
    const edgeDelay = (d: ElkExtendedEdge): number => {
      if (REDUCED_MOTION || !enteringEdgeIds.has(d.id)) { return 0; }
      const src = this.edgeEnds.get(d.id)?.source;
      return (src ? (this.waveOf.get(src) ?? 0) : 0) * 70 + 160;
    };

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
    // One title voice for the wire AND its 16px hit twin (the twin sits
    // on top, so the pointer usually rests there).
    const titleOf = (d: ElkExtendedEdge): string => {
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
    };
    enter.append('title').text(titleOf);

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
      .attr('x', (d) => this.edgeLabelPoint(d)[0])
      .attr('y', (d) => this.edgeLabelPoint(d)[1] - 5)
      .attr('text-anchor', 'middle')
      .text((d) => dagEdgeMap.get(d.id)?.label ?? '');

    // Direction chevrons — end arrowheads drown under the target cards
    // (the n8n 1.70 read); one quiet ⌃ at the wire's WAIST carries the
    // flow direction at any pan. Ghost wires keep their red march.
    const dirs = this.edgeGroup
      .selectAll<SVGPathElement, ElkExtendedEdge>('path.edge-dir')
      .data(elkEdges.filter((e) => !dagEdgeMap.get(e.id)?.ghost), (d) => d.id);
    dirs.exit().remove();
    dirs
      .enter()
      .append('path')
      .attr('class', (d) =>
        `edge-dir ${dagEdgeMap.get(d.id)?.isDataEdge ? 'edge-dir-data' : 'edge-dir-dep'}`)
      .attr('d', 'M -3.4 -3.1 L 3 0 L -3.4 3.1')
      .merge(dirs)
      .attr('transform', (d) => this.edgeDirTransformFor(d))
      .attr('display', (d) => this.edgeDirTransformFor(d) === '' ? 'none' : null);

    enter
      .merge(paths)
      .transition().duration(300)
      .delay(edgeDelay)
      .attr('opacity', 1)
      .attr('d', (d) => this.edgePathFor(d));

    // Hover twins for EVERY real wire — a 2px stroke is an undiscoverable
    // hit target; each edge gets an invisible 16px-wide twin (the n8n/
    // React Flow hit convention) that lights the wire + its label and
    // carries the gestures: the insert-on-edge + rides DEP wires only
    // (splicing reroutes depends_on; a binding is a ref, never rewritten
    // — DESIGN.md §6b), ⌥click removes the dependency (both kinds).
    const hits = this.edgeGroup
      .selectAll<SVGPathElement, ElkExtendedEdge>('path.edge-hit')
      .data(elkEdges.filter((e) => {
        const meta = dagEdgeMap.get(e.id);
        return meta !== undefined && !meta.ghost;
      }), (d) => d.id);
    hits.exit().remove();
    const hitsEnter = hits
      .enter()
      .append('path')
      .attr('class', 'edge-hit')
      .on('mouseenter', (event: MouseEvent, d: ElkExtendedEdge) => {
        const ends = this.edgeEnds.get(d.id);
        if (!ends) { return; }
        this.setEdgeLit(d.id, true);
        if (dagEdgeMap.get(d.id)?.isDataEdge !== true) {
          this.showEdgePlus(event.currentTarget as SVGPathElement, ends.source, ends.target);
        }
      })
      .on('mouseleave', (_event: MouseEvent, d: ElkExtendedEdge) => {
        this.setEdgeLit(d.id, false);
        this.hideEdgePlus();
      })
      .on('click', (event: MouseEvent, d: ElkExtendedEdge) => {
        // The twin sits ABOVE the wire — it must carry the wire's ⌥click
        // (before the twins widened to every edge, the path's own handler
        // was already unreachable under a twin).
        if (!event.altKey) { return; }
        const ends = this.edgeEnds.get(d.id);
        if (!ends) { return; }
        event.stopPropagation();
        vscode.postMessage({
          kind: 'dag:disconnect',
          from: ends.source,
          to: ends.target,
          workflowUri: this.currentGraph?.workflowUri,
        });
      });
    hitsEnter.append('title').text(titleOf);
    hitsEnter
      .merge(hits)
      .attr('d', (d) => this.edgePathFor(d));

    // Refresh the id→element caches (the drag hot path reads these).
    this.edgePathEl.clear();
    this.edgeLabelEl.clear();
    this.edgeHitEl.clear();
    this.edgeDirEl.clear();
    const pathEls = this.edgePathEl;
    this.edgeGroup.selectAll<SVGPathElement, ElkExtendedEdge>('path.dag-edge')
      .each(function (d) { pathEls.set(d.id, this); });
    const labelEls = this.edgeLabelEl;
    this.edgeGroup.selectAll<SVGTextElement, ElkExtendedEdge>('text.edge-label')
      .each(function (d) { labelEls.set(d.id, this); });
    const hitEls = this.edgeHitEl;
    this.edgeGroup.selectAll<SVGPathElement, ElkExtendedEdge>('path.edge-hit')
      .each(function (d) { hitEls.set(d.id, this); });
    const dirEls = this.edgeDirEl;
    this.edgeGroup.selectAll<SVGPathElement, ElkExtendedEdge>('path.edge-dir')
      .each(function (d) { dirEls.set(d.id, this); });
  }

  /** Light one wire + its label + its chevron (hover through the twin). */
  private setEdgeLit(edgeId: string, lit: boolean): void {
    this.edgePathEl.get(edgeId)?.classList.toggle('edge-lit', lit);
    this.edgeLabelEl.get(edgeId)?.classList.toggle('lit', lit);
    this.edgeDirEl.get(edgeId)?.classList.toggle('lit', lit);
  }

  /** Chevron placement: midpoint + tangent of the edge's FINAL path,
   *  measured on the hidden defs path (never the mid-transition wire).
   *  '' = too short to read (the card gap already tells the story). */
  private edgeDirTransformFor(edge: ElkExtendedEdge): string {
    const mp = this.measurePath;
    if (!mp) { return ''; }
    const d = this.edgePathFor(edge);
    if (!d) { return ''; }
    mp.setAttribute('d', d);
    const total = mp.getTotalLength();
    if (total < 42) { return ''; }
    const mid = mp.getPointAtLength(total / 2);
    const a = mp.getPointAtLength(Math.max(total / 2 - 4, 0));
    const b = mp.getPointAtLength(Math.min(total / 2 + 4, total));
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    return `translate(${mid.x}, ${mid.y}) rotate(${ang.toFixed(1)})`;
  }

  /** Path for one edge — a direct curve when an endpoint is hand-pinned
   *  (its ELK sections describe a layout the card has left). */
  private edgePathFor(edge: ElkExtendedEdge): string {
    const ends = this.edgeEnds.get(edge.id);
    if (ends && (this.manualPos.has(ends.source) || this.manualPos.has(ends.target))) {
      return this.edgePathDirect(ends.source, ends.target);
    }
    return this.smoothEdges ? this.edgePathSmooth(edge) : this.edgePath(edge);
  }

  /** Vertical cubic between two cards' ports (drag re-route). */
  private edgePathDirect(source: string, target: string): string {
    const s = this.layoutBox.get(source);
    const t = this.layoutBox.get(target);
    if (!s || !t) { return ''; }
    const sx = s.x + s.w / 2;
    const sy = s.y + s.h;
    const tx = t.x + t.w / 2;
    const ty = t.y;
    const reach = Math.max(Math.abs(ty - sy) / 2, 32);
    return `M ${sx} ${sy} C ${sx} ${sy + reach}, ${tx} ${ty - reach}, ${tx} ${ty}`;
  }

  /** Label anchor — bezier midpoint for pinned edges, ELK midpoint else. */
  private edgeLabelPoint(edge: ElkExtendedEdge): [number, number] {
    const ends = this.edgeEnds.get(edge.id);
    if (ends && (this.manualPos.has(ends.source) || this.manualPos.has(ends.target))) {
      const s = this.layoutBox.get(ends.source);
      const t = this.layoutBox.get(ends.target);
      if (s && t) {
        return [(s.x + s.w / 2 + t.x + t.w / 2) / 2, (s.y + s.h + t.y) / 2];
      }
    }
    return this.edgeMidpoint(edge);
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
  private applyStatus(taskId: string, status: TaskStatus, durationMs?: number, cached?: boolean, outputPreview?: string, recoveredFrom?: string, usd?: number): boolean {
    const node = this.nodeMap.get(taskId);
    if (!node) return false;

    if (node.status !== status) {
      appendActivity(taskId, status, durationMs, cached);
      if (status === 'running') { this.maybeFollow(taskId); }
      if (status === 'failed') { this.failureShockwave(taskId); }
    }
    // The elapsed anchor: set at the FIRST observed live transition
    // (retries keep the original clock — the task's wall time, not the
    // attempt's); any terminal state retires it.
    if (status === 'running' || status === 'retrying') {
      if (!this.liveStart.has(taskId)) { this.liveStart.set(taskId, performance.now()); }
    } else {
      this.liveStart.delete(taskId);
    }
    node.status = status;
    if (durationMs != null) node.durationMs = durationMs;
    // Assign, never accumulate — a fresh run's running-paint must CLEAR
    // the ↻ (and the output fact) a previous resume left on the card.
    node.cached = cached === true;
    node.recoveredFrom = recoveredFrom;
    node.usd = usd;
    node.outputPreview = outputPreview;

    const el = this.nodeGroup.select(`[data-id="${CSS.escape(taskId)}"]`);
    el.attr('class', nodeClassOf(node));
    el.select('.nc-sub-v').text(this.subValue(node));

    // The recorded output lands ON the card once the task settles ✓ —
    // the run shows its data where the prompt was; any other state
    // restores the resting text (re-run · scrub · pending).
    const bodyEl = el.select<HTMLElement>('.nc-body');
    const bodyNode = bodyEl.node();
    if (bodyNode) {
      if (status === 'success' && outputPreview) {
        bodyNode.textContent = `\u2192 ${outputPreview}`;
        bodyNode.title = outputPreview;
        bodyNode.classList.add('nc-body-live');
      } else if (bodyNode.classList.contains('nc-body-live')) {
        bodyNode.textContent = bodyNode.dataset.base ?? '';
        bodyNode.title = bodyNode.dataset.base ?? '';
        bodyNode.classList.remove('nc-body-live');
      }
    }

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
    // applyStatus rewrote node classes, wiping .dimmed — refreshDim
    // ALWAYS (a live run under a `/` filter with no focused node must
    // keep filtered-out cards dimmed, matching applyStale/applyAudit).
    if (this.focusedId) { this.applyFocus(this.focusedId); } else { this.refreshDim(); }

    this.saveState({ graph: this.currentGraph });
    this.updateStatusDisplay();
    if (this.heatmapOn) { this.applyHeatmap(); }

    // Source-bound highlight: tell the extension WHERE execution is now
    // so the YAML lights the running spans. Live batches, the platine
    // and the Replayer all funnel through this one seam; the set only
    // posts on change (a settled frame costs nothing).
    const running = (this.currentGraph?.nodes ?? [])
      .filter((n) => n.status === 'running' || n.status === 'retrying')
      .map((n) => n.id);
    const sig = running.join(' ');
    if (sig !== this.lastRunTick) {
      this.lastRunTick = sig;
      vscode.postMessage({ kind: 'transport:tick', running });
    }
  }

  updateNodeStatus(taskId: string, status: TaskStatus, durationMs?: number, cached?: boolean, outputPreview?: string, recoveredFrom?: string, usd?: number): void {
    if (!this.applyStatus(taskId, status, durationMs, cached, outputPreview, recoveredFrom, usd)) return;
    this.afterStatusChange();
  }

  batchUpdateStatus(updates: Array<{ taskId: string; status: TaskStatus; durationMs?: number; usd?: number; cached?: boolean; recoveredFrom?: string; outputPreview?: string }>): void {
    let touched = false;
    for (const u of updates) {
      touched = this.applyStatus(u.taskId, u.status, u.durationMs, u.cached, u.outputPreview, u.recoveredFrom, u.usd) || touched;
    }
    if (touched) { this.afterStatusChange(); }
  }

  // ─── Viewport Controls ───────────────────────────────────────────────────

  fitToView(elkResult?: ElkNode, instant = false): void {
    const svgEl = this.svg.node();
    if (!svgEl) return;

    const { width: svgW, height: svgH } = svgEl.getBoundingClientRect();
    if (svgW === 0 || svgH === 0) return;

    // Chrome floats OVER the canvas (top rail · omnibar · legend · the
    // plan rail's left column) — the fit parks the graph in the visible
    // pool between them, or cards hide under pills forever.
    const leftInset = document.body.classList.contains('has-rail') ? 132 : 0;
    const usableH = Math.max(svgH - TOP_INSET - 96, 160);
    const usableW = Math.max(svgW - leftInset, 240);

    let graphW: number;
    let graphH: number;

    if (this.layoutBox.size > 0) {
      // The live boxes are the truth (they follow hand-dragged cards).
      let maxX = 1;
      let maxY = 1;
      for (const b of this.layoutBox.values()) {
        maxX = Math.max(maxX, b.x + b.w);
        maxY = Math.max(maxY, b.y + b.h);
      }
      graphW = maxX + PADDING;
      graphH = maxY + PADDING;
    } else if (elkResult) {
      graphW = (elkResult.width ?? svgW) + PADDING * 2;
      graphH = (elkResult.height ?? svgH) + PADDING * 2;
    } else {
      const rootNode = this.rootGroup.node();
      if (!rootNode) return;
      const bbox = rootNode.getBBox();
      graphW = bbox.width + PADDING * 2;
      graphH = bbox.height + PADDING * 2;
    }

    const scale = Math.min(usableW / graphW, usableH / graphH, 1.5);
    const tx = leftInset + (usableW - graphW * scale) / 2;
    const ty = TOP_INSET + (usableH - graphH * scale) / 2;

    const t = zoomIdentity.translate(tx, ty).scale(scale);
    // Motion charter (law 7): keyboard-initiated camera moves NEVER
    // animate — `instant` rides down from the key handlers.
    this.svg
      .transition().duration(instant || REDUCED_MOTION ? 0 : 500)
      .ease(easeCubicOut)
      .call(this.zoomBehavior.transform as D3ZoomCall, t);
  }

  zoomIn(instant = false): void {
    this.svg
      .transition().duration(instant || REDUCED_MOTION ? 0 : 300)
      .call(this.zoomBehavior.scaleBy as D3ZoomCall, 1.3);
  }

  zoomOut(instant = false): void {
    this.svg
      .transition().duration(instant || REDUCED_MOTION ? 0 : 300)
      .call(this.zoomBehavior.scaleBy as D3ZoomCall, 0.7);
  }

  clear(): void {
    this.bandGroup.selectAll('*').remove();
    this.regionGroup.selectAll('*').remove();
    this.edgeGroup.selectAll('*').remove();
    this.particleGroup.selectAll('*').remove();
    this.particleEdges.clear();
    if (this.afterglowTimer !== undefined) {
      window.clearTimeout(this.afterglowTimer);
      this.afterglowTimer = undefined;
    }
    this.nodeGroup.selectAll('*').remove();
    this.currentGraph = undefined;
    this.nodeMap.clear();
    this.edgeEnds.clear();
    this.upstreamOf.clear();
    this.downstreamOf.clear();
    this.criticalEdges.clear();
    this.waveOf.clear();
    this.focusedId = null;
    this.lineage = null;
    this.lineageFromEditor = false;
    this.hoverLin = null;
    this.filterMatches = null;
    if (this.lastRunTick !== '') {
      this.lastRunTick = '';
      vscode.postMessage({ kind: 'transport:tick', running: [] });
    }
    this.liveStart.clear();
    if (this.elapsedTimer !== undefined) {
      window.clearInterval(this.elapsedTimer);
      this.elapsedTimer = undefined;
    }
    stopCardAudio();
    this.wasAllTerminal = false;
    this.layoutBox.clear();
    this.hideHoverCard(true);
    this.waveExtents.clear();
    document.getElementById('plan-rail')?.setAttribute('hidden', '');
    document.body.classList.remove('has-rail');
    // The welcome takes the empty panel — the arrival bar is per-workflow.
    document.getElementById('canvas-describe')?.setAttribute('hidden', '');
    document.getElementById('empty-state')?.removeAttribute('hidden');
    document.body.classList.add('welcome');

    const titleEl = document.getElementById('dag-title');
    if (titleEl) titleEl.textContent = '';
    const statusEl = document.getElementById('dag-status');
    if (statusEl) statusEl.textContent = '';

    vscode.setState(undefined as unknown as WebviewState);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /** Left half of the fact row — the STATIC mechanism (never repaints). */
  private subMechanism(node: DagNode): string {
    if (node.tool) return `${node.verb} \u00B7 ${toolWithGlyph(node.tool)}`;
    if (node.provider) return `${node.verb} \u00B7 ${node.provider}`;
    if (node.model) return `${node.verb} \u00B7 ${node.model.split('/')[0]}`;
    return node.verb;
  }

  /** `12.4s` · `74s` · `2m05` — the live elapsed, compact. */
  private elapsedText(startTs: number): string {
    const s = (performance.now() - startTs) / 1000;
    if (s < 10) { return `${s.toFixed(1)}s`; }
    if (s < 100) { return `${Math.round(s)}s`; }
    return `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}`;
  }

  /** Right half — the LIVE verdict (Well's value column · DESIGN.md §1). */
  private subValue(node: DagNode): string {
    // A LIVE task counts its OBSERVED elapsed (our clock from the start
    // event — real wall time; the ⋯ marks it live, the engine's measured
    // duration replaces it at settle). No start observed → no number.
    if (node.status === 'running' || node.status === 'retrying') {
      const started = this.liveStart.get(node.id);
      const prefix = node.status === 'retrying' ? '↻ ' : '';
      if (started !== undefined) { return `${prefix}${this.elapsedText(started)} ⋯`; }
      return node.status === 'running' ? 'running\u2026' : 'retry\u2026';
    }
    // ADR-099 rehydration — no clock fact exists (nothing executed).
    if (node.cached) return '\u21BB cached';
    // D-2026-07-08-N4 — a repaired success never paints clean.
    if (node.recoveredFrom !== undefined) return '✚ recovered';
    if (node.durationMs != null) {
      const dur = node.durationMs >= 1000
        ? `${(node.durationMs / 1000).toFixed(1)}s`
        : `${node.durationMs}ms`;
      if (node.status === 'success') {
        // The after-story ON the card: recorded spend joins the verdict
        // (terminal event's cost_usd \u2014 engine truth, never estimated).
        return node.usd !== undefined ? `\u2713 ${dur} \u00b7 ${usd(node.usd)}` : `\u2713 ${dur}`;
      }
      if (node.status === 'failed') { return `\u2717 ${dur}`; }
      return dur;
    }
    if (node.status === 'failed') { return '\u2717 failed'; }
    if (node.status === 'skipped') { return 'skipped'; }
    if (node.status === 'cancelled') { return 'cancelled'; }
    return '';
  }

  private badgeText(node: DagNode): string {
    // when: speaks through the gate chip now; ×N speaks through the
    // deck + this badge (the count survives at LOD-mid).
    if (node.fanOutKind) {
      return node.fanOutCount != null ? `\u00D7${node.fanOutCount}` : '\u00D7n';
    }
    return '';
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

    // The elapsed ticker lives exactly while something runs: one 1Hz
    // repaint of the live verdicts (text, not motion — the engine's
    // measured duration takes the cell at settle).
    const live = counts.running + counts.retrying > 0;
    if (live && this.elapsedTimer === undefined) {
      this.elapsedTimer = window.setInterval(() => {
        for (const id of this.liveStart.keys()) {
          const node = this.nodeMap.get(id);
          if (!node) { continue; }
          this.nodeGroup
            .select(`[data-id="${CSS.escape(id)}"]`)
            .select('.nc-sub-v')
            .text(this.subValue(node));
        }
      }, 1000);
    } else if (!live && this.elapsedTimer !== undefined) {
      window.clearInterval(this.elapsedTimer);
      this.elapsedTimer = undefined;
    }

    // Run verdict → the aurora speaks once, at the LIVE close. A replay
    // reaching its terminal frame (or a scrub crossing it) is not a live
    // finish — never fire the verdict sweep/danger flash while scrubbing.
    const allTerminal = total > 0 && terminal === total;
    if (allTerminal && !this.wasAllTerminal && !replayer.active) {
      auroraSignal(counts.failed > 0 ? 'danger' : 'sweep');
      // The trace, persisted briefly: heat on exactly the wires that fired.
      this.runAfterglow();
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

    // The live cost ticker — recorded spend only (terminal events' usd):
    // the ≥ grammar of the run totals. Unpriced tasks exist, so the sum
    // is a floor, never a bill — and nothing-priced (mock/local-only)
    // shows nothing: a $0.00 meaning « unpriced » would be the fake-zero.
    let spent = 0;
    let priced = false;
    for (const node of this.currentGraph.nodes) {
      if (node.usd !== undefined) { spent += node.usd; priced = true; }
    }
    if (priced) {
      parts.push(`≥ $${spent.toFixed(spent < 0.1 ? 4 : 2)}`);
    }

    const statusEl = document.getElementById('dag-status');
    if (statusEl) {
      // One aggregate dot leads the pill (the « • Active » chip read):
      // failed > running/retrying > all-done > resting.
      const agg = counts.failed > 0 ? 'failed'
        : counts.running + counts.retrying > 0 ? 'running'
        : allTerminal ? 'success' : 'idle';
      statusEl.className = `agg-${agg}`;
      const dot = document.createElement('span');
      dot.className = 'agg-dot';
      statusEl.replaceChildren(dot, document.createTextNode(parts.join(' \u00B7 ')));
    }

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
      // A repaired run says so at a glance here too (D-2026-07-08-N4).
      let recovered = 0;
      for (const node of this.currentGraph.nodes) {
        if (node.recoveredFrom !== undefined) { recovered += 1; }
      }
      if (recovered > 0) {
        const chip = document.createElement('span');
        chip.className = 'legend-chip st-recovered';
        const dot = document.createElement('span');
        dot.className = 'legend-dot';
        const label = document.createElement('span');
        label.textContent = `✚ ${recovered} recovered`;
        chip.append(dot, label);
        chips.appendChild(chip);
      }
      if (this.criticalEdges.size > 0) {
        const chip = document.createElement('span');
        chip.className = 'legend-chip st-critical';
        chip.dataset.kind = 'critical';
        const dot = document.createElement('span');
        dot.className = 'legend-dot';
        const label = document.createElement('span');
        label.textContent = 'critical path';
        chip.append(dot, label);
        chips.appendChild(chip);
      }
    }
    // An untouched graph shows no progress furniture — the empty track
    // reads as a hairline of noise, not information.
    document.getElementById('progress-track')?.toggleAttribute(
      'hidden',
      terminal === 0 && counts.running === 0 && counts.retrying === 0,
    );
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
  // A burst lands many entries in the same second — repeating the
  // timestamp five times is noise, not information. The first entry of
  // each second keeps the ink; repeats dim to a whisper (the value
  // stays in the DOM — hover/copy still read it).
  const prevTime = host.lastElementChild?.querySelector<HTMLElement>('.act-time');
  if (prevTime && prevTime.textContent === time.textContent) {
    time.classList.add('act-time-rep');
  }

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

function appendActivity(taskId: string, status: TaskStatus, durationMs?: number, cached?: boolean): void {
  if (cached === true) {
    // ADR-099 rehydration — the feed must not read as a fresh success.
    pushActivityLine('↻', `${taskId} cached · recorded output reused`, 'st-success', taskId);
    return;
  }
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
    ['ex-glyph-hover', 'Hover a node', 'the run story + jumps — output · blast radius · needs/unlocks · \u25B8 run from here · \u29C9 duplicate'],
    ['ex-glyph-stack', 'Stacked card', 'a fan-out task (map ×N) — the deck IS the parallel copies; the badge counts them'],
    ['ex-glyph-data', 'On-card wires + policy', 'alias ← producer rows are the data arriving (click one to jump); the footer chips are declared policy — ↻ retries · ⏱ timeout · on_error route · ⤳ outputs · ▦ permits'],
    ['ex-glyph-gate', '⌁ gate chip', 'a when: condition — this task runs only if it holds (skipped is a decision, never a failure)'],
    ['ex-glyph-rail', 'The left rail', 'the plan itself — every wave, clickable; your viewport\'s wave stays lit'],
    ['ex-glyph-drag', 'Drag a card', 'arrange the canvas your way — snaps align to other cards (\u2325 bypasses) · wires follow · A returns to the auto-layout'],
    ['ex-glyph-connect', '⌥ drag node → node', 'create a dependency — the YAML gets the depends_on (⌘Z undoes) · ⌥click an edge removes it'],
    ['ex-glyph-splice', '+ on a dashed wire', 'insert a task INTO the edge — pick a verb or a tool, the wire reroutes through it (dependency wires only)'],
    ['ex-glyph-dup', '\u2318D duplicate', 'copy the focused task under the original — fresh id, inbound wiring kept'],
    ['ex-glyph-add', '＋ Task · Delete · Enter', 'add a task after the focused one · Delete removes it (refused while referenced) · Enter opens its YAML'],
    ['ex-glyph-data', 'Blue labeled edges', 'data actually CROSSES here (the label is the binding alias) — gray dashed edges are ordering only'],
    ['ex-glyph-data', 'Lineage — follow the data', 'click a card (or put the caret inside ${{ tasks.x }} in the YAML): producers and consumers stay lit, direct neighbors louder, the data wires saturate, the rest fades — Esc clears'],
    ['ex-glyph-gate', 'Preflight chip (run pill)', 'the flight plan at a glance — ✗ missing keys/secrets · ⚠ flows · ✓ ready; click it for the full document (cost · secrets · permits · waves)'],
    ['ex-glyph-ghost', 'Red dashed edges', 'a task READS another without declaring depends_on (NIKA-DAG-003) — click the edge to declare it'],
    ['ex-glyph-zoom', 'Zoom far out', 'the map read — cards become tiles, ids hold one readable size at any distance (semantic zoom)'],
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
  for (const [key, label] of [['Tab', 'next task'], ['↑↓', 'dep / dependent'], ['←→', 'prev / next'], ['⏎', 'open YAML'], ['R', 'run'], ['M', 'mock run'], ['S', 'stop'], ['F', 'fit'], ['A', 'auto-layout'], ['W', 'waves'], ['H', 'heatmap'], ['G', 'follow run'], ['K', 'command'], ['N', 'add a task'], ['/', 'filter'], ['\u2318D', 'duplicate'], ['Esc', 'clear'], ['?', 'this card']]) {
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
// The top-of-file listener updates REDUCED_MOTION first (registration
// order); this one lets the renderer retire/spawn particle trains live.
MOTION_QUERY.addEventListener('change', () => renderer.motionPrefChanged());

// The platine — paints trace instants through the SAME batch path as
// live runs (states/classes only, never a relayout).
const transport = createTransport({
  applyStates: (updates) => renderer.batchUpdateStatus(updates),
});
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
    document.body.classList.add('replaying');
    const title = document.getElementById('dag-title');
    if (title) { title.textContent = `↻ ${label}`; }
    // Land on the FINAL state (the outcome), ready to scrub back or replay.
    this.setPos(1);
  }

  close(): void {
    this.pause();
    this.el?.setAttribute('hidden', '');
    document.body.classList.remove('replaying');
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
      // rAF throttles/pauses while the panel is hidden — an unclamped dt
      // after regaining visibility would snap the playhead to the end.
      const dt = Math.min(now - this.lastTick, 100);
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

// ─── Skin resolution · `auto` = brand on dark themes, adaptive on light ────
// VS Code stamps vscode-light / vscode-dark / vscode-high-contrast on
// <body>; the initial data-nk-theme arrives server-rendered from the
// panel HTML, so this only needs to run on mode/theme CHANGES.
let rawSkinMode: 'nika' | 'editor' | 'phosphor' | 'auto' =
  (document.body.dataset.nkTheme as 'nika' | 'editor' | 'phosphor' | 'auto') ?? 'nika';

function applySkinMode(mode: 'nika' | 'editor' | 'phosphor' | 'auto'): void {
  // phosphor is EXPLICIT only — auto never resolves to it (an OLED-black
  // register is a choice, not an inference).
  const resolved = mode === 'auto'
    ? (document.body.classList.contains('vscode-light') ? 'editor' : 'nika')
    : mode;
  document.body.dataset.nkTheme = resolved;
}

applySkinMode(rawSkinMode);

// The resolved binary ships --resume (stamped on the graph at load) —
// gates the ↻ affordance + the honest stale-chip tooltip. Declared
// BEFORE the restore bootstrap below: refreshStaleChip reads it (and
// applyResumeCapable assigns it) during restore — a later `let` is a
// temporal-dead-zone ReferenceError on every panel revival.
let resumeCapable = false;

// Restore from webview state (e.g., after being hidden and re-shown)
const savedState = vscode.getState();
if (savedState?.showWaves !== undefined) { renderer.showWaves = savedState.showWaves; }
if (savedState?.smoothEdges !== undefined) { renderer.smoothEdges = savedState.smoothEdges; }
if (savedState?.showFeed) { toggleActivity(); }
if (savedState?.heatmap) { renderer.heatmapOn = true; }
if (savedState?.followRun) { renderer.followRun = true; }
if (savedState?.graph) {
  renderer.render(savedState.graph);
  applyResumeCapable(savedState.graph);
  refreshStaleChip();
} else {
  document.getElementById('empty-state')?.removeAttribute('hidden');
  document.body.classList.add('welcome');
}

// ─── Message Handler ────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent<ExtToWebviewMessage>) => {
  const msg = event.data;
  switch (msg.kind) {
    case 'dag:load':
      // A new graph invalidates any loaded timeline; transport:load (if
      // this is a replay) follows in-order and re-arms it. The resync
      // covers the race where the timeline lands while ELK is laying out.
      // A diff paints the PREVIOUS graph's story — drop it too.
      clearDiff();
      transport.deactivate();
      // Any graph load while a replay is up supersedes it (live run ·
      // follow-mode retarget · normal show). The replay's OWN graph
      // loads BEFORE the scrubber arms, so this never closes itself.
      // Close it BEFORE the ONE render — a second render here used to
      // race two async ELK layouts and double every entrance transition.
      if (replayer.active) { replayer.close(); }
      if (msg.toolCats) { toolCatsMap = msg.toolCats; }
      void renderer.render(msg.graph).then(() => transport.resync());
      applyResumeCapable(msg.graph);
      refreshStaleChip();
      // The cost chip is a singleton, not per-node data — a workflow
      // switch must not keep showing the PREVIOUS file's forecast; the
      // new file's check will re-push its own (dag:cost) when it lands.
      applyCostChip(null);
      // A verdict is per-run, per-file — never carry it across a switch.
      hideRunVerdict();
      break;
    case 'dag:updateStatus':
      // The live present wins over any replay scrub (runsView law).
      transport.deactivate();
      renderer.updateNodeStatus(msg.taskId, msg.status, msg.durationMs, msg.cached, msg.outputPreview, msg.recoveredFrom, msg.usd);
      break;
    case 'dag:batchUpdateStatus':
      transport.deactivate();
      renderer.batchUpdateStatus(msg.updates);
      break;
    case 'dag:focus':
      renderer.focusAndCenter(msg.taskId);
      break;
    case 'dag:cursorHint':
      renderer.cursorHint(msg.taskId);
      break;
    case 'dag:lineage':
      renderer.editorLineage(msg.taskId);
      break;
    case 'dag:preflight':
      applyPreflightChip(msg.chip);
      break;
    case 'dag:note':
      pushActivityLine(msg.icon, msg.text, msg.cls ?? 'st-note', msg.taskId);
      break;
    case 'dag:clear':
      transport.deactivate();
      renderer.clear();
      break;
    case 'dag:fitToView':
      renderer.fitToView();
      break;
    case 'theme:changed':
      // CSS variables update automatically; an `auto` skin re-resolves
      // against the swapped body theme class (dark ⇄ light live).
      applySkinMode(rawSkinMode);
      break;
    case 'theme:mode':
      // Skin flip (nika ⇄ editor ⇄ auto) — tokens re-scope, no reload.
      // A pending aurora must not replay when flipping BACK to nika.
      rawSkinMode = msg.mode;
      applySkinMode(rawSkinMode);
      if (auroraTimer) { clearTimeout(auroraTimer); auroraTimer = undefined; }
      delete document.body.dataset.aurora;
      break;
    case 'run:state':
      setRunUiState(msg.running);
      break;
    case 'run:progress':
      applyRunProgress(msg.done, msg.total);
      break;
    case 'run:verdict':
      showRunVerdict(msg.icon, msg.text, msg.cls);
      break;
    case 'dag:stale':
      renderer.applyStale(msg.stale, msg.direct);
      refreshStaleChip();
      break;
    case 'dag:artifacts':
      renderer.applyArtifacts(msg.artifacts);
      break;
    case 'dag:audit':
      renderer.applyAudit(msg.audits);
      break;
    case 'dag:cost':
      applyCostChip(msg.forecast);
      break;
    case 'dag:replayLoad':
      replayer.load(msg.timeline, msg.label, msg.speed);
      break;
    case 'dag:replayEnd':
      replayer.close();
      break;
    case 'transport:load':
      transport.load(msg.timeline, { speed: msg.speed, autoPlay: msg.autoPlay });
      break;
    case 'transport:clear':
      transport.deactivate();
      break;
    case 'diff:load':
      applyDiff(msg.entries);
      break;
    case 'diff:clear':
      clearDiff();
      break;
    case 'welcome:data': {
      const banner = document.getElementById('es-binary');
      if (banner) {
        if (msg.binaryMissing) { banner.removeAttribute('hidden'); }
        else { banner.setAttribute('hidden', ''); }
      }
    }
      renderWelcomeRecent(msg.recent);
      break;
  }
});

// ─── Run-diff paint ─────────────────────────────────────────────────────────
// Verdicts ride DATA attributes on the node <g>, never its class attr —
// updateStatus rewrites `class` wholesale on every live event and must
// not wipe a diff mid-run. The badge is an SVG <text> appended inside
// the group (the cards are pure SVG · CSS pseudo-elements don't exist
// there), anchored to the node-bg's top-right corner: zero change to
// the card metrics the layout was computed from (anatomy law).

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyDiff(entries: Array<{ taskId: string; verdict: string; badge: string }>): void {
  clearDiff();
  for (const e of entries) {
    const g = document.querySelector(`.dag-node[data-id="${CSS.escape(e.taskId)}"]`);
    if (!g) { continue; }
    g.setAttribute('data-diff', e.verdict);
    if (!e.badge) { continue; }
    const bg = g.querySelector('.node-bg');
    const width = bg ? Number(bg.getAttribute('width') ?? 0) : 0;
    const badge = document.createElementNS(SVG_NS, 'text');
    badge.setAttribute('class', 'diff-badge');
    badge.setAttribute('x', String(width > 0 ? width - 8 : 0));
    badge.setAttribute('y', '-6');
    badge.setAttribute('text-anchor', 'end');
    badge.textContent = e.badge;
    g.appendChild(badge);
  }
}

function clearDiff(): void {
  for (const el of Array.from(document.querySelectorAll('.dag-node[data-diff]'))) {
    el.removeAttribute('data-diff');
  }
  for (const el of Array.from(document.querySelectorAll('.diff-badge'))) {
    el.remove();
  }
}
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
  const resumeBtn = document.getElementById('btn-run-resume') as HTMLButtonElement | null;
  if (resumeBtn) { resumeBtn.disabled = running; }
  stop?.toggleAttribute('hidden', !running);
  if (running) {
    // A fresh run resets the heartbeat label and claims the verdict spot.
    if (stop) { stop.textContent = '■ Stop'; }
    hideRunVerdict();
  }
}

/** `■ 3/7` — settled over scheduled, the run's glanceable heartbeat. */
function applyRunProgress(done: number, total: number): void {
  const stop = document.getElementById('btn-stop');
  if (stop && total > 0) { stop.textContent = `■ ${done}/${total}`; }
}

// ─── Verdict banner · the run's close, visible without the feed ─────────────

let verdictTimer: ReturnType<typeof setTimeout> | undefined;

function hideRunVerdict(): void {
  if (verdictTimer) { clearTimeout(verdictTimer); verdictTimer = undefined; }
  const el = document.getElementById('run-verdict');
  el?.classList.remove('rv-in');
  el?.setAttribute('hidden', '');
}

function showRunVerdict(icon: string, text: string, cls: string): void {
  const el = document.getElementById('run-verdict');
  if (!el) { return; }
  if (verdictTimer) { clearTimeout(verdictTimer); }
  el.className = cls; // st-success · st-failed · st-cancelled — one tint
  el.replaceChildren();
  const iconEl = document.createElement('span');
  iconEl.className = 'rv-icon';
  iconEl.textContent = icon;
  const textEl = document.createElement('span');
  textEl.textContent = text;
  el.append(iconEl, textEl);
  el.title = 'Click for the full run story (activity feed)';
  el.removeAttribute('hidden');
  // Double-rAF so the transition runs on reveal (hidden → visible needs a
  // painted frame in between); reduced-motion gets no slide via CSS.
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('rv-in')));
  verdictTimer = setTimeout(hideRunVerdict, 8000);
}

document.getElementById('run-verdict')?.addEventListener('click', () => {
  hideRunVerdict();
  const feed = document.getElementById('activity');
  if (feed?.hasAttribute('hidden')) { toggleActivity(); }
});

function applyCostChip(forecast: { label: string; tooltip: string; unbounded: boolean; delta?: { label: string; tooltip: string; up: boolean } } | null): void {
  const chip = document.getElementById('run-cost');
  if (!chip) { return; }
  if (!forecast) {
    chip.setAttribute('hidden', '');
    return;
  }
  // The delta (vs the last commit) is the review signal — it rides the
  // chip as a suffix and tints it only when the ceiling went UP.
  chip.textContent = forecast.delta ? `${forecast.label} · ${forecast.delta.label}` : forecast.label;
  chip.title = forecast.delta ? `${forecast.tooltip}\n${forecast.delta.tooltip}` : forecast.tooltip;
  chip.classList.toggle('unbounded', forecast.unbounded);
  chip.classList.toggle('cost-up', forecast.delta?.up === true);
  chip.removeAttribute('hidden');
}

/** Preflight verdict on the pill: ready ✓ · flows ⚠ · missing ✗ — the
 *  glanceable half of the flight plan; the click opens the whole doc. */
function applyPreflightChip(chip: { text: string; cls: string; tip: string } | null): void {
  const el = document.getElementById('run-preflight');
  if (!el) { return; }
  if (!chip) {
    el.setAttribute('hidden', '');
    return;
  }
  el.textContent = chip.text;
  el.title = chip.tip;
  el.classList.remove('ok', 'warn', 'bad');
  el.classList.add(chip.cls);
  el.removeAttribute('hidden');
}
document.getElementById('run-preflight')?.addEventListener('click', () => {
  vscode.postMessage({ kind: 'dag:openPreflight' });
});

function refreshStaleChip(): void {
  const chip = document.getElementById('run-stale');
  if (!chip) { return; }
  const summary = runPlanSummary(renderer.currentNodes(), { partialRun: resumeCapable });
  if (summary.total === 0) {
    chip.setAttribute('hidden', '');
    return;
  }
  chip.textContent = summary.label;
  chip.title = summary.tooltip ?? '';
  chip.removeAttribute('hidden');
}

// `resumeCapable` is declared ABOVE the restore bootstrap (TDZ) — this
// helper just applies a loaded graph's stamp to the flag + the button.
function applyResumeCapable(graph: DagGraph | undefined): void {
  resumeCapable = graph?.resumeCapable === true;
  document.getElementById('btn-run-resume')?.toggleAttribute('hidden', !resumeCapable);
}

function requestRun(preview: boolean, resume = false): void {
  // `running` = confirmed by run:state; `run-starting` = optimistic —
  // both block re-entry, closing the double-click window before spawn.
  if (document.body.classList.contains('running')
    || document.body.classList.contains('run-starting')) { return; }
  // Optimistic latency masking: the click has a visible consequence
  // BEFORE the first engine event (pending cards shimmer) — cleared by
  // the first run:state, or by a 4s safety in case the spawn dies.
  document.body.classList.add('run-starting');
  setTimeout(() => document.body.classList.remove('run-starting'), 4000);
  vscode.postMessage({
    kind: 'dag:runRequest',
    preview,
    resume,
    workflowUri: vscode.getState()?.graph?.workflowUri,
  });
}

document.getElementById('btn-run')?.addEventListener('click', () => requestRun(false));
document.getElementById('btn-run-mock')?.addEventListener('click', () => requestRun(true));
document.getElementById('btn-run-resume')?.addEventListener('click', () => requestRun(false, true));
document.getElementById('btn-stop')?.addEventListener('click', () => {
  vscode.postMessage({ kind: 'dag:cancelRun' });
});

// ─── Toolbar Handlers ───────────────────────────────────────────────────────

document.getElementById('btn-fit')?.addEventListener('click', () => renderer.fitToView());
document.getElementById('btn-zoom-in')?.addEventListener('click', () => renderer.zoomIn());
document.getElementById('btn-zoom-out')?.addEventListener('click', () => renderer.zoomOut());
document.getElementById('zoom-pct')?.addEventListener('click', () => renderer.fitToView());

/** Auto-layout: drop the drag pins, re-run ELK, re-fit (⌗ · key A). */
async function resetLayout(instant = false): Promise<void> {
  if (!renderer.hasManualLayout) { return; }
  renderer.clearManualLayout();
  const g = vscode.getState()?.graph;
  if (!g) { return; }
  await renderer.render(g);
  renderer.fitToView(undefined, instant);
}
document.getElementById('btn-relayout')?.addEventListener('click', () => { void resetLayout(); });

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

const followBtn = document.getElementById('btn-follow');
const syncFollowBtn = (): void => { followBtn?.classList.toggle('active', renderer.followRun); };
function toggleFollow(): void {
  renderer.followRun = !renderer.followRun;
  syncFollowBtn();
  vscode.setState({ ...(vscode.getState() ?? {}), followRun: renderer.followRun });
}
followBtn?.addEventListener('click', toggleFollow);
syncFollowBtn();

const heatBtn = document.getElementById('btn-heat');
const syncHeatBtn = (): void => { heatBtn?.classList.toggle('active', renderer.heatmapOn); };
function toggleHeatmap(): void {
  renderer.heatmapOn = !renderer.heatmapOn;
  syncHeatBtn();
  renderer.applyHeatmap();
  vscode.setState({ ...(vscode.getState() ?? {}), heatmap: renderer.heatmapOn });
}
heatBtn?.addEventListener('click', toggleHeatmap);
syncHeatBtn();

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
      // Keyboard cycling — the camera jumps (motion charter law 7).
      renderer.focusAndCenter(ids[searchCycle % ids.length], true);
      searchCycle += 1;
    }
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e: KeyboardEvent) => {
  // Only handle if not in an input field
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  // Keyboard camera = INSTANT (motion charter law 7: a key press never
  // animates — the glides belong to pointer gestures).
  if (e.key === 'f' || e.key === 'F') renderer.fitToView(undefined, true);
  if (e.key === '+' || e.key === '=') renderer.zoomIn(true);
  if (e.key === '-') renderer.zoomOut(true);
  if (e.key === '/') {
    e.preventDefault();
    openSearch();
    return;
  }
  // Keyboard-first canvas nav (a11y + power): Tab (or ←/→) cycles the
  // topological node order, ↑ walks to a dependency, ↓ to a dependent.
  if (e.key === 'Tab') {
    e.preventDefault();
    renderer.navFocus(e.shiftKey ? 'prev' : 'next');
    return;
  }
  if (e.key === 'ArrowUp') { e.preventDefault(); renderer.navFocus('up'); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); renderer.navFocus('down'); return; }
  if (e.key === 'ArrowLeft') { e.preventDefault(); renderer.navFocus('prev'); return; }
  if (e.key === 'ArrowRight') { e.preventDefault(); renderer.navFocus('next'); return; }
  if (e.key === 'Escape') {
    if (closeSearch()) { return; }
    if (renderer.cancelConnect()) { return; }
    const ex = document.getElementById('explainer');
    if (ex && !ex.hasAttribute('hidden')) { ex.setAttribute('hidden', ''); return; }
    renderer.clearFocus();
  }
  if (e.key === 'w' || e.key === 'W') wavesBtn?.dispatchEvent(new Event('click'));
  if (e.key === 'a' || e.key === 'A') { void resetLayout(true); }
  if (e.key === 'h' || e.key === 'H') { toggleHeatmap(); }
  if (e.key === 'g' || e.key === 'G') { toggleFollow(); syncFollowBtn(); }
  // K (or ⌘K) — the command muscle: focus the omnibar input.
  if (e.key === 'k' || e.key === 'K') {
    e.preventDefault();
    (document.getElementById('omni-input') as HTMLInputElement | null)?.focus();
    return;
  }
  // N — new task: the palette (verb or tool), centered.
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    openTaskPalette();
    return;
  }
  if (e.key === '?') toggleExplainer();
  if (e.key === 'l' || e.key === 'L') toggleActivity();
  // ⌘D / Ctrl+D — duplicate the focused task (the n8n/Figma muscle).
  if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
    e.preventDefault();
    renderer.requestDuplicateFocused();
    return;
  }
  // Run keys — modifier-free only (⌘R must stay the browser/editor's).
  // requestRun's own re-entry guard makes repeats harmless.
  if (!e.metaKey && !e.ctrlKey && !e.altKey) {
    if (e.key === 'r' || e.key === 'R') requestRun(false);
    if (e.key === 'm' || e.key === 'M') requestRun(true);
    if ((e.key === 's' || e.key === 'S') && document.body.classList.contains('running')) {
      vscode.postMessage({ kind: 'dag:cancelRun' });
    }
  }
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
// ＋ Task (and N) open the task palette centered — verb or tool, one
// searchable surface (the QuickPick fallback stays for the omnibar).
function openTaskPalette(): void {
  if (!vscode.getState()?.graph) { return; } // welcome owns the empty panel
  verbCmdk.openCentered((pick) => {
    vscode.postMessage({
      kind: 'dag:addTask',
      verb: pick.verb,
      tool: pick.tool,
      afterTaskId: renderer.focused,
      workflowUri: vscode.getState()?.graph?.workflowUri,
    });
  });
}
document.getElementById('btn-add-task')?.addEventListener('click', () => openTaskPalette());
// ＋ New — a fresh workflow page (untitled .nika.yaml, extension-side).
document.getElementById('btn-new')?.addEventListener('click', () => {
  vscode.postMessage({ kind: 'dag:newWorkflow' });
});

// The arrival describe bar (empty workflow) — same oracle-checked
// generate flow as the welcome; the hint teaches the palette.
document.getElementById('canvas-describe')?.addEventListener('submit', (e: Event) => {
  e.preventDefault();
  const input = document.getElementById('cd-input') as HTMLInputElement | null;
  const text = input?.value.trim();
  if (!text) { input?.focus(); return; }
  vscode.postMessage({ kind: 'welcome:describe', text });
  if (input) { input.value = ''; }
});
document.getElementById('cd-input')?.addEventListener('keydown', (e: KeyboardEvent) => {
  e.stopPropagation();
  if (e.key === 'Escape') { (e.target as HTMLInputElement).blur(); }
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

document.getElementById('es-new')?.addEventListener('click', () => {
  vscode.postMessage({ kind: 'dag:newWorkflow' });
});
document.getElementById('es-walkthrough')?.addEventListener('click', () => {
  vscode.postMessage({ kind: 'dag:openWalkthrough' });
});

// ─── The welcome · describe → generate · actions → whitelisted commands ─────

document.getElementById('es-describe')?.addEventListener('submit', (e: Event) => {
  e.preventDefault();
  const input = document.getElementById('es-describe-input') as HTMLInputElement | null;
  const text = input?.value.trim();
  if (!text) { input?.focus(); return; }
  vscode.postMessage({ kind: 'welcome:describe', text });
  if (input) { input.value = ''; }
});

for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('.es-cmd'))) {
  btn.addEventListener('click', () => {
    const command = btn.dataset.cmd;
    if (command) { vscode.postMessage({ kind: 'welcome:cmd', command }); }
  });
}

/** The resume list — recent workflows, the sidebar-sessions read. */
function renderWelcomeRecent(recent: Array<{ name: string; uri: string; rel: string }>): void {
  const host = document.getElementById('es-recent-list');
  const section = document.getElementById('es-recent');
  if (!host || !section) { return; }
  host.replaceChildren();
  if (recent.length === 0) {
    section.setAttribute('hidden', '');
    return;
  }
  for (const r of recent) {
    const row = document.createElement('button');
    row.className = 'es-row';
    const name = document.createElement('span');
    name.className = 'es-row-name';
    name.textContent = r.name;
    name.title = r.name;
    const rel = document.createElement('span');
    rel.className = 'es-row-rel';
    rel.textContent = r.rel;
    row.append(name, rel);
    row.addEventListener('click', () => {
      vscode.postMessage({ kind: 'welcome:open', uri: r.uri });
    });
    host.appendChild(row);
  }
  section.removeAttribute('hidden');
}

// Cursor spotlight (nika skin) — two custom props written at most once
// per frame; the CSS overlay does the painting. Pointer-leave fades out.
{
  const container = document.getElementById('dag-container');
  let spotRaf = 0;
  let spotEvt: { x: number; y: number } | null = null;
  container?.addEventListener('pointermove', (e: PointerEvent) => {
    spotEvt = { x: e.clientX, y: e.clientY };
    if (spotRaf) { return; }
    spotRaf = requestAnimationFrame(() => {
      spotRaf = 0;
      if (!spotEvt || !container) { return; }
      container.style.setProperty('--spot-x', `${spotEvt.x}px`);
      container.style.setProperty('--spot-y', `${spotEvt.y}px`);
      container.style.setProperty('--spot-on', '1');
    });
  });
  container?.addEventListener('pointerleave', () => {
    container.style.setProperty('--spot-on', '0');
  });
}

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
  let hintScheduled = false;
  const firstGraphListener = (event: MessageEvent<ExtToWebviewMessage>): void => {
    // Two dag:loads inside the 600ms window must not append two hints.
    if (event.data.kind === 'dag:load' && !hintScheduled) {
      hintScheduled = true;
      setTimeout(onFirstGraph, 600);
    }
  };
  window.addEventListener('message', firstGraphListener);
}

// ─── Signal Ready ───────────────────────────────────────────────────────────
vscode.postMessage({ kind: 'dag:ready' });
