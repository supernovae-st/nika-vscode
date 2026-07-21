import { describe, expect, it } from 'vitest';
import { CANVAS_KEYMAP } from '../core/canvasKeymap';

describe('CANVAS_KEYMAP (one source, two surfaces)', () => {
  it('keys are unique and every row is named', () => {
    const keys = CANVAS_KEYMAP.map(([k]) => k);
    expect(new Set(keys).size).toBe(keys.length);
    for (const [key, what] of CANVAS_KEYMAP) {
      expect(key.length).toBeGreaterThan(0);
      expect(what.length).toBeGreaterThan(0);
    }
  });

  it('carries the a11y-critical gestures (connect · nudge · help · peek)', () => {
    const keys = new Set(CANVAS_KEYMAP.map(([k]) => k));
    for (const k of ['C', '⌥←↑↓→', '⌥F1', 'Space', 'Esc', 'Tab', '?']) {
      expect(keys.has(k)).toBe(true);
    }
  });
});
