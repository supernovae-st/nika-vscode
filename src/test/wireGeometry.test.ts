// wireGeometry.test.ts — the rounding pass, held to its recipe.
//
// One fold serves every wire (ELK sections AND the hand-drag local
// re-route): `L` to the corner's approach, a quadratic with control AT
// the corner, bend clamped to half of each adjacent segment. The clamp
// is the whole contract — close consecutive corners must degrade into
// an S-curve with zero overshoot, never a special case.

import { describe, it, expect } from 'vitest';
import { EDGE_BEND_RADIUS, roundedPolyline, type WirePoint } from '../webview/wireGeometry';

const p = (x: number, y: number): WirePoint => ({ x, y });

describe('roundedPolyline', () => {
  it('degenerate inputs collapse to nothing', () => {
    expect(roundedPolyline([])).toBe('');
    expect(roundedPolyline([p(4, 4)])).toBe('');
    // All-duplicate points dedupe below the 2-point floor.
    expect(roundedPolyline([p(4, 4), p(4, 4)])).toBe('');
  });

  it('a straight segment stays a bare M + L', () => {
    expect(roundedPolyline([p(0, 0), p(0, 90)])).toBe('M 0 0 L 0 90');
  });

  it('one right-angle corner bends at the full radius', () => {
    const d = roundedPolyline([p(0, 0), p(0, 100), p(80, 100)]);
    // Approach stops R short of the corner; the quadratic's control IS
    // the corner; the exit resumes R past it.
    const r = EDGE_BEND_RADIUS;
    expect(d).toBe(`M 0 0 L 0 ${100 - r} Q 0 100 ${r} 100 L 80 100`);
  });

  it('short segments clamp the bend to half the segment', () => {
    // Segments of 12 and 100: the bend may only eat 6 (12/2), not 14.
    const d = roundedPolyline([p(0, 0), p(0, 12), p(100, 12)]);
    expect(d).toBe('M 0 0 L 0 6 Q 0 12 6 12 L 100 12');
  });

  it('two close corners degrade into an S-curve, zero overshoot', () => {
    // A 10px jog between two long rails: each corner may only eat 5
    // (the jog's half) on BOTH its arms — the two quadratics meet
    // exactly at the jog's midpoint, no crossing back, no overshoot.
    const d = roundedPolyline([p(0, 0), p(0, 100), p(10, 100), p(10, 200)]);
    expect(d).toBe('M 0 0 L 0 95 Q 0 100 5 100 L 5 100 Q 10 100 10 105 L 10 200');
  });

  it('collinear middles pass straight through (no phantom corner)', () => {
    const d = roundedPolyline([p(0, 0), p(0, 50), p(0, 100), p(60, 100)]);
    expect(d).toBe(`M 0 0 L 0 50 L 0 ${100 - EDGE_BEND_RADIUS} Q 0 100 ${EDGE_BEND_RADIUS} 100 L 60 100`);
  });

  it('ELK section seams (duplicated junction points) dedupe defensively', () => {
    const dup = roundedPolyline([p(0, 0), p(0, 100), p(0, 100), p(80, 100)]);
    const clean = roundedPolyline([p(0, 0), p(0, 100), p(80, 100)]);
    expect(dup).toBe(clean);
  });

  it('the fold works for any polyline, not only axis-aligned rails', () => {
    // A diagonal corner still rounds — the local re-route never needs
    // this today, but the recipe must not care (geometry over cases).
    const d = roundedPolyline([p(0, 0), p(30, 40), p(60, 0)]);
    expect(d).toContain('Q 30 40');
    expect(d.startsWith('M 0 0 L ')).toBe(true);
  });
});
