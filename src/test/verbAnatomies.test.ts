// verbAnatomies.test.ts — the four voices, held structurally (W-D8 CI-1).
//
// dag.ts is the webview bundle (module-scope acquireVsCodeApi — not
// importable here), so the anatomy contract is pinned the way
// designTokensCss.test.ts pins the token vocabulary: source reads with
// exact anchors. What each pin holds:
//   1 · the ONE reorder — an invoke card appends its essence/body
//       BEFORE the mechanism line (the tool is the hero); every other
//       verb keeps sub-then-body; the agent band rides between the
//       pair and the why block;
//   2 · the loop-band promotion — cardFactsOf yields loop/budget to
//       the band under the SAME gate the build and the heights read
//       (hasAgentBand · one source, three consumers);
//   3 · heights — the band adds exactly AGENT_BAND_H (18) behind the
//       agent-only gate, the for_each row adds io metrics behind
//       hasForEachRow; no other verb's height expression changed;
//   4 · the CSS voices — quote-rail (infer, leaves with the quotes) ·
//       terminal frame (exec, HOLDS through the settle) · hero
//       essence (invoke) · the honest meter (agent);
//   5 · the settle law — the body swap only ADDS classes, so the
//       exec terminal frame survives `→ stdout` by construction.
// The live-DOM order is proven per-verb in the headed pixel run
// (scripts/media/harness.html) — this belt keeps the source honest
// between runs.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, '../webview/dag.ts'), 'utf8');
const css = readFileSync(join(__dirname, '../webview/dag.css'), 'utf8');
const harness = readFileSync(join(__dirname, '../../scripts/media/harness.html'), 'utf8');

/** The grand-mode section of buildCardHtml — from the reorder comment
 *  to the contract block (unique anchors; a rename fails loudly). */
