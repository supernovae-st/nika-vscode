// cardIdentity.test.ts — the card cartography contract.
//
// A card never GUESSES what it is: identity resolves from the graph
// SSOT (node.verb · node.tool) crossed with the engine's own tool
// catalog (`catalog --tools` categories). The resolver is pure — this
// suite IS the map, provable without a webview.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { splitEssence, resolveCardIdentity, mediaDeclareOf, CATEGORY_GLYPH, CHART_SHAPES, type PreviewKind } from '../core/cardIdentity';

// The 28 builtins with the ENGINE's own categories (`catalog --tools`
// truth — the D1/D2 drifts lived exactly here: a test seeded with
// invented names like `tts`/`append` proves nothing about the catalog).
const CATALOG: Record<string, { cat: string }> = {
  log: { cat: 'core' }, emit: { cat: 'core' }, assert: { cat: 'core' },
  prompt: { cat: 'core' }, done: { cat: 'core' }, wait: { cat: 'core' },
  read: { cat: 'file' }, write: { cat: 'file' }, edit: { cat: 'file' },
  glob: { cat: 'file' }, grep: { cat: 'file' },
  jq: { cat: 'data' }, json_diff: { cat: 'data' }, validate: { cat: 'data' },
  json_merge_patch: { cat: 'data' }, convert: { cat: 'data' }, uuid: { cat: 'data' },
  date: { cat: 'data' }, hash: { cat: 'data' }, decide: { cat: 'data' },
  fetch: { cat: 'network' }, notify: { cat: 'network' },
  compose: { cat: 'introspection' }, inspect: { cat: 'introspection' },
  chart: { cat: 'media' }, tts_generate: { cat: 'media' },
  image_generate: { cat: 'media' }, image_fx: { cat: 'media' },
};

