// Pure YAML parsing utilities — no vscode dependency.
// Extracted for testability with vitest.
//
// This is the CLIENT-SIDE approximation that powers tree view, fallback
// intel, and decorations when the binary/LSP is absent. The engine's
// parser stays the oracle — on any disagreement, `nika check` wins.
//
// W1 « the map »: `tasks:` is a YAML MAP whose key IS the task identity —
// a task starts at its indent-2 bare `name:` key inside the tasks block
// (the `- id:` list form is dead engine-side · NIKA-PARSE-022).
//
// W2 « the flow »: `depends_on` is dead (NIKA-PARSE-024). A task crosses
// its boundary through exactly two doors — `with:` bindings (data edges:
// every `${{ tasks.X.* }}` ref IS an edge) and `after:` entries (control
// edges: `{producer: succeeded|failed|skipped|terminal}`). The fallback
// stays as strict as the server: a `tasks.*` ref anywhere else is
// NIKA-VAR-021 territory, never an edge.

const TASK_KEY_REGEX = /^ {2}([a-z][a-z0-9_]*)\s*:\s*(?:#.*)?$/;
const VERB_REGEX = /^\s+(infer|exec|invoke|agent)\s*:/;
const TOP_KEY = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/;
/** `tasks.X(.path)` inside a boundary value — the ref that IS an edge. */
const TASK_REF_RE = /\btasks\.([a-z][a-z0-9_]*)((?:\.[A-Za-z0-9_]+)*)/g;

export interface ParsedTask {
  id: string;
  line: number;
  verb: string;
}

/**
 * The line ranges of the top-level `tasks:` block(s): [start+1, end)
 * line indices. A task key only counts INSIDE this block — indent-2 keys
 * under `vars:` / `secrets:` / `permits:` are not tasks.
 */
function tasksBlockRanges(lines: string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let open: number | undefined;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TOP_KEY);
    if (!m) { continue; }
    if (open !== undefined) {
      ranges.push([open, i]);
      open = undefined;
    }
    if (m[1] === 'tasks') { open = i + 1; }
  }
  if (open !== undefined) { ranges.push([open, lines.length]); }
  return ranges;
}

/** Whether `line` (index) falls inside any tasks block range. */
function inTasksBlock(ranges: Array<[number, number]>, line: number): boolean {
  return ranges.some(([s, e]) => line >= s && line < e);
}

export function parseWorkflowTasks(content: string): ParsedTask[] {
  const lines = content.split('\n');
  const ranges = tasksBlockRanges(lines);
  const tasks: ParsedTask[] = [];
  let currentTask: { id: string; line: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const keyMatch = inTasksBlock(ranges, i) ? lines[i].match(TASK_KEY_REGEX) : null;
    if (keyMatch) {
      if (currentTask) {
        tasks.push({ ...currentTask, verb: 'unknown' });
      }
      currentTask = { id: keyMatch[1], line: i };
      continue;
    }

    if (currentTask) {
      const verbMatch = lines[i].match(VERB_REGEX);
      if (verbMatch) {
        tasks.push({ id: currentTask.id, line: currentTask.line, verb: verbMatch[1] });
        currentTask = null;
      }
    }
  }

  if (currentTask) {
    tasks.push({ ...currentTask, verb: 'unknown' });
  }

  return tasks;
}

// ─── Rich parse (v2) ─────────────────────────────────────────────────────────
// Indentation-scoped, regex-based, zero-dependency. Captures what the
// client-side features need: task spans, the two boundary doors (with ·
// after), declared keys.

/** One `${{ tasks.X.path }}` reference crossing the data boundary. */
export interface TaskDataRef {
  /** The `with:` alias whose value carries the reference. */
  alias: string;
  /** Producer task id. */
  from: string;
  /** Referenced path under the task record (`output` · `status` · …). */
  path: string;
}

export interface RichTask {
  id: string;
  /** Line of the declaring `name:` map key. */
  line: number;
  /** Last line of the task body (inclusive). */
  endLine: number;
  verb: string;
  model?: string;
  tool?: string;
  /** `after:` control entries — producer → predicate (03-dag §after). */
  after: Record<string, string>;
  /** `with:` aliases declared on this task. */
  withAliases: string[];
  /** `${{ tasks.* }}` refs inside `with:` values — the data edges. */
  withRefs: TaskDataRef[];
  /** `on_error.recover:` refs — recovery edges (parking reads, no order). */
  recoverRefs: string[];
  /** Scheduling producers: after keys ∪ withRefs sources (deduped). */
  producers: string[];
}

export interface RichWorkflow {
  name?: string;
  defaultModel?: string;
  tasks: RichTask[];
  /** Keys declared under top-level `secrets:`. */
  secretsKeys: string[];
  /** Keys declared under top-level `vars:`. */
  varsKeys: string[];
  /** Line of the top-level `permits:` key, when present. */
  permitsLine?: number;
}

