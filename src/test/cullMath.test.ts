// cullMath.test.ts — the culling decision, held to its hysteresis.
//
// The band is asymmetric by design (ENTER 200 / EXIT 500 screen px):
// a visible card holds on until it drifts well past the edge, a
// sleeping card wakes early on approach — a camera resting between the
// two margins never flaps anyone. Margins live in SCREEN px and land in
// root space by ÷zoom. Edges sleep only when both endpoints sleep AND
// the pair's union bbox clears the exit-expanded viewport (a long wire
// crossing the screen keeps painting).

import { describe, it, expect } from 'vitest';
import {
  CULL_MIN_NODES, CULL_ENTER_PX, CULL_EXIT_PX,
  cullMargins, boxSleeps, edgeSleeps,
  type CullBox, type CullViewport,
} from '../webview/cullMath';

const VP: CullViewport = { x0: 0, y0: 0, x1: 1000, y1: 800 };
const M1 = cullMargins(1);
const box = (x: number, y: number, w = 100, h = 60): CullBox => ({ x, y, w, h });

describe('the locked trio', () => {
  it('gate 150 nodes · band 200/500 screen px', () => {
    expect(CULL_MIN_NODES).toBe(150);
    expect(CULL_ENTER_PX).toBe(200);
    expect(CULL_EXIT_PX).toBe(500);
  });
});

describe('cullMargins — screen px ÷ zoom', () => {
  it('divides by the live zoom (near zoom shrinks the root-space band)', () => {
    expect(cullMargins(2)).toEqual({ enter: 100, exit: 250 });
    expect(cullMargins(0.5)).toEqual({ enter: 400, exit: 1000 });
  });

  it('an uninitialized camera (zoom 0) reads as 1, never Infinity', () => {
    expect(cullMargins(0)).toEqual({ enter: 200, exit: 500 });
  });
});

describe('boxSleeps — the hysteresis band', () => {
  it('a card in view never sleeps', () => {
    expect(boxSleeps(box(400, 300), VP, false, M1)).toBe(false);
    expect(boxSleeps(box(400, 300), VP, true, M1)).toBe(false);
  });

  it('a VISIBLE card holds on inside the exit margin…', () => {
    // 400px beyond the right edge: inside EXIT(500) — stays awake.
    expect(boxSleeps(box(1400, 300), VP, false, M1)).toBe(false);
  });

  it('…and sleeps only beyond it', () => {
    // 501px beyond the right edge: past EXIT — sleeps.
    expect(boxSleeps(box(1501, 300), VP, false, M1)).toBe(true);
  });

  it('a SLEEPING card stays asleep between the margins (no flap)', () => {
    // 400px out: a visible card would stay visible, a sleeping one
    // stays asleep — the band holds whatever state entered it.
    expect(boxSleeps(box(1400, 300), VP, true, M1)).toBe(true);
  });

  it('a SLEEPING card wakes at the enter margin', () => {
    // 150px out: inside ENTER(200) — wakes before it reaches the edge.
    expect(boxSleeps(box(1150, 300), VP, true, M1)).toBe(false);
  });

  it('every side of the viewport carries the band (top/left symmetric)', () => {
    expect(boxSleeps(box(-100 - 501, 300), VP, false, M1)).toBe(true);
    expect(boxSleeps(box(400, -60 - 501), VP, false, M1)).toBe(true);
    expect(boxSleeps(box(-100 - 400, 300), VP, false, M1)).toBe(false);
  });

  it('zoom divides the band: at 2× a 300 screen-px drift is past EXIT', () => {
    // 300 root px beyond the edge = 600 screen px at zoom 2 > EXIT 500.
    expect(boxSleeps(box(1301, 300), VP, false, cullMargins(2))).toBe(true);
    // The same drift at zoom 1 sits inside EXIT — awake.
    expect(boxSleeps(box(1301, 300), VP, false, M1)).toBe(false);
  });
});

describe('edgeSleeps — both endpoints AND the union bbox', () => {
  const far = cullMargins(1).exit;

  it('never sleeps while either endpoint is awake', () => {
    expect(edgeSleeps(box(-2000, 300), box(400, 300), false, VP, far)).toBe(false);
  });

  it('missing geometry never sleeps (a box the layout has not placed)', () => {
    expect(edgeSleeps(undefined, box(-2000, 300), true, VP, far)).toBe(false);
    expect(edgeSleeps(box(-2000, 300), undefined, true, VP, far)).toBe(false);
  });

  it('sleeps when both ends sit far off the SAME side', () => {
    expect(edgeSleeps(box(-2000, 100), box(-1800, 500), true, VP, far)).toBe(true);
  });

  it('a wire CROSSING the screen keeps painting (ends on opposite sides)', () => {
    // Both endpoints past EXIT on opposite sides — their union spans the
    // viewport, so the mid-span read is real and the edge stays awake.
    expect(edgeSleeps(box(-2000, 300), box(3000, 300), true, VP, far)).toBe(false);
  });

  it('a long vertical wire off to one side still sleeps', () => {
    expect(edgeSleeps(box(2000, -3000), box(2000, 3000), true, VP, far)).toBe(true);
  });
});
