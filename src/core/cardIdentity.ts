// cardIdentity.ts — the card cartography (pure resolve, zero guessing).
//
// Every canvas card KNOWS what it is by reading the graph SSOT: the
// node's verb (the family · its motion identity per design/motion.yaml)
// crossed with its tool and the engine's own catalog categories
// (`catalog --tools` — Lane A; the presentation fallback glyphs hold
// only when the catalog has not answered yet). The resolver decides
// which PREVIEW a card earns: a media builtin develops an image/audio
// frame while running, a file writer lands a file row, nika:fetch
// pulses its round-trip — the builtin's nature, visible in the card.

import type { ToolMeta } from './cliContract';

/** The category glyph vocabulary (mirrors the DESIGN.md table — the
 *  vocabulary is presentation canon; the CATEGORY per builtin is the
 *  engine's word, never ours). */
export const CATEGORY_GLYPH: Record<string, string> = {
  core: '◦',
  file: '▤',
  data: '⧉',
  network: '⇄',
  introspection: '⌕',
  media: '▣',
};

/** The canonical per-verb motion identity names (design/motion.yaml
 *  v1 — the SAME names the website's keyframes and the terminal's
 *  braille families carry; the belt in tokens-parity guards them). */
const MOTION: Record<string, string> = {
  infer: 'nika-motion-infer',
  exec: 'nika-motion-exec',
  invoke: 'nika-motion-invoke',
  agent: 'nika-motion-agent',
};

export type PreviewKind = 'image' | 'audio' | 'file' | 'http' | 'none';

export interface CardIdentity {
  /** The verb family — the tile, the hue, the identity mark. */
  family: string;
  /** Bare builtin name (`fetch`) when the tool is nika-namespaced. */
  builtin?: string;
  /** The engine's category word for that builtin (catalog truth). */
  category?: string;
  /** The category glyph — absent when the catalog has not spoken. */
  glyph?: string;
  /** Which preview slot the card earns. */
  preview: PreviewKind;
  /** The running-motion identity (canonical keyframes name). */
  motion?: string;
  /** Composition (spec 14): `invoke workflow:<path>` — the child
   *  workflow's path, as written. The card becomes a door into it. */
  subWorkflow?: string;
}

/** The composition glyph — a page pointing at another page (⎘). Not a
 *  category: the target is a WORKFLOW, outside the tool catalog. */
export const SUB_WORKFLOW_GLYPH = '⎘';

/** The essence register — which arg IS each builtin's soul, and how
 *  the card renders it (the deep-card law: an invoke card leads with
 *  the ONE fact that names its work, never a flat `k: v · k: v`).
 *  The LIST of builtins stays engine truth (catalog); this register
 *  only teaches presentation for the names it knows — an unknown
 *  builtin keeps the plain args line, never a guess. */
export type EssenceRender = 'code' | 'path' | 'url' | 'event' | 'duration' | 'condition' | 'text';

export const BUILTIN_ESSENCE: ReadonlyMap<string, { arg: string; render: EssenceRender }> = new Map([
  ['jq', { arg: 'query', render: 'code' }],
  ['convert', { arg: 'to', render: 'text' }],
  ['fetch', { arg: 'url', render: 'url' }],
  ['write', { arg: 'path', render: 'path' }],
  ['append', { arg: 'path', render: 'path' }],
  ['read', { arg: 'path', render: 'path' }],
  ['copy', { arg: 'to', render: 'path' }],
  ['move', { arg: 'to', render: 'path' }],
  ['glob', { arg: 'pattern', render: 'code' }],
  ['assert', { arg: 'condition', render: 'condition' }],
  ['emit', { arg: 'event', render: 'event' }],
  ['wait', { arg: 'for', render: 'duration' }],
  ['chart', { arg: 'title', render: 'text' }],
  ['image_generate', { arg: 'prompt', render: 'text' }],
  ['tts_generate', { arg: 'text', render: 'text' }],
  ['decide', { arg: 'bundle', render: 'path' }],
  ['compose', { arg: 'workflow_yaml', render: 'code' }],
  ['hash', { arg: 'input', render: 'text' }],
  ['log', { arg: 'message', render: 'text' }],
]);

/** Split an args preview (`k: v · k: v`) around a builtin's essence:
 *  the essence pair leads styled, the rest stays the muted line. */
export function splitEssence(
  builtin: string | undefined,
  argsPreview: string | undefined,
): { essence?: { key: string; value: string; render: EssenceRender }; rest?: string } {
  if (builtin === undefined || argsPreview === undefined) {
    return argsPreview !== undefined ? { rest: argsPreview } : {};
  }
  const spec = BUILTIN_ESSENCE.get(builtin);
  if (!spec) { return { rest: argsPreview }; }
  const pairs = argsPreview.split(' · ');
  const i = pairs.findIndex((p) => p.startsWith(`${spec.arg}: `));
  if (i === -1) { return { rest: argsPreview }; }
  const value = pairs[i].slice(spec.arg.length + 2);
  const rest = pairs.filter((_, j) => j !== i).join(' · ');
  return {
    essence: { key: spec.arg, value, render: spec.render },
    ...(rest.length > 0 ? { rest } : {}),
  };
}

/** Builtins whose OUTPUT is a file the run writes — the card lands a
 *  file row at settle (artifacts.ts already proves existence). */
const FILE_WRITERS = new Set(['write', 'append', 'copy', 'move', 'archive']);

/** Media builtins split by what they develop. */
const AUDIO_MAKERS = new Set(['tts', 'speak', 'transcribe']);

function previewFor(builtin: string | undefined, category: string | undefined): PreviewKind {
  if (!builtin) { return 'none'; }
  if (category === 'media') { return AUDIO_MAKERS.has(builtin) ? 'audio' : 'image'; }
  if (category === 'file') { return FILE_WRITERS.has(builtin) ? 'file' : 'none'; }
  if (category === 'network') { return 'http'; }
  return 'none';
}

export function resolveCardIdentity(
  node: { verb: string; tool?: string },
  toolCats: Record<string, ToolMeta> | undefined,
): CardIdentity {
  const identity: CardIdentity = {
    family: node.verb,
    preview: 'none',
    ...(MOTION[node.verb] !== undefined ? { motion: MOTION[node.verb] } : {}),
  };
  const tool = node.tool;
  // The union form (`invoke: { tool: | workflow: }`) rides the
  // projection as a `workflow:`-prefixed tool ref (probed on the
  // engine, 2026-07-19) — a sub-workflow call, not a catalog tool.
  if (typeof tool === 'string' && tool.startsWith('workflow:')) {
    const path = tool.slice('workflow:'.length).trim();
    if (path.length > 0) {
      identity.subWorkflow = path;
      identity.glyph = SUB_WORKFLOW_GLYPH;
    }
    return identity;
  }
  if (typeof tool === 'string' && tool.startsWith('nika:')) {
    const builtin = tool.slice('nika:'.length);
    identity.builtin = builtin;
    const category = toolCats?.[builtin]?.cat;
    if (category !== undefined) {
      identity.category = category;
      const glyph = CATEGORY_GLYPH[category];
      if (glyph !== undefined) { identity.glyph = glyph; }
    }
    identity.preview = previewFor(builtin, category);
  }
  return identity;
}
