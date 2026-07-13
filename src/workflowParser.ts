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

const TASK_KEY_REGEX = /^ {2}([a-z][a-z0-9_]*)\s*:\s*(?:#.*)?$/;
const VERB_REGEX = /^\s+(infer|exec|invoke|agent)\s*:/;
const TOP_KEY = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/;

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
// client-side features need: task spans, with-aliases, declared keys.

export interface RichTask {
  id: string;
  /** Line of the declaring `name:` map key. */
  line: number;
  /** Last line of the task body (inclusive). */
  endLine: number;
  verb: string;
  model?: string;
  tool?: string;
  dependsOn: string[];
  /** `with:` aliases declared on this task. */
  withAliases: string[];
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

const LIST_ITEM = /^\s*-\s*(?:"([^"]*)"|'([^']*)'|([^#\s][^#]*?))\s*(?:#.*)?$/;

function scalarOf(rest: string): string | undefined {
  const value = rest.replace(/#.*$/, '').trim().replace(/^["']|["']$/g, '');
  return value.length > 0 ? value : undefined;
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
      dependsOn: [],
      withAliases: [],
    };

    let inWith = false;
    let inDepends = false;
    let withIndent = 0;
    // Body starts AFTER the declaring key line (the key itself would
    // otherwise read as a field named like the task — e.g. a task
    // named `model`).
    for (let i = start + 1; i <= endLine; i++) {
      const line = lines[i];
      const ind = line.match(/^( *)[^\s]/);
      const indent = ind ? ind[1].length : Number.MAX_SAFE_INTEGER;

      if (inWith && indent <= withIndent) { inWith = false; }
      // Blank lines inside a depends_on block do not end it — only a
      // non-blank non-item line does (a blank between two `- dep` items
      // must not silently drop the second one).
      if (inDepends && line.trim() !== '' && !line.trimStart().startsWith('-')) {
        inDepends = false;
      }

      const verbMatch = line.match(VERB_REGEX);
      if (verbMatch && task.verb === 'unknown') { task.verb = verbMatch[1]; }

      const fieldMatch = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (fieldMatch) {
        const [, fkey, rest] = fieldMatch;
        if (fkey === 'model' && !task.model) { task.model = scalarOf(rest); }
        if (fkey === 'tool' && !task.tool) { task.tool = scalarOf(rest); }
        if (fkey === 'with' && rest.trim() === '') {
          inWith = true;
          withIndent = indent;
          continue;
        }
        if (fkey === 'depends_on') {
          const inline = rest.match(/^\[(.*)\]\s*$/);
          if (inline) {
            for (const part of inline[1].split(',')) {
              const v = part.trim().replace(/^["']|["']$/g, '');
              if (v) { task.dependsOn.push(v); }
            }
          } else if (rest.trim() === '') {
            inDepends = true;
          }
          continue;
        }
        if (inWith && indent === withIndent + 2) {
          task.withAliases.push(fkey);
        }
      }

      if (inDepends) {
        const item = line.match(LIST_ITEM);
        if (item) {
          const v = (item[1] ?? item[2] ?? item[3] ?? '').trim();
          if (v) { task.dependsOn.push(v); }
        }
      }
    }

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
 * GRAPH (ids, verbs, tools, dependency edges, in document order); typing
 * inside a prompt, a `with:` block or a comment must not move it.
 * Deliberately EXCLUDES models/params: those change card cosmetics, not
 * topology, and a keystroke reload for them would fight the editor.
 */
export function topoKey(wf: RichWorkflow): string {
  return wf.tasks
    .map((t) => `${t.id}${t.verb}${t.tool ?? ''}${t.dependsOn.join(',')}`)
    .join('');
}
