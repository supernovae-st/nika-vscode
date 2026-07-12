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

export interface SchemaShape {
  id: string;
  /** The picker row (≤ 40 chars). */
  label: string;
  /** The picker detail — teaches the why. */
  hint: string;
  /** The schema block, unindented (first line is `schema:`). */
  body: string;
}

/** The proven shapes — every one a top-level object (the portable
 * structured-output form on every provider; the starters teach the
 * same). SLOT comments mark what the author renames. */
export const SCHEMA_SHAPES: readonly SchemaShape[] = [
  {
    id: 'fields',
    label: 'named fields',
    hint: 'The workhorse — an object whose required fields ARE the contract.',
    body: 'schema:                # the response MUST match — structured output\n'
      + '  type: object\n'
      + '  required: [summary]   # SLOT: the fields you demand\n'
      + '  properties:\n'
      + '    summary: { type: string }\n',
  },
  {
    id: 'list',
    label: 'a list',
    hint: 'items: an array field — extraction, findings, batch results.',
    body: 'schema:\n'
      + '  type: object\n'
      + '  required: [items]\n'
      + '  properties:\n'
      + '    items:\n'
      + '      type: array\n'
      + '      items: { type: string }   # SLOT: the element shape\n',
  },
  {
    id: 'verdict',
    label: 'a verdict',
    hint: 'boolean + reason — the judge shape gates and goldens consume.',
    body: 'schema:\n'
      + '  type: object\n'
      + '  required: [verdict, reason]\n'
      + '  properties:\n'
      + '    verdict: { type: boolean }\n'
      + '    reason: { type: string }\n',
  },
  {
    id: 'grade',
    label: 'a grade',
    hint: 'enum: the closed set — the model cannot invent a fifth answer.',
    body: 'schema:\n'
      + '  type: object\n'
      + '  required: [grade]\n'
      + '  properties:\n'
      + '    grade: { type: string, enum: [A, B, C] }   # SLOT: the closed set\n',
  },
];

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
