// inputsEdit.ts — « declare an input » + « make it callable » (pure).
// Typed `inputs:` are the input half of the callable contract (spec 01 ·
// they power `nika.run_workflow` over MCP and UI generation). This module
// inserts a declaration where the envelope reads (the `inputs:` block ·
// created after the model/description/workflow line when missing) and
// promotes an untyped row to the typed form, inferring `type:` from the
// YAML scalar it replaces. Refuses flow-form blocks — never a blind write.
//
// Named for the block it writes. The old name (`varsEdit`) carried the
// dead `vars:` spelling (NIKA-VALUES-001 · the E-split · R3a) in the
// filename itself, which kept a refused field alive in our vocabulary.
//
// On `inputs:` an entry is ALWAYS a typed declaration — `type:` is
// required (spec 01 §inputs), so the untyped `name: value` shorthand is
// not a legal input at all. `promoteInput` is therefore a REPAIR of an
// illegal row, not a nicety.

/** The 10 primitives of the closed type grammar (spec 09). The flat
 *  6-enum is dead (R3b · LAW-GRAMMAR-0211): `bool` is the one boolean
 *  spelling, and list / record types are TypeExpr CONSTRUCTORS
 *  (`{ array: T }` · `{ object: … }`), never the bare words
 *  `array` / `object`. */
export type VarType =
  | 'null' | 'bool' | 'integer' | 'number' | 'string'
  | 'bytes' | 'uri' | 'path' | 'duration' | 'timestamp';

/** The primitives, in spec order — the pick list a door offers. */
export const PRIMITIVE_TYPES: readonly VarType[] = [
  'string', 'integer', 'number', 'bool',
  'uri', 'path', 'duration', 'timestamp', 'bytes', 'null',
];

interface Block {
  line: number;
  /** Inclusive. */
  end: number;
}

function indentOf(line: string): number {
  const m = line.match(/^( *)\S/);
  return m ? m[1].length : -1;
}

