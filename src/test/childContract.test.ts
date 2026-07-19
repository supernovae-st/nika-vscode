// childContract.test.ts — the callable contract, both sides (S5).
//
// Laws under test: untyped `name: value` = has-default · the typed
// discriminator (object + closed-enum type:) · required without
// default joins as required-unset ONLY when the parent supplies
// nothing · facts, never judgments.

import { describe, it, expect } from 'vitest';
import { joinContract, parseChildVars, parseInvokeArgKeys } from '../core/childContract';

const CHILD = [
  'nika: v1',
  'workflow:',
  '  id: brief',
  '',
  'vars:',
  '  output_dir: "./out"',
  '  topic:',
  '    type: string',
  '    required: true',
  '    description: subject',
  '  style:',
  '    type: string',
  '    default: plain',
  '  config: { type: object, default: { type: "custom" } }',
  '',
  'tasks:',
  '  start:',
  '    infer:',
  '      prompt: hi',
].join('\n');

describe('parseChildVars — the spec 01 §vars discriminator', () => {
  it('reads untyped defaults, typed declarations, and the flow form', () => {
    const vars = parseChildVars(CHILD);
    expect(vars).toEqual([
      { name: 'output_dir', hasDefault: true },
      { name: 'topic', type: 'string', required: true },
      { name: 'style', type: 'string', hasDefault: true },
      { name: 'config', type: 'object', hasDefault: true },
    ]);
  });

  it('a workflow without vars declares nothing', () => {
    expect(parseChildVars('nika: v1\nworkflow:\n  id: x\ntasks:\n  a:\n    exec:\n      command: ["ls"]\n')).toEqual([]);
  });
});

describe('parseInvokeArgKeys — the parent side', () => {
  const PARENT = [
    'nika: v1',
    'workflow:',
    '  id: parent',
    'tasks:',
    '  brief:',
    '    invoke:',
    '      workflow: ./brief.nika.yaml',
    '      args:',
    '        topic: release notes',
    '        style: crisp',
    '  other:',
    '    invoke:',
    '      tool: nika:jq',
    '      args: { input: "x", query: ".a" }',
  ].join('\n');

  it('collects block-form and flow-form arg keys per task', () => {
    expect([...parseInvokeArgKeys(PARENT, 'brief')]).toEqual(['topic', 'style']);
    expect([...parseInvokeArgKeys(PARENT, 'other')]).toEqual(['input', 'query']);
    expect(parseInvokeArgKeys(PARENT, 'ghost').size).toBe(0);
  });
});

describe('joinContract — facts, never judgments', () => {
  it('joins the four states', () => {
    const rows = joinContract(
      [
        { name: 'topic', type: 'string', required: true },
        { name: 'style', hasDefault: true },
        { name: 'depth', required: true },
        { name: 'note' },
      ],
      new Set(['topic']),
    );
    expect(rows).toEqual([
      { name: 'topic', state: 'supplied', type: 'string' },
      { name: 'style', state: 'default' },
      { name: 'depth', state: 'required-unset' },
      { name: 'note', state: 'optional' },
    ]);
  });
});

describe('parseChildVars — degradation stays honest (edge forms)', () => {
  it('a fully-inline flow-form vars block degrades to NO rows — never a crash, never a guess', () => {
    // The line-based read does not enter a `vars: { … }` one-liner;
    // the card simply shows no contract (garnish law). Documented.
    const vars = parseChildVars('nika: v1\nworkflow:\n  id: x\nvars: { topic: "release", style: plain }\ntasks:\n  a:\n    exec:\n      command: ["ls"]\n');
    expect(vars).toEqual([]);
  });

  it('joinContract over an empty declaration list is an empty join', () => {
    expect(joinContract([], new Set(['ghost']))).toEqual([]);
  });
});
