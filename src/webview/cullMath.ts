// Viewport culling math (annexe H §3) — pure, DOM-free, vitest-covered.
//
// The canvas keeps every card in the DOM and lets offscreen ones SLEEP
// (`.nk-offscreen { display: none }`): no unmount, no re-entry cost, and
// the class carries zero color by construction. These helpers decide WHO
// sleeps; the renderer owns when a pass runs (rAF-coalesced) and who is
// protected (selected · sim seed · drag · follow target · pinned grand).

/** A laid-out card box in root space (the layoutBox entry shape). */
export interface CullBox { x: number; y: number; w: number; h: number }

/** The viewport in root space (viewportRootRect's shape). */
export interface CullViewport { x0: number; y0: number; x1: number; y1: number }

/** Culling only exists on big graphs — below this, zero behavior change. */
export const CULL_MIN_NODES = 150;

/** Hysteresis band, SCREEN px: a sleeping card wakes when it comes within
 *  ENTER of the viewport edge; a visible card sleeps only once it drifts
 *  beyond EXIT. EXIT > ENTER, so a camera resting on a boundary never
 *  flaps a card (the applyLod band construction, applied to space). */
export const CULL_ENTER_PX = 200;
export const CULL_EXIT_PX = 500;

/** Screen-px margins land in root space by ÷zoom (guarded: a zero/absent
 *  zoom means the camera never initialized — treat as 1). */
export function cullMargins(zoom: number): { enter: number; exit: number } {
  const k = zoom > 0 ? zoom : 1;
  return { enter: CULL_ENTER_PX / k, exit: CULL_EXIT_PX / k };
}

/** True when the box sits ENTIRELY beyond the viewport expanded by m. */
function outsideBy(b: CullBox, vp: CullViewport, m: number): boolean {
  return b.x + b.w < vp.x0 - m
    || b.x > vp.x1 + m
    || b.y + b.h < vp.y0 - m
    || b.y > vp.y1 + m;
}

/** The hysteresis decision for one card. `wasAsleep` selects which margin
 *  binds: visible cards hold on until EXIT, sleeping cards wake at ENTER
 *  — between the two margins the current state persists. */
export function boxSleeps(
  b: CullBox,
  vp: CullViewport,
  wasAsleep: boolean,
  m: { enter: number; exit: number },
): boolean {
  return outsideBy(b, vp, wasAsleep ? m.enter : m.exit);
}

/** An edge sleeps ONLY when both endpoints sleep (the spec's necessary
 *  condition) AND the pair's union bbox clears the EXIT-expanded viewport
 *  — a long wire crossing the screen with both ends far offscreen must
 *  keep painting (the mid-span read is real at near zoom). Routed detours
 *  beyond the union ride inside the EXIT margin. */
export function edgeSleeps(
  s: CullBox | undefined,
  t: CullBox | undefined,
  bothEndsAsleep: boolean,
  vp: CullViewport,
  exitMargin: number,
): boolean {
  if (!bothEndsAsleep || s === undefined || t === undefined) { return false; }
  const union: CullBox = {
    x: Math.min(s.x, t.x),
    y: Math.min(s.y, t.y),
    w: Math.max(s.x + s.w, t.x + t.w) - Math.min(s.x, t.x),
    h: Math.max(s.y + s.h, t.y + t.h) - Math.min(s.y, t.y),
  };
  return outsideBy(union, vp, exitMargin);
}
