// varsEdit.ts — « declare an input » + « make it callable » (pure).
// Typed `vars:` are the input half of the callable contract (spec 01 ·
// they power `nika.run_workflow` over MCP and UI generation); the
// untyped form is the value-is-the-default shorthand. This module
// inserts a declaration where the envelope reads (vars block · created
// after the model/description/workflow line when missing) and promotes
// an untyped row to the typed form, inferring `type:` from the YAML
// scalar it replaces. Refuses flow-form blocks — never a blind write.

export type VarType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

interface Block {
  line: number;
  /** Inclusive. */
  end: number;
}

function indentOf(line: string): number {
  const m = line.match(/^( *)\S/);
  return m ? m[1].length : -1;
}

/** Top-level block-form `vars:` — flow-form returns undefined. */
export function findVarsBlock(lines: readonly string[]): Block | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (!/^vars:\s*(#.*)?$/.test(lines[i])) { continue; }
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      const ind = indentOf(lines[j]);
      if (ind === -1) { end = j; continue; }
      if (ind > 0) { end = j; continue; }
      break;
    }
    while (end > i && lines[end].trim() === '') { end -= 1; }
    return { line: i, end };
  }
  return undefined;
}

export interface VarEntry {
  name: string;
  /** Line of `name:`. */
  line: number;
  /** Spec discriminator: an object value carrying a string `type:` key. */
  typed: boolean;
  /** The scalar default, raw (untyped inline rows only). */
  inline?: string;
  /** Trailing `# …` on the row, when present (rides a promotion). */
  comment?: string;
}

/** Entries at indent 2 within the block. An inline scalar is untyped;
 * a child map is typed iff it carries `type:` (the spec discriminator —
 * an object default legitimately holding `type` must already be using
 * the explicit typed form, so the heuristic matches the law). The
 * comment split demands whitespace before `#` so a quoted `"a#b"`
 * stays a value. */
export function parseVarEntries(lines: readonly string[], block: Block): VarEntry[] {
  const out: VarEntry[] = [];
  for (let i = block.line + 1; i <= block.end; i++) {
    const m = lines[i].match(/^ {2}([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) { continue; }
    const raw = m[2];
    const hash = raw.search(/(^|\s)#/);
    const value = (hash === -1 ? raw : raw.slice(0, hash)).trim();
    const comment = hash === -1 ? undefined : raw.slice(hash).trim();
    if (value.length === 0) {
      // Block-map child — typed iff a `type:` key sits one level deeper.
      let typed = false;
      for (let j = i + 1; j <= block.end; j++) {
        const ind = indentOf(lines[j]);
        if (ind !== -1 && ind <= 2) { break; }
        if (/^ {4}type\s*:/.test(lines[j])) { typed = true; break; }
      }
      out.push({ name: m[1], line: i, typed, comment });
    } else if (/^\{.*\btype\s*:/.test(value)) {
      out.push({ name: m[1], line: i, typed: true, comment });
    } else {
      out.push({ name: m[1], line: i, typed: false, inline: value, comment });
    }
  }
  return out;
}

export interface InputDecl {
  name: string;
  /** Omitted → the untyped shorthand (`name: default`). */
  type?: VarType;
  required?: boolean;
  /** Raw YAML scalar, written as-is. */
  def?: string;
  description?: string;
}

function declLines(d: InputDecl): string[] {
  if (d.type === undefined) {
    return [`  ${d.name}: ${d.def ?? '""'}`];
  }
  const rows = [`  ${d.name}:`, `    type: ${d.type}`];
  if (d.required) { rows.push('    required: true'); }
  if (d.def !== undefined) { rows.push(`    default: ${d.def}`); }
  if (d.description) { rows.push(`    description: "${d.description}"`); }
  return rows;
}

/** Insert the declaration at the end of `vars:` — creating the block
 * after the first of model:/description:/workflow:/nika: when absent.
 * Undefined: flow-form vars, duplicate name, or no envelope to anchor. */
export function declareInput(text: string, decl: InputDecl): string | undefined {
  const lines = text.split('\n');
  if (lines.some((l) => /^vars:\s*[^#\s]/.test(l))) { return undefined; }
  const block = findVarsBlock(lines);
  if (block) {
    if (parseVarEntries(lines, block).some((e) => e.name === decl.name)) { return undefined; }
    lines.splice(block.end + 1, 0, ...declLines(decl));
    return lines.join('\n');
  }
  for (const key of ['model', 'description', 'workflow', 'nika']) {
    const at = lines.findIndex((l) => new RegExp(`^${key}:\\s`).test(l));
    if (at === -1) { continue; }
    lines.splice(at + 1, 0, '', 'vars:', ...declLines(decl));
    return lines.join('\n');
  }
  return undefined;
}

/** Infer the typed-form `type:` from the untyped row's YAML scalar. */
export function inferVarType(raw: string): VarType {
  const v = raw.trim();
  if (v === 'true' || v === 'false') { return 'boolean'; }
  if (/^-?\d+$/.test(v)) { return 'integer'; }
  if (/^-?\d*\.\d+([eE][+-]?\d+)?$/.test(v)) { return 'number'; }
  if (v.startsWith('[')) { return 'array'; }
  if (v.startsWith('{')) { return 'object'; }
  return 'string';
}

/** Promote an untyped row to the typed form — the value becomes
 * `default:` verbatim, its trailing comment rides along. Undefined when
 * the row moved, is already typed, or has no inline value. */
export function promoteVar(text: string, name: string): string | undefined {
  const lines = text.split('\n');
  const block = findVarsBlock(lines);
  if (!block) { return undefined; }
  const entry = parseVarEntries(lines, block).find((e) => e.name === name);
  if (!entry || entry.typed || entry.inline === undefined) { return undefined; }
  lines.splice(entry.line, 1,
    `  ${name}:`,
    `    type: ${inferVarType(entry.inline)}`,
    `    default: ${entry.inline}${entry.comment ? `   ${entry.comment}` : ''}`,
  );
  return lines.join('\n');
}
