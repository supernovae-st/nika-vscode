// cardEnsemble.test.ts — the grand ENSEMBLE, held structurally (W-D11
// CI-2.5 · the ElevenLabs grammar: header above, pill below).
//
// dag.ts is the webview bundle (module-scope acquireVsCodeApi — not
// importable here), so the contract is pinned the way verbAnatomies
// pins the four voices: source reads with exact anchors. What holds:
//   1 · the zones — GRAND_HEAD_H 24 · PILL_GAP 8 · PILL_H 36, and the
//       grand return that joins them around the card sum (min keeps
//       the in-frame head + divider and never grows the zones);
//   2 · the footprint — node-bg, foreignObject and the out port span
//       the WHOLE ensemble (nodeHeightOf) at enter, update and
//       in-place sync: the drag grabs the card by its floating title
//       because the hit rect covers the header zone;
//   3 · the deck — fan-out ghost sheets track the CARD frame
//       (deckYOf/deckHeightOf), never the pill;
//   4 · the CSS mirror — the 24/68 arithmetic, the absolute head band,
//       the pill's zone, the far :not gate, the mid visibility, the
//       reduced-motion gate on the pill entrance, forced-colors;
//   5 · the knob moves — the engine chip joins the grand header, the
//       params row keeps only the gate, the pill carries cost/⌀ and
//       the action cluster (the journeys' .nc-x-actions probe holds).
// The live geometry is proven in the headed pixel run (scripts/media/
// harness.html) — this belt keeps the source honest between runs.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, '../webview/dag.ts'), 'utf8');
const css = readFileSync(join(__dirname, '../webview/dag.css'), 'utf8');

describe('the ensemble zones · TS constants (dag.ts)', () => {
  it('pins the exact zone heights — header 24, gap 8, pill 36', () => {
    expect(src).toContain('const GRAND_HEAD_H = 24;');
    expect(src).toContain('const PILL_GAP = 8;');
    expect(src).toContain('const PILL_H = 36;');
    expect(src).toContain('const GRAND_EXTRA = GRAND_HEAD_H + PILL_GAP + PILL_H;');
  });

  it('grand joins the zones around the card sum at the return', () => {
    expect(src).toContain('return GRAND_HEAD_H + Math.max(h, NODE_HEIGHT) + PILL_GAP + PILL_H;');
  });

  it('min keeps the in-frame head + divider and never grows the zones', () => {
    const fn = src.slice(
      src.indexOf('function nodeHeightOf'),
      src.indexOf('function deckYOf'),
    );
    const minBranch = fn.slice(fn.indexOf("if (mode === 'min') {"), fn.indexOf('// grand:'));
    expect(minBranch).toContain('h += HEAD_H + DIVIDER_H;');
    expect(minBranch).toContain('return Math.max(h, NODE_HEIGHT);');
    expect(minBranch).not.toContain('GRAND_HEAD_H');
    expect(minBranch).not.toContain('PILL_H');
  });

  it('the sum stays order-independent — gated += terms, zones only at the return', () => {
    const fn = src.slice(
      src.indexOf('function nodeHeightOf'),
      src.indexOf('function deckYOf'),
    );
    // The zones appear exactly once each in the whole function: at the
    // grand return (never interleaved into the content sum).
    expect(fn.match(/GRAND_HEAD_H/g)).toHaveLength(1);
    expect(fn.match(/PILL_H/g)).toHaveLength(1);
    expect(fn.match(/PILL_GAP/g)).toHaveLength(1);
  });
});

describe('the footprint · hit-test covers the floating header (dag.ts)', () => {
  it('node-bg, foreignObject and the out port span the WHOLE ensemble', () => {
    // enter + update: the ensemble height on all three.
    expect(src).toContain("merged.select('rect.node-bg').attr('height', (d) => nodeHeightOf(d));");
    expect(src).toContain("merged.select('foreignObject').attr('height', (d) => nodeHeightOf(d));");
    expect(src).toContain("merged.select('.nc-port-out').attr('cy', (d) => nodeHeightOf(d));");
    // in-place sync (peek · live refresh): same law.
    const sync = src.slice(src.indexOf('private syncFrameHeights'), src.indexOf('private cardRefreshQueue'));
    expect(sync).toContain("g.select('rect.node-bg').attr('height', h);");
    expect(sync).toContain("g.select('foreignObject').attr('height', h);");
    expect(sync).toContain("g.select('.nc-port-out').attr('cy', h);");
  });

  it('the drag backstop is the transparent node-bg — the fO opts out of pointing', () => {
    // The head floats INSIDE the footprint, so the full-height node-bg
    // IS the header's drag surface (pointer-events design).
    expect(css).toMatch(/\.node-fo \{[^}]*pointer-events: none;/);
    expect(css).toMatch(/\.dag-node \.node-bg \{[^}]*fill: transparent;/);
  });

  it('the deck tracks the CARD frame, never the pill', () => {
    expect(src).toContain('function deckYOf(');
    expect(src).toContain("return off + (mode === 'grand' ? GRAND_HEAD_H : 0);");
    expect(src).toContain('function deckHeightOf(');
    expect(src).toContain("return nodeHeightOf(node, mode) - (mode === 'grand' ? GRAND_EXTRA : 0);");
    expect(src).toContain("merged.selectAll<SVGRectElement, DagNode>('rect.node-stack').attr('height', (d) => deckHeightOf(d));");
    const sync = src.slice(src.indexOf('private syncFrameHeights'), src.indexOf('private cardRefreshQueue'));
    expect(sync).toContain("g.selectAll('rect.node-stack').attr('height', grand ? h - GRAND_EXTRA : h);");
  });
});

