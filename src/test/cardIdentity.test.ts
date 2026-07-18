// cardIdentity.test.ts — the card cartography contract.
//
// A card never GUESSES what it is: identity resolves from the graph
// SSOT (node.verb · node.tool) crossed with the engine's own tool
// catalog (`catalog --tools` categories). The resolver is pure — this
// suite IS the map, provable without a webview.

import { describe, it, expect } from 'vitest';
import { resolveCardIdentity, CATEGORY_GLYPH } from '../core/cardIdentity';

const CATS = {
  fetch: { cat: 'network' },
  write: { cat: 'file' },
  read: { cat: 'file' },
  jq: { cat: 'data' },
  log: { cat: 'core' },
  inspect: { cat: 'introspection' },
  image: { cat: 'media' },
  tts: { cat: 'media' },
};

describe('resolveCardIdentity — verb × builtin × category', () => {
  it('a bare verb card carries its verb family and motion identity', () => {
    const id = resolveCardIdentity({ verb: 'infer' }, CATS);
    expect(id.family).toBe('infer');
    expect(id.motion).toBe('nika-motion-infer');
    expect(id.builtin).toBeUndefined();
    expect(id.preview).toBe('none');
  });

  it('an invoke card resolves its builtin through the REAL catalog', () => {
    const id = resolveCardIdentity({ verb: 'invoke', tool: 'nika:fetch' }, CATS);
    expect(id.builtin).toBe('fetch');
    expect(id.category).toBe('network');
    expect(id.glyph).toBe(CATEGORY_GLYPH.network);
    expect(id.preview).toBe('http');
    expect(id.motion).toBe('nika-motion-invoke');
  });

  it('media builtins preview as a developing IMAGE frame', () => {
    expect(resolveCardIdentity({ verb: 'invoke', tool: 'nika:image' }, CATS).preview).toBe('image');
    expect(resolveCardIdentity({ verb: 'invoke', tool: 'nika:tts' }, CATS).preview).toBe('audio');
  });

  it('file writers preview as a file row · readers stay quiet', () => {
    expect(resolveCardIdentity({ verb: 'invoke', tool: 'nika:write' }, CATS).preview).toBe('file');
    expect(resolveCardIdentity({ verb: 'invoke', tool: 'nika:read' }, CATS).preview).toBe('none');
  });

  it('an MCP tool (namespace ≠ nika) keeps the plug family — no fake category', () => {
    const id = resolveCardIdentity({ verb: 'invoke', tool: 'mcp:github/create_issue' }, CATS);
    expect(id.builtin).toBeUndefined();
    expect(id.category).toBeUndefined();
    expect(id.preview).toBe('none');
  });

  it('a builtin missing from the catalog degrades honestly (no glyph invention)', () => {
    const id = resolveCardIdentity({ verb: 'invoke', tool: 'nika:brand_new' }, CATS);
    expect(id.builtin).toBe('brand_new');
    expect(id.category).toBeUndefined();
    expect(id.glyph).toBeUndefined();
  });

  it('no catalog at all (offline) → verb family alone, never a crash', () => {
    const id = resolveCardIdentity({ verb: 'exec' }, undefined);
    expect(id.family).toBe('exec');
    expect(id.motion).toBe('nika-motion-exec');
  });

  it('the four motion identities are the canonical SSOT names', () => {
    for (const verb of ['infer', 'exec', 'invoke', 'agent'] as const) {
      expect(resolveCardIdentity({ verb }, CATS).motion).toBe(`nika-motion-${verb}`);
    }
    // An unknown verb (reader tolerance) rides without motion.
    expect(resolveCardIdentity({ verb: 'future' }, CATS).motion).toBeUndefined();
  });
});
