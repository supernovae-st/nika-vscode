// workflowsModel.ts — the Workflows view's attention brain (pure · zero
// vscode).
//
// The Explorer already groups by folder (Jakob) — this tree partitions
// by ATTENTION instead: broken files lead outside any section (the
// Station's brokeRow idiom — a file the scan could not read must never
// masquerade as an empty-but-fine workflow), then Findings · Clean ·
// Unchecked. The absence of a check never dresses up as clean: an
// unchecked file is its own story, and when the engine is off the
// section says so.
//
// Pure function of (facts · engine flag) — the view renders dumbly.

/** What one file's read + parse concluded — three different stories.
 *  The old catch collapsed « could not read » into « zero tasks »;
 *  the discrimination is the fix. */
export type WorkflowParse<T> =
  | { kind: 'ok'; tasks: T[] }
  | { kind: 'empty' }
  | { kind: 'unparseable'; message: string };

/** Discriminate a read outcome into its honest parse story. */
export function classifyWorkflow<T>(
  outcome: { kind: 'read'; tasks: T[] } | { kind: 'unreadable'; message: string },
): WorkflowParse<T> {
  if (outcome.kind === 'unreadable') {
    return { kind: 'unparseable', message: outcome.message };
  }
  return outcome.tasks.length === 0
    ? { kind: 'empty' }
    : { kind: 'ok', tasks: outcome.tasks };
}

/** The cached `nika check` verdict — absent = never checked. */
export type WorkflowBadge =
  | { kind: 'clean' }
  | { kind: 'findings'; count: number }
  | undefined;

export interface WorkflowFileFacts<T> {
  fsPath: string;
  parse: WorkflowParse<T>;
  badge: WorkflowBadge;
}

export interface WorkflowRow<T> extends WorkflowFileFacts<T> {
  /** Disambiguator when basenames collide — the folder tells them
   *  apart (relative to the colliding group's common directory). */
  dirHint?: string;
}

export type WorkflowSectionKey = 'findings' | 'clean' | 'unchecked';

export interface WorkflowSection<T> {
  key: WorkflowSectionKey;
  /** Stable — expansion state survives refreshes. */
  id: string;
  /** `Findings — 2` (the house section grammar). */
  label: string;
  /** `engine off` on Unchecked when the service is down — the missing
   *  check names its cause instead of hiding. */
  description?: string;
  files: WorkflowRow<T>[];
}

export interface WorkflowGrouping<T> {
  /** Broken rows lead, outside any section (the brokeRow idiom). */
  unparseable: WorkflowRow<T>[];
  /** Empty = render flat (a single section dissolves — one answer
   *  needs no headline). */
  sections: WorkflowSection<T>[];
  /** The flat rendering when sections dissolve (path-sorted). */
  flat: WorkflowRow<T>[];
}

function basenameOf(fsPath: string): string {
  const parts = fsPath.split(/[\\/]/);
  return parts[parts.length - 1] ?? fsPath;
}

/** Attach dirHints to rows whose basenames collide: each hint is the
 *  file's directory relative to the colliding group's common prefix.
 *  A hint that resolves empty stays absent — the SIBLING's hint
 *  already tells the two apart. */
function withDirHints<T>(rows: WorkflowFileFacts<T>[]): WorkflowRow<T>[] {
  const groups = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const base = basenameOf(r.fsPath);
    const g = groups.get(base) ?? [];
    g.push(i);
    groups.set(base, g);
  });
  const out: WorkflowRow<T>[] = rows.map((r) => ({ ...r }));
  for (const indices of groups.values()) {
    if (indices.length < 2) { continue; }
    const dirs = indices.map((i) => rows[i].fsPath.split(/[\\/]/).slice(0, -1));
    let common = 0;
    for (;;) {
      const seg = dirs[0][common];
      if (seg === undefined || !dirs.every((d) => d[common] === seg)) { break; }
      common += 1;
    }
    indices.forEach((rowIdx, k) => {
      const hint = dirs[k].slice(common).join('/');
      if (hint.length > 0) { out[rowIdx].dirHint = hint; }
    });
  }
  return out;
}

/**
 * Partition path-sorted rows by attention. Unparseable rows lead
 * outside any section; the three sections (Findings · Clean ·
 * Unchecked) hide when empty and dissolve to flat when only one
 * survives.
 */
export function groupWorkflows<T>(
  rows: WorkflowFileFacts<T>[],
  engineAvailable: boolean,
): WorkflowGrouping<T> {
  const sorted = withDirHints(
    [...rows].sort((a, b) => a.fsPath.localeCompare(b.fsPath)),
  );
  const unparseable = sorted.filter((r) => r.parse.kind === 'unparseable');
  const readable = sorted.filter((r) => r.parse.kind !== 'unparseable');
  const findings = readable.filter((r) => r.badge?.kind === 'findings');
  const clean = readable.filter((r) => r.badge?.kind === 'clean');
  const unchecked = readable.filter((r) => r.badge === undefined);

  const sections: WorkflowSection<T>[] = [];
  if (findings.length > 0) {
    sections.push({
      key: 'findings',
      id: 'workflows.section.findings',
      label: `Findings — ${findings.length}`,
      files: findings,
    });
  }
  if (clean.length > 0) {
    sections.push({
      key: 'clean',
      id: 'workflows.section.clean',
      label: `Clean — ${clean.length}`,
      files: clean,
    });
  }
  if (unchecked.length > 0) {
    sections.push({
      key: 'unchecked',
      id: 'workflows.section.unchecked',
      label: `Unchecked — ${unchecked.length}`,
      ...(engineAvailable ? {} : { description: 'engine off' }),
      files: unchecked,
    });
  }

  if (sections.length <= 1) {
    return { unparseable, sections: [], flat: readable };
  }
  return { unparseable, sections, flat: [] };
}