function scalarOf(rest: string): string | undefined {
  const value = rest.replace(/#.*$/, '').trim().replace(/^["']|["']$/g, '');
  return value.length > 0 ? value : undefined;
}

/** Split a flow-map body (`a: x, b: y`) on top-level commas only. */
function splitFlowEntries(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '{' || ch === '[') { depth += 1; }
    if (ch === '}' || ch === ']') { depth -= 1; }
    if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Every `tasks.X(.path)` reference in a value snippet. */
function taskRefsIn(value: string): Array<{ from: string; path: string }> {
  const refs: Array<{ from: string; path: string }> = [];
  for (const m of value.matchAll(TASK_REF_RE)) {
    refs.push({ from: m[1], path: m[2] ? m[2].slice(1) : 'output' });
  }
  return refs;
}

export function parseRichWorkflow(content: string): RichWorkflow {
  const lines = content.split('\n');
  const wf: RichWorkflow = { tasks: [], secretsKeys: [], varsKeys: [] };

  // Pass 1 — top-level scalars and block keys.
  const collectBlockKeys = (start: number): string[] => {
    const keys: string[] = [];
    for (let i = start + 1; i < lines.length; i++) {
      const ind = lines[i].match(/^( *)\S/);
      if (!ind) { continue; }
      if (ind[1].length === 0) { break; }
      const m = lines[i].match(/^ {2}([A-Za-z0-9_-]+)\s*:/);
      if (m) { keys.push(m[1]); }
    }
    return keys;
  };

  // W1: `workflow:` is an OBJECT — the display name is its `id:` field.
  const workflowObjectId = (start: number): string | undefined => {
    for (let i = start + 1; i < lines.length; i++) {
      const ind = lines[i].match(/^( *)\S/);
      if (!ind) { continue; }
      if (ind[1].length === 0) { break; }
      const m = lines[i].match(/^ {2}id\s*:\s*(.*)$/);
      if (m) { return scalarOf(m[1]); }
    }
    return undefined;
  };

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TOP_KEY);
    if (!m) { continue; }
    const [, key, rest] = m;
    switch (key) {
      case 'workflow':
        wf.name = wf.name ?? (scalarOf(rest) ?? workflowObjectId(i));
        break;
      case 'name':
        wf.name = wf.name ?? scalarOf(rest);
        break;
      case 'model':
        wf.defaultModel = scalarOf(rest);
        break;
      case 'secrets':
        wf.secretsKeys = collectBlockKeys(i);
        break;
      case 'vars':
        wf.varsKeys = collectBlockKeys(i);
        break;
      case 'permits':
        wf.permitsLine = i;
        break;
      default:
        break;
    }
  }

  // Pass 2 — tasks with spans and nested facts. A task is an indent-2
  // bare `name:` key INSIDE the tasks block (map form · the key IS the
  // identity); nested deeper keys are task body, not tasks.
  const ranges = tasksBlockRanges(lines);
  const keyLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (inTasksBlock(ranges, i) && TASK_KEY_REGEX.test(lines[i])) {
      keyLines.push(i);
    }
  }

  for (let t = 0; t < keyLines.length; t++) {
    const start = keyLines[t];
    const keyMatch = lines[start].match(TASK_KEY_REGEX);
    if (!keyMatch) { continue; }

    // Task ends just before the next sibling task key, or at the next
    // top-level key, or at EOF.
    let endLine = lines.length - 1;
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      const ind = line.match(/^( *)\S/);
      if (!ind) { continue; }
      const indent = ind[1].length;
      if (indent === 0 || (inTasksBlock(ranges, i) && TASK_KEY_REGEX.test(line))) {
        endLine = i - 1;
        break;
      }
    }
    // Trailing blanks AND comments leave the span — a comment that ends
    // a span documents the NEXT task (the doc-comment convention), so
    // delete/duplicate must not carry it. Mid-task comments (followed
    // by more fields) are not trailing and stay.
    while (
      endLine > start
      && (lines[endLine].trim() === '' || lines[endLine].trim().startsWith('#'))
    ) { endLine -= 1; }

    const task: RichTask = {
      id: keyMatch[1],
      line: start,
      endLine,
      verb: 'unknown',
      after: {},
      withAliases: [],
      withRefs: [],
      recoverRefs: [],
      producers: [],
    };

    let inWith = false;
    let inAfter = false;
    let withIndent = 0;
    let afterIndent = 0;
    let currentAlias: string | undefined;
    const pushWithRef = (alias: string, from: string, path: string): void => {
      if (from === task.id) { return; }
      if (task.withRefs.some((r) => r.alias === alias && r.from === from && r.path === path)) { return; }
      task.withRefs.push({ alias, from, path });
    };
    // Body starts AFTER the declaring key line (the key itself would
    // otherwise read as a field named like the task — e.g. a task
    // named `model`).
    for (let i = start + 1; i <= endLine; i++) {
      const line = lines[i];
      const ind = line.match(/^( *)[^\s]/);
      const indent = ind ? ind[1].length : Number.MAX_SAFE_INTEGER;
      const blank = line.trim() === '';

      if (inWith && !blank && indent <= withIndent) { inWith = false; currentAlias = undefined; }
      // Blank lines inside an `after:` block do not end it — only a
      // shallower non-blank line does (a blank between two entries must
      // not silently drop the second one).
      if (inAfter && !blank && indent <= afterIndent) { inAfter = false; }

      const verbMatch = line.match(VERB_REGEX);
      if (verbMatch && task.verb === 'unknown') { task.verb = verbMatch[1]; }

      const fieldMatch = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (fieldMatch) {
        const [, fkey, rest] = fieldMatch;
        if (inAfter && indent > afterIndent) {
          // Block entry: `producer: predicate`.
          const predicate = scalarOf(rest);
          if (predicate) { task.after[fkey] = predicate; }
          continue;
        }
        if (inWith && indent === withIndent + 2) {
          task.withAliases.push(fkey);
          currentAlias = fkey;
          for (const r of taskRefsIn(rest)) { pushWithRef(fkey, r.from, r.path); }
          continue;
        }
        if (!inWith) {
          if (fkey === 'model' && !task.model) { task.model = scalarOf(rest); }
          if (fkey === 'tool' && !task.tool) { task.tool = scalarOf(rest); }
          if (fkey === 'with') {
            const inline = rest.replace(/#.*$/, '').trim().match(/^\{(.*)\}$/);
            if (inline) {
              for (const entry of splitFlowEntries(inline[1])) {
                const kv = entry.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
                if (!kv) { continue; }
                task.withAliases.push(kv[1]);
                for (const r of taskRefsIn(kv[2])) { pushWithRef(kv[1], r.from, r.path); }
              }
            } else if (rest.trim() === '') {
              inWith = true;
              withIndent = indent;
              currentAlias = undefined;
            }
            continue;
          }
          if (fkey === 'after') {
            const inline = rest.replace(/#.*$/, '').trim().match(/^\{(.*)\}$/);
            if (inline) {
              for (const entry of splitFlowEntries(inline[1])) {
                const kv = entry.match(/^([a-z][a-z0-9_]*)\s*:\s*([a-z]+)\s*$/);
                if (kv) { task.after[kv[1]] = kv[2]; }
              }
            } else if (rest.trim() === '') {
              inAfter = true;
              afterIndent = indent;
            }
            continue;
          }
          // `on_error.recover:` — a settled-record read (recovery edge).
          if (fkey === 'recover') {
            for (const r of taskRefsIn(rest)) {
              if (r.from !== task.id && !task.recoverRefs.includes(r.from)) {
                task.recoverRefs.push(r.from);
              }
            }
            continue;
          }
        }
      }

      // Continuation lines of a with entry (nested map/list/multiline
      // scalar) — refs there still belong to the entry's alias.
      if (inWith && currentAlias !== undefined && indent > withIndent + 2) {
        for (const r of taskRefsIn(line)) { pushWithRef(currentAlias, r.from, r.path); }
      }
    }

    // Scheduling producers — after keys first (doc order), then data refs.
    const producers: string[] = [];
    for (const p of Object.keys(task.after)) {
      if (!producers.includes(p)) { producers.push(p); }
    }
    for (const r of task.withRefs) {
      if (!producers.includes(r.from)) { producers.push(r.from); }
    }
    task.producers = producers;

    wf.tasks.push(task);
  }

  return wf;
}

/** The task whose item span covers `line`, if any. */
export function taskAtLine(wf: RichWorkflow, line: number): RichTask | undefined {
  return wf.tasks.find((t) => line >= t.line && line <= t.endLine);
}

/**
 * Stable topology fingerprint of a workflow — the anti-flicker gate for
 * the keystroke DAG (liveDag). Two texts with the same key have the same
 * GRAPH (ids, verbs, tools, typed edges, in document order); typing
 * inside a prompt, a `with:` LITERAL or a comment must not move it —
 * but editing an `after:` entry or a `${{ tasks.* }}` binding does (in
 * W2 the binding IS the edge). Deliberately EXCLUDES models/params:
 * those change card cosmetics, not topology, and a keystroke reload for
 * them would fight the editor.
 */
export function topoKey(wf: RichWorkflow): string {
  return wf.tasks
    .map((t) => {
      const control = Object.entries(t.after).map(([p, pred]) => `${p}=${pred}`).join(',');
      const data = t.withRefs.map((r) => `${r.from}.${r.path}`).join(',');
      return `${t.id}${t.verb}${t.tool ?? ''}|${control}|${data}`;
    })
    .join(';');
}
