// glyphRegistry.ts — one glyph, one sense (DESIGN.md §2b · pure, no vscode).
//
// Every sense-bearing unicode mark the extension paints lives here, once,
// with its one sense. The status maps (runHistory cells · traceFold badges ·
// runReport · the canvas activity feed · the live-run feed) import these
// characters — a second glyph for a sense that already owns one is
// unrepresentable by construction. Verb marks are the generated SSOT
// (NIKA_VERB_GLYPH) and category marks are the card cartography
// (CATEGORY_GLYPH) — both re-exported, never forked.
//
// The three laws (DESIGN.md §2b):
//   1 · one glyph = one sense, on every surface (webview · empty state ·
//       native views · package.json · harness);
//   2 · worded-only marks (⟳ ⟲ ⊗ ⤼) never paint without their word;
//   3 · a new mark is admitted only if a neighbor of its unicode block
//       already ships — rendering proven by adjacency, never @font-face.
//
// The belt: scripts/glyph-registry.mjs (npm test) gates the vocabulary.

import { NIKA_VERB_GLYPH } from '../design-tokens.generated';
import { CATEGORY_GLYPH } from './cardIdentity';

export interface GlyphEntry {
  readonly glyph: string;
  readonly sense: string;
  /** Law 2 — the word is part of the mark; never paints glyph-only. */
  readonly wordedOnly?: true;
}

/** Status vocabulary — the recorded quartet + the live states + the two
 *  overlay facts (cached rehydration · the workflow-level pause). THE
 *  shape every status map imports; the dialects died here. */
export const STATUS_GLYPH = {
  pending: { glyph: '·', sense: 'pending — no verdict yet (blank cell = not in that run)' },
  running: { glyph: '▶', sense: 'run — the one run family: Run · mock preview · play · a task running' },
  retrying: { glyph: '↻', sense: 'retry — the attempt failing, not the task (↻×n budget · counters)' },
  success: { glyph: '✓', sense: 'settled success (check-clean rides the same family)' },
  failed: { glyph: '✗', sense: 'failure — the status and the ✗ fail on_error route' },
  skipped: { glyph: '↷', sense: 'skipped — a decision, never a failure' },
  cancelled: { glyph: '⊘', sense: 'cancelled — a decision, never red' },
  paused: { glyph: '⏸', sense: 'paused — the run waits on a human' },
  cached: { glyph: '○', sense: 'cache hit — rehydrated from the recording, nothing executed' },
} as const satisfies Record<string, GlyphEntry>;

export type StatusSense = keyof typeof STATUS_GLYPH;

/** sense → bare character — what the status maps actually paint. */
export const STATUS_CHAR = Object.fromEntries(
  Object.entries(STATUS_GLYPH).map(([k, v]) => [k, v.glyph]),
) as Record<StatusSense, string>;

/** Declared-policy chip vocabulary (the card footer · DESIGN.md §1). */
export const POLICY_GLYPH = {
  retry: { glyph: STATUS_GLYPH.retrying.glyph, sense: 'retry budget (retry.max_attempts)' },
  timeout: { glyph: '⏱', sense: 'hard timeout' },
  recover: { glyph: '✚', sense: 'recovery — on_error: recover · a repaired success' },
  bypass: { glyph: '⤼', sense: 'a failure is bypassed — on_error: skip · fail_fast: false per-item', wordedOnly: true },
  fail: { glyph: STATUS_GLYPH.failed.glyph, sense: 'on_error: fail_workflow — a failure here stops the run' },
  failFast: { glyph: '⊗', sense: 'fail-fast — the first iteration error fails the whole task', wordedOnly: true },
  thinking: { glyph: '∴', sense: 'extended thinking budget' },
  vision: { glyph: CATEGORY_GLYPH.media, sense: 'image inputs ride the prompt (cognate of the media frame — sanctioned)' },
  typed: { glyph: '⊨', sense: 'proven assertion — typed output shape · a condition essence' },
  parallel: { glyph: '∥', sense: 'fan-out — the for_each construct (source row ∥ items ← x · concurrency cap ∥ max N)' },
  finally: { glyph: '◈', sense: 'on_finally cleanup steps' },
  outputs: { glyph: '⤳', sense: 'declared outputs' },
  gate: { glyph: '⌁', sense: 'a when: condition gate' },
} as const satisfies Record<string, GlyphEntry>;

