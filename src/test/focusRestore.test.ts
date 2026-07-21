// focusRestore.test.ts — overlays hand the focus back (O14 · the
// connect seam, everywhere).
//
// dag.ts is the webview bundle (module-scope acquireVsCodeApi — not
// importable here), so the contract is pinned the way cardEnsemble
// pins the zones: source reads with exact anchors. What holds:
//   1 · ONE seam — restoreDomFocus is defined once, restores by id
//       (re-query, never a held DOM node) and falls back to the svg
//       root without a throw when the card is gone;
//   2 · the verb palette (N · ＋ Task · port-drop · edge splice)
//       blurs its input and fires the onClosed hook — Esc, pick and
//       click-away all funnel through close(), so every exit path
//       inherits the restore;
//   3 · the hook is wired to the seam once, at init;
//   4 · the K panel (openNodeActions) restores on close() — row
//       click, Enter, Esc, K — and on its toggle path;
//   5 · the connect picker keeps its own restore (the C1 lineage this
//       fix generalizes).
// The live round-trips are proven headed (scripts/media/a11y-probes.cjs
// §8) — this belt keeps the source honest between runs.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, '../webview/dag.ts'), 'utf8');

/** Slice [start, end) with existence asserted — anchor drift fails loud. */
function sliceOf(start: string, end: string): string {
  const a = src.indexOf(start);
  expect(a, `anchor missing: ${start}`).toBeGreaterThan(-1);
  const b = src.indexOf(end, a);
  expect(b, `anchor missing after ${start}: ${end}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

describe('the seam is ONE implementation (restoreDomFocus)', () => {
  it('is defined exactly once', () => {
    expect(src.match(/restoreDomFocus\(\): void/g)).toHaveLength(1);
  });

  it('re-queries the card by id and falls back to the svg root, no throw', () => {
    const seam = sliceOf('restoreDomFocus(): void', 'editorLineage');
    expect(seam).toContain('this.focusedId === null');
    expect(seam).toContain('CSS.escape(this.focusedId)');
    expect(seam).toContain("else { this.svg.node()?.focus({ preventScroll: true }); }");
  });

  it('never robs a live input (orphaned activeElement only, document focused)', () => {
    const seam = sliceOf('restoreDomFocus(): void', 'editorLineage');
    expect(seam).toContain('if (!document.hasFocus()) { return; }');
    expect(seam).toContain('if (!orphaned) { return; }');
  });
});

describe('the verb palette hands the focus back (VerbCmdk)', () => {
  const cls = sliceOf('class VerbCmdk {', 'const verbCmdk = new VerbCmdk();');

  it('close() blurs the input and fires the hook', () => {
    const close = cls.slice(cls.indexOf('close(): void {'), cls.indexOf('private move('));
    expect(close).toContain('this.input?.blur();');
    expect(close).toContain('this.onClosed?.();');
  });

  it('every exit funnels through close() — Esc, pick, click-away', () => {
    expect(cls).toContain("if (e.key === 'Escape') { this.close(); }");
    expect(cls).toContain('if (this.isOpen && this.el && !this.el.contains(e.target as Node)) { this.close(); }');
    const pick = cls.slice(cls.indexOf('private pick('), cls.indexOf('private header('));
    expect(pick).toContain('this.close();');
  });

  it('the hook is wired to the seam once, at init', () => {
    expect(src).toContain('verbCmdk.onClosed = () => renderer.restoreDomFocus();');
    expect(src.match(/verbCmdk\.onClosed =/g)).toHaveLength(1);
  });
});

describe('the K panel hands the focus back (openNodeActions)', () => {
  const panel = sliceOf('openNodeActions(): boolean {', 'openRunMenu(');

  it('restores on close() and on the K toggle path', () => {
    expect(panel).toContain("if (existing) { existing.remove(); this.restoreDomFocus(); return true; }");
    const close = panel.slice(panel.indexOf('const close = (): void => {'), panel.indexOf('const onKey'));
    expect(close).toContain('this.restoreDomFocus();');
  });
});

describe('the connect picker keeps its restore (C1 lineage)', () => {
  it('kbConnectCleanup still ends on the seam', () => {
    const cleanup = sliceOf('private kbConnectCleanup(): void {', 'nudgeFocused(');
    expect(cleanup).toContain('this.restoreDomFocus();');
  });
});