describe('the CSS mirror · zones and gates (dag.css)', () => {
  it('the card frame drops 24 and shaves 68 — the TS arithmetic, mirrored', () => {
    expect(css).toContain('body:not(.lod-far) .nc-mode-grand {');
    expect(css).toContain('margin-top: 24px;');
    expect(css).toContain('height: calc(100% - 68px);');
  });

  it('the head floats as an 18px band at -24 (6px of air above the frame)', () => {
    const band = css.slice(
      css.indexOf('body:not(.lod-far) .nc-mode-grand .nc-head {'),
      css.indexOf('.nc-engine {'),
    );
    expect(band).toContain('position: absolute;');
    expect(band).toContain('top: -24px;');
    expect(band).toContain('height: 18px;');
  });

  it('the pill owns its reserved zone — top 100% + 8, height 36', () => {
    const pill = css.slice(css.indexOf('.nc-pill {'), css.indexOf('.nc-pill-fact {'));
    expect(pill).toContain('top: calc(100% + 8px);');
    expect(pill).toContain('height: 36px;');
    expect(pill).toContain('border-radius: 18px;');
    // floating = the only shadow wearers (elevation grammar).
    expect(pill).toContain('box-shadow: var(--nk-card-shadow-hover);');
  });

  it('LOD: mid hides the pill with the dial rows, far kills it and re-frames the head', () => {
    expect(css).toContain('body.lod-mid .nc-pill { visibility: hidden; }');
    expect(css).toContain('body.lod-far .nc-pill { display: none; }');
    // the far gate: every float rule is scoped body:not(.lod-far), so
    // the map read gets the in-frame centered head for free.
    expect(css).not.toMatch(/^\.nc-mode-grand \{/m);
  });

  it('the pill entrance rides prefers-reduced-motion: no-preference', () => {
    const gate = css.indexOf('@media (prefers-reduced-motion: no-preference) {\n  .nc-pill {');
    expect(gate).toBeGreaterThan(-1);
    expect(css.slice(gate, gate + 400)).toContain('@starting-style');
  });

  it('forced-colors: the pill earns a CanvasText border and drops the shadow', () => {
    const fc = css.slice(css.indexOf('@media (forced-colors: active) {\n  .nc-pill {'));
    expect(fc).toContain('border: 1px solid CanvasText !important;');
    expect(fc).toContain('box-shadow: none !important;');
  });

  it('the exported pill keeps its theme — the hover shadow token is baked', () => {
    expect(src).toContain("'nk-card-shadow-hover'");
  });
});

describe('the knob moves · one home per fact (dag.ts)', () => {
  it('the grand header gains the engine chip; min never does', () => {
    const head = src.slice(
      src.indexOf('private buildCardHtml'),
      src.indexOf('// min — head · verdict · one essence line'),
    );
    expect(head).toContain("if (mode === 'grand') {");
    expect(head).toContain('const engine = this.buildEngineChip(node);');
    expect(head).toContain('header.append(glyph, id, auditChip, staleChip, engine, badge, st);');
  });

  it('the params row keeps only the when: gate', () => {
    const fn = src.slice(src.indexOf('function hasParamsRow'), src.indexOf('function hasIoRow'));
    expect(fn).toContain('return node.when !== undefined;');
    expect(fn).not.toContain('node.model');
    expect(fn).not.toContain('costMin');
  });

  it('the pill carries the declared knobs, the cost, the ⌀ and the action cluster', () => {
    const pill = src.slice(src.indexOf('private appendPill'), src.indexOf('private buildCardHtml'));
    expect(pill).toContain('mediaDeclareOf(identity.builtin, node.argsPreview)');
    expect(pill).toContain('d.ratioLabel');
    expect(pill).toContain('d.voice');
    expect(pill).toContain('d.method');
    expect(pill).toContain('node.costMin != null && node.costMax != null');
    expect(pill).toContain('node.avgMs !== undefined && node.avgRuns');
    expect(pill).toContain('this.appendCardActions(pill, node);');
  });

  it('the action cluster keeps its .nc-x-actions identity (the journeys probe)', () => {
    const acts = src.slice(src.indexOf('private appendCardActions'), src.indexOf('private buildEngineChip'));
    expect(acts).toContain("rowEl.className = 'nc-x-actions';");
    // the ⋯ door is unconditional — a pill always offers every action.
    expect(acts).toContain("btn('nc-x-panel', '\\u22ef'");
  });

  it('the grand build ends on the pill — the ensemble is the last append', () => {
    const tail = src.slice(src.indexOf('this.appendCardChips(host, node);'));
    expect(tail.slice(0, 400)).toContain('this.appendPill(host, node);');
  });
});
