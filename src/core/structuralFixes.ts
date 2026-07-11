// structuralFixes.ts — quick-fix builders for the two conformance classes
// the corpus work proved most common (pure · no vscode):
//
//   NIKA-DAG-003  task `X` references `tasks.Y` without declaring `Y` in
//                 depends_on   → add/extend depends_on on task X
//   NIKA-VAR-001  unresolved reference `vars.x` in task `X`
//                 → declare x under the top-level vars: block
//
// Both edits are textual and indentation-faithful; both are idempotent
// (returns undefined when the declaration already exists).

import { findTaskRefs } from './renameRefs';
import { parseRichWorkflow } from '../workflowParser';

export interface Dag003 { task: string; missing: string }
export interface Var001 { varName: string; task?: string }

/** Parse the DAG-003 message shape (tolerant of the nested-backtick form). */
export function parseDag003(message: string): Dag003 | undefined {
  const m = message.match(/task\s+`+([a-z][a-z0-9_]*)`+\s+references\s+`tasks\.([a-z][a-z0-9_]*)`?[^`]*without declaring/);
  if (!m) { return undefined; }
  return { task: m[1], missing: m[2] };
}

/** Parse the VAR-001 message shape for `vars.x` references. */
export function parseVar001(message: string): Var001 | undefined {
  const m = message.match(/unresolved reference\s+`vars\.([a-z0-9_]+)`(?:\s+in task\s+`([a-z][a-z0-9_]*)`)?/);
  if (!m) { return undefined; }
  return { varName: m[1], task: m[2] };
}

/**
 * Add `dep` to `taskId`'s depends_on — extends an inline list, appends a
 * block item, or inserts a fresh `depends_on: [dep]` right after the id
 * line. Returns the rewritten document, or undefined when already present.
 */
export function addDependsOn(text: string, taskId: string, dep: string): string | undefined {
  const wf = parseRichWorkflow(text);
  const task = wf.tasks.find((t) => t.id === taskId);
  if (!task) { return undefined; }
  if (task.dependsOn.includes(dep)) { return undefined; }

  const lines = text.split('\n');
  const fieldIndent = ' '.repeat(lines[task.line].indexOf('-') + 2);

  for (let i = task.line; i <= task.endLine; i++) {
    const line = lines[i];
    const inline = line.match(/^(\s*depends_on:\s*\[)([^\]]*)(\].*)$/);
    if (inline) {
      const inner = inline[2].trim();
      lines[i] = inline[1] + (inner.length > 0 ? `${inline[2].replace(/\s+$/, '')}, ${dep}` : dep) + inline[3];
      return lines.join('\n');
    }
    if (/^\s*depends_on:\s*$/.test(line)) {
      // Block form — append after the last item. YAML allows list items
      // at the SAME indent as the key (a legal style the parser reads),
      // so the scan accepts >= — but only for `- ` lines, so the next
      // sibling task item (shallower) still terminates it.
      let last = i;
      const keyIndent = line.match(/^( *)/)?.[1].length ?? 0;
      for (let j = i + 1; j <= task.endLine; j++) {
        if (lines[j].trim() === '') { continue; }
        if (/^\s*-\s/.test(lines[j]) && (lines[j].match(/^( *)/)?.[1].length ?? 0) >= keyIndent) {
          last = j;
          continue;
        }
        break;
      }
      const itemIndent = last === i
        ? `${line.match(/^( *)/)?.[1] ?? ''}  `
        : (lines[last].match(/^( *)/)?.[1] ?? '');
      lines.splice(last + 1, 0, `${itemIndent}- ${dep}`);
      return lines.join('\n');
    }
  }

  // No depends_on yet — insert directly under the `- id:` line.
  lines.splice(task.line + 1, 0, `${fieldIndent}depends_on: [${dep}]`);
  return lines.join('\n');
}

// ─── Graph-editing backends (the n8n loop · YAML stays the source) ──────────

export type Verb = 'infer' | 'exec' | 'invoke' | 'agent';

const SKELETONS: Record<Verb, string[]> = {
  infer: ['infer:', '  prompt: "Describe what to infer"'],
  exec: ['exec:', '  command: "echo hello"'],
  invoke: ['invoke:', '  tool: nika:log', '  args:', '    message: "hello"'],
  agent: [
    'agent:',
    '  model: mock/echo',
    '  prompt: "Describe the goal"',
    '  tools:',
    '    - "nika:done"',
    '  max_turns: 5',
  ],
};

/** First free `<base>_N` id (engine grammar: snake_case). The base is
 *  the verb — or the bare tool name when the task palette picked one
 *  (`jq` reads better than `invoke_4`). */
export function nextTaskId(text: string, base: string): string {
  const wf = parseRichWorkflow(text);
  const taken = new Set(wf.tasks.map((t) => t.id));
  if (!taken.has(base)) { return base; }
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) { return candidate; }
  }
}

/**
 * Insert a new task skeleton — after `afterTaskId` when given, else at the
 * end of the `tasks:` block (creating the block when absent). Returns the
 * rewritten document + the new id, or undefined when the insert anchor
 * cannot be resolved.
 *
 * `tool` (task palette · invoke only): the skeleton pins THAT tool and
 * deliberately writes NO args — the check's findings teach the tool's
 * required args in its own voice (one voice: CLI · findings · LSP).
 */
export function insertTaskSkeleton(
  text: string,
  verb: Verb,
  afterTaskId?: string,
  tool?: string,
): { text: string; taskId: string } | undefined {
  const wf = parseRichWorkflow(text);
  const lines = text.split('\n');
  const bare = verb === 'invoke' ? tool?.match(/^nika:([a-z][a-z0-9_]*)$/)?.[1] : undefined;
  const taskId = nextTaskId(text, bare ?? verb);
  const skeleton = bare !== undefined
    ? ['invoke:', `  tool: nika:${bare}`]
    : SKELETONS[verb];

  // Item indent mirrors existing tasks (2 spaces under `tasks:` default).
  const anchor = afterTaskId
    ? wf.tasks.find((t) => t.id === afterTaskId)
    : wf.tasks[wf.tasks.length - 1];
  const itemIndent = anchor !== undefined
    ? ' '.repeat(lines[anchor.line].indexOf('-'))
    : '  ';
  const fieldIndent = `${itemIndent}  `;

  const block = [
    '',
    `${itemIndent}- id: ${taskId}`,
    ...(afterTaskId ? [`${fieldIndent}depends_on: [${afterTaskId}]`] : []),
    ...skeleton.map((l) => `${fieldIndent}${l}`),
  ];

  if (anchor !== undefined) {
    lines.splice(anchor.endLine + 1, 0, ...block);
    return { text: lines.join('\n'), taskId };
  }

  const tasksLine = lines.findIndex((l) => /^tasks:\s*(#.*)?$/.test(l));
  if (tasksLine !== -1) {
    lines.splice(tasksLine + 1, 0, ...block.slice(1)); // no leading blank right under tasks:
    return { text: lines.join('\n'), taskId };
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') { lines.pop(); }
  lines.push('', 'tasks:', ...block.slice(1), '');
  return { text: lines.join('\n'), taskId };
}

/**
 * Set (or insert) a task-level `model:` — the canvas params-bar edit.
 * Replace when the task already declares one; else insert right under
 * the `- id:` line at task-property indent. Undefined when the task is
 * unknown or the value fails the provider/model shape.
 */
export function setTaskModel(text: string, taskId: string, model: string): string | undefined {
  if (!/^[a-z0-9_-]+\/[A-Za-z0-9._:-]+$/.test(model)) { return undefined; }
  const wf = parseRichWorkflow(text);
  const task = wf.tasks.find((t) => t.id === taskId);
  if (!task) { return undefined; }
  const lines = text.split('\n');

  for (let i = task.line; i <= task.endLine && i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)model:\s*.*$/);
    if (m) {
      lines[i] = `${m[1]}model: ${model}`;
      return lines.join('\n');
    }
  }
  const itemIndent = lines[task.line].indexOf('-');
  if (itemIndent < 0) { return undefined; }
  const fieldIndent = ' '.repeat(itemIndent + 2);
  lines.splice(task.line + 1, 0, `${fieldIndent}model: ${model}`);
  return lines.join('\n');
}

/**
 * Remove `dep` from `taskId`'s depends_on (inline or block form). Drops
 * the whole key when the list empties. Undefined when not present.
 */
export function removeDependsOn(text: string, taskId: string, dep: string): string | undefined {
  const wf = parseRichWorkflow(text);
  const task = wf.tasks.find((t) => t.id === taskId);
  if (!task || !task.dependsOn.includes(dep)) { return undefined; }

  const lines = text.split('\n');
  for (let i = task.line; i <= task.endLine; i++) {
    const inline = lines[i].match(/^(\s*depends_on:\s*\[)([^\]]*)(\].*)$/);
    if (inline) {
      const unquote = (s: string): string => s.replace(/^['"]|['"]$/g, '');
      const items = inline[2].split(',').map((s) => s.trim()).filter((s) => s.length > 0 && unquote(s) !== dep);
      if (items.length === 0) {
        lines.splice(i, 1);
      } else {
        lines[i] = inline[1] + items.join(', ') + inline[3];
      }
      return lines.join('\n');
    }
    if (/^\s*depends_on:\s*$/.test(lines[i])) {
      const keyIndent = lines[i].search(/\S/);
      let removed = false;
      let remaining = 0;
      for (let j = i + 1; j <= task.endLine + 1 && j < lines.length; j++) {
        if (lines[j].trim() === '') { continue; }
        const indent = lines[j].search(/\S/);
        if (indent <= keyIndent || !lines[j].trim().startsWith('-')) { break; }
        if (new RegExp(`^\\s*-\\s*(['"]?)${dep}\\1\\s*(#.*)?$`).test(lines[j])) {
          lines.splice(j, 1);
          removed = true;
          j -= 1;
        } else {
          remaining += 1;
        }
      }
      if (removed && remaining === 0) { lines.splice(i, 1); }
      return removed ? lines.join('\n') : undefined;
    }
  }
  return undefined;
}

