// schemaEdit.ts — « type its output » (pure): the hardest authoring
// moment in the language is the JSON-Schema-in-YAML block that turns an
// infer/agent into a typed, parseable unit. This module detects a verb
// block with no `schema:` and produces the surgical append of a proven
// shape — the lens offers it only where it's missing, the tests pin the
// indent discipline without a vscode host.

import { verbBlockEnd } from './verbBlocks';
import type { NikaVerb } from './verbStarters.generated';

/** Only the two verbs whose output a `schema:` types (spec 02-verbs). */
export function verbTakesSchema(verb: NikaVerb): boolean {
  return verb === 'infer' || verb === 'agent';
}

/** Whether the verb block opened at `verbLine` already carries `schema:`. */
export function verbHasSchema(
  lines: readonly string[],
  verbLine: number,
  indent: number,
): boolean {
  const end = verbBlockEnd(lines, verbLine, indent);
  const keyRe = new RegExp(`^ {${indent + 2}}schema\\s*:`);
  for (let i = verbLine + 1; i < end; i++) {
    if (keyRe.test(lines[i])) { return true; }
  }
  return false;
}

// The proven shapes — SSOT nika-spec stdlib/authoring-shapes-v0.1.yaml,
// oracle-proven at projection time. This module only re-exports: the
// register is spec truth, the surgical edit below is editor mechanics.
export { NIKA_SCHEMA_SHAPES as SCHEMA_SHAPES, type SchemaShape } from './authoringShapes.generated';
import type { SchemaShape } from './authoringShapes.generated';

export interface SchemaInsert {
  /** Line index to insert AT (exclusive end of the verb block). */
  atLine: number;
  /** Indented block text, trailing newline included. */
  text: string;
}

/**
 * The surgical append: `shape.body` re-indented to child depth, at the
 * end of the verb block. Undefined when the anchor moved, the verb
 * cannot carry a schema, or one is already there — refuse a blind write.
 */
export function schemaInsert(
  text: string,
  verbLine: number,
  verb: NikaVerb,
  shape: SchemaShape,
): SchemaInsert | undefined {
  if (!verbTakesSchema(verb)) { return undefined; }
  const lines = text.split('\n');
  const m = verbLine < lines.length
    ? lines[verbLine].match(/^( {2,6})(infer|exec|invoke|agent):\s*(#.*)?$/)
    : null;
  if (!m || m[2] !== verb) { return undefined; }
  const indent = m[1].length;
  if (verbHasSchema(lines, verbLine, indent)) { return undefined; }
  const pad = ' '.repeat(indent + 2);
  const body = shape.body
    .replace(/\n$/, '')
    .split('\n')
    .map((l) => (l.trim() === '' ? '' : pad + l))
    .join('\n');
  return { atLine: verbBlockEnd(lines, verbLine, indent), text: `${body}\n` };
}
