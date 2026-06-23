import { describe, it, expect } from 'vitest';
import { topoWaves, criticalPath } from '../core/cliContract';
import {
  addDependsOn,
  addVarDeclaration,
  deleteTask,
  insertTaskSkeleton,
  nextTaskId,
  parseDag003,
  parseVar001,
  removeDependsOn,
} from '../core/structuralFixes';
import { parseRichWorkflow } from '../workflowParser';

describe('topoWaves + criticalPath', () => {
  const nodes = [
    { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'merge' }, { id: 'ship' },
  ];
  const edges = [
    { source: 'a', target: 'merge' },
    { source: 'b', target: 'merge' },
    { source: 'b', target: 'c' },
    { source: 'c', target: 'merge' },
    { source: 'merge', target: 'ship' },
  ];

  it('computes Kahn levels (parallelism made visible)', () => {
    expect(topoWaves(nodes, edges)).toEqual([
      ['a', 'b'],
      ['c'],
      ['merge'],
      ['ship'],
    ]);
  });

  it('drops cyclic leftovers into a final catch-all wave (degraded parse)', () => {
    const cyc = topoWaves(
      [{ id: 'x' }, { id: 'y' }, { id: 'solo' }],
      [{ source: 'x', target: 'y' }, { source: 'y', target: 'x' }],
    );
    expect(cyc[0]).toEqual(['solo']);
    expect(cyc[1].sort()).toEqual(['x', 'y']);
  });

  it('finds the hop-count critical path without durations', () => {
    expect(criticalPath(nodes, edges)).toEqual(['b', 'c', 'merge', 'ship']);
  });

  it('weights the path by durations when known', () => {
    const timed = [
      { id: 'a', durationMs: 10_000 }, { id: 'b', durationMs: 100 },
      { id: 'c', durationMs: 100 }, { id: 'merge', durationMs: 100 },
      { id: 'ship', durationMs: 100 },
    ];
    expect(criticalPath(timed, edges)).toEqual(['a', 'merge', 'ship']);
  });
});

describe('structuralFixes parsers', () => {
  it('parses the DAG-003 message (incl. the nested-backtick form)', () => {
    expect(parseDag003('task `task `second`` references `tasks.first` without declaring `first` in depends_on'))
      .toEqual({ task: 'second', missing: 'first' });
    expect(parseDag003('task `use` references `tasks.fetch_page` without declaring `fetch_page` in depends_on'))
      .toEqual({ task: 'use', missing: 'fetch_page' });
    expect(parseDag003('cycle detected: a → b')).toBeUndefined();
  });

  it('parses the VAR-001 message', () => {
    expect(parseVar001('unresolved reference `vars.topic` in task `a`'))
      .toEqual({ varName: 'topic', task: 'a' });
    expect(parseVar001('unresolved reference `tasks.y` in task `a`')).toBeUndefined();
  });
});

const DOC = [
  'nika: v1',
  'workflow: t',
  'model: mock/echo',
  '',
  'tasks:',
  '  - id: first',
  '    infer:',
  '      prompt: "one"',
  '',
  '  - id: second',
  '    with:',
  '      prev: ${{ tasks.first.output }}',
  '    infer:',
  '      prompt: "two"',
  '',
  '  - id: third',
  '    depends_on: [first]',
  '    exec:',
  '      command: echo hi',
  '',
  '  - id: fourth',
  '    depends_on:',
  '      - first',
  '    exec:',
  '      command: echo ho',
].join('\n');

describe('addDependsOn', () => {
  it('inserts a fresh depends_on under the id line', () => {
    const out = addDependsOn(DOC, 'second', 'first')!;
    const lines = out.split('\n');
    const idLine = lines.findIndex((l) => l.includes('- id: second'));
    expect(lines[idLine + 1]).toBe('    depends_on: [first]');
  });

  it('extends an inline list', () => {
    const out = addDependsOn(DOC, 'third', 'second')!;
    expect(out).toContain('depends_on: [first, second]');
  });

  it('appends to a block list', () => {
    const out = addDependsOn(DOC, 'fourth', 'second')!;
    const lines = out.split('\n');
    const blockIdx = lines.findIndex((l, i) => l.trim() === 'depends_on:' && i > lines.findIndex((x) => x.includes('- id: fourth')));
    expect(lines[blockIdx + 1].trim()).toBe('- first');
    expect(lines[blockIdx + 2].trim()).toBe('- second');
  });

  it('is idempotent', () => {
    expect(addDependsOn(DOC, 'third', 'first')).toBeUndefined();
  });
});