function grandOrderRegion(): string {
  const start = src.indexOf("if (node.verb === 'invoke') {");
  const end = src.indexOf('this.appendCardWhy(host, node);', start);
  expect(start, 'the invoke reorder branch exists in buildCardHtml').toBeGreaterThan(-1);
  expect(end, 'appendCardWhy follows the verb-ordered pair').toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('the four voices · build order per verb (dag.ts)', () => {
  it('invoke is the ONE reorder — body (essence) before sub (mechanism)', () => {
    const region = grandOrderRegion();
    const invokeBranch = region.slice(0, region.indexOf('} else {'));
    const bodyAt = invokeBranch.indexOf("this.appendCardBody(host, node, 'grand')");
    const subAt = invokeBranch.indexOf('this.appendCardSub(host, node)');
    expect(bodyAt, 'invoke: body call present').toBeGreaterThan(-1);
    expect(subAt, 'invoke: sub call present').toBeGreaterThan(-1);
    expect(bodyAt, 'invoke: essence LEADS — body appends before sub').toBeLessThan(subAt);
  });

  it('every other verb keeps sub (mechanism/verdict) before body', () => {
    const region = grandOrderRegion();
    const elseBranch = region.slice(region.indexOf('} else {'));
    const subAt = elseBranch.indexOf('this.appendCardSub(host, node)');
    const bodyAt = elseBranch.indexOf("this.appendCardBody(host, node, 'grand')");
    expect(subAt).toBeGreaterThan(-1);
    expect(bodyAt).toBeGreaterThan(-1);
    expect(subAt, 'default anatomy: sub leads').toBeLessThan(bodyAt);
  });

  it('the agent band rides between the ordered pair and the why block', () => {
    const region = grandOrderRegion();
    expect(region).toContain('this.appendAgentBand(host, node);');
  });

  it('the min anatomy stays fixed — head · verdict · essence, no reorder', () => {
    const minRegion = src.slice(
      src.indexOf("if (mode === 'min') {", src.indexOf('private buildCardHtml')),
    );
    const subAt = minRegion.indexOf('this.appendCardSub(host, node)');
    const bodyAt = minRegion.indexOf("this.appendCardBody(host, node, 'min')");
    expect(subAt).toBeGreaterThan(-1);
    expect(bodyAt).toBeGreaterThan(-1);
    expect(subAt, 'min: verdict line leads for every verb').toBeLessThan(bodyAt);
  });
});

describe('the agent loop band · one gate, three consumers', () => {
  it('hasAgentBand gates on the agent verb AND a speaking loop', () => {
    expect(src).toContain("node.verb === 'agent' && node.agent !== undefined");
    expect(src).toContain('(node.agent.turns !== undefined || node.agent.budget !== undefined)');
  });

  it('cardFactsOf yields loop and budget to the band (prose facts stay)', () => {
    const facts = src.slice(src.indexOf('function cardFactsOf'), src.indexOf('function factLinesOf'));
    expect(facts).toContain('const banded = hasAgentBand(node);');
    expect(facts).toContain('!banded && af.turns !== undefined');
    expect(facts).toContain('!banded && af.budget !== undefined');
    // nudged/stalled/compose stay unconditional prose.
    expect(facts).toContain('af.nudges !== undefined && af.nudges > 0');
    expect(facts).toContain('af.stalled !== undefined');
    expect(facts).toContain('af.compose !== undefined');
  });

  it('nodeHeightOf adds exactly AGENT_BAND_H (18) behind the same gate', () => {
    expect(src).toContain('const AGENT_BAND_H = 18;');
    const heights = src.slice(src.indexOf('function nodeHeightOf'), src.indexOf('const VERB_ICONS'));
    expect(heights).toContain('if (hasAgentBand(node)) { h += AGENT_BAND_H; }');
  });

  it('the meter is honest — a bar only under a declared budget, a bare counter otherwise', () => {
    const band = src.slice(src.indexOf('private appendAgentBand'), src.indexOf('private appendCardWhy'));
    // The bar path requires the declared ceiling…
    expect(band).toContain('if (af.budget.budget !== undefined)');
    expect(band).toContain('af.budget.totalTokens / af.budget.budget');
    // …and the no-ceiling path paints text only (no fill element).
    const bare = band.slice(band.indexOf('} else {'));
    expect(bare).toContain('nc-ab-tk');
    expect(bare, 'no invented bar without a denominator').not.toContain('nc-ab-fill');
  });
});

describe('the for_each source row · io grammar, both consumers', () => {
  it('hasForEachRow rides the io display-prop and the client YAML fact', () => {
    expect(src).toContain('function hasForEachRow');
    expect(src).toContain('return node.forEachSource !== undefined;');
  });

  it('build renders it and nodeHeightOf budgets it with io metrics', () => {
    expect(src).toContain("fe.className = 'nc-io nc-foreach';");
    const heights = src.slice(src.indexOf('function nodeHeightOf'), src.indexOf('const VERB_ICONS'));
    expect(heights).toContain('if (hasForEachRow(node)) { h += IO_GAP + IO_H; }');
  });

  it('a sole wrapping interpolation unwraps for the row label', () => {
    expect(src).toContain('function forEachSourceLabel');
    expect(src).toContain(String.raw`/^\$\{\{\s*(.+?)\s*\}\}$/`);
  });
});

describe('the four voices · CSS (dag.css)', () => {
  it('infer wears the quote-rail — canon hue at 30%, gone when the output swaps in', () => {
    const rule = css.slice(
      css.indexOf('.dag-node.verb-infer .nc-body-prompt:not(.nc-body-live)'),
    );
    expect(rule.slice(0, 300)).toContain(
      'border-left: 2px solid color-mix(in srgb, var(--nk-verb-infer-canon) 30%, transparent);',
    );
  });

  it('exec wears the terminal frame — rail + ink wash + strict mono, NOT gated on live', () => {
    const at = css.indexOf('.dag-node.verb-exec .nc-body-cmd {');
    expect(at, 'the exec frame rule exists (and holds through the settle)').toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf('}', at));
    expect(rule).toContain('color-mix(in srgb, var(--nk-verb-exec-canon) 30%, transparent)');
    expect(rule).toContain('background: color-mix(in srgb, var(--nk-ink) 5%, transparent);');
    expect(rule).toContain('font-family: var(--nk-mono);');
  });

  it('invoke essence reads half a point larger (the sub voice · §1e)', () => {
    expect(css).toContain('.dag-node.verb-invoke .nc-essence { font-size: var(--nk-fs-sub); }');
    // The voice's value is the contract (10.5 · half above body 10).
    expect(css).toMatch(/--nk-fs-sub:\s*10\.5px/);
  });

  it('the band mirrors AGENT_BAND_H — 14px row + 4px gap = 18', () => {
    const at = css.indexOf('.nc-agent-band {');
    expect(at).toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf('}', at));
    expect(rule).toContain('margin-top: 4px;');
    expect(rule).toContain('height: 14px;');
  });

  it('the meter fill is the agent text voice, and forced-colors keeps it visible', () => {
    const fill = css.slice(css.indexOf('.nc-ab-fill {'), css.indexOf('.nc-ab-tk'));
    expect(fill).toContain('background: var(--nk-verb-agent-text);');
    expect(css).toContain('.nc-ab-fill { background: Highlight; }');
  });

  it('far LOD drops the band with the rest of the card story', () => {
    expect(css).toContain('body.lod-far .nc-agent-band,');
  });
});

describe('the settle law · the swap only ADDS classes', () => {
  it('no swap site ever removes a body kind class (the terminal frame survives)', () => {
    // The two swap sites add nc-body-live (± err); the restore removes
    // exactly those two — nc-body-cmd/-prompt/-args never leave.
    expect(src).toContain("classList.remove('nc-body-live', 'nc-body-err')");
    expect(src).not.toMatch(/classList\.remove\([^)]*nc-body-(cmd|prompt|args)/);
  });
});

describe('the harness fixture carries the four-voices proof shapes', () => {
  it('a fan-out node declares its for_each source', () => {
    expect(harness).toContain('forEachSource:');
  });

  it('the scripted run feeds the agent loop band (turns · routing · declared budget)', () => {
    expect(harness).toMatch(/agent: \{ turns: \d+, offered: \d+, universe: \d+, budget: \{ totalTokens: \d+, budget: \d+ \} \}/);
  });
});