/** Surface vocabulary — toolbar lenses · empty-state capabilities ·
 *  actions · transport. One entry per sense; the slots share it. */
export const SURFACE_GLYPH = {
  waves: { glyph: '≋', sense: 'wave bands lens — topological levels' },
  timeline: { glyph: '▧', sense: 'timeline lens — the run as a Gantt (the stair)' },
  audit: { glyph: '▦', sense: 'the permits/audit read — what this file CAN DO' },
  dataflow: { glyph: '⇉', sense: 'dataflow lens — where the data goes' },
  smooth: { glyph: '∿', sense: 'smooth edges' },
  heatmap: { glyph: '▥', sense: 'heatmap lens' },
  follow: { glyph: '⌖', sense: 'follow the run — the camera tracks the frontier' },
  feed: { glyph: '≣', sense: 'activity feed — every transition, live' },
  relayout: { glyph: '⌗', sense: 'auto-layout — back to the grid' },
  newFile: { glyph: '⧇', sense: 'new workflow — a fresh page' },
  examples: { glyph: '⧈', sense: 'embedded examples — a framed specimen' },
  runHistory: { glyph: '⊞', sense: 'run history — the cross-run grid' },
  preflight: { glyph: '▩', sense: 'preflight — cost · secrets · keys (the audit family, denser weave)' },
  report: { glyph: '⎙', sense: 'pre-flight report — the printable document' },
  inspect: { glyph: CATEGORY_GLYPH.introspection, sense: 'inspect — the lens (the introspection category rides it)' },
  explain: { glyph: '¶', sense: 'explain — prose from the graph' },
  spec: { glyph: '§', sense: 'the embedded spec (section marks ride the same voice)' },
  copyPrompt: { glyph: '⇗', sense: 'copy the AI authoring prompt — take it elsewhere' },
  setupMcp: { glyph: '⎓', sense: 'setup MCP — the wiring jack' },
  openCanvas: { glyph: '⊡', sense: 'open the canvas — the card on the board' },
  duplicate: { glyph: '❏', sense: 'duplicate — the universal copy' },
  replay: { glyph: '⟲', sense: 'replay a recorded trace — winding time back', wordedOnly: true },
  restart: { glyph: '⟳', sense: 'restart / redetect the server', wordedOnly: true },
  resume: { glyph: 'Δ', sense: 'what changed — resume re-runs the delta (cost Δ · run diff ride the family)' },
  whatIf: { glyph: '⚡', sense: 'what-if — replay admission with a task failed' },
  event: { glyph: '⚑', sense: 'an event essence — the flag on the wire' },
  stop: { glyph: '■', sense: 'stop the live run' },
  pauseTransport: { glyph: '❚❚', sense: 'pause the replay transport' },
  live: { glyph: '⋯', sense: 'live — the clock still counting (in-flight elapsed)' },
  export: { glyph: '⤓', sense: 'export (svg · png)' },
  commands: { glyph: '⌘', sense: 'the command surface — all commands · chord keycaps' },
  call: { glyph: '⎘', sense: 'workflow call — the door to the child' },
  fork: { glyph: '⑂', sense: 'fork from a task — branch the recording' },
  peek: { glyph: '◉', sense: 'peek the run story' },
  edit: { glyph: '✎', sense: 'custom / editable entry' },
  secret: { glyph: '⚿', sense: 'a pasted literal credential' },
  warning: { glyph: '⚠', sense: 'warning' },
  tool: { glyph: '⚒', sense: 'calls tools (the capability grid)' },
  submit: { glyph: '↵', sense: 'submit the describe bar' },
  close: { glyph: '✕', sense: 'close / delete — a dismissal, never a failure verdict' },
  stale: { glyph: '△', sense: 'stale — changed since its last run (the per-card badge; Δ measures/re-runs the delta)' },
  trendUp: { glyph: '▲', sense: 'duration trend up vs the window median' },
  trendDown: { glyph: '▼', sense: 'duration trend down vs the window median' },
  average: { glyph: '⌀', sense: 'the recorded mean (⌀ 1.2s on the card)' },
} as const satisfies Record<string, GlyphEntry>;

/** The four house verb marks — generated SSOT, re-exported, never forked. */
export { NIKA_VERB_GLYPH };
/** The builtin-category marks — the card cartography, never forked. */
export { CATEGORY_GLYPH };
