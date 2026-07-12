// flowEdit.ts — the flow doors (pure): wire its inputs (`depends_on`) ·
// choose a gate (`when:`) · choose the collection (`for_each:`). One
// shared discipline: find the task-level key inside the task item,
// replace its value surgically, or insert at the spec's canonical
// position (id → depends_on → when → for_each · 03-dag task shape).
// The §219 law rides along: any `tasks.<id>` reference REQUIRES an
// explicit depends_on edge — the gate/collection helpers surface the
// ids they reference so the caller can wire the edge FIRST.

export interface TaskRange {
  id: string;
  /** Line of `- id:`. */
  line: number;
  /** Last line of the task item (inclusive). */
  endLine: number;
  dependsOn: string[];
}

interface KeyLine {
  line: number;
  indent: number;
  /** Raw value after the colon (comment kept aside). */
  value: string;
  /** Last line of a block-list value (inclusive) — flow forms end on `line`. */
  end: number;
}

function indentOf(line: string): number {
  const m = line.match(/^( *)\S/);
  return m ? m[1].length : -1;
}

/** Field indent for a task item: the `- ` marker's column + 2. */
function fieldIndentOf(lines: readonly string[], task: TaskRange): number {
  const m = lines[task.line]?.match(/^( *)- /);
  return m ? m[1].length + 2 : 4;
}

/** Find a task-level `key:` inside the item. A block value's extent
 * (list items AND map children — `retry:`'s fields as much as
 * `depends_on:`'s dashes) is any deeper-indented run; blanks stay
 * inside, the parser's own law. */
export function findTaskKey(
  lines: readonly string[],
  task: TaskRange,
  key: string,
): KeyLine | undefined {
  const indent = fieldIndentOf(lines, task);
  const re = new RegExp(`^ {${indent}}${key}\\s*:\\s*(.*)$`);
  for (let i = task.line; i <= task.endLine && i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) { continue; }
    let end = i;
    if (m[1].trim() === '' || m[1].trim().startsWith('#')) {
      for (let j = i + 1; j <= task.endLine && j < lines.length; j++) {
        if (lines[j].trim() === '') { continue; }
        if (indentOf(lines[j]) > indent) { end = j; continue; }
        break;
      }
    }
    return { line: i, indent, value: m[1], end };
  }
  return undefined;
}

/** Tasks whose dependency chain reaches `id` — picking one of these as
 * an INPUT of `id` would close a cycle; they leave the candidate list. */
export function descendantsOf(tasks: readonly TaskRange[], id: string): Set<string> {
  const out = new Set<string>();
  const frontier = [id];
  while (frontier.length > 0) {
    const cur = frontier.pop()!;
    for (const t of tasks) {
      if (!out.has(t.id) && t.dependsOn.includes(cur)) {
        out.add(t.id);
        frontier.push(t.id);
      }
    }
  }
  return out;
}

/** The pickable inputs for `id`: every other task, minus its descendants. */
export function upstreamCandidates(tasks: readonly TaskRange[], id: string): TaskRange[] {
  const blocked = descendantsOf(tasks, id);
  return tasks.filter((t) => t.id !== id && !blocked.has(t.id));
}

/** The spec's canonical task-key order (03-dag task shape) — the
 * anchor chain a fresh key inserts after. */
const KEY_ORDER: readonly string[] = [
  'depends_on', 'when', 'for_each', 'retry', 'on_error', 'timeout',
];

export function insertionLine(lines: readonly string[], task: TaskRange, key: string): number {
  let at = task.line; // after `- id:` by default
  for (const prior of KEY_ORDER.slice(0, KEY_ORDER.indexOf(key))) {
    const found = findTaskKey(lines, task, prior);
    if (found) { at = found.end; }
  }
  return at + 1;
}

/**
 * Insert a task-level BLOCK key (`retry:`'s policy, `on_error:`'s
 * action) at the canonical position — `body` unindented, first line
 * `<key>:`. Refuses when the anchor moved or the key already exists:
 * armor is tuned by hand once worn, never blind-rewritten.
 */
