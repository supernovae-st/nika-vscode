// childContract.ts — the callable contract, read from both sides.
//
// Spec 01 §inputs: a child workflow's `inputs:` block IS its input
// contract — every entry a typed declaration
// (`{ type, required, default, description }`), with the normative
// discriminator: an object value carrying a string `type:` key IS a
// typed declaration. The parent supplies values through its invoke
// `args:` keys.
//
// A pre-flip child declaring `vars:` is still READ (its contract is
// the same shape) so a half-migrated pair of files still paints a
// card — the block is dead on the engine (NIKA-VALUES-001), not
// unreadable here.
//
// This module reads the FACTS on both sides (client best-effort —
// `nika check` owns conformance and the NIKA-COMP findings): what
// the child declares, what the parent supplies, and the join the
// card paints. No judgment, no invented verdicts — a required-and-
// unsupplied row simply shows both facts side by side.

// The 10 primitives of the closed type grammar (spec 09) plus the
// constructor keywords a head word can carry. `boolean` is dead —
// `bool` is the one boolean spelling (R3b · LAW-GRAMMAR-0211).
const TYPE_ENUM = new Set([
  'null', 'bool', 'integer', 'number', 'string',
  'bytes', 'uri', 'path', 'duration', 'timestamp',
  'array', 'map', 'object', 'union', 'optional', 'enum',
]);

export interface ContractVar {
  name: string;
  /** The closed-enum type, when the typed form declares one. */
  type?: string;
  required?: boolean;
  hasDefault?: boolean;
}

/** Parse the child's `inputs:` block (top-level key · one level of
 *  names · the typed-form discriminator honored). A pre-flip `vars:`
 *  block is accepted as the same shape. Pure text read — the same
 *  degraded-honest contract as bodyFacts. */
export function parseChildVars(text: string): ContractVar[] {
  const lines = text.split('\n');
  const out: ContractVar[] = [];
  let varsIndent = -1;
  let nameIndent = -1;
  let current: ContractVar | undefined;
  let currentIndent = -1;

  for (const line of lines) {
    if (line.trim().length === 0) { continue; }
    const key = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!key) {
      if (varsIndent >= 0 && line.search(/\S/) <= varsIndent) { break; }
      continue;
    }
    const indent = key[1].length;
    const name = key[2];
    const rest = key[3].trim();

    if (varsIndent === -1) {
      if (indent === 0 && (name === 'inputs' || name === 'vars')) { varsIndent = 0; }
      continue;
    }
    if (indent <= varsIndent) { break; } // the block closed

    if (nameIndent === -1) { nameIndent = indent; }
    if (indent === nameIndent) {
      current = { name };
      currentIndent = indent;
      out.push(current);
      // Untyped inline (`name: value`) — the value IS the default.
      if (rest.length > 0 && !rest.startsWith('#')) {
        // Inline flow typed form `{ type: string, required: true }`.
        const typeInline = rest.match(/\btype:\s*([a-z]+)/);
        if (rest.startsWith('{') && typeInline && TYPE_ENUM.has(typeInline[1])) {
          current.type = typeInline[1];
          if (/\brequired:\s*true/.test(rest)) { current.required = true; }
          if (/\bdefault:/.test(rest)) { current.hasDefault = true; }
        } else {
          current.hasDefault = true;
        }
      }
      continue;
    }
    // One level under a name — the typed form's fields.
    if (current !== undefined && indent > currentIndent) {
      if (name === 'type' && TYPE_ENUM.has(rest.replace(/["']/g, ''))) {
        current.type = rest.replace(/["']/g, '');
      }
      if (name === 'required' && rest.startsWith('true')) { current.required = true; }
      if (name === 'default') { current.hasDefault = true; }
    }
  }
  return out;
}

/** The parent side: the arg KEYS a task's `invoke: args:` block
 *  supplies (block members one level under args: · flow form keys). */
export function parseInvokeArgKeys(text: string, taskId: string): Set<string> {
  const lines = text.split('\n');
  const keys = new Set<string>();
  // Locate the task's item line (2-space map under tasks:).
  const taskRe = new RegExp(`^(\\s+)${taskId}:\\s*(#.*)?$`);
  let taskLine = -1;
  let taskIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(taskRe);
    if (m) { taskLine = i; taskIndent = m[1].length; break; }
  }
  if (taskLine === -1) { return keys; }
  let argsIndent = -1;
  for (let i = taskLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) { continue; }
    const key = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    const indent = line.search(/\S/);
    if (indent <= taskIndent) { break; } // next task
    if (argsIndent >= 0) {
      if (indent <= argsIndent) { argsIndent = -1; }
      else if (key) { keys.add(key[2]); continue; }
    }
    if (key && key[2] === 'args') {
      const rest = key[3].trim();
      if (rest.startsWith('{')) {
        // Flow form — key: value pairs inside one line.
        for (const m of rest.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) { keys.add(m[1]); }
      } else {
        argsIndent = key[1].length;
      }
    }
  }
  return keys;
}

export interface ContractRow {
  name: string;
  /** The joined read: supplied · default · required-unset · optional. */
  state: 'supplied' | 'default' | 'required-unset' | 'optional';
  type?: string;
}

/** The join the card paints — child declarations × parent args. */
export function joinContract(vars: ContractVar[], supplied: Set<string>): ContractRow[] {
  return vars.map((v) => ({
    name: v.name,
    state: supplied.has(v.name) ? 'supplied'
      : v.hasDefault === true ? 'default'
      : v.required === true ? 'required-unset'
      : 'optional',
    ...(v.type !== undefined ? { type: v.type } : {}),
  }));
}
