import { describe, expect, it } from 'vitest';
import { findVerbLines, invokeBodyFor, verbBlockEdit, verbBlockEnd } from '../core/verbBlocks';

const WF = `nika: v1
workflow:
  id: probe
model: mock/echo
tasks:
  gather:
    invoke:
      tool: "nika:read"
      args:
        path: "./README.md"
  think:
    after: { gather: succeeded }
    infer:
      prompt: "Summarize"

  act:
    exec:
      command: "echo ok"
  finish:
    agent:
      prompt: "wrap up"
      tools: ["nika:fetch"]
`;

const lines = (s: string): string[] => s.split('\n');

describe('findVerbLines (the 4 doors)', () => {
  it('finds all four verbs with their lines', () => {
    const found = findVerbLines(lines(WF));
    expect(found.map((v) => v.verb)).toEqual(['invoke', 'infer', 'exec', 'agent']);
    expect(found[0]).toEqual({ line: 6, verb: 'invoke', indent: 4 });
  });

  it('never matches comments, flow style, or args-nested decoys', () => {
    const tricky = [
      '  # infer: not me',
      '    invoke: { tool: "nika:log" }',
      '    invoke:',
      '      args:',
      '        exec: "a mapping key, not a verb"',
    ];
    const found = findVerbLines(tricky);
    expect(found).toEqual([{ line: 2, verb: 'invoke', indent: 4 }]);
  });

  it('ignores top-level keys (verbs live under a task)', () => {
    expect(findVerbLines(['infer:', 'exec:'])).toEqual([]);
  });
});

describe('verbBlockEnd (block measurement)', () => {
  it('measures through nested fields and stops at the next sibling', () => {
    const ls = lines(WF);
    expect(verbBlockEnd(ls, 6, 4)).toBe(10); // invoke block: tool + args + path
  });

  it('leaves trailing blanks outside the block', () => {
    const ls = lines(WF);
    expect(verbBlockEnd(ls, 12, 4)).toBe(14); // infer: prompt — the blank line stays out
  });

  it('handles an empty block and end-of-file', () => {
    expect(verbBlockEnd(['  a:', '    infer:', '  b:'], 1, 4)).toBe(2);
    expect(verbBlockEnd(['  a:', '    infer:', '      prompt: "x"'], 1, 4)).toBe(3);
  });
});

describe('verbBlockEdit (the surgical swap)', () => {
  it('replaces the block re-indented to the site', () => {
    const edit = verbBlockEdit(WF, 12, 'infer', 'infer:\n  prompt: "New"\n  max_tokens: 100\n');
    expect(edit).toBeDefined();
    expect(edit!.startLine).toBe(12);
    expect(edit!.endLine).toBe(14);
    expect(edit!.newText).toBe('    infer:\n      prompt: "New"\n      max_tokens: 100\n');
  });

  it('keeps SLOT comments riding the body', () => {
    const edit = verbBlockEdit(WF, 16, 'exec', 'exec:\n  command: "ls"   # SLOT: the command\n');
    expect(edit!.newText).toContain('# SLOT: the command');
  });

  it('refuses a moved anchor or a verb mismatch', () => {
    expect(verbBlockEdit(WF, 11, 'infer', 'infer:\n  prompt: "x"\n')).toBeUndefined();
    expect(verbBlockEdit(WF, 12, 'exec', 'exec:\n  command: "x"\n')).toBeUndefined();
    expect(verbBlockEdit(WF, 9999, 'infer', 'infer:\n  prompt: "x"\n')).toBeUndefined();
  });

  it('round-trips: applying the edit leaves siblings untouched', () => {
    const edit = verbBlockEdit(WF, 6, 'invoke', 'invoke:\n  tool: "nika:fetch"\n  args:\n    url: ""   # SLOT\n')!;
    const ls = lines(WF);
    ls.splice(edit.startLine, edit.endLine - edit.startLine, ...edit.newText.replace(/\n$/, '').split('\n'));
    const out = ls.join('\n');
    expect(out).toContain('tool: "nika:fetch"');
    expect(out).not.toContain('nika:read');
    expect(out).toContain('think:'); // the next task survives byte-identical
    expect(out).toContain('prompt: "Summarize"');
  });
});

describe('invokeBodyFor (catalog → skeleton)', () => {
  it('emits tool + required args as SLOT lines, typed placeholders', () => {
    const body = invokeBodyFor('nika:read', [
      { name: 'path', required: true, type: 'string', desc: 'file path to read' },
      { name: 'limit', required: false, type: 'integer', desc: 'max bytes' },
    ]);
    expect(body).toBe('invoke:\n  tool: "nika:read"\n  args:\n    path: ""   # SLOT: file path to read\n');
  });

  it('typed placeholders per schema type', () => {
    const body = invokeBodyFor('nika:x', [
      { name: 'n', required: true, type: 'integer' },
      { name: 'flag', required: true, type: 'boolean' },
      { name: 'items', required: true, type: 'array' },
      { name: 'data', required: true },
    ]);
    expect(body).toContain('n: 0   # SLOT');
    expect(body).toContain('flag: false   # SLOT');
    expect(body).toContain('items: []   # SLOT');
    expect(body).toContain('data: ""   # SLOT');
  });

  it('a no-args tool gets no args: key', () => {
    expect(invokeBodyFor('nika:now', [])).toBe('invoke:\n  tool: "nika:now"\n');
  });
});
