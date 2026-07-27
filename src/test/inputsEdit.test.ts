import { describe, expect, it } from 'vitest';
import {
  declareInput, findInputsBlock, inferTypeExpr, inferVarType,
  parseInputEntries, promoteInput, typeHeadWord,
} from '../core/inputsEdit';

const WF = `nika: v1
workflow:
  id: w
model: mock/echo

inputs:
  output_dir: "./out"   # where artifacts land
  topic:
    type: string
    required: true
  retries: 3
  locales:
    type: { array: string }
  config: { type: { object: { a: string } }, default: { type: "custom" } }

tasks:
  a:
    infer:
      prompt: "\${{ inputs.topic }}"
`;

describe('inputsEdit (« declare an input » · « make it callable »)', () => {
  it('reads the block — typed vs untyped per the spec discriminator', () => {
    const lines = WF.split('\n');
    const entries = parseInputEntries(lines, findInputsBlock(lines)!);
    expect(entries.map((e) => [e.name, e.typed])).toEqual([
      ['output_dir', false],
      ['topic', true],
      ['retries', false],
      ['locales', true],
      ['config', true],
    ]);
    expect(entries[0].inline).toBe('"./out"');
    expect(entries[0].comment).toBe('# where artifacts land');
  });

  it('reads a CONSTRUCTOR type, not just a primitive', () => {
    // The flat 6-enum is dead (R3b): a list type is `{ array: T }`. A
    // reader that only matched `[a-z]+` saw those entries as UNTYPED and
    // would have offered to « promote » an already-typed input.
    const lines = WF.split('\n');
    const entries = parseInputEntries(lines, findInputsBlock(lines)!);
    expect(entries.find((e) => e.name === 'locales')?.varType).toBe('array');
    expect(entries.find((e) => e.name === 'config')?.varType).toBe('object');
    expect(entries.find((e) => e.name === 'topic')?.varType).toBe('string');
  });

  it('typeHeadWord takes the keyword off any type expression', () => {
    expect(typeHeadWord('string')).toBe('string');
    expect(typeHeadWord('"bool"')).toBe('bool');
    expect(typeHeadWord('{ array: string }')).toBe('array');
    expect(typeHeadWord('{ object: { a: string } }')).toBe('object');
    expect(typeHeadWord('{ union: [string, null] }')).toBe('union');
    expect(typeHeadWord('Summary')).toBeUndefined(); // a named type, not a keyword
  });

  it('a quoted hash stays a value, not a comment', () => {
    const wf = 'inputs:\n  tag: "a#b"\n';
    const lines = wf.split('\n');
    const [tag] = parseInputEntries(lines, findInputsBlock(lines)!);
    expect(tag.inline).toBe('"a#b"');
    expect(tag.comment).toBeUndefined();
  });

  it('declares a typed input at the end of the block', () => {
    const next = declareInput(WF, {
      name: 'lang', type: 'string', required: true, description: 'target language',
    })!;
    expect(next).toContain('  lang:\n    type: string\n    required: true\n    description: "target language"');
    // Lands INSIDE inputs: — before the blank line that closes the block.
    expect(next.indexOf('lang:')).toBeLessThan(next.indexOf('tasks:'));
  });

  it('ALWAYS writes a typed declaration — `type:` is required on an input', () => {
    // The old untyped shorthand (`name: value`) is not a legal input
    // (spec 01 §inputs), so omitting the type falls back to `string`
    // rather than emitting a row the engine refuses.
    const next = declareInput('nika: v1\nworkflow:\n  id: w\ninputs:\n  a: 1\n', { name: 'b', def: '"x"' })!;
    expect(next).toContain('  b:\n    type: string\n    default: "x"');
    expect(next).not.toContain('  b: "x"');
  });

  it('carries a whole TypeExpr through, not only a primitive', () => {
    const next = declareInput(WF, { name: 'tags', type: '{ array: string }' })!;
    expect(next).toContain('  tags:\n    type: { array: string }');
  });

  it('creates the inputs block after the envelope head when absent', () => {
    const next = declareInput('nika: v1\nworkflow:\n  id: w\ntasks:\n', { name: 'topic', type: 'string' })!;
    expect(next).toContain('  id: w\n\ninputs:\n  topic:\n    type: string\ntasks:');
  });

  it('never authors the dead envelope field', () => {
    const next = declareInput('nika: v1\nworkflow:\n  id: w\ntasks:\n', { name: 'topic', type: 'string' })!;
    expect(next).not.toMatch(/^vars:/m);
    expect(next).not.toMatch(/^env:/m);
  });

  it('refuses duplicates, flow-form blocks, and headless fragments', () => {
    expect(declareInput(WF, { name: 'topic', type: 'string' })).toBeUndefined();
    expect(declareInput('inputs: { a: 1 }\n', { name: 'b' })).toBeUndefined();
    expect(declareInput('tasks:\n', { name: 'b' })).toBeUndefined();
  });

  it('infers a LIVE primitive spelling from the YAML scalar', () => {
    // `boolean` is dead — `bool` is the one boolean spelling (R3b).
    expect(inferVarType('true')).toBe('bool');
    expect(inferVarType('3')).toBe('integer');
    expect(inferVarType('0.5')).toBe('number');
    expect(inferVarType('"./out"')).toBe('string');
    expect(inferVarType('plain words')).toBe('string');
  });

  it('lowers a list to the array CONSTRUCTOR, and refuses to invent a record', () => {
    expect(inferTypeExpr('[1, 2]')).toBe('{ array: integer }');
    expect(inferTypeExpr('["a", "b"]')).toBe('{ array: string }');
    expect(inferTypeExpr('[]')).toBe('{ array: string }');
    expect(inferTypeExpr('"x"')).toBe('string');
    // `{ object: … }` is CLOSED: a guessed shape would make every
    // unlisted field a violation, so we decline rather than narrow it.
    expect(inferTypeExpr('{ a: 1 }')).toBeUndefined();
  });

  it('promotes an untyped row — default verbatim, comment riding along', () => {
    const next = promoteInput(WF, 'output_dir')!;
    expect(next).toContain(
      '  output_dir:\n    type: string\n    default: "./out"   # where artifacts land',
    );
    const again = promoteInput(next, 'retries')!;
    expect(again).toContain('  retries:\n    type: integer\n    default: 3');
  });

  it('refuses to promote what is already typed — or absent', () => {
    expect(promoteInput(WF, 'topic')).toBeUndefined();
    expect(promoteInput(WF, 'ghost')).toBeUndefined();
    expect(promoteInput(WF, 'config')).toBeUndefined();
    expect(promoteInput(WF, 'locales')).toBeUndefined();
  });

  it('refuses to promote a record literal — no invented closed shape', () => {
    const wf = 'nika: v1\nworkflow:\n  id: w\ninputs:\n  opts: { a: 1 }\n';
    expect(promoteInput(wf, 'opts')).toBeUndefined();
  });
});