const CATS = CATALOG;

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

  it('media builtins develop their nature: images frame, tts strips (the D1 catch)', () => {
    expect(resolveCardIdentity({ verb: 'invoke', tool: 'nika:image_generate' }, CATS).preview).toBe('image');
    expect(resolveCardIdentity({ verb: 'invoke', tool: 'nika:image_fx' }, CATS).preview).toBe('image');
    expect(resolveCardIdentity({ verb: 'invoke', tool: 'nika:chart' }, CATS).preview).toBe('image');
    // THE bug this table kills: tts_generate developed an IMAGE frame
    // because the audio set carried names the catalog never had.
    expect(resolveCardIdentity({ verb: 'invoke', tool: 'nika:tts_generate' }, CATS).preview).toBe('audio');
  });

  it('file writers preview as a file row · readers stay quiet (the D2 catch)', () => {
    expect(resolveCardIdentity({ verb: 'invoke', tool: 'nika:write' }, CATS).preview).toBe('file');
    expect(resolveCardIdentity({ verb: 'invoke', tool: 'nika:edit' }, CATS).preview).toBe('file');
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

describe('resolveCardIdentity · composition (spec 14 — invoke workflow:)', () => {
  it('a workflow: tool ref becomes a sub-workflow door: path + ⎘, never a catalog tool', () => {
    const id = resolveCardIdentity(
      { verb: 'invoke', tool: 'workflow:./sub.nika.yaml' },
      { fetch: { cat: 'network' } } as never,
    );
    expect(id.subWorkflow).toBe('./sub.nika.yaml');
    expect(id.glyph).toBe('⎘');
    expect(id.builtin).toBeUndefined();
    expect(id.category).toBeUndefined();
    expect(id.preview).toBe('none');
    expect(id.family).toBe('invoke');
  });

  it('an empty workflow: ref earns nothing (check owns the finding)', () => {
    const id = resolveCardIdentity({ verb: 'invoke', tool: 'workflow:' }, undefined);
    expect(id.subWorkflow).toBeUndefined();
    expect(id.glyph).toBeUndefined();
  });
});

describe('splitEssence — the deep-card law (the essence leads, the rest rests)', () => {
  it('finds the soul arg and splits the preview around it', () => {
    const s = splitEssence('jq', 'input: rows · query: .[] | select(.n > 3)');
    expect(s.essence).toEqual({ key: 'query', value: '.[] | select(.n > 3)', render: 'code' });
    expect(s.rest).toBe('input: rows');
  });

  it('an unknown builtin keeps the plain line — never a guess', () => {
    const s = splitEssence('hologram', 'a: 1 · b: 2');
    expect(s.essence).toBeUndefined();
    expect(s.rest).toBe('a: 1 · b: 2');
  });

  it('a known builtin whose essence arg is absent degrades to the plain line', () => {
    const s = splitEssence('fetch', 'mode: markdown');
    expect(s.essence).toBeUndefined();
    expect(s.rest).toBe('mode: markdown');
  });

  it('the essence alone leaves no rest', () => {
    const s = splitEssence('emit', 'event: task_done');
    expect(s.essence?.render).toBe('event');
    expect(s.rest).toBeUndefined();
  });
});

describe('previewFor — the 28-builtin table (every card knows its nature)', () => {
  // The full closed table: builtin → the preview its card earns. A NEW
  // builtin landing in the catalog without a row here fails loudly —
  // and a phantom name (D1 tts/speak/transcribe · D2 append/copy/move/
  // archive) can never silently zero a frame again.
  const TABLE: Record<string, PreviewKind> = {
    // core — plain cards, no frame.
    log: 'none', emit: 'none', assert: 'none', prompt: 'none', done: 'none', wait: 'none',
    // file — the two writers land a receipt row; readers stay quiet.
    read: 'none', write: 'file', edit: 'file', glob: 'none', grep: 'none',
    // data — plain cards.
    jq: 'none', json_diff: 'none', validate: 'none', json_merge_patch: 'none',
    convert: 'none', uuid: 'none', date: 'none', hash: 'none', decide: 'none',
    // network — the round-trip pulse.
    fetch: 'http', notify: 'http',
    // introspection — compose earns the check-receipt row; inspect stays plain.
    compose: 'check', inspect: 'none',
    // media — images (and charts and restyles) frame; tts strips.
    chart: 'image', tts_generate: 'audio', image_generate: 'image', image_fx: 'image',
  };

  it('covers the catalog exactly (28 builtins, none forgotten)', () => {
    expect(Object.keys(TABLE).sort()).toEqual(Object.keys(CATALOG).sort());
    expect(Object.keys(TABLE)).toHaveLength(28);
  });

  for (const [builtin, expected] of Object.entries(TABLE)) {
    it(`${builtin} → ${expected}`, () => {
      expect(resolveCardIdentity({ verb: 'invoke', tool: `nika:${builtin}` }, CATALOG).preview).toBe(expected);
    });
  }

  it('the phantom names are DEAD in the source sets (D1 + D2 stay fixed)', () => {
    const src = fs.readFileSync(
      fileURLToPath(new URL('../core/cardIdentity.ts', import.meta.url)), 'utf-8');
    const writers = src.match(/FILE_WRITERS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '';
    const audio = src.match(/AUDIO_MAKERS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '';
    for (const phantom of ['append', 'copy', 'move', 'archive']) {
      expect(writers, `phantom file writer: ${phantom}`).not.toContain(`'${phantom}'`);
    }
    expect(writers).toContain(`'write'`);
    expect(writers).toContain(`'edit'`);
    for (const phantom of ['tts', 'speak', 'transcribe']) {
      expect(audio, `phantom audio maker: ${phantom}`).not.toContain(`'${phantom}'`);
    }
    expect(audio).toContain(`'tts_generate'`);
  });
});

describe('mediaDeclareOf — what the frame can SAY before the run', () => {
  it('image_generate: a literal aspect_ratio letterboxes the ghost', () => {
    const d = mediaDeclareOf('image_generate', 'prompt: a lighthouse · aspect_ratio: 16:9 · n: 3');
    expect(d.ratio).toBeCloseTo(16 / 9);
    expect(d.ratioLabel).toBe('16:9');
    expect(d.count).toBe(3);
  });

  it('image_generate: an exact size wins over aspect_ratio (the tool precedence)', () => {
    const d = mediaDeclareOf('image_generate', 'size: 1024x768 · aspect_ratio: 9:16');
    expect(d.ratio).toBeCloseTo(1024 / 768);
    expect(d.ratioLabel).toBe('1024x768');
  });

  it('an interpolated value is a STATED gap — the generic frame, never a guess', () => {
    const d = mediaDeclareOf('image_generate', 'aspect_ratio: ${{ vars.ratio }} · provider: gemini');
    expect(d.ratio).toBeUndefined();
    expect(d.ratioLabel).toBeUndefined();
    expect(d.provider).toBe('gemini');
  });

  it('n: 1 earns no ×N chip (a single is not a batch)', () => {
    expect(mediaDeclareOf('image_generate', 'n: 1').count).toBeUndefined();
  });

  it('tts_generate: voice · format ride the strip; provider captions', () => {
    const d = mediaDeclareOf('tts_generate', 'voice: alloy · format: mp3 · provider: openai');
    expect(d.voice).toBe('alloy');
    expect(d.format).toBe('mp3');
    expect(d.provider).toBe('openai');
  });

  it('chart: the declared type must be a member of the closed shape set', () => {
    expect(mediaDeclareOf('chart', 'type: bar · out: ./out/velocity.svg')).toMatchObject({
      chartType: 'bar', out: 'velocity.svg',
    });
    expect(mediaDeclareOf('chart', 'type: pie').chartType).toBeUndefined();
    for (const shape of CHART_SHAPES) {
      expect(mediaDeclareOf('chart', `type: ${shape}`).chartType).toBe(shape);
    }
  });

  it('image_fx: the ops chain + input basename declare the recipe', () => {
    const d = mediaDeclareOf('image_fx', 'input: ./out/hero-1.png · ops: dither → duotone · out: ./x.png');
    expect(d.input).toBe('hero-1.png');
    expect(d.ops).toEqual(['dither', 'duotone']);
  });

  it('no argsPreview → an empty declaration (frames stay generic)', () => {
    expect(mediaDeclareOf('image_generate', undefined)).toEqual({});
    expect(mediaDeclareOf(undefined, 'aspect_ratio: 16:9')).toEqual({});
  });
});