/**
 * Delete a task's whole item span. REFUSES (returns the referencing ids)
 * when other homes still point at it — a graph edit must not silently
 * break the DAG; the caller surfaces « referenced by X · Y ».
 */
export function deleteTask(
  text: string,
  taskId: string,
): { text: string } | { blockedBy: string[] } | undefined {
  const wf = parseRichWorkflow(text);
  const task = wf.tasks.find((t) => t.id === taskId);
  if (!task) { return undefined; }

  const externalRefs = findTaskRefs(text, taskId).filter((r) => {
    if (r.home === 'declaration') { return false; }
    // Refs INSIDE the task's own span die with it (offsets → line check).
    const line = text.slice(0, r.start).split('\n').length - 1;
    return line < task.line || line > task.endLine;
  });
  if (externalRefs.length > 0) {
    const owners = new Set<string>();
    for (const ref of externalRefs) {
      const line = text.slice(0, ref.start).split('\n').length - 1;
      const owner = wf.tasks.find((t) => line >= t.line && line <= t.endLine);
      owners.add(owner?.id ?? 'outputs');
    }
    return { blockedBy: [...owners] };
  }

  const lines = text.split('\n');
  let end = task.endLine;
  // Swallow ONE trailing blank separator so deletes stay symmetric.
  if (end + 1 < lines.length && lines[end + 1].trim() === '') { end += 1; }
  lines.splice(task.line, end - task.line + 1);
  return { text: lines.join('\n') };
}

