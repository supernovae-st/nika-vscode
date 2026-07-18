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