/** Top-level block-form `inputs:` — flow-form returns undefined. */
export function findInputsBlock(lines: readonly string[]): Block | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (!/^inputs:\s*(#.*)?$/.test(lines[i])) { continue; }
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
  /** The declared type's HEAD WORD when typed — a primitive spells
   *  itself (`string`), a constructor yields its keyword
   *  (`{ array: string }` → `array`). */
  varType?: string;
  /** The scalar default, raw (untyped inline rows only). */
  inline?: string;
  /** Trailing `# …` on the row, when present (rides a promotion). */
  comment?: string;
}

/**
 * The head word of a type expression (spec 09). A primitive spells
 * itself; a CONSTRUCTOR is an object whose single key is the keyword —
 * `{ array: string }` → `array`, `{ object: { … } }` → `object`. The
 * old `[a-z]+` read only saw primitives, so every constructor-typed
 * entry read as UNTYPED once the flat 6-enum died.
 */
export function typeHeadWord(raw: string): string | undefined {
  const v = raw.replace(/#.*$/, '').trim();
  const ctor = v.match(/^\{\s*([a-z]+)\s*:/);
  if (ctor) { return ctor[1]; }
  const prim = v.match(/^["']?([a-z]+)["']?\s*$/);
  return prim ? prim[1] : undefined;
}

/** Entries at indent 2 within the block. An inline scalar is untyped;
 * a child map is typed iff it carries `type:` (the spec discriminator —
 * an object default legitimately holding `type` must already be using
 * the explicit typed form, so the heuristic matches the law). The
 * comment split demands whitespace before `#` so a quoted `"a#b"`
 * stays a value. */
export function parseInputEntries(lines: readonly string[], block: Block): VarEntry[] {
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
      let varType: string | undefined;
      for (let j = i + 1; j <= block.end; j++) {
        const ind = indentOf(lines[j]);
        if (ind !== -1 && ind <= 2) { break; }
        const t = lines[j].match(/^ {4}type\s*:\s*(.+)$/);
        if (t) { varType = typeHeadWord(t[1]); break; }
      }
      out.push({ name: m[1], line: i, typed: varType !== undefined, varType, comment });
    } else if (/^\{.*\btype\s*:/.test(value)) {
      // Inline `{ type: T, … }` — T runs to the next top-level comma.
      const after = value.replace(/^\{\s*/, '').match(/\btype\s*:\s*(.+)$/)?.[1] ?? '';
      const varType = typeHeadWord(after.replace(/,\s*[a-z_]+\s*:.*$/, '').replace(/\}\s*$/, ''));
      out.push({ name: m[1], line: i, typed: true, varType, comment });
    } else {
      out.push({ name: m[1], line: i, typed: false, inline: value, comment });
    }
  }
  return out;
}

export interface InputDecl {
  name: string;
  /** A primitive or a whole TypeExpr (`{ array: string }`). Omitted →
   *  `string`: `type:` is REQUIRED on an input, so there is no untyped
   *  form to fall back to (spec 01 §inputs). */
  type?: VarType | string;
  required?: boolean;
  /** Raw YAML scalar, written as-is. */
  def?: string;
  description?: string;
}

function declLines(d: InputDecl): string[] {
  const rows = [`  ${d.name}:`, `    type: ${d.type ?? 'string'}`];
  if (d.required) { rows.push('    required: true'); }
  if (d.def !== undefined) { rows.push(`    default: ${d.def}`); }
  if (d.description) { rows.push(`    description: "${d.description}"`); }
  return rows;
}

/** Insert the declaration at the end of `inputs:` — creating the block
 * after the first of model:/description:/workflow:/nika: when absent.
 * Undefined: flow-form inputs, duplicate name, or no envelope to anchor. */
export function declareInput(text: string, decl: InputDecl): string | undefined {
  const lines = text.split('\n');
  if (lines.some((l) => /^inputs:\s*[^#\s]/.test(l))) { return undefined; }
  const block = findInputsBlock(lines);
  if (block) {
    if (parseInputEntries(lines, block).some((e) => e.name === decl.name)) { return undefined; }
    lines.splice(block.end + 1, 0, ...declLines(decl));
    return lines.join('\n');
  }
  for (const key of ['model', 'workflow', 'nika']) {
    const at = lines.findIndex((l) => key === 'workflow'
      ? /^workflow:\s*(#.*)?$/.test(l) || /^workflow:\s/.test(l)
      : new RegExp(`^${key}:\\s`).test(l));
    if (at === -1) { continue; }
    // W1: the workflow OBJECT carries id + description — the inputs block
    // lands after its whole body, never inside it.
    let slot = at;
    if (key === 'workflow') {
      while (slot + 1 < lines.length && /^ {2}\S/.test(lines[slot + 1])) { slot += 1; }
    }
    lines.splice(slot + 1, 0, '', 'inputs:', ...declLines(decl));
    return lines.join('\n');
  }
  return undefined;
}

/** Infer a PRIMITIVE type from the untyped row's YAML scalar. Only the
 *  scalars we can name honestly — a list or a record needs a TypeExpr
 *  constructor, which `inferTypeExpr` handles. */
export function inferVarType(raw: string): VarType {
  const v = raw.trim();
  if (v === 'true' || v === 'false') { return 'bool'; }
  if (/^-?\d+$/.test(v)) { return 'integer'; }
  if (/^-?\d*\.\d+([eE][+-]?\d+)?$/.test(v)) { return 'number'; }
  return 'string';
}

/**
 * The full type expression for a YAML scalar (spec 09 · the closed type
 * grammar). A list lowers to the `{ array: T }` constructor with T read
 * from its first element — the bare word `array` is not a type.
 *
 * A record returns undefined ON PURPOSE: `{ object: … }` is CLOSED, so
 * inventing one would declare a shape the author never wrote and make
 * every unlisted field a violation. A guess that narrows the contract is
 * worse than no guess — the author writes that one by hand.
 */
export function inferTypeExpr(raw: string): string | undefined {
  const v = raw.trim();
  if (v.startsWith('{')) { return undefined; }
  if (v.startsWith('[')) {
    const first = v.slice(1).replace(/\]\s*$/, '').split(',')[0]?.trim() ?? '';
    return `{ array: ${first.length > 0 ? inferVarType(first) : 'string'} }`;
  }
  return inferVarType(v);
}

/** Promote an untyped row to the typed form — the value becomes
 * `default:` verbatim, its trailing comment rides along. Undefined when
 * the row moved, is already typed, has no inline value, or carries a
 * record literal (see `inferTypeExpr`). */
export function promoteInput(text: string, name: string): string | undefined {
  const lines = text.split('\n');
  const block = findInputsBlock(lines);
  if (!block) { return undefined; }
  const entry = parseInputEntries(lines, block).find((e) => e.name === name);
  if (!entry || entry.typed || entry.inline === undefined) { return undefined; }
  const type = inferTypeExpr(entry.inline);
  if (type === undefined) { return undefined; }
  lines.splice(entry.line, 1,
    `  ${name}:`,
    `    type: ${type}`,
    `    default: ${entry.inline}${entry.comment ? `   ${entry.comment}` : ''}`,
  );
  return lines.join('\n');
}