export function taskBlockInsert(
  text: string,
  task: TaskRange,
  key: string,
  body: string,
): string | undefined {
  const lines = text.split('\n');
  if (!/^\s*- /.test(lines[task.line] ?? '')) { return undefined; }
  if (findTaskKey(lines, task, key)) { return undefined; }
  const pad = ' '.repeat(fieldIndentOf(lines, task));
  const block = body
    .replace(/\n$/, '')
    .split('\n')
    .map((l) => (l.trim() === '' ? '' : pad + l));
  lines.splice(insertionLine(lines, task, key), 0, ...block);
  return lines.join('\n');
}

/**
 * Write a task-level key: replace the existing line (block lists
 * collapse to the flow form) or insert at the canonical position.
 * `value === undefined` removes the key. Undefined result: the anchor
 * moved (no `- id:` at task.line) — refuse a blind write.
 */
export function taskKeyRewrite(
  text: string,
  task: TaskRange,
  key: string,
  value: string | undefined,
): string | undefined {
  const lines = text.split('\n');
  if (!/^\s*- /.test(lines[task.line] ?? '')) { return undefined; }
  const indent = fieldIndentOf(lines, task);
  const existing = findTaskKey(lines, task, key);
  if (existing) {
    const span = existing.end - existing.line + 1;
    if (value === undefined) { lines.splice(existing.line, span); }
    else { lines.splice(existing.line, span, `${' '.repeat(indent)}${key}: ${value}`); }
    return lines.join('\n');
  }
  if (value === undefined) { return text; }
  lines.splice(insertionLine(lines, task, key), 0, `${' '.repeat(indent)}${key}: ${value}`);
  return lines.join('\n');
}

// ─── The three doors ─────────────────────────────────────────────────────────

/** `depends_on: [a, b]` — the flow form the spec teaches; empty removes. */
export function dependsRewrite(
  text: string,
  task: TaskRange,
  picked: readonly string[],
): string | undefined {
  return taskKeyRewrite(text, task, 'depends_on',
    picked.length > 0 ? `[${picked.join(', ')}]` : undefined);
}

export interface GateShape {
  id: string;
  /** Picker row. */
  label: string;
  hint: string;
  /** The CEL v0.1 expression (unwrapped). */
  expr: string;
  /** Task id the expression reads — the edge §219 demands. */
  needsTask?: string;
}

/** The gate register, built from THIS file's vars and upstream tasks —
 * every expression inside the CEL v0.1 subset (comparison · boolean ·
 * size() — the one function). */
export function gateShapes(
  varNames: readonly string[],
  upstream: readonly TaskRange[],
): GateShape[] {
  const shapes: GateShape[] = [];
  for (const v of varNames) {
    shapes.push({
      id: `var-eq-${v}`,
      label: `vars.${v} equals …`,
      hint: `run only when \`vars.${v}\` matches a value you name`,
      expr: `vars.${v} == 'value'`,
    });
    shapes.push({
      id: `var-flag-${v}`,
      label: `vars.${v} is on`,
      hint: `\`vars.${v}\` as a boolean switch`,
      expr: `vars.${v}`,
    });
  }
  for (const t of upstream) {
    shapes.push({
      id: `status-${t.id}`,
      label: `${t.id} succeeded`,
      hint: `run only when \`${t.id}\` ended in success`,
      expr: `tasks.${t.id}.status == 'success'`,
      needsTask: t.id,
    });
    shapes.push({
      id: `content-${t.id}`,
      label: `${t.id} has content`,
      hint: `size() — the v0.1 empty-check idiom on \`${t.id}\`'s output`,
      expr: `size(tasks.${t.id}.output) > 0`,
      needsTask: t.id,
    });
  }
  return shapes;
}

/** `when: ${{ <expr> }}` — the wrapped canonical form. */
export function gateRewrite(text: string, task: TaskRange, expr: string): string | undefined {
  return taskKeyRewrite(text, task, 'when', `\${{ ${expr} }}`);
}

export interface CollectionRef {
  /** Picker row. */
  label: string;
  /** The `${{ … }}` body. */
  ref: string;
  /** Task id the ref reads (the §219 edge), when it reads one. */
  needsTask?: string;
}

/** `for_each: ${{ <ref> }}` — unquoted, the spec's own form. */
export function fanoutRewrite(text: string, task: TaskRange, ref: string): string | undefined {
  return taskKeyRewrite(text, task, 'for_each', `\${{ ${ref} }}`);
}
