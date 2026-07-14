import { describe, expect, it } from 'vitest';
import { findTaskDeclaration, findVarDeclaration, resolveDefinition } from '../core/definitions';

const WF = [
  'nika: v1',            // 0
  'workflow:',           // 1
  '  id: t',             // 2
  'vars:',               // 3
  '  source: "./a.md"',  // 4
  'tasks:',              // 5
  '  gather:',           // 6
  '    invoke:',         // 7
  '      args: { path: "${{ vars.source }}" }', // 8
  '  think:',            // 9
  '    after: { gather: succeeded }',            // 10
  '    with:',           // 11
  '      doc: ${{ tasks.gather.output }}',       // 12
  '    infer:',          // 13
  '      prompt: "x ${{ with.doc }}"',           // 14
  '  ship:',             // 15
  '    after:',          // 16
  '      think: terminal',                       // 17
  '    exec:',           // 18
  '      command: ["echo", "done"]',             // 19
].join('\n');

describe('go-to-definition, the three navigable classes', () => {
  it('finds task and var declarations', () => {
    expect(findTaskDeclaration(WF, 'gather')).toEqual({ line: 6, start: 2, end: 8 });
    expect(findTaskDeclaration(WF, 'phantom')).toBeUndefined();
    expect(findVarDeclaration(WF, 'source')).toEqual({ line: 4, start: 2, end: 8 });
    expect(findVarDeclaration(WF, 'nope')).toBeUndefined();
  });

  it('resolves after producer keys at the cursor — inline flow map', () => {
    const col = WF.split('\n')[10].indexOf('gather') + 2;
    expect(resolveDefinition(WF, 10, col)?.line).toBe(6);
    expect(resolveDefinition(WF, 10, 4)).toBeUndefined(); // on the key, not a name
  });

  it('resolves after producer keys at the cursor — block entry', () => {
    const col = WF.split('\n')[17].indexOf('think') + 2;
    expect(resolveDefinition(WF, 17, col)?.line).toBe(9);
    // The predicate is a keyword, never a task ref.
    const predCol = WF.split('\n')[17].indexOf('terminal') + 2;
    expect(resolveDefinition(WF, 17, predCol)).toBeUndefined();
  });

  it('resolves island refs — tasks.X and vars.Y', () => {
    const l12 = WF.split('\n')[12];
    expect(resolveDefinition(WF, 12, l12.indexOf('gather') + 1)?.line).toBe(6);
    const l8 = WF.split('\n')[8];
    expect(resolveDefinition(WF, 8, l8.indexOf('source') + 1)?.line).toBe(4);
  });

  it('stays silent off references', () => {
    expect(resolveDefinition(WF, 0, 2)).toBeUndefined();
    expect(resolveDefinition(WF, 6, 10)).toBeUndefined(); // the declaration itself
  });
});
