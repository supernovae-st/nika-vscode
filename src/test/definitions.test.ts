import { describe, expect, it } from 'vitest';
import { findTaskDeclaration, findVarDeclaration, resolveDefinition } from '../core/definitions';

const WF = [
  'nika: v1',            // 0
  'workflow: t',         // 1
  'vars:',               // 2
  '  source: "./a.md"',  // 3
  'tasks:',              // 4
  '  - id: gather',      // 5
  '    invoke:',         // 6
  '      args: { path: "${{ vars.source }}" }', // 7
  '  - id: think',       // 8
  '    depends_on: [gather]',                    // 9
  '    infer:',          // 10
  '      prompt: "x ${{ tasks.gather.output }}"', // 11
].join('\n');

describe('go-to-definition, the three navigable classes', () => {
  it('finds task and var declarations', () => {
    expect(findTaskDeclaration(WF, 'gather')).toEqual({ line: 5, start: 8, end: 14 });
    expect(findTaskDeclaration(WF, 'ghost')).toBeUndefined();
    expect(findVarDeclaration(WF, 'source')).toEqual({ line: 3, start: 2, end: 8 });
    expect(findVarDeclaration(WF, 'nope')).toBeUndefined();
  });

  it('resolves depends_on names at the cursor', () => {
    const col = WF.split('\n')[9].indexOf('gather') + 2;
    expect(resolveDefinition(WF, 9, col)?.line).toBe(5);
    expect(resolveDefinition(WF, 9, 4)).toBeUndefined(); // on the key, not a name
  });

  it('resolves island refs — tasks.X and vars.Y', () => {
    const l11 = WF.split('\n')[11];
    expect(resolveDefinition(WF, 11, l11.indexOf('gather') + 1)?.line).toBe(5);
    const l7 = WF.split('\n')[7];
    expect(resolveDefinition(WF, 7, l7.indexOf('source') + 1)?.line).toBe(3);
  });

  it('stays silent off references', () => {
    expect(resolveDefinition(WF, 0, 2)).toBeUndefined();
    expect(resolveDefinition(WF, 5, 10)).toBeUndefined(); // the declaration itself
  });
});
