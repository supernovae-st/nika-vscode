// flowEdit.ts — the flow doors (pure): order on state (`after:`) ·
// choose a gate (`when:`) · choose the collection (`for_each:`) · bind
// data across the boundary (`with:`). One shared discipline: find the
// task-level key inside the task item, replace its value surgically, or
// insert at the spec's canonical position (with → after → when →
// for_each · 03-dag task shape).
//
// W2 « the flow »: `when:` reads LOCAL namespaces only (a `tasks.*` ref
// there is NIKA-VAR-021) — so a gate that used to read an upstream
// record now either becomes an `after:` entry (state → control edge) or
// hoists the value through `with:` FIRST and reads the binding. The
// doors can never write the parse rejection the spec promises.

export interface TaskRange {
  id: string;
  /** Line of the declaring `name:` map key. */
  line: number;
  /** Last line of the task item (inclusive). */
  endLine: number;
  /** `after:` control entries — producer → predicate. */
  after: Record<string, string>;
  /** Scheduling producers (after keys ∪ with-binding sources). */
  producers: string[];
}

/** The closed `after:` predicate set (03-dag §after · NIKA-DAG-005). */
export const AFTER_PREDICATES = ['succeeded', 'failed', 'skipped', 'terminal'] as const;

interface KeyLine {
  line: number;
  indent: number;
  /** Raw value after the colon (comment kept aside). */
  value: string;
  /** Last line of a block value (inclusive) — flow forms end on `line`. */
  end: number;
}

function indentOf(line: string): number {
  const m = line.match(/^( *)\S/);
  return m ? m[1].length : -1;
}

/** Field indent for a task body: the key's column + 2 (W1 map form). */
function fieldIndentOf(lines: readonly string[], task: TaskRange): number {
  const m = lines[task.line]?.match(/^( *)[a-z]/);
  return m ? m[1].length + 2 : 4;
}

/** Find a task-level `key:` inside the item. A block value's extent
 * (map children — `retry:`'s fields as much as `after:`'s entries) is
 * any deeper-indented run; blanks stay inside, the parser's own law. */
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

/** Tasks whose edge chain reaches `id` — picking one of these as an
 * INPUT of `id` would close a cycle; they leave the candidate list.
 * Edges = the scheduling producers (control AND data — G_p is their
 * union). One reverse-adjacency pass then a plain BFS — O(V+E): the
 * naive form rescanned every task per frontier pop (O(V·E)), invisible
 * on a hand-written file, quadratic on generated hundreds-of-tasks DAGs. */