/**
 * Splice a new task INTO an edge (the n8n insert-on-edge move): the
 * skeleton lands right after `from` wired `depends_on: [from]`, and the
 * edge REROUTES — `to` drops its `from` dependency (when declared; a
 * data-only edge has none) and gains the spliced task. Data refs are
 * never rewritten. Undefined when either end is unknown.
 */
export function insertBetween(
  text: string,
  from: string,
  to: string,
  verb: Verb,
  tool?: string,
): { text: string; taskId: string } | undefined {
  const wf = parseRichWorkflow(text);
  if (!wf.tasks.some((t) => t.id === from) || !wf.tasks.some((t) => t.id === to)) {
    return undefined;
  }
  const ins = insertTaskSkeleton(text, verb, from, tool);
  if (!ins) { return undefined; }
  let out = removeDependsOn(ins.text, to, from) ?? ins.text;
  out = addDependsOn(out, to, ins.taskId) ?? out;
  return { text: out, taskId: ins.taskId };
}

/**
 * Duplicate a task's whole item span right after the original — the ⌘D
 * move. The copy gets a fresh `<id>_copy` id (collision-suffixed); its
 * inbound wiring (depends_on · with refs) is kept verbatim, downstream
 * refs stay on the original. Undefined when the task is unknown.
 */
