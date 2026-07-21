import { describe, expect, it } from 'vitest';
import { filterTools, filterVerbs, omniAddDidYouMean, parseOmniAdd, VERB_ITEMS, type ToolItem } from '../core/verbPalette';

const names = (q: string): string[] => filterVerbs(q).map((v) => v.verb);

describe('filterVerbs (the drop-port cmdk)', () => {
  it('empty query is the canonical 4-verb order', () => {
    expect(names('')).toEqual(['infer', 'exec', 'invoke', 'agent']);
    expect(names('   ')).toEqual(['infer', 'exec', 'invoke', 'agent']);
  });

  it('name-prefix ranks first: "in" → infer before invoke', () => {
    expect(names('in')).toEqual(['infer', 'invoke']);
  });

  it('an exact-ish prefix narrows to one', () => {
    expect(names('inf')).toEqual(['infer']);
    expect(names('ag')).toEqual(['agent']);
  });

  it('a blurb-only match still surfaces (behind name matches)', () => {
    // "tool" is in invoke + agent blurbs, in neither name.
    expect(names('tool')).toEqual(['invoke', 'agent']);
    // "shell" only in exec's blurb.
    expect(names('shell')).toEqual(['exec']);
  });

  it('drops non-matches', () => {
    expect(names('zzz')).toEqual([]);
  });

  it('name-prefix beats name-substring for the same letter', () => {
    // "e": exec is a PREFIX match (rank 0) so it leads; infer/invoke/
    // agent are name-substring (rank 1) in canonical order after it.
    expect(names('e')).toEqual(['exec', 'infer', 'invoke', 'agent']);
  });

  it('exposes exactly the 4 locked verbs with glyphs', () => {
    expect(VERB_ITEMS.map((v) => v.verb)).toEqual(['infer', 'exec', 'invoke', 'agent']);
    expect(VERB_ITEMS.every((v) => v.glyph.length > 0)).toBe(true);
  });
});

describe('filterTools (the task palette tool rows)', () => {
  const TOOLS: ToolItem[] = [
    { tool: 'nika:jq', bare: 'jq', cat: 'data' },
    { tool: 'nika:json_diff', bare: 'json_diff', cat: 'data' },
    { tool: 'nika:fetch', bare: 'fetch', cat: 'network' },
    { tool: 'nika:chart', bare: 'chart', cat: 'media' },
    { tool: 'nika:image_fx', bare: 'image_fx', cat: 'media' },
  ];
  const bares = (q: string): string[] => filterTools(q, TOOLS).map((t) => t.bare);

  it('empty query keeps the given order (caller groups by category)', () => {
    expect(bares('')).toEqual(['jq', 'json_diff', 'fetch', 'chart', 'image_fx']);
  });

  it('bare-name prefix ranks above substring: "j" → jq before json_diff', () => {
    expect(bares('j')).toEqual(['jq', 'json_diff']);
  });

  it('a category query surfaces its family, behind any name match', () => {
    expect(bares('media')).toEqual(['chart', 'image_fx']);
  });

  it('drops non-matches', () => {
    expect(bares('zzz')).toEqual([]);
  });
});

describe('parseOmniAdd (the omnibar deterministic-add grammar)', () => {
  const KNOWN = new Set(['jq', 'fetch', 'chart']);

  it('a verb, with and without an anchor', () => {
    expect(parseOmniAdd('+ infer', KNOWN)).toEqual({ verb: 'infer', after: undefined });
    expect(parseOmniAdd('+ exec after gather', KNOWN)).toEqual({ verb: 'exec', after: 'gather' });
  });

  it('a KNOWN bare tool lands an invoke pinned to it', () => {
    expect(parseOmniAdd('+ jq after gather', KNOWN))
      .toEqual({ verb: 'invoke', tool: 'nika:jq', after: 'gather' });
  });

  it('a full nika: ref is accepted even outside the known set — the engine diagnoses', () => {
    expect(parseOmniAdd('+ nika:frobnicate', KNOWN))
      .toEqual({ verb: 'invoke', tool: 'nika:frobnicate', after: undefined });
  });

  it('an unknown bare word routes to generate (undefined)', () => {
    expect(parseOmniAdd('+ summarize the page', KNOWN)).toBeUndefined();
    expect(parseOmniAdd('+ frobnicate', KNOWN)).toBeUndefined();
  });

  it('no leading + = not an add', () => {
    expect(parseOmniAdd('scrape hn and post to slack', KNOWN)).toBeUndefined();
  });
});

describe('omniAddDidYouMean (the typo forgiven — Raycast forgiveness)', () => {
  const KNOWN = new Set(['jq', 'fetch', 'chart', 'emit', 'edit']);

  it('a near-miss verb corrects: + ifner means infer', () => {
    expect(omniAddDidYouMean('+ ifner', KNOWN)).toEqual({
      token: 'ifner',
      candidates: [{ verb: 'infer', after: undefined }],
    });
  });

  it('a near-miss tool corrects and keeps its anchor: + fech after gather', () => {
    expect(omniAddDidYouMean('+ fech after gather', KNOWN)).toEqual({
      token: 'fech',
      candidates: [{ verb: 'invoke', tool: 'nika:fetch', after: 'gather' }],
    });
  });

  it('several neighbours are ALL proposed — nearest first, lexical within', () => {
    expect(omniAddDidYouMean('+ exit', KNOWN)).toEqual({
      token: 'exit',
      candidates: [
        { verb: 'invoke', tool: 'nika:edit', after: undefined },
        { verb: 'invoke', tool: 'nika:emit', after: undefined },
        { verb: 'exec', after: undefined },
      ],
    });
  });

  it('a long unknown word has no neighbour — the caller keeps generate', () => {
    expect(omniAddDidYouMean('+ frobnicate', KNOWN)).toBeUndefined();
  });

  it('free prose is never fuzzed — the + grammar stays the gate', () => {
    expect(omniAddDidYouMean('make me a workflow', KNOWN)).toBeUndefined();
    expect(omniAddDidYouMean('+ summarize the page', KNOWN)).toBeUndefined();
  });

  it('a nika: ref is never fuzzed — unknown refs are the engine diagnostic', () => {
    expect(omniAddDidYouMean('+ nika:fech', KNOWN)).toBeUndefined();
  });
});