describe('graph editing backends (the n8n loop)', () => {
  it('mints collision-free snake_case ids', () => {
    expect(nextTaskId(DOC, 'infer')).toBe('infer');
    const withInfer = DOC.replace('- id: first', '- id: infer');
    expect(nextTaskId(withInfer, 'infer')).toBe('infer_2');
  });

  it('inserts a skeleton after an anchor task WITH the dependency wired', () => {
    const res = insertTaskSkeleton(DOC, 'invoke', 'second')!;
    expect('taskId' in res && res.taskId).toBe('invoke');
    const wf = parseRichWorkflow(res.text);
    const inserted = wf.tasks.find((t) => t.id === 'invoke')!;
    expect(inserted.verb).toBe('invoke');
    expect(inserted.dependsOn).toEqual(['second']);
    // Anchored right after `second`, before `third`.
    const order = wf.tasks.map((t) => t.id);
    expect(order.indexOf('invoke')).toBe(order.indexOf('second') + 1);
  });

  it('appends at the end without an anchor (no dependency)', () => {
    const res = insertTaskSkeleton(DOC, 'agent')!;
    const wf = parseRichWorkflow(res.text);
    expect(wf.tasks[wf.tasks.length - 1].id).toBe('agent');
    expect(wf.tasks[wf.tasks.length - 1].dependsOn).toEqual([]);
  });

  it('creates the tasks block when the document has none', () => {
    const res = insertTaskSkeleton('nika: v1\nworkflow: t\nmodel: mock/echo\n', 'exec')!;
    const wf = parseRichWorkflow(res.text);
    expect(wf.tasks.map((t) => t.id)).toEqual(['exec']);
  });

  it('removes a dep from inline lists, dropping the key when emptied', () => {
    const out = removeDependsOn(DOC, 'third', 'first')!;
    expect(out).not.toContain('depends_on: [first]');
    expect(parseRichWorkflow(out).tasks.find((t) => t.id === 'third')?.dependsOn).toEqual([]);
    const two = addDependsOn(DOC, 'third', 'second')!;
    const stillOne = removeDependsOn(two, 'third', 'first')!;
    expect(stillOne).toContain('depends_on: [second]');
  });

  it('removes a dep from block lists, dropping the key when emptied', () => {
    const out = removeDependsOn(DOC, 'fourth', 'first')!;
    const wf = parseRichWorkflow(out);
    expect(wf.tasks.find((t) => t.id === 'fourth')?.dependsOn).toEqual([]);
    expect(out).not.toMatch(/- id: fourth[\s\S]{0,40}depends_on/);
  });

  it('is undefined for an absent dep', () => {
    expect(removeDependsOn(DOC, 'third', 'second')).toBeUndefined();
  });

  it('deletes an unreferenced task cleanly', () => {
    const res = deleteTask(DOC, 'fourth');
    expect(res && 'text' in res).toBe(true);
    const wf = parseRichWorkflow((res as { text: string }).text);
    expect(wf.tasks.map((t) => t.id)).toEqual(['first', 'second', 'third']);
  });

  it('REFUSES deleting a task others still reference, naming the owners', () => {
    const res = deleteTask(DOC, 'first');
    expect(res && 'blockedBy' in res).toBe(true);
    const blockers = (res as { blockedBy: string[] }).blockedBy.sort();
    expect(blockers).toEqual(['fourth', 'second', 'third']);
  });

  it('skeletons parse with the right shape (own-corpus floor)', () => {
    for (const verb of ['infer', 'exec', 'invoke', 'agent'] as const) {
      const res = insertTaskSkeleton(DOC, verb)!;
      const wf = parseRichWorkflow(res.text);
      const t = wf.tasks.find((x) => x.id === res.taskId)!;
      expect(t.verb).toBe(verb);
    }
  });
});

describe('addVarDeclaration', () => {
  it('creates the vars block before tasks: when absent', () => {
    const out = addVarDeclaration(DOC, 'topic')!;
    const lines = out.split('\n');
    const varsIdx = lines.indexOf('vars:');
    expect(varsIdx).toBeGreaterThan(-1);
    expect(lines[varsIdx + 1]).toBe('  topic: ""');
    expect(varsIdx).toBeLessThan(lines.indexOf('tasks:'));
  });

  it('appends to an existing block and stays idempotent', () => {
    const withVars = DOC.replace('tasks:', 'vars:\n  existing: "x"\n\ntasks:');
    const out = addVarDeclaration(withVars, 'topic')!;
    const lines = out.split('\n');
    const varsIdx = lines.indexOf('vars:');
    expect(lines[varsIdx + 1]).toBe('  existing: "x"');
    expect(lines[varsIdx + 2]).toBe('  topic: ""');
    expect(addVarDeclaration(withVars, 'existing')).toBeUndefined();
  });
});
