import { describe, expect, it } from 'vitest';
import {
  declareInput, findVarsBlock, inferVarType, parseVarEntries, promoteVar,
} from '../core/varsEdit';

const WF = `nika: v1
workflow: w
model: mock/echo

vars:
  output_dir: "./out"   # where artifacts land
  topic:
    type: string
    required: true
  retries: 3
  config: { type: object, default: { type: "custom" } }

tasks:
  - id: a
    infer:
      prompt: "\${{ vars.topic }}"
`;

describe('varsEdit (« declare an input » · « make it callable »)', () => {
  it('reads the block — typed vs untyped per the spec discriminator', () => {
    const lines = WF.split('\n');
    const entries = parseVarEntries(lines, findVarsBlock(lines)!);
    expect(entries.map((e) => [e.name, e.typed])).toEqual([
      ['output_dir', false],
      ['topic', true],
      ['retries', false],
      ['config', true],
    ]);
    expect(entries[0].inline).toBe('"./out"');
    expect(entries[0].comment).toBe('# where artifacts land');
  });

  it('a quoted hash stays a value, not a comment', () => {
    const wf = 'vars:\n  tag: "a#b"\n';
    const lines = wf.split('\n');
    const [tag] = parseVarEntries(lines, findVarsBlock(lines)!);
    expect(tag.inline).toBe('"a#b"');
    expect(tag.comment).toBeUndefined();
  });

  it('declares a typed input at the end of the block', () => {
    const next = declareInput(WF, {
      name: 'lang', type: 'string', required: true, description: 'target language',
    })!;
    expect(next).toContain('  lang:\n    type: string\n    required: true\n    description: "target language"');
    // Lands INSIDE vars: — before the blank line that closes the block.
    expect(next.indexOf('lang:')).toBeLessThan(next.indexOf('tasks:'));
  });

  it('declares the untyped shorthand when no type is chosen', () => {
    const next = declareInput('nika: v1\nworkflow: w\nvars:\n  a: 1\n', { name: 'b', def: '"x"' })!;
    expect(next).toContain('vars:\n  a: 1\n  b: "x"');
  });

  it('creates the vars block after the envelope head when absent', () => {
    const next = declareInput('nika: v1\nworkflow: w\ntasks:\n', { name: 'topic', type: 'string' })!;
    expect(next).toContain('workflow: w\n\nvars:\n  topic:\n    type: string\ntasks:');
  });

  it('refuses duplicates, flow-form blocks, and headless fragments', () => {
    expect(declareInput(WF, { name: 'topic', type: 'string' })).toBeUndefined();
    expect(declareInput('vars: { a: 1 }\n', { name: 'b' })).toBeUndefined();
    expect(declareInput('tasks:\n', { name: 'b' })).toBeUndefined();
  });

  it('infers the typed form from the YAML scalar it replaces', () => {
    expect(inferVarType('true')).toBe('boolean');
    expect(inferVarType('3')).toBe('integer');
    expect(inferVarType('0.5')).toBe('number');
    expect(inferVarType('[1, 2]')).toBe('array');
    expect(inferVarType('{ a: 1 }')).toBe('object');
    expect(inferVarType('"./out"')).toBe('string');
    expect(inferVarType('plain words')).toBe('string');
  });

  it('promotes an untyped row — default verbatim, comment riding along', () => {
    const next = promoteVar(WF, 'output_dir')!;
    expect(next).toContain(
      '  output_dir:\n    type: string\n    default: "./out"   # where artifacts land',
    );
    const again = promoteVar(next, 'retries')!;
    expect(again).toContain('  retries:\n    type: integer\n    default: 3');
  });

  it('refuses to promote what is already typed — or absent', () => {
    expect(promoteVar(WF, 'topic')).toBeUndefined();
    expect(promoteVar(WF, 'ghost')).toBeUndefined();
    expect(promoteVar(WF, 'config')).toBeUndefined();
  });
});
