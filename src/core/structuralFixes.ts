// structuralFixes.ts — structural graph edits + quick-fix builders (pure ·
// no vscode):
//
//   after entries   add/remove one `{producer: predicate}` control edge
//                   (the canvas connect gesture · `after: {a: succeeded}`)
//   NIKA-VAR-001    unresolved reference `vars.x` in task `X`
//                   → declare x under the top-level vars: block
//
// All edits are textual and indentation-faithful; all are idempotent
// (returns undefined when the target state already holds). The pre-W2
// NIKA-DAG-003 machinery (declare a missing depends_on) died with the
// code itself: in W2 the binding IS the edge — there is no « missing
// wire » class left to repair, only NIKA-VAR-021's hoist, which
// `nika check --fix` owns.

import { findTaskKey, insertionLine } from './flowEdit';
import { findTaskRefs } from './renameRefs';
import { NIKA_VERB_STARTERS } from './verbStarters.generated';
import { parseRichWorkflow } from '../workflowParser';

export interface Var001 { varName: string; task?: string }

/** Parse the VAR-001 message shape for `vars.x` references. */
export function parseVar001(message: string): Var001 | undefined {
  const m = message.match(/unresolved reference\s+`vars\.([a-z0-9_]+)`(?:\s+in task\s+`([a-z][a-z0-9_]*)`)?/);
  if (!m) { return undefined; }
  return { varName: m[1], task: m[2] };
}

/**
 * Add `{producer: predicate}` to `taskId`'s `after:` — extends an inline
 * flow map, appends a block entry, or inserts a fresh
 * `after: { producer: predicate }` at the canonical position (after
 * `with:` when present). Returns the rewritten document, or undefined
 * when the entry is already declared (any predicate — tightening an
 * existing entry is a hand edit, never a blind rewrite).
 */
