// dirtyNodes.ts — per-task staleness against the last SUCCESSFUL run.
//
// The n8n "dirty nodes" contract wired to a file-first SSOT: a task is
// stale when its SUBSTANCE (verb body · effective model · deps · when)
// no longer matches the fingerprint recorded when it last ran to
// success. Staleness propagates DOWNSTREAM (a changed parent invalidates
// everything it feeds). Pure module — IO lives in canvasState.ts.
//
// Fingerprints are REFORMAT-STABLE (indent · blank lines · standalone
// comments · key order don't dirty) but CONSERVATIVE the other way: any
// content change dirties. False-stale is safe; false-clean is not.

import { parseRichWorkflow } from '../workflowParser';

/** FNV-1a 32-bit — tiny, stable, dependency-free (not cryptographic;
 * this guards against drift, not adversaries). */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Normalize a task's YAML span into an order-independent line set:
 * trim · collapse internal whitespace · drop blanks and standalone
 * comments · sort. Key reorder and reindentation stop dirtying; any
 * value change still does.
 */
function normalizedTaskLines(lines: string[], start: number, end: number): string[] {
  const out: string[] = [];
  for (let i = start; i <= end && i < lines.length; i++) {
    const collapsed = lines[i].trim().replace(/\s+/g, ' ');
    if (collapsed.length === 0 || collapsed.startsWith('#')) { continue; }
    out.push(collapsed);
  }
  return out.sort();
}

/** Fingerprints for every task: substance + effective model + deps. */
export function taskFingerprints(text: string): Map<string, string> {
  const wf = parseRichWorkflow(text);
  const lines = text.split('\n');
  const prints = new Map<string, string>();
  for (const task of wf.tasks) {
    const material = [
      `verb=${task.verb}`,
      // Envelope model is part of the EFFECTIVE substance: changing the
      // workflow default re-runs every task that inherits it.
      `model=${task.model ?? wf.defaultModel ?? ''}`,
      `deps=${[...task.producers].sort().join(',')}`,
      ...normalizedTaskLines(lines, task.line, task.endLine),
    ].join('\n');
    prints.set(task.id, fnv1a(material));
  }
  return prints;
}

export interface DirtyResult {
  /** Tasks whose substance changed since their recorded success. */
  direct: Set<string>;
  /** direct ∪ everything downstream of it (what a run would redo). */
  stale: Set<string>;
  /** Current fingerprints (callers persist these on a successful run). */
  hashes: Map<string, string>;
}

/**
 * Staleness against the recorded fingerprints. `recorded` maps task id →
 * fingerprint at its last SUCCESS; a task absent from the record counts
 * stale only when the record is non-empty (a never-recorded workflow
 * shows NO badges — first-run state, not noise).
 */
export function computeDirty(text: string, recorded: ReadonlyMap<string, string>): DirtyResult {
  const hashes = taskFingerprints(text);
  const direct = new Set<string>();
  if (recorded.size > 0) {
    for (const [id, hash] of hashes) {
      if (recorded.get(id) !== hash) { direct.add(id); }
    }
  }

  // Downstream cone: children of stale are stale (BFS over the
  // scheduling producers — after entries AND with-binding sources).
  const wf = parseRichWorkflow(text);
  const childrenOf = new Map<string, string[]>();
  for (const t of wf.tasks) {
    for (const producer of t.producers) {
      (childrenOf.get(producer) ?? childrenOf.set(producer, []).get(producer)!).push(t.id);
    }
  }
  const stale = new Set<string>(direct);
  const queue = [...direct];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    for (const child of childrenOf.get(cur) ?? []) {
      if (!stale.has(child)) {
        stale.add(child);
        queue.push(child);
      }
    }
  }
  return { direct, stale, hashes };
}
