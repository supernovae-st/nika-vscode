// verbGlyphs.ts — the 4 house verb glyphs, built as safe DOM (never innerHTML).
//
// Vendored from the Nika icon ontology (nika.sh/brand/icons · the SuperNovae
// house set): infer=sparkle · exec=console · invoke=api-connection ·
// agent=agent-graph. Path data is 24-grid, stroke-2, currentColor — the
// keycap/cmdk hue (--dv-hue) inks them for free. Unknown verbs return null
// so callers keep the unicode fallback (forward-compat with future graph
// projections, same contract as verbIcon).

const SVG_NS = 'http://www.w3.org/2000/svg';

interface VerbGlyphDef {
  /** stroked path d= runs (round caps/joins unless noCap) */
  paths: { d: string; noCap?: boolean }[];
  /** stroked circles (the agent graph nodes) */
  circles?: { cx: number; cy: number; r: number }[];
}

const VERB_GLYPHS: Record<string, VerbGlyphDef> = {
  infer: {
    paths: [
      {
        d: 'M21 12.5C14.75 12.5 12 15.4028 12 22C12 15.4028 9.25 12.5 3 12.5C9.25 12.5 12 9.59722 12 3C12 9.59722 14.75 12.5 21 12.5Z',
        noCap: true,
      },
    ],
  },
  exec: {
    paths: [
      {
        d: 'M7.5 8L9.25 9.75L7.5 11.5M12 11.5H14M7 20H17C18.6569 20 20 18.6569 20 17V7C20 5.34315 18.6569 4 17 4H7C5.34315 4 4 5.34315 4 7V17C4 18.6569 5.34315 20 7 20Z',
      },
    ],
  },
  invoke: {
    paths: [
      {
        d: 'M4 12C4 16.4183 7.58172 20 12 20C14.9611 20 17.5465 18.3912 18.9297 16M4 12C4 7.58172 7.58172 4 12 4C14.9611 4 17.5465 5.60879 18.9297 8M4 12H2M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12ZM16 12H22',
      },
    ],
  },
  agent: {
    paths: [
      { d: 'M12 8.5V12M12 12H9C7.34315 12 6 13.3431 6 15V15.5M12 12H15C16.6569 12 18 13.3431 18 15V15.5' },
    ],
    circles: [
      { cx: 12, cy: 6, r: 2.5 },
      { cx: 6, cy: 18, r: 2.5 },
      { cx: 18, cy: 18, r: 2.5 },
    ],
  },
};

/**
 * Build the verb's house glyph as an SVG element (currentColor ink), or
 * null for an unknown verb — the caller keeps its text fallback.
 */
export function makeVerbGlyph(verb: string, size: number): SVGSVGElement | null {
  return buildGlyph(VERB_GLYPHS[verb], size);
}

/** Shared 24-grid stroke-2 builder (verbs + tool categories). */
interface GlyphDef extends VerbGlyphDef {
  /** currentColor-FILLED dots (the hub center · the frame sun). */
  dots?: { cx: number; cy: number; r: number }[];
}

function buildGlyph(def: GlyphDef | undefined, size: number): SVGSVGElement | null {
  if (!def) { return null; }
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (const p of def.paths) {
    const el = document.createElementNS(SVG_NS, 'path');
    el.setAttribute('d', p.d);
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '2');
    el.setAttribute('stroke-linejoin', 'round');
    if (!p.noCap) { el.setAttribute('stroke-linecap', 'round'); }
    svg.appendChild(el);
  }
  for (const c of def.circles ?? []) {
    const el = document.createElementNS(SVG_NS, 'circle');
    el.setAttribute('cx', String(c.cx));
    el.setAttribute('cy', String(c.cy));
    el.setAttribute('r', String(c.r));
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '2');
    svg.appendChild(el);
  }
  for (const d of def.dots ?? []) {
    const el = document.createElementNS(SVG_NS, 'circle');
    el.setAttribute('cx', String(d.cx));
    el.setAttribute('cy', String(d.cy));
    el.setAttribute('r', String(d.r));
    el.setAttribute('fill', 'currentColor');
    svg.appendChild(el);
  }
  return svg;
}

// The 6 builtin-category icons — the same 24-grid stroke-2 house
// language as the verbs (core=hub · file=doc · data=braces ·
// network=globe · introspection=lens · media=frame). currentColor rides
// each surface's hue; unknown categories return null → unicode fallback.
const CATEGORY_GLYPHS: Record<string, GlyphDef> = {
  core: {
    paths: [],
    circles: [{ cx: 12, cy: 12, r: 7.5 }],
    dots: [{ cx: 12, cy: 12, r: 2 }],
  },
  file: {
    paths: [
      { d: 'M8 3H14L19 8V19C19 20.1046 18.1046 21 17 21H8C6.89543 21 6 20.1046 6 19V5C6 3.89543 6.89543 3 8 3Z' },
      { d: 'M14 3V8H19M9.5 13H15.5M9.5 16.5H15.5' },
    ],
  },
  data: {
    paths: [
      { d: 'M9 4C7 4 7 6 7 8C7 10 6 11 4.5 12C6 13 7 14 7 16C7 18 7 20 9 20' },
      { d: 'M15 4C17 4 17 6 17 8C17 10 18 11 19.5 12C18 13 17 14 17 16C17 18 17 20 15 20' },
    ],
  },
  network: {
    paths: [
      { d: 'M4 12H20M12 4C14.8 6.7 14.8 17.3 12 20M12 4C9.2 6.7 9.2 17.3 12 20' },
    ],
    circles: [{ cx: 12, cy: 12, r: 8 }],
  },
  introspection: {
    paths: [{ d: 'M15.8 15.8L20 20' }],
    circles: [{ cx: 11, cy: 11, r: 5.5 }],
  },
  media: {
    paths: [
      { d: 'M5.5 4H18.5C19.3284 4 20 4.67157 20 5.5V18.5C20 19.3284 19.3284 20 18.5 20H5.5C4.67157 20 4 19.3284 4 18.5V5.5C4 4.67157 4.67157 4 5.5 4Z' },
      { d: 'M6.5 16L10.5 11.5L13.5 14.5L15.5 12.5L17.8 15.3' },
    ],
    dots: [{ cx: 9, cy: 8.6, r: 1.4 }],
  },
};

/**
 * Build a builtin CATEGORY's house icon (currentColor ink), or null for
 * an unknown category — the caller keeps the unicode fallback.
 */
export function makeCategoryGlyph(cat: string, size: number): SVGSVGElement | null {
  return buildGlyph(CATEGORY_GLYPHS[cat], size);
}
