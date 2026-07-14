// renameRefs.ts — task-id rename/references engine (pure · no vscode).
//
// A task id is referenced from FOUR syntactic homes (W2 « the flow »):
//   1. its declaration    `extract:` (the indent-2 map key · W1)
//   2. after entries      `after: { extract: succeeded }` · block `extract: succeeded`
//   3. template islands   `${{ tasks.extract.output }}` (with: values · recover:)
//   4. bare CEL strings   an un-islanded `tasks.extract…` (WIP text — the
//                         engine refuses it at parse, the rename still follows)
// Rename must hit all four or it produces a broken DAG — which is why
// this lives in ONE scanner shared by rename and find-references.

import { scanIslands } from './expr';

/** The engine's task-id grammar (snake_case · CEL-safe · pass-4 lesson). */
export const TASK_ID_RE = /^[a-z][a-z0-9_]*$/;

export function isValidTaskId(id: string): boolean {
  return TASK_ID_RE.test(id);
}

export interface RefSpan {
  /** UTF-16 offset of the id token. */
  start: number;
  end: number;
  home: 'declaration' | 'after' | 'island' | 'cel';
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every reference to `taskId` in the document, deduped + sorted. */
export function findTaskRefs(text: string, taskId: string): RefSpan[] {
  const refs: RefSpan[] = [];
  const id = escapeRe(taskId);
  const lines = text.split('\n');

  // Offsets of each line start (single forward pass).
  const lineStart: number[] = [0];
  for (let i = 0; i < lines.length - 1; i++) {
    lineStart.push(lineStart[i] + lines[i].length + 1);
  }

  // 1 · declaration — the indent-2 map key inside the tasks block (W1:
  // the key IS the identity; a same-named typed var never matches
  // because declarations only count while inTasks).
  const declRe = new RegExp(`^( {2})(${id})\\s*:\\s*(#.*)?$`);
  // 2 · after — inline flow map keys or block entries
  const afterInlineRe = /after:\s*\{([^}]*)\}/;
  const blockEntryRe = new RegExp(`^(\\s*)(${id})\\s*:\\s*[a-z]+\\s*(#.*)?$`);

  let inAfterBlock = false;
  let afterIndent = 0;
  let inTasks = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const base = lineStart[i];
    if (/^[A-Za-z0-9_-]+\s*:/.test(line)) { inTasks = /^tasks\s*:/.test(line); }

    const decl = inTasks ? line.match(declRe) : null;
    if (decl) {
      refs.push({ start: base + decl[1].length, end: base + decl[1].length + taskId.length, home: 'declaration' });
    }

    const inline = line.match(afterInlineRe);
    if (inline && inline.index !== undefined) {
      const inner = inline[1];
      const innerStart = base + inline.index + inline[0].indexOf('{') + 1;
      const keyRe = new RegExp(`(^|[,{\\s])(${id})(?=\\s*:)`, 'g');
      for (const m of inner.matchAll(keyRe)) {
        const off = innerStart + (m.index ?? 0) + m[1].length;
        refs.push({ start: off, end: off + taskId.length, home: 'after' });
      }
    }

    if (/^\s*after:\s*$/.test(line)) {
      inAfterBlock = true;
      afterIndent = indentOf(line);
      continue;
    }
    if (inAfterBlock) {
      const trimmed = line.trim();
      if (trimmed === '') { continue; }
      if (indentOf(line) <= afterIndent) {
        inAfterBlock = false;
      } else {
        const entry = line.match(blockEntryRe);
        if (entry) {
          refs.push({ start: base + entry[1].length, end: base + entry[1].length + taskId.length, home: 'after' });
        }
        continue;
      }
    }
  }

  // 3 · template islands — ${{ tasks.taskId... }}
  const islands = scanIslands(text);
  const islandRanges = islands.map((isl) => [isl.start, isl.end] as const);
  const tasksRefRe = new RegExp(`\\btasks\\.(${id})(?![A-Za-z0-9_])`, 'g');
  const seen = new Set(refs.map((r) => r.start));
  for (const m of text.matchAll(tasksRefRe)) {
    const idStart = (m.index ?? 0) + 'tasks.'.length;
    if (seen.has(idStart)) { continue; }
    const insideIsland = islandRanges.some(([s, e]) => idStart >= s && idStart < e);
    // 4 · outside islands = bare CEL (WIP text) — still a real reference.
    refs.push({
      start: idStart,
      end: idStart + taskId.length,
      home: insideIsland ? 'island' : 'cel',
    });
    seen.add(idStart);
  }

  return refs.sort((a, b) => a.start - b.start);
}