export function duplicateTask(
  text: string,
  taskId: string,
): { text: string; taskId: string } | undefined {
  const wf = parseRichWorkflow(text);
  const task = wf.tasks.find((t) => t.id === taskId);
  if (!task) { return undefined; }

  const taken = new Set(wf.tasks.map((t) => t.id));
  let newId = `${taskId}_copy`;
  for (let n = 2; taken.has(newId); n++) { newId = `${taskId}_copy${n}`; }

  const lines = text.split('\n');
  const span = lines.slice(task.line, task.endLine + 1);
  const idPattern = new RegExp(`^(\\s*-\\s*id:\\s*)${taskId}(\\s*(#.*)?)$`);
  const idIdx = span.findIndex((l) => idPattern.test(l));
  if (idIdx === -1) { return undefined; }
  const copy = [...span];
  copy[idIdx] = copy[idIdx].replace(idPattern, `$1${newId}$2`);

  lines.splice(task.endLine + 1, 0, '', ...copy);
  return { text: lines.join('\n'), taskId: newId };
}

/**
 * Declare `varName` under the top-level `vars:` block (creating the block
 * after the envelope when absent). Returns undefined when already declared.
 */
export function addVarDeclaration(text: string, varName: string): string | undefined {
  const wf = parseRichWorkflow(text);
  if (wf.varsKeys.includes(varName)) { return undefined; }

  const lines = text.split('\n');
  const varsLine = lines.findIndex((l) => /^vars:\s*(#.*)?$/.test(l));
  if (varsLine !== -1) {
    // Append after the last line BELONGING to the block — any indented
    // line (entries AND their multi-line values: block scalars, nested
    // maps, 4-space styles). The block ends at the next top-level key.
    let last = varsLine;
    let entryIndent = 2;
    let sawEntry = false;
    for (let i = varsLine + 1; i < lines.length; i++) {
      if (lines[i].trim() === '') { continue; }
      const indent = lines[i].match(/^( *)/)?.[1].length ?? 0;
      if (indent === 0) { break; }
      if (!sawEntry) { entryIndent = indent; sawEntry = true; }
      last = i;
    }
    lines.splice(last + 1, 0, `${' '.repeat(entryIndent)}${varName}: ""`);
    return lines.join('\n');
  }

  // Create the block before `tasks:` (the conventional envelope order),
  // else at the end of the document.
  const tasksLine = lines.findIndex((l) => /^tasks:\s*(#.*)?$/.test(l));
  const block = ['vars:', `  ${varName}: ""`, ''];
  if (tasksLine !== -1) {
    lines.splice(tasksLine, 0, ...block);
  } else {
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') { lines.pop(); }
    lines.push('', ...block.slice(0, 2), '');
  }
  return lines.join('\n');
}