export function addAfterEntry(
  text: string,
  taskId: string,
  producer: string,
  predicate = 'succeeded',
): string | undefined {
  const wf = parseRichWorkflow(text);
  const task = wf.tasks.find((t) => t.id === taskId);
  if (!task) { return undefined; }
  if (producer in task.after) { return undefined; }

  const lines = text.split('\n');
  const existing = findTaskKey(lines, task, 'after');
  if (existing) {
    const inline = existing.value.replace(/#.*$/, '').trim();
    if (inline.startsWith('{') && inline.endsWith('}')) {
      const body = inline.slice(1, -1).trim();
      const grown = body.length > 0 ? `${body}, ${producer}: ${predicate}` : `${producer}: ${predicate}`;
      lines.splice(existing.line, 1, `${' '.repeat(existing.indent)}after: { ${grown} }`);
      return lines.join('\n');
    }
    // Block form — append after the last entry line.
    lines.splice(existing.end + 1, 0, `${' '.repeat(existing.indent + 2)}${producer}: ${predicate}`);
    return lines.join('\n');
  }

  const fieldIndent = ' '.repeat(Math.max(lines[task.line].search(/\S/), 0) + 2);
  lines.splice(insertionLine(lines, task, 'after'), 0, `${fieldIndent}after: { ${producer}: ${predicate} }`);
  return lines.join('\n');
}

/**
 * Remove `producer` from `taskId`'s `after:` (inline flow map or block
 * form). Drops the whole key when the map empties. Undefined when the
 * entry is not declared. Data edges are NOT touchable here — a `with:`
 * binding is a ref the body reads, never blind-rewritten.
 */
export function removeAfterEntry(text: string, taskId: string, producer: string): string | undefined {
  const wf = parseRichWorkflow(text);
  const task = wf.tasks.find((t) => t.id === taskId);
  if (!task || !(producer in task.after)) { return undefined; }

  const lines = text.split('\n');
  const existing = findTaskKey(lines, task, 'after');
  if (!existing) { return undefined; }
  const inline = existing.value.replace(/#.*$/, '').trim();
  if (inline.startsWith('{') && inline.endsWith('}')) {
    const entries = inline.slice(1, -1).split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !new RegExp(`^${producer}\\s*:`).test(s));
    if (entries.length === 0) {
      lines.splice(existing.line, 1);
    } else {
      lines.splice(existing.line, 1, `${' '.repeat(existing.indent)}after: { ${entries.join(', ')} }`);
    }
    return lines.join('\n');
  }
  // Block form — drop the entry line; drop the key when nothing remains.
  // The walk is INDENT-bounded (not index-bounded): a splice shifts the
  // following lines into the old window, and counting a shallower line
  // as a « remaining entry » left a dangling `after:` key behind.
  let removed = false;
  let remaining = 0;
  for (let j = existing.line + 1; j < lines.length; j++) {
    if (lines[j].trim() === '') { continue; }
    const indent = lines[j].match(/^( *)\S/)?.[1].length ?? 0;
    if (indent <= existing.indent) { break; } // the block ended
    const m = lines[j].match(/^\s*([a-z][a-z0-9_]*)\s*:/);
    if (!m) { continue; }
    if (m[1] === producer) {
      lines.splice(j, 1);
      removed = true;
      j -= 1;
    } else {
      remaining += 1;
    }
  }
  if (!removed) { return undefined; }
  if (remaining === 0) { lines.splice(existing.line, 1); }
  return lines.join('\n');
}

// ─── Graph-editing backends (the n8n loop · YAML stays the source) ──────────

export type Verb = 'infer' | 'exec' | 'invoke' | 'agent';

/** A fresh task's body IS the verb's FIRST spec starter (the minimal
 * shape) — one voice with the « choose a starter » door: add-a-task
 * and the starter picker land the identical block, and the SSOT
 * (nika-spec stdlib · oracle-proven) owns both. */
function skeletonFor(verb: Verb): string[] {
  return NIKA_VERB_STARTERS[verb][0].body.replace(/\n$/, '').split('\n');
}

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
 * Insert a new task skeleton — after `afterTaskId` when given (wired
 * `after: { <id>: succeeded }` — the W2 spelling of a bare ordering),
 * else at the end of the `tasks:` block (creating the block when
 * absent). Returns the rewritten document + the new id, or undefined
 * when the insert anchor cannot be resolved.
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
    : skeletonFor(verb);

  // Key indent mirrors existing tasks (2 spaces under `tasks:` · W1 map).
  const anchor = afterTaskId
    ? wf.tasks.find((t) => t.id === afterTaskId)
    : wf.tasks[wf.tasks.length - 1];
  const itemIndent = anchor !== undefined
    ? ' '.repeat(Math.max(lines[anchor.line].search(/\S/), 0))
    : '  ';
  const fieldIndent = `${itemIndent}  `;

  const block = [
    '',
    `${itemIndent}${taskId}:`,
    ...(afterTaskId ? [`${fieldIndent}after: { ${afterTaskId}: succeeded }`] : []),
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
 * the task key line at task-property indent. Undefined when the task is
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
  const itemIndent = lines[task.line].search(/\S/);
  if (itemIndent < 0) { return undefined; }
  const fieldIndent = ' '.repeat(itemIndent + 2);
  lines.splice(task.line + 1, 0, `${fieldIndent}model: ${model}`);
  return lines.join('\n');
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
 * Splice a new task INTO a control edge (the n8n insert-on-edge move):
 * the skeleton lands right after `from` wired `after: { from: succeeded }`,
 * and the edge REROUTES — `to` drops its `from` entry (when declared; a
 * data edge has none) and gains the spliced task. Data refs are never
 * rewritten. Undefined when either end is unknown.
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
  let out = removeAfterEntry(ins.text, to, from) ?? ins.text;
  out = addAfterEntry(out, to, ins.taskId) ?? out;
  return { text: out, taskId: ins.taskId };
}

/**
 * Duplicate a task's whole item span right after the original — the ⌘D
 * move. The copy gets a fresh `<id>_copy` id (collision-suffixed); its
 * inbound wiring (after · with refs) is kept verbatim, downstream
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
  // W1 map form: the identity is the declaring key line (span line 0).
  const idPattern = new RegExp(`^(\\s*)${taskId}(\\s*:\\s*(#.*)?)$`);
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
