import { describe, expect, it } from 'vitest';
import { refinedIntent, slugifyIntent } from '../core/generateStaging';

describe('slugifyIntent (save-name suggestion · engine-id-safe)', () => {
  it('kebab-cases a normal intent', () => {
    expect(slugifyIntent('Fetch the top HN stories and summarize each'))
      .toBe('fetch-the-top-hn-stories-and-summarize-e');
  });

  it('is always ^[a-z0-9-]+$ (the newWorkflow validator)', () => {
    for (const s of ['Héllo, Wörld! 42', '   spaces   ', 'a/b\\c:d', 'UPPER']) {
      expect(slugifyIntent(s)).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('never leaves a trailing hyphen after the length clamp', () => {
    // 40th char lands on a separator — the clamp must not leave it dangling.
    const s = slugifyIntent('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa boom');
    expect(s.endsWith('-')).toBe(false);
  });

  it('falls back to generated on empty / punctuation-only', () => {
    expect(slugifyIntent('')).toBe('generated');
    expect(slugifyIntent('!!!  ...')).toBe('generated');
  });
});

describe('refinedIntent (the refine turn keeps the whole goal)', () => {
  it('anchors the original intent and appends the delta', () => {
    const out = refinedIntent('build a scraper', 'add a summarize step');
    expect(out.startsWith('build a scraper')).toBe(true);
    expect(out).toContain('Refinement (apply to the workflow above): add a summarize step');
  });

  it('returns the base unchanged when the refinement is blank', () => {
    expect(refinedIntent('build a scraper', '   ')).toBe('build a scraper');
  });
});
