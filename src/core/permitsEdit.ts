// permitsEdit.ts — apply the check fix grammar to workflow YAML (pure).
//
// `nika check` emits machine-applicable fixes in ONE locked form:
//
//     add "<value>" to permits.<dotted.path>
//
// (the fix grammar IS an API — agents and this extension converge on the
// same applier). This module parses that line and computes the textual
// edit: insert the value under the right nested key inside the top-level
// `permits:` block, creating missing levels — or the whole block — with
// 2-space indentation. Returns the FULL rewritten document (small files ·
// deterministic diff) so the caller applies one WorkspaceEdit.

export interface ParsedFix {
  value: string;
  /** Path segments under `permits` (e.g. ["net", "hosts"]). */
  path: string[];
}

const FIX_RE = /^add\s+"((?:[^"\\]|\\.)*)"\s+to\s+permits((?:\.[A-Za-z0-9_-]+)+)\s*$/;

export function parseFix(fix: string): ParsedFix | undefined {
  const m = fix.trim().match(FIX_RE);
  if (!m) { return undefined; }
  return {
    value: m[1].replace(/\\(.)/g, '$1'),
    path: m[2].slice(1).split('.'),
  };
}

interface Block {
  /** Line index of the key. */
  line: number;
  /** Indent (spaces) of the key. */
  indent: number;
  /** Last line index belonging to the block (inclusive). */
  end: number;
}

function indentOf(line: string): number {
  const m = line.match(/^( *)\S/);
  return m ? m[1].length : -1;
}

/** Find `key:` at exactly `indent` spaces within [from, to]. */
function findKey(lines: string[], key: string, indent: number, from: number, to: number): Block | undefined {
  const keyRe = new RegExp(`^ {${indent}}${key}\\s*:`);
  for (let i = from; i <= to && i < lines.length; i++) {
    if (!keyRe.test(lines[i])) { continue; }
    // Block extends while lines are blank, comments, or deeper-indented.
    let end = i;
    for (let j = i + 1; j <= to && j < lines.length; j++) {
      const ind = indentOf(lines[j]);
      if (ind === -1) { end = j; continue; } // blank line stays inside
      if (ind > indent) { end = j; continue; }
      break;
    }
    // Trim trailing blank lines out of the block.
    while (end > i && lines[end].trim() === '') { end -= 1; }
    return { line: i, indent, end };
  }
  return undefined;
}

/**
 * Insert `value` into a FLOW-style line (`net: { http: ["a.com"] }`) —
 * the exact shape `check --infer-permits` emits. Walks `restPath` keys
 * left-to-right inside the line, expects a flow list at the end, and
 * splices the value in. Returns undefined when the shape is not handled
 * (nested unknown flow · not a list · value already present) — the caller
 * REFUSES rather than corrupting the YAML.
 */
function insertIntoFlowLine(lineText: string, restPath: string[], value: string): string | undefined {
  let cursor = lineText.indexOf(':') + 1;
  if (cursor === 0) { return undefined; }
  for (const seg of restPath) {
    const re = new RegExp(
      `(?<![A-Za-z0-9_-])${seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`,
    );
    const m = lineText.slice(cursor).match(re);
    if (!m || m.index === undefined) { return undefined; }
    cursor = cursor + m.index + m[0].length;
  }
  const open = lineText.indexOf('[', cursor);
  if (open === -1) { return undefined; }
  if (lineText.slice(cursor, open).trim() !== '') { return undefined; }
  // Quote-aware scan for the matching close bracket (both YAML quote
  // styles — a `]` inside 'single-quoted' must not close the list);
  // refuse nested flow.
  let close = -1;
  let quote: '"' | "'" | undefined;
  for (let j = open + 1; j < lineText.length; j++) {
    const c = lineText[j];
    if (quote) {
      if (c === quote && (quote === "'" || lineText[j - 1] !== '\\')) { quote = undefined; }
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === ']') { close = j; break; }
    if (c === '[' || c === '{') { return undefined; }
  }
  if (close === -1) { return undefined; }
  const inner = lineText.slice(open + 1, close);
  const existing = inner
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter((s) => s.length > 0);
  if (existing.includes(value)) { return undefined; }
  const insertion = inner.trim() === ''
    ? `"${value}"`
    : `${inner.replace(/\s+$/, '')}, "${value}"`;
  return lineText.slice(0, open + 1) + insertion + lineText.slice(close);
}

