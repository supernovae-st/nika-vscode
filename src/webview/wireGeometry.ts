// Wire geometry — the rounded-orthogonal language. Pure, DOM-free,
// vitest-covered.
//
// ELK routes ORTHOGONAL polylines (its lane logic is the readability
// asset: aligned rails, ~90° crossings); the esthetic is fixed at the
// render — one rounding pass folds every corner. The split is the
// yFiles/draw.io construction: routers emit polylines, styles round
// them. The SAME fold serves the hand-drag local re-route, so the wire
// language never forks on provenance (the n8n law: geometry decides,
// provenance never does).

/** A polyline point (the ELK section point shape). */
export interface WirePoint { x: number; y: number }

/** One corner radius for every wire, auto-routed or hand-dragged.
 *  14 sits between n8n's 16 and this canvas's card density. */
export const EDGE_BEND_RADIUS = 14;

/** Fold a polyline into a rounded SVG path: `L` to each corner's
 *  approach point, then a QUADRATIC Bézier with its control AT the
 *  corner (the React Flow getBend recipe · visually an arc at r ≤ 16,
 *  cheaper than an `A`). The bend clamps to half of each adjacent
 *  segment, so two close consecutive corners degrade into an S-curve
 *  with zero special cases and zero overshoot. Duplicate and collinear
 *  points drop defensively (ELK section seams repeat the junction). */
export function roundedPolyline(points: WirePoint[], radius = EDGE_BEND_RADIUS): string {
  const pts: WirePoint[] = [];
  for (const p of points) {
    const prev = pts[pts.length - 1];
    if (prev !== undefined && Math.abs(prev.x - p.x) < 0.01 && Math.abs(prev.y - p.y) < 0.01) {
      continue;
    }
    pts.push(p);
  }
  if (pts.length < 2) { return ''; }
  const parts = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const ab = Math.hypot(b.x - a.x, b.y - a.y);
    const bc = Math.hypot(c.x - b.x, c.y - b.y);
    // A collinear (or degenerate) middle passes straight through.
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const bend = Math.min(ab / 2, bc / 2, radius);
    if (ab < 0.01 || bc < 0.01 || Math.abs(cross) < 0.01 || bend < 0.5) {
      parts.push(`L ${b.x} ${b.y}`);
      continue;
    }
    const inX = b.x - ((b.x - a.x) / ab) * bend;
    const inY = b.y - ((b.y - a.y) / ab) * bend;
    const outX = b.x + ((c.x - b.x) / bc) * bend;
    const outY = b.y + ((c.y - b.y) / bc) * bend;
    parts.push(`L ${inX} ${inY} Q ${b.x} ${b.y} ${outX} ${outY}`);
  }
  const last = pts[pts.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(' ');
}