export function descendantsOf(tasks: readonly TaskRange[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const t of tasks) {
    for (const producer of t.producers) {
      (children.get(producer) ?? children.set(producer, []).get(producer)!).push(t.id);
    }
  }
  const out = new Set<string>();
  const frontier = [id];
  while (frontier.length > 0) {
    const cur = frontier.pop()!;
    for (const child of children.get(cur) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        frontier.push(child);
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
 * anchor chain a fresh key inserts after. `with` leads: the boundary
 * imports sit at the top of the task, the spec's own reading order. */
const KEY_ORDER: readonly string[] = [
  'with', 'after', 'when', 'for_each', 'retry', 'on_error', 'timeout',
];

export function insertionLine(lines: readonly string[], task: TaskRange, key: string): number {
  let at = task.line; // after the declaring key by default
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
  if (!/^ {2}[a-z][a-z0-9_]*\s*:/.test(lines[task.line] ?? '')) { return undefined; }
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
 * Write a task-level key: replace the existing line (block values
 * collapse to the flow form) or insert at the canonical position.
 * `value === undefined` removes the key. Undefined result: the anchor
 * moved (no task key at task.line) — refuse a blind write.
 */
export function taskKeyRewrite(
  text: string,
  task: TaskRange,
  key: string,
  value: string | undefined,
): string | undefined {
  const lines = text.split('\n');
  if (!/^ {2}[a-z][a-z0-9_]*\s*:/.test(lines[task.line] ?? '')) { return undefined; }
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

// ─── The doors ───────────────────────────────────────────────────────────────

/** `after: { a: succeeded, b: terminal }` — the compact flow form the
 *  doors write (block forms collapse); empty removes the key. */
export function afterRewrite(
  text: string,
  task: TaskRange,
  entries: ReadonlyArray<readonly [string, string]>,
): string | undefined {
  return taskKeyRewrite(text, task, 'after',
    entries.length > 0
      ? `{ ${entries.map(([p, pred]) => `${p}: ${pred}`).join(', ')} }`
      : undefined);
}

/**
 * Add (or grow) a `with:` binding — the data door. Returns the new
 * document + the alias actually written (collision-suffixed against
 * `takenAliases`). Block entry under an existing block `with:`, grown
 * in place for the inline flow form, created at the canonical position
 * otherwise. Undefined when the anchor moved.
 */
export function bindingInsert(
  text: string,
  task: TaskRange,
  aliasBase: string,
  expr: string,
  takenAliases: readonly string[],
): { text: string; alias: string } | undefined {
  const lines = text.split('\n');
  if (!/^ {2}[a-z][a-z0-9_]*\s*:/.test(lines[task.line] ?? '')) { return undefined; }
  let alias = aliasBase;
  for (let n = 2; takenAliases.includes(alias); n++) { alias = `${aliasBase}_${n}`; }
  const indent = fieldIndentOf(lines, task);
  const existing = findTaskKey(lines, task, 'with');
  if (existing) {
    const inline = existing.value.replace(/#.*$/, '').trim();
    if (inline.startsWith('{') && inline.endsWith('}')) {
      const body = inline.slice(1, -1).trim();
      const grown = body.length > 0
        ? `${body}, ${alias}: \${{ ${expr} }}`
        : `${alias}: \${{ ${expr} }}`;
      lines.splice(existing.line, 1, `${' '.repeat(indent)}with: { ${grown} }`);
      return { text: lines.join('\n'), alias };
    }
    lines.splice(existing.end + 1, 0, `${' '.repeat(indent + 2)}${alias}: \${{ ${expr} }}`);
    return { text: lines.join('\n'), alias };
  }
  lines.splice(
    insertionLine(lines, task, 'with'), 0,
    `${' '.repeat(indent)}with:`,
    `${' '.repeat(indent + 2)}${alias}: \${{ ${expr} }}`,
  );
  return { text: lines.join('\n'), alias };
}

export interface GateShape {
  id: string;
  /** Picker row. */
  label: string;
  hint: string;
  /** What the pick writes — the three W2-legal forms. */
  action:
    | { kind: 'when'; expr: string }
    | { kind: 'after'; producer: string; predicate: string }
    | { kind: 'bind-when'; producer: string; path: string; aliasBase: string; exprOf: (alias: string) => string };
}

/** The gate register, built from THIS file's vars, the task's own
 * bindings and its upstream tasks — every `when:` expression inside
 * the CEL v0.1 subset and LOCAL (vars · with · never tasks.*): an
 * upstream STATE becomes an `after:` entry, an upstream VALUE crosses
 * through `with:` first (the hoist the spec teaches). */
export function gateShapes(
  varNames: readonly string[],
  withAliases: readonly string[],
  upstream: readonly TaskRange[],
): GateShape[] {
  const shapes: GateShape[] = [];
  for (const v of varNames) {
    shapes.push({
      id: `var-eq-${v}`,
      label: `vars.${v} equals …`,
      hint: `run only when \`vars.${v}\` matches a value you name`,
      action: { kind: 'when', expr: `vars.${v} == 'value'` },
    });
    shapes.push({
      id: `var-flag-${v}`,
      label: `vars.${v} is on`,
      hint: `\`vars.${v}\` as a boolean switch`,
      action: { kind: 'when', expr: `vars.${v}` },
    });
  }
  for (const a of withAliases) {
    shapes.push({
      id: `with-content-${a}`,
      label: `with.${a} has content`,
      hint: `size() — the v0.1 empty-check idiom on the \`${a}\` binding`,
      action: { kind: 'when', expr: `size(with.${a}) > 0` },
    });
  }
  for (const t of upstream) {
    shapes.push({
      id: `after-${t.id}`,
      label: `${t.id} succeeded`,
      hint: `state is control — writes \`after: { ${t.id}: succeeded }\`, never a when:`,
      action: { kind: 'after', producer: t.id, predicate: 'succeeded' },
    });
    shapes.push({
      id: `content-${t.id}`,
      label: `${t.id} has content`,
      hint: 'hoists the output through with: (the binding IS the edge) · then size() > 0',
      action: {
        kind: 'bind-when',
        producer: t.id,
        path: 'output',
        aliasBase: t.id,
        exprOf: (alias) => `size(with.${alias}) > 0`,
      },
    });
  }
  return shapes;
}

/** `when: ${{ <expr> }}` — the wrapped canonical form. */
export function gateRewrite(text: string, task: TaskRange, expr: string): string | undefined {
  return taskKeyRewrite(text, task, 'when', `\${{ ${expr} }}`);
}

/** `when: ` / `for_each: ` with an EMPTY value — the server-island
 *  position (engine ≥0.103): the LSP completion serves whole
 *  `${{ … }}` islands composed from THIS document's declarations
 *  exactly there. The door writes the key, the server speaks — the
 *  SSOT convergence lane; the client shapes stay as the offline
 *  fallback. Trailing space matters: the island lane serves
 *  `key:` + whitespace-only. */
export function islandKeyRewrite(
  text: string,
  task: TaskRange,
  key: 'when' | 'for_each',
): string | undefined {
  return taskKeyRewrite(text, task, key, '');
}

/** Remove an ABANDONED island key (`when: ` left empty — the suggest
 *  was dismissed): the janitor twin of islandKeyRewrite. */
export function islandCleanupRewrite(
  text: string,
  task: TaskRange,
  key: 'when' | 'for_each',
): string | undefined {
  return taskKeyRewrite(text, task, key, undefined);
}

export interface CollectionRef {
  /** Picker row. */
  label: string;
  /** The `${{ … }}` body — LOCAL (vars.* or with.*). */
  ref: string;
  /** Upstream task whose output must cross the boundary first — the
   *  door binds `with: { <alias>: ${{ tasks.<id>.output }} }` and the
   *  `for_each:` reads the binding (for_each is a body surface —
   *  a `tasks.*` ref there is NIKA-VAR-021). */
  needsBinding?: { producer: string; path: string; aliasBase: string };
}

/** `for_each: ${{ <ref> }}` — unquoted, the spec's own form. */
export function fanoutRewrite(text: string, task: TaskRange, ref: string): string | undefined {
  return taskKeyRewrite(text, task, 'for_each', `\${{ ${ref} }}`);
}
