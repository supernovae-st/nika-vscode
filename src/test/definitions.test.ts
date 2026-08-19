import { describe, expect, it } from 'vitest';
import { findTaskDeclaration, findVarDeclaration, resolveDefinition } from '../core/definitions';

const WF = [
  'nika: t',            // 0
  'const:',              // 1
  '  source: "./a.md"',  // 2
  'tasks:',              // 3
  '  gather:',           // 4
  '    invoke:',         // 5
  '      args: { path: "${{ const.source }}" }', // 6
  '  think:',            // 7
  '    after: { gather: success }',            // 8
  '    with:',           // 9
  '      doc: ${{ tasks.gather.output }}',       // 10
  '    infer:',          // 11
  '      prompt: "x ${{ with.doc }}"',           // 12
  '  ship:',             // 13
  '    after:',          // 14
  '      think: terminal',                       // 15
  '    exec:',           // 16
  '      command: ["echo", "done"]',             // 17
].join('\n');

describe('go-to-definition, the three navigable classes', () => {
  it('finds task and var declarations', () => {
    expect(findTaskDeclaration(WF, 'gather')).toEqual({ line: 4, start: 2, end: 8 });
    expect(findTaskDeclaration(WF, 'phantom')).toBeUndefined();
    expect(findVarDeclaration(WF, 'source', 'const')).toEqual({ line: 2, start: 2, end: 8 });
    expect(findVarDeclaration(WF, 'nope', 'const')).toBeUndefined();
    // The lookup is per-AUTHORITY: a const key is not an input key.
    expect(findVarDeclaration(WF, 'source', 'inputs')).toBeUndefined();
  });

  it('resolves after producer keys at the cursor — inline flow map', () => {
    const col = WF.split('\n')[8].indexOf('gather') + 2;
    expect(resolveDefinition(WF, 8, col)?.line).toBe(4);
    expect(resolveDefinition(WF, 8, 4)).toBeUndefined(); // on the key, not a name
  });

  it('resolves after producer keys at the cursor — block entry', () => {
    const col = WF.split('\n')[15].indexOf('think') + 2;
    expect(resolveDefinition(WF, 15, col)?.line).toBe(7);
    // The predicate is a keyword, never a task ref.
    const predCol = WF.split('\n')[15].indexOf('terminal') + 2;
    expect(resolveDefinition(WF, 15, predCol)).toBeUndefined();
  });

  it('resolves island refs — tasks.X and <authority>.Y', () => {
    const l10 = WF.split('\n')[10];
    expect(resolveDefinition(WF, 10, l10.indexOf('gather') + 1)?.line).toBe(4);
    const l6 = WF.split('\n')[6];
    expect(resolveDefinition(WF, 6, l6.indexOf('source') + 1)?.line).toBe(2);
  });

  it('navigates each live authority to its OWN block · a dead config: still resolves', () => {
    const doc = [
      'nika: t',                                    // 0
      'inputs:',                                     // 1
      '  topic: { type: string }',                   // 2
      'config:',                                     // 3  dead · still navigable while the file is being moved
      '  region: { type: string }',                  // 4
      'secrets:',                                    // 5
      '  api_key:',                                  // 6
      '    source: vault',                           // 7
      'tasks:',                                      // 8
      '  a:',                                        // 9
      '    infer:',                                  // 10
      '      prompt: "${{ inputs.topic }} ${{ config.region }} ${{ secrets.api_key }}"', // 11
    ].join('\n');
    const l = doc.split('\n')[11];
    expect(resolveDefinition(doc, 11, l.indexOf('topic') + 1)?.line).toBe(2);
    expect(resolveDefinition(doc, 11, l.indexOf('region') + 1)?.line).toBe(4);
    expect(resolveDefinition(doc, 11, l.indexOf('api_key') + 1)?.line).toBe(6);
  });

  it('a pre-flip file still navigates — dead blocks resolve too', () => {
    // The value is refused by the engine, but the editor is exactly the
    // tool you migrate IN: jumping to the old declaration must still work.
    const legacy = [
      'nika: t',                              // 0
      'workflow:',                             // 1
      '  id: t',                               // 2
      'vars:',                                 // 3
      '  topic: "x"',                          // 4
      'tasks:',                                // 5
      '  a:',                                  // 6
      '    infer:',                            // 7
      '      prompt: "${{ vars.topic }}"',     // 8
    ].join('\n');
    const l8 = legacy.split('\n')[8];
    expect(resolveDefinition(legacy, 8, l8.indexOf('topic') + 1)?.line).toBe(4);
  });

  it('stays silent off references', () => {
    expect(resolveDefinition(WF, 0, 2)).toBeUndefined();
    expect(resolveDefinition(WF, 4, 10)).toBeUndefined(); // the declaration itself
  });
});
