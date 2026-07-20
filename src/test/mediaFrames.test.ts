// mediaFrames.test.ts — the media grammar, held structurally (W-D8 CI-2).
//
// dag.ts is the webview bundle (module-scope acquireVsCodeApi — not
// importable here), so the frame contract is pinned the way
// verbAnatomies.test.ts pins the four voices: source reads with exact
// anchors. What each pin holds:
//   1 · heights — a declared audio strip and the compose check row
//       reserve PREVIEW_AUD_H behind the same identity gate the build
//       reads; the image slot reserves PREVIEW_IMG_H (124, the
//       full-bleed body) and the TS constant MIRRORS the CSS (law 2);
//   2 · the byte gate — every card <img> declares loading=lazy +
//       decoding=async (a culled card must not decode its pixels);
//   3 · the declarations are decorative — every declared frame is
//       born aria-hidden (C1 owns the a11y story), inert
//       (pointer-events none) and GHOST (dashed ghosts · flat bars ·
//       an inert ▶) — no pre-run pixel can read as generated content;
//   4 · ONE develop sweep — the three frame kinds share nc-dev-sweep,
//       running-gated, reduced-motion opted out, export-frozen;
//   5 · honesty — the audio strip carries NO level shape (uniform
//       bars by construction: one height value for all 26).
// The live states (declare → develop → deliver) are proven in the
// headed pixel run (harness ?media=1) — this belt keeps the source
// honest between runs.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, '../webview/dag.ts'), 'utf8');
const css = readFileSync(join(__dirname, '../webview/dag.css'), 'utf8');

function heightsRegion(): string {
  const start = src.indexOf('function nodeHeightOf');
  const end = src.indexOf('const VERB_ICONS', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('heights — the declared frames budget their true boxes', () => {
  it('audio and check rows reserve PREVIEW_AUD_H behind the identity gate', () => {
    const h = heightsRegion();
    expect(h).toContain("if (declared === 'image') { h += PREVIEW_GAP + PREVIEW_IMG_H; }");
    expect(h).toContain("else if (declared === 'audio' || declared === 'check') { h += PREVIEW_GAP + PREVIEW_AUD_H; }");
  });

  it('the image slot constant is 124 and the CSS mirrors it (anatomy law 2)', () => {
    expect(src).toContain('const PREVIEW_IMG_H = 124;');
    const preview = css.slice(css.indexOf('.nc-preview {'), css.indexOf('.nc-preview img'));
    expect(preview).toContain('height: 124px;');
    // Full-bleed: the slot cancels the .nc side padding (12px each side).
    expect(preview).toContain('margin: 6px -12px 0;');
  });

  it('the audio/check rows are 30px in TS and CSS alike', () => {
    expect(src).toContain('const PREVIEW_AUD_H = 30;');
    const audio = css.slice(css.indexOf('.nc-preview-audio {'), css.indexOf('.nc-audio-play {'));
    expect(audio).toContain('height: 30px;');
    const check = css.slice(css.indexOf('.nc-preview-check {'), css.indexOf('.nc-check-glyph'));
    expect(check).toContain('height: 30px;');
  });
});

describe('the byte gate — card images never decode eagerly', () => {
  it('every card <img> assignment rides lazy + async', () => {
    const sites = src.match(/document\.createElement\('img'\)/g) ?? [];
    const lazy = src.match(/img\.loading = 'lazy';/g) ?? [];
    const decode = src.match(/img\.decoding = 'async';/g) ?? [];
    expect(sites.length).toBeGreaterThan(0);
    expect(lazy.length, 'one loading=lazy per img site').toBe(sites.length);
    expect(decode.length, 'one decoding=async per img site').toBe(sites.length);
  });
});

describe('the declarations are decorative and unconfusable (refuter floor)', () => {
  it('every declared frame is born aria-hidden', () => {
    for (const anchor of [
      "frame.className = 'nc-preview nc-developing nc-dev-sweep';",
      "row.className = 'nc-preview-audio nc-audio-ghost nc-dev-sweep';",
      "row.className = 'nc-preview-check nc-dev-sweep';",
    ]) {
      const at = src.indexOf(anchor);
      expect(at, anchor).toBeGreaterThan(-1);
      expect(src.slice(at, at + 220)).toContain("setAttribute('aria-hidden', 'true')");
    }
  });

  it('declared frames are inert (pointer-events none — no live affordance)', () => {
    for (const cls of ['.nc-developing {', '.nc-audio-ghost {', '.nc-preview-check {']) {
      const at = css.indexOf(cls);
      expect(at, cls).toBeGreaterThan(-1);
      expect(css.slice(at, css.indexOf('}', at))).toContain('pointer-events: none;');
    }
  });

  it('the ghost is dashed and the inert ▶ is a span, never a button', () => {
    const ghost = css.slice(css.indexOf('.nc-ghost {'), css.indexOf('.nc-ghost-ratio'));
    expect(ghost).toContain('dashed');
    expect(src).toContain("play.className = 'nc-audio-play nc-play-ghost';");
    const at = src.indexOf("play.className = 'nc-audio-play nc-play-ghost';");
    expect(src.slice(at - 120, at)).toContain("createElement('span')");
  });

  it('the audio strip is FLAT by construction — one bar height, no level shape', () => {
    const at = src.indexOf("strip.setAttribute('class', 'nc-audio-strip');");
    expect(at).toBeGreaterThan(-1);
    const loop = src.slice(at, at + 700);
    const heights = [...loop.matchAll(/setAttribute\('height', '([^']+)'\)/g)].map((m) => m[1]);
    expect(new Set(heights).size, 'every bar carries the SAME height (no fake VU)').toBe(1);
  });
});

describe('one develop sweep — shared, gated, frozen at export', () => {
  it('the sweep keys on nc-dev-sweep under status-running only', () => {
    expect(css).toContain('.dag-node.status-running .nc-dev-sweep::after {');
    expect(css.match(/\.nc-dev-sweep::after \{/g)?.length).toBe(1);
  });

  it('reduced motion opts the sweep out', () => {
    expect(css).toContain(
      '.dag-node.status-running .nc-dev-sweep::after,\n  .dag-node.status-running .nc-cat-network { animation: none; }',
    );
  });

  it('exports freeze it (the shed class kills the ::after)', () => {
    expect(css).toContain('.nc-preview-exported::after { content: none; }');
    expect(src).toContain("'.nc-preview, .nc-preview-audio, .nc-preview-file, .nc-preview-check'");
  });
});