function indentOf(line: string): number {
  const m = line.match(/^( *)\S/);
  return m ? m[1].length : -1;
}

/** Apply a rename as a pure text transform (rename-provider backend). */
export function renameTask(text: string, oldId: string, newId: string): string | undefined {
  if (!isValidTaskId(newId)) { return undefined; }
  const refs = findTaskRefs(text, oldId);
  if (refs.length === 0) { return undefined; }
  let out = '';
  let cursor = 0;
  for (const ref of refs) {
    out += text.slice(cursor, ref.start) + newId;
    cursor = ref.end;
  }
  out += text.slice(cursor);
  return out;
}

/**
 * Non-declaration reference COUNTS for every id in one pass — the
 * per-task lens row needs only the number, and calling
 * [`findTaskRefs`] per task made the repaint O(V·L) (quadratic on the
 * generated hundreds-of-tasks DAGs). One line walk + one island scan,
 * same reference classes (after inline/block · `tasks.<id>`
 * template/CEL); equivalence with the single-id walk is pinned by
 * test, not asserted by hope.
 */
export function countTaskRefs(text: string, ids: ReadonlySet<string>): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (id: string): void => {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  const lines = text.split('\n');
  const lineStart: number[] = [0];
  for (let i = 0; i < lines.length - 1; i++) {
    lineStart.push(lineStart[i] + lines[i].length + 1);
  }

  const afterInlineRe = /after:\s*\{([^}]*)\}/;
  const blockEntryRe = /^(\s*)([a-z][a-z0-9_]*)\s*:\s*[a-z]+\s*(#.*)?$/;
  const counted = new Set<number>(); // absolute offsets already counted

  let inAfterBlock = false;
  let afterIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const base = lineStart[i];

    const inline = line.match(afterInlineRe);
    if (inline && inline.index !== undefined) {
      const inner = inline[1];
      const innerStart = base + inline.index + inline[0].indexOf('{') + 1;
      const keyRe = /(^|[,{\s])([a-z][a-z0-9_]*)(?=\s*:)/g;
      for (const m of inner.matchAll(keyRe)) {
        const id = m[2];
        if (!ids.has(id)) { continue; }
        bump(id);
        counted.add(innerStart + (m.index ?? 0) + m[1].length);
      }
    }

    if (/^\s*after:\s*$/.test(line)) {
      inAfterBlock = true;
      afterIndent = indentOf(line);
      continue;
    }
    if (inAfterBlock) {
      const trimmed = line.trim();
      if (trimmed === '') { continue; }
      if (indentOf(line) <= afterIndent) {
        inAfterBlock = false;
      } else {
        const entry = line.match(blockEntryRe);
        if (entry && ids.has(entry[2])) {
          bump(entry[2]);
          counted.add(base + entry[1].length);
        }
        continue;
      }
    }
  }

  const tasksRefRe = /\btasks\.([A-Za-z0-9_]+)(?![A-Za-z0-9_])/g;
  for (const m of text.matchAll(tasksRefRe)) {
    const id = m[1];
    if (!ids.has(id)) { continue; }
    const idStart = (m.index ?? 0) + 'tasks.'.length;
    if (counted.has(idStart)) { continue; }
    bump(id);
    counted.add(idStart);
  }

  return counts;
}
