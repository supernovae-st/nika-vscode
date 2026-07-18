// timelineModel.ts — the timeline lens's pure model (annexe G).
//
// The Gantt of the RUN'S TRUTH: one row per task in WAVE order (the
// plan grammar), a bar only where the fold recorded REAL clocks
// (startMs/endMs — a synthetic-clock task earns a row, never a lying
// bar), retries as sub-segments on the same row (attempt 1 faded ·
// the final one solid — the Temporal read), a cache hit as a hollow
// no-time mark, the parked question as the row's marker, and the $
// column blank when nothing was spent (a fake $0.00 is noise, the
// annexe-G law). Pure derive — the webview renders it dumbly.

import type { Attempt } from './attempts';
import type { FoldedStatus, RunModel } from './traceFold';

export interface TimelineSegment {
  startMs: number;
  endMs: number;
  /** The attempt that SETTLED the task — solid; earlier tries fade. */
  final: boolean;
}

export interface TimelineRow {
  id: string;
  status: FoldedStatus;
  /** The observed span — absent when the fold has no real clocks. */
  bar?: { startMs: number; endMs: number };
  /** Retry sub-segments (≥2 only when retries happened). */
  segments: TimelineSegment[];
  usd?: number;
  cached?: boolean;
  recoveredFrom?: string;
  pausedQuestion?: string;
  /** Didn't-run pedagogy (gate false · blocked by). */
  why?: string;
  /** Wave index (the left gutter groups rows by plan step). */
  wave: number;
}

export interface TimelineData {
  rows: TimelineRow[];
  /** The run's own span (model clocks first, else the rows' extent). */
  startMs: number;
  spanMs: number;
}

/** The one cost grammar: recorded spend renders; nothing renders
 *  EMPTY — a fake $0.00 is noise, not honesty. */
export function formatUsd(usd: number | undefined): string {
  if (usd === undefined || usd <= 0) { return ''; }
  const amount = usd.toFixed(usd < 0.1 ? 4 : 2)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return `$${amount}`;
}

/** Segment a row's bar by its attempt ladder: boundaries at each
 *  RETRIED attempt's clock; the last segment is the settling one. */
function segmentsFor(
  bar: { startMs: number; endMs: number } | undefined,
  attempts: Attempt[] | undefined,
): TimelineSegment[] {
  if (!bar) { return []; }
  const cuts = (attempts ?? [])
    .filter((a) => a.outcome === 'retried' && a.atMs !== undefined
      && a.atMs > bar.startMs && a.atMs < bar.endMs)
    .map((a) => a.atMs as number)
    .sort((a, b) => a - b);
  if (cuts.length === 0) {
    return [{ startMs: bar.startMs, endMs: bar.endMs, final: true }];
  }
  const bounds = [bar.startMs, ...cuts, bar.endMs];
  const out: TimelineSegment[] = [];
  for (let i = 0; i + 1 < bounds.length; i += 1) {
    out.push({
      startMs: bounds[i],
      endMs: bounds[i + 1],
      final: i + 2 === bounds.length,
    });
  }
  return out;
}

export function buildTimeline(
  model: RunModel,
  ladders: Map<string, Attempt[]>,
  waves: string[][],
): TimelineData {
  const waveOf = new Map<string, number>();
  waves.forEach((wave, i) => { for (const id of wave) { waveOf.set(id, i); } });

  const ordered = [...model.tasks.values()].sort((a, b) => {
    const wa = waveOf.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const wb = waveOf.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return wa === wb ? a.id.localeCompare(b.id) : wa - wb;
  });

  const rows: TimelineRow[] = ordered.map((t) => {
    const bar = t.startMs !== undefined && t.endMs !== undefined && t.endMs > t.startMs
      ? { startMs: t.startMs, endMs: t.endMs }
      : undefined;
    const row: TimelineRow = {
      id: t.id,
      status: t.status,
      segments: segmentsFor(bar, ladders.get(t.id)),
      wave: waveOf.get(t.id) ?? waves.length,
      ...(bar ? { bar } : {}),
      ...(t.usd !== undefined && t.usd > 0 ? { usd: t.usd } : {}),
      ...(t.cached ? { cached: true } : {}),
      ...(t.recoveredFrom !== undefined ? { recoveredFrom: t.recoveredFrom } : {}),
    };
    const paused = (model as { paused?: { task: string; message?: string } }).paused;
    if (paused?.task === t.id) {
      row.pausedQuestion = paused.message ?? 'awaiting an answer';
    }
    const why = t.whyWhen ? `gate false: ${t.whyWhen}`
      : t.blockedBy ? `blocked by ${t.blockedBy}` : undefined;
    if (why !== undefined) { row.why = why; }
    return row;
  });

  // The run's span: the model's own clocks first, else the rows' extent.
  const barRows = rows.filter((r) => r.bar);
  const start = model.startMs
    ?? (barRows.length > 0 ? Math.min(...barRows.map((r) => r.bar!.startMs)) : 0);
  const end = model.endMs
    ?? (barRows.length > 0 ? Math.max(...barRows.map((r) => r.bar!.endMs)) : start);
  return { rows, startMs: start, spanMs: Math.max(end - start, 1) };
}
