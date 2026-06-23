// renameRefs.ts — task-id rename/references engine (pure · no vscode).
//
// A task id is referenced from FOUR syntactic homes:
//   1. its declaration         `- id: extract`
//   2. depends_on entries      `depends_on: [extract]` · block `- extract`
//   3. template islands        `${{ tasks.extract.output }}`
//   4. bare CEL strings        `when: "tasks.extract.status == 'success'"`
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
  home: 'declaration' | 'depends_on' | 'island' | 'cel';
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

  // 1 · declaration — `- id: taskId`
  const declRe = new RegExp(`^(\\s*-\\s*id:\\s*)(${id})\\s*(#.*)?$`);
  // 2 · depends_on — inline list or block items
  const dependsInlineRe = new RegExp(`depends_on:\\s*\\[([^\\]]*)\\]`);
  const blockItemRe = new RegExp(`^(\\s*-\\s*)(${id})\\s*(#.*)?$`);

  let inDependsBlock = false;
  let dependsIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const base = lineStart[i];

    const decl = line.match(declRe);
    if (decl) {
      refs.push({ start: base + decl[1].length, end: base + decl[1].length + taskId.length, home: 'declaration' });
    }

    const inline = line.match(dependsInlineRe);
    if (inline && inline.index !== undefined) {
      const inner = inline[1];
      const innerStart = base + inline.index + inline[0].indexOf('[') + 1;
      const itemRe = new RegExp(`(^|[,\\s"'])(${id})(?=[,\\s"']|$)`, 'g');
      for (const m of inner.matchAll(itemRe)) {
        const off = innerStart + (m.index ?? 0) + m[1].length;
        refs.push({ start: off, end: off + taskId.length, home: 'depends_on' });
      }
    }

    if (/^\s*depends_on:\s*$/.test(line)) {
      inDependsBlock = true;
      dependsIndent = indentOf(line);
      continue;
    }
    if (inDependsBlock) {
      const trimmed = line.trim();
      if (trimmed === '') { continue; }
      if (!trimmed.startsWith('-') || indentOf(line) <= dependsIndent) {
        inDependsBlock = false;
      } else {
        const item = line.match(blockItemRe);
        if (item) {
          refs.push({ start: base + item[1].length, end: base + item[1].length + taskId.length, home: 'depends_on' });
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
    // 4 · outside islands = bare CEL (when:) — still a real reference.
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
