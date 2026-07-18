// extractModes.test.ts — the teaching register (spec stdlib mirror).
//
// The law: the register teaches, the engine lists. Facts carry an
// output shape and a use line for every canonical mode; ranking
// follows the spec table (markdown leads); an unknown engine mode is
// tolerated — ranked last, never invented into the facts.

import { describe, it, expect } from 'vitest';
import { EXTRACT_MODE_FACTS, extractModeRank } from '../core/extractModes';

describe('EXTRACT_MODE_FACTS — the spec stdlib mirror', () => {
  it('carries the 9 canonical modes + raw, each with output and use', () => {
    expect(EXTRACT_MODE_FACTS.size).toBe(10);
    for (const [mode, fact] of EXTRACT_MODE_FACTS) {
      expect(mode).toMatch(/^[a-z]+$/);
      expect(fact.output.length).toBeGreaterThan(3);
      expect(fact.use.length).toBeGreaterThan(8);
    }
  });

  it('markdown leads (the content-scraping default), raw closes', () => {
    expect(extractModeRank('markdown')).toBe(0);
    expect(extractModeRank('raw')).toBe(9);
    expect(extractModeRank('jq')).toBeLessThan(extractModeRank('sitemap'));
  });

  it('an unknown engine mode ranks after every known one — tolerated, never invented', () => {
    expect(extractModeRank('hologram')).toBe(EXTRACT_MODE_FACTS.size);
    expect(EXTRACT_MODE_FACTS.get('hologram')).toBeUndefined();
  });
});
