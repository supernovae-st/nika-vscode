// traceStore.ts — the ONE in-memory home of "the last run of workflow X"
// (pure · no vscode). Two publishers feed it — the live runner (runLive
// re-folds its NDJSON buffer · throttled intermediates + exact final) and
// the trace overlay (runsView folds the file after its majority-overlap
// gate) — and every editor surface (line badges · hover cards) reads the
// SAME fold back through `onDidUpdate`. One fold, many faces.
//
// Keyed on the WORKFLOW file (normalized fsPath), never the trace file:
// the editor asks "what happened to THIS document", not "what does trace
// #47 contain". Latest write wins — the store is a present, not a log
// (the flight-recorder on disk IS the log).
//
// The emitter is hand-rolled to the exact vscode contract
// (`event(listener) → Disposable`) instead of importing vscode.EventEmitter:
// src/core is the pure layer (every sibling is vscode-free) and vitest
// runs these files directly — same shape, zero runtime dependency.

import * as path from 'path';
import type { RunModel } from './traceFold';

export interface TraceRecord {
  fold: RunModel;
  /** When this fold was published (wall clock) — staleness cue for surfaces. */
  at: Date;
}

interface StoreDisposable {
  dispose(): void;
}

/** Minimal vscode-shaped emitter — `event(listener)` returns a disposable. */
class Emitter<T> {
  private readonly listeners = new Set<(payload: T) => void>();

  readonly event = (listener: (payload: T) => void): StoreDisposable => {
    this.listeners.add(listener);
    return { dispose: () => { this.listeners.delete(listener); } };
  };

  fire(payload: T): void {
    // Snapshot — a listener disposing itself (or a sibling) mid-fire must
    // not mutate the set we are iterating.
    for (const listener of [...this.listeners]) { listener(payload); }
  }
}

/**
 * Canonical store key for a workflow file. Both publishers and all readers
 * derive their key from a `Uri.fsPath`, so this only has to collapse the
 * cosmetic differences (`a//b` · `a/./b` · trailing separator) — never
 * resolve symlinks or hit the disk.
 */
export function normalizeWorkflowKey(fsPath: string): string {
  const normalized = path.normalize(fsPath);
  // Strip a trailing separator (never the root itself).
  return normalized.length > 1 && normalized.endsWith(path.sep)
    ? normalized.slice(0, -1)
    : normalized;
}

export class TraceStore {
  private readonly records = new Map<string, TraceRecord>();
  private readonly emitter = new Emitter<string>();

  /** Fires with the NORMALIZED workflow key after every `set`. */
  readonly onDidUpdate = this.emitter.event;

  /** Publish the latest fold for a workflow file (latest write wins). */
  set(workflowFsPath: string, fold: RunModel): void {
    const key = normalizeWorkflowKey(workflowFsPath);
    this.records.set(key, { fold, at: new Date() });
    this.emitter.fire(key);
  }

  /** Latest known fold for a workflow file — undefined when never run. */
  get(workflowFsPath: string): TraceRecord | undefined {
    return this.records.get(normalizeWorkflowKey(workflowFsPath));
  }
}

/** The singleton every surface shares — one present per workflow. */
export const traceStore = new TraceStore();
