// canvasState.ts — the per-directory sidecar recording task fingerprints
// at their last successful run: `.nika/canvas-state.json`, keyed by
// workflow basename. NEVER inside the workflow YAML (the YAML is the
// language; this is editor memory). Parse/merge are pure; the two fs
// helpers are the only IO and stay try/catch-silent — staleness is
// garnish, it must never break a graph load.

import * as fs from 'fs';
import * as path from 'path';

export interface WorkflowRunRecord {
  /** task id → fingerprint at its last SUCCESS. */
  taskHashes: Record<string, string>;
  updatedAt: string;
}

export interface CanvasState {
  version: 1;
  workflows: Record<string, WorkflowRunRecord>;
}

/** Sidecar path for a workflow file (same dir · .nika/canvas-state.json). */
export function canvasStatePath(workflowFsPath: string): string {
  return path.join(path.dirname(workflowFsPath), '.nika', 'canvas-state.json');
}

/** Strict parse — anything malformed returns undefined (caller shows no badges). */
export function parseCanvasState(json: string): CanvasState | undefined {
  try {
    const value: unknown = JSON.parse(json);
    if (typeof value !== 'object' || value === null) { return undefined; }
    const v = value as { version?: unknown; workflows?: unknown };
    if (v.version !== 1 || typeof v.workflows !== 'object' || v.workflows === null) { return undefined; }
    for (const rec of Object.values(v.workflows as Record<string, unknown>)) {
      const r = rec as { taskHashes?: unknown };
      if (typeof r !== 'object' || r === null || typeof r.taskHashes !== 'object' || r.taskHashes === null) {
        return undefined;
      }
    }
    return value as CanvasState;
  } catch {
    return undefined;
  }
}

/** Merge one run's SUCCESS fingerprints into the state (pure). */
export function mergeRunHashes(
  state: CanvasState | undefined,
  workflowKey: string,
  hashes: ReadonlyMap<string, string>,
  now: string,
): CanvasState {
  const base: CanvasState = state ?? { version: 1, workflows: {} };
  const prev = base.workflows[workflowKey]?.taskHashes ?? {};
  const taskHashes = { ...prev };
  for (const [id, hash] of hashes) { taskHashes[id] = hash; }
  return {
    version: 1,
    workflows: {
      ...base.workflows,
      [workflowKey]: { taskHashes, updatedAt: now },
    },
  };
}

/** Recorded fingerprints for a workflow file — empty map when none. */
export function loadRecordedHashes(workflowFsPath: string): Map<string, string> {
  try {
    const state = parseCanvasState(fs.readFileSync(canvasStatePath(workflowFsPath), 'utf-8'));
    const rec = state?.workflows[path.basename(workflowFsPath)];
    return rec ? new Map(Object.entries(rec.taskHashes)) : new Map();
  } catch {
    return new Map();
  }
}

/** Persist SUCCESS fingerprints for a run (mkdir -p · silent failure). */
export function saveRunHashes(workflowFsPath: string, hashes: ReadonlyMap<string, string>): void {
  if (hashes.size === 0) { return; }
  try {
    const file = canvasStatePath(workflowFsPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let existing: CanvasState | undefined;
    try {
      existing = parseCanvasState(fs.readFileSync(file, 'utf-8'));
    } catch {
      existing = undefined;
    }
    const merged = mergeRunHashes(existing, path.basename(workflowFsPath), hashes, new Date().toISOString());
    fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`, 'utf-8');
  } catch {
    // Editor memory only — a read-only workspace must not break runs.
  }
}
