import { describe, expect, it } from 'vitest';
import { buildAddTaskPicks } from '../core/addTaskPicks';
import { FALLBACK_TOOL_BLURBS, VERB_ITEMS } from '../core/verbPalette';

/* ── the Add Task pick list — one vocabulary, both sources ────────────────────
   The editor command must speak the task palette's exact vocabulary: the 4
   verbs first (canonical order), then every builtin as a pre-wired invoke.
   Binary-fed when the catalog is present; the fallback vocabulary offline
   (capability-honest — the command never goes empty-handed). */

const CATS = {
  jq: { cat: 'data', desc: 'Run a jq program on JSON input.' },
  fetch: { cat: 'network', desc: 'HTTP request + content extraction.' },
  assert: { cat: 'core', desc: 'Fail-fast guard.' },
};

describe('buildAddTaskPicks', () => {
  it('verbs lead, in canonical order, glyphed', () => {
    const picks = buildAddTaskPicks(CATS);
    const verbs = picks.filter((p) => p.kind === 'verb');
    expect(verbs.map((v) => v.verb)).toEqual(VERB_ITEMS.map((v) => v.verb));
    expect(verbs[0].label).toBe('◇ infer');
    expect(verbs.every((v) => v.tool === undefined)).toBe(true);
  });

  it('builtins follow a separator, category-then-name order, invoke-wired', () => {
    const picks = buildAddTaskPicks(CATS);
    const sep = picks.findIndex((p) => p.kind === 'separator');
    expect(sep).toBe(VERB_ITEMS.length);
    const tools = picks.slice(sep + 1);
    expect(tools.map((t) => t.tool)).toEqual(['nika:assert', 'nika:jq', 'nika:fetch']);
    for (const t of tools) {
      expect(t.verb).toBe('invoke');
      expect(t.description).toContain('·');
    }
  });

  it('no catalog → the fallback vocabulary stands (never empty-handed)', () => {
    const picks = buildAddTaskPicks(undefined);
    const tools = picks.filter((p) => p.kind === 'tool');
    expect(tools.length).toBe(Object.keys(FALLBACK_TOOL_BLURBS).length);
    const jq = tools.find((t) => t.tool === 'nika:jq');
    expect(jq?.description).toBe(FALLBACK_TOOL_BLURBS.jq);
  });

  it('binary description wins over the fallback blurb', () => {
    const picks = buildAddTaskPicks(CATS);
    const jq = picks.find((t) => t.tool === 'nika:jq');
    expect(jq?.description).toBe('data · Run a jq program on JSON input.');
  });
});
