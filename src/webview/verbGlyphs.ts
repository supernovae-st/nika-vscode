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
  const def = VERB_GLYPHS[verb];
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
  return svg;
}