/** The inline content after `key:` when the line carries a flow value. */
function flowTailOf(lineText: string): string | undefined {
  const tail = lineText.match(/^\s*(?:[A-Za-z0-9_-]+)\s*:\s*(\S.*)$/)?.[1];
  if (tail === undefined || tail.startsWith('#')) { return undefined; }
  return tail;
}

/**
 * Apply a parsed fix to the document text. Pure: returns the new text,
 * or undefined when the value is already present under the target path
 * (or the shape cannot be edited safely).
 */
export function applyPermitsFix(text: string, fix: ParsedFix): string | undefined {
  const lines = text.split('\n');
  const item = (indent: number): string => `${' '.repeat(indent)}- "${fix.value}"`;

  const permits = findKey(lines, 'permits', 0, 0, lines.length - 1);
  if (!permits) {
    // No boundary yet — create the whole block at the end of the document.
    const block: string[] = ['', 'permits:'];
    let indent = 2;
    for (const seg of fix.path) {
      block.push(`${' '.repeat(indent)}${seg}:`);
      indent += 2;
    }
    block.push(item(indent));
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') { lines.pop(); }
    return [...lines, ...block, ''].join('\n');
  }

  // Walk/create the nested path inside the permits block.
  let scope = permits;
  let depth = 1; // permits = depth 0 keys at indent 0; children at 2, 4, …
  for (let i = 0; i < fix.path.length; i++) {
    // Flow-style scope line (`net: { http: [] }` · the --infer-permits
    // shape): a block walk below it would splice malformed YAML. Edit the
    // line in place — or refuse, never corrupt.
    if (flowTailOf(lines[scope.line]) !== undefined) {
      const updated = insertIntoFlowLine(lines[scope.line], fix.path.slice(i), fix.value);
      if (updated === undefined) { return undefined; }
      lines[scope.line] = updated;
      return lines.join('\n');
    }
    const seg = fix.path[i];
    const childIndent = depth * 2;
    const child = findKey(lines, seg, childIndent, scope.line + 1, scope.end);
    if (!child) {
      // Insert the missing remainder right after the deepest existing
      // scope. Index-based slice — `indexOf(seg)` would resolve to the
      // FIRST occurrence when the path repeats a segment name.
      const insert: string[] = [];
      let indent = childIndent;
      for (const rest of fix.path.slice(i)) {
        insert.push(`${' '.repeat(indent)}${rest}:`);
        indent += 2;
      }
      insert.push(item(indent));
      lines.splice(scope.end + 1, 0, ...insert);
      return lines.join('\n');
    }
    scope = child;
    depth += 1;
  }

  // Path fully walked. The leaf may itself be a flow list on one line
  // (`hosts: ["a.com"]`) — splicing a block item after it would be
  // malformed; edit in place instead.
  if (flowTailOf(lines[scope.line]) !== undefined) {
    const updated = insertIntoFlowLine(lines[scope.line], [], fix.value);
    if (updated === undefined) { return undefined; }
    lines[scope.line] = updated;
    return lines.join('\n');
  }

  // Block-style leaf — check for duplicates, then append the list item.
  const wanted = fix.value;
  for (let i = scope.line + 1; i <= scope.end; i++) {
    const m = lines[i].match(/^\s*-\s*"?((?:[^"#\\]|\\.)*?)"?\s*(?:#.*)?$/);
    if (m && m[1] === wanted) { return undefined; }
  }
  lines.splice(scope.end + 1, 0, item(depth * 2));
  return lines.join('\n');
}

/** Insert a full inferred `permits:` boundary (from `check --infer-permits`). */
export function insertPermitsBlock(text: string, permitsYaml: string): string {
  const lines = text.split('\n');
  const existing = findKey(lines, 'permits', 0, 0, lines.length - 1);
  const blockLines = permitsYaml.replace(/\s+$/, '').split('\n');
  if (existing) {
    lines.splice(existing.line, existing.end - existing.line + 1, ...blockLines);
    return lines.join('\n');
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') { lines.pop(); }
  return [...lines, '', ...blockLines, ''].join('\n');
}
