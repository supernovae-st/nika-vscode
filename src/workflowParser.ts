// Pure YAML parsing utilities — no vscode dependency.
// Extracted for testability with vitest.
//
// This is the CLIENT-SIDE approximation that powers tree view, fallback
// intel, and decorations when the binary/LSP is absent. The engine's
// parser stays the oracle — on any disagreement, `nika check` wins.

const TASK_ID_REGEX = /^\s*-\s*id:\s*(\S+)/;
const VERB_REGEX = /^\s+(infer|exec|invoke|agent)\s*:/;

export interface ParsedTask {
  id: string;
  line: number;
  verb: string;
}

/**
 * The dash column of REAL task items: nested `- id:` lines (e.g. inside an
 * invoke args list) sit deeper and must not become phantom tasks. The first
 * `- id:` seen sets the canonical column.
 */
function taskItemIndent(lines: string[]): number | undefined {
  for (const line of lines) {
    if (TASK_ID_REGEX.test(line)) { return line.indexOf('-'); }
  }
  return undefined;
}

export function parseWorkflowTasks(content: string): ParsedTask[] {
  const lines = content.split('\n');
  const tasks: ParsedTask[] = [];
  let currentTask: { id: string; line: number } | null = null;
  const itemIndent = taskItemIndent(lines);

  for (let i = 0; i < lines.length; i++) {
    const idMatch = lines[i].match(TASK_ID_REGEX);
    if (idMatch && lines[i].indexOf('-') !== itemIndent) { continue; }
    if (idMatch) {
      if (currentTask) {
        tasks.push({ ...currentTask, verb: 'unknown' });
      }
      currentTask = { id: idMatch[1], line: i };
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
  /** Line of `- id:`. */
  line: number;
  /** Last line of the task item (inclusive). */
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

const TOP_KEY = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/;
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

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TOP_KEY);
    if (!m) { continue; }
    const [, key, rest] = m;
    switch (key) {
      case 'workflow':
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

  // Pass 2 — tasks with spans and nested facts. Only `- id:` items at the
  // canonical task column count (nested id lists are task body, not tasks).
  const canonicalIndent = taskItemIndent(lines);
  const idLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (TASK_ID_REGEX.test(lines[i]) && lines[i].indexOf('-') === canonicalIndent) {
      idLines.push(i);
    }
  }

  for (let t = 0; t < idLines.length; t++) {
    const start = idLines[t];
    const idMatch = lines[start].match(TASK_ID_REGEX);
    if (!idMatch) { continue; }
    const itemIndent = lines[start].indexOf('-');

    // Task ends just before the next sibling `- ` at the same indent, or
    // at the next top-level key, or at EOF.
    let endLine = lines.length - 1;
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      const ind = line.match(/^( *)\S/);
      if (!ind) { continue; }
      const indent = ind[1].length;
      if (indent < itemIndent || (indent === itemIndent && line.trimStart().startsWith('- '))) {
        endLine = i - 1;
        break;
      }
      if (indent === 0) {
        endLine = i - 1;
        break;
      }
    }
    while (endLine > start && lines[endLine].trim() === '') { endLine -= 1; }

    const task: RichTask = {
      id: idMatch[1],
      line: start,
      endLine,
      verb: 'unknown',
      dependsOn: [],
      withAliases: [],
    };

    let inWith = false;
    let inDepends = false;
    let withIndent = 0;
    for (let i = start; i <= endLine; i++) {
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
