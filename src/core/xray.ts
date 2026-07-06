// xray.ts — ghost values: resolved run data inside the source (pure).
//
// « Select ${{ tasks.fetch.output.title }} and SEE what it was »: the
// v0.94 journal records every task's full output — this module drills
// those recorded values so the editor can show ` = "Hello HN"` right
// after the ref, from the last matching run. Honest by construction:
// no recorded value → no hint (never a guess); values the engine
// masked stay masked; previews truncate loudly with an ellipsis.

import { scanIslands, scanRefs } from './expr';

/** Parsed recorded outputs per task (JSON value, or the raw string). */
export function parseTraceOutputs(ndjson: string): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const raw of ndjson.split('\n')) {
    const line = raw.trim();
    if (line.length === 0) { continue; }
    let ev: unknown;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof ev !== 'object' || ev === null) { continue; }
    const e = ev as Record<string, unknown>;
    if (e.kind !== 'task_completed' && e.kind !== 'task_cache_hit') { continue; }
    if (!Array.isArray(e.fields)) { continue; }
    let task: string | undefined;
    let output: string | undefined;
    for (const f of e.fields as unknown[]) {
      if (typeof f !== 'object' || f === null) { continue; }
      const kv = f as Record<string, unknown>;
      if (kv.key === 'task' && typeof kv.value === 'string') { task = kv.value; }
      if (kv.key === 'output' && typeof kv.value === 'string') { output = kv.value; }
    }
    if (!task || output === undefined) { continue; }
    try {
      out.set(task, JSON.parse(output));
    } catch {
      out.set(task, output);
    }
  }
  return out;
}

/** Drill `a.b.0.c` into a JSON value — undefined when the path breaks. */
export function drillPath(value: unknown, segments: string[]): unknown {
  let cur = value;
  for (const seg of segments) {
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) { return undefined; }
      cur = cur[idx];
    } else if (typeof cur === 'object' && cur !== null && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

const MAX = 36;

/** One badge-safe rendering of a recorded value — loud ellipsis, no lies. */
export function formatXrayValue(v: unknown): string | undefined {
  if (v === undefined) { return undefined; }
  let s: string;
  if (typeof v === 'string') {
    const flat = v.replace(/\s+/g, ' ').trim();
    s = `"${flat}"`;
  } else {
    try {
      s = JSON.stringify(v);
    } catch {
      return undefined;
    }
    if (s === undefined) { return undefined; }
  }
  return s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s;
}

export interface XrayHint {
  /** Text offset the hint attaches AFTER (the ref's end). */
  offset: number;
  /** ` = value` — ready to render. */
  label: string;
  /** Full (bounded) value for the tooltip. */
  full: string;
}

/**
 * Every `${{ tasks.X… }}` ref in the text that resolves against the
 * recorded outputs → a ghost-value hint. Refs to tasks the run never
 * completed (or paths that don't exist in the recorded value) yield
 * NOTHING — silence is the honest state.
 */
export function xrayHintsForText(text: string, outputs: Map<string, unknown>): XrayHint[] {
  const hints: XrayHint[] = [];
  // The hint reads best AFTER the closing `}}` — `${{ tasks.x }} = "v"`,
  // not wedged between the path and the braces. Unclosed islands (still
  // being typed) keep the ref end.
  const islands = scanIslands(text);
  const hintOffsetFor = (refStart: number, refEnd: number): number => {
    const island = islands.find((i) => i.start <= refStart && refEnd <= i.end);
    return island === undefined || island.unclosed ? refEnd : island.end;
  };
  for (const ref of scanRefs(text)) {
    if (ref.root !== 'tasks' || ref.path.length === 0) { continue; }
    const taskId = ref.path[0];
    if (!outputs.has(taskId)) { continue; }
    const rest = ref.path.slice(1);
    // `tasks.x` and `tasks.x.output` both mean the recorded output;
    // deeper segments drill into it. `status`/other pseudo-fields are
    // not recorded values — skip them (no invention).
    let segments: string[];
    if (rest.length === 0 || rest[0] === 'output') {
      segments = rest.slice(1);
    } else {
      continue;
    }
    const value = drillPath(outputs.get(taskId), segments);
    const label = formatXrayValue(value);
    if (label === undefined) { continue; }
    let full: string;
    try {
      full = typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '';
    } catch {
      full = label;
    }
    if (full.length > 2000) { full = `${full.slice(0, 2000)}…`; }
    hints.push({ offset: hintOffsetFor(ref.start, ref.end), label: ` = ${label}`, full });
  }
  return hints;
}
