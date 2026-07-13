// yamlContext.ts — cursor-context classifier for schema-driven completion
// (pure · no vscode). Given the document text and a cursor position,
// answers: « what KIND of thing belongs here? » — a top-level key, a task
// key, a verb-body key, or a VALUE for a known field (with the enclosing
// verb and nearby tool, so `mode:` can complete fetch extract modes).

import { parseRichWorkflow, taskAtLine, type RichTask, type RichWorkflow } from '../workflowParser';

const VERBS = new Set(['infer', 'exec', 'invoke', 'agent']);

export type YamlContext =
  | { kind: 'top-key'; partial: string }
  | { kind: 'task-key'; partial: string }
  | { kind: 'verb-key'; verb: string; partial: string }
  | { kind: 'value'; key: string; verb?: string; tool?: string; partial: string }
  | undefined;

function indentOf(line: string): number {
  const m = line.match(/^( *)\S/);
  return m ? m[1].length : -1;
}

/** Nearest ancestor key above `lineIdx` with indent < `indent`. */
function parentKey(lines: string[], lineIdx: number, indent: number): { key: string; indent: number } | undefined {
  for (let i = lineIdx - 1; i >= 0; i--) {
    const ind = indentOf(lines[i]);
    if (ind === -1 || ind >= indent) { continue; }
    const m = lines[i].match(/^\s*(?:-\s+)?([A-Za-z0-9_-]+)\s*:/);
    if (m) { return { key: m[1], indent: ind }; }
    return undefined;
  }
  return undefined;
}

/**
 * Enclosing task for a cursor line — tolerant of the freshest-typing case:
 * a trailing blank line after the last field is OUTSIDE the parsed span
 * (spans trim trailing blanks), yet logically the user is still typing
 * inside that task. Fall back to the nearest non-blank line above.
 */
function enclosingTask(wf: RichWorkflow, lines: string[], lineIdx: number): RichTask | undefined {
  const direct = taskAtLine(wf, lineIdx);
  if (direct) { return direct; }
  for (let i = lineIdx - 1; i >= 0; i--) {
    if (lines[i].trim() === '') { continue; }
    return taskAtLine(wf, i);
  }
  return undefined;
}

/** The `tool:` value inside the enclosing invoke block, when present. */
function nearbyTool(lines: string[], lineIdx: number, taskStart: number): string | undefined {
  for (let i = lineIdx; i >= taskStart; i--) {
    const m = lines[i].match(/^\s*tool:\s*["']?([A-Za-z0-9:_/.-]+)["']?\s*(#.*)?$/);
    if (m) { return m[1]; }
  }
  return undefined;
}

export function yamlContextAt(text: string, lineIdx: number, character: number): YamlContext {
  const lines = text.split('\n');
  const line = lines[lineIdx] ?? '';
  const before = line.slice(0, character);

  // VALUE position — cursor after `key:` on this line.
  const valueMatch = before.match(/^(\s*)(?:-\s+)?([A-Za-z0-9_-]+):\s+(.*)$/)
    ?? before.match(/^(\s*)(?:-\s+)?([A-Za-z0-9_-]+):$/);
  if (valueMatch) {
    const key = valueMatch[2];
    const partial = (valueMatch[3] ?? '').replace(/^["']/, '');
    const wf = parseRichWorkflow(text);
    const task = enclosingTask(wf, lines, lineIdx);
    const indent = valueMatch[1].length + (before.includes('- ') ? 2 : 0);
    let verb: string | undefined;
    let tool: string | undefined;
    if (task) {
      // Walk ancestors to find the enclosing verb block, if any.
      let probe = parentKey(lines, lineIdx, indent);
      while (probe) {
        if (VERBS.has(probe.key)) { verb = probe.key; break; }
        probe = parentKey(lines, lineIdx, probe.indent);
      }
      tool = nearbyTool(lines, lineIdx, task.line);
    }
    return { kind: 'value', key, verb, tool, partial };
  }

  // KEY position — typing a bare word (possibly after `- `).
  const keyMatch = before.match(/^(\s*)(?:-\s+)?([A-Za-z0-9_-]*)$/);
  if (!keyMatch) { return undefined; }
  const partial = keyMatch[2];
  const dashOffset = before.includes('- ') ? 2 : 0;
  const indent = keyMatch[1].length + dashOffset;

  const wf = parseRichWorkflow(text);
  const task = enclosingTask(wf, lines, lineIdx);

  if (!task) {
    return indent === 0 ? { kind: 'top-key', partial } : undefined;
  }

  const taskFieldIndent = Math.max(lines[task.line].search(/\S/), 0) + 2;
  if (indent === taskFieldIndent) {
    return { kind: 'task-key', partial };
  }

  // Deeper: inside a verb body?
  let probe = parentKey(lines, lineIdx, indent);
  while (probe) {
    if (VERBS.has(probe.key)) {
      return { kind: 'verb-key', verb: probe.key, partial };
    }
    if (probe.indent <= taskFieldIndent) { break; }
    probe = parentKey(lines, lineIdx, probe.indent);
  }
  return undefined;
}
