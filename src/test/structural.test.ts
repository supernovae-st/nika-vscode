import { describe, it, expect } from 'vitest';
import { topoWaves, criticalPath } from '../core/cliContract';
import {
  addDependsOn,
  addVarDeclaration,
  deleteTask,
  duplicateTask,
  insertBetween,
  insertTaskSkeleton,
  nextTaskId,
  parseDag003,
  parseVar001,
  removeDependsOn,
} from '../core/structuralFixes';
import { NIKA_VERB_STARTERS } from '../core/verbStarters.generated';
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
  'workflow:',
  '  id: t',
  'model: mock/echo',
  '',
  'tasks:',
  '  first:',
  '    infer:',
  '      prompt: "one"',
  '',
  '  second:',
  '    with:',
  '      prev: ${{ tasks.first.output }}',
  '    infer:',
  '      prompt: "two"',
  '',
  '  third:',
  '    depends_on: [first]',
  '    exec:',
  '      command: echo hi',
  '',
  '  fourth:',
  '    depends_on:',
  '      - first',
  '    exec:',
  '      command: echo ho',
].join('\n');

describe('addDependsOn', () => {
  it('inserts a fresh depends_on under the id line', () => {
    const out = addDependsOn(DOC, 'second', 'first')!;
    const lines = out.split('\n');
    const idLine = lines.findIndex((l) => l.includes('second:'));
    expect(lines[idLine + 1]).toBe('    depends_on: [first]');
  });

  it('extends an inline list', () => {
    const out = addDependsOn(DOC, 'third', 'second')!;
    expect(out).toContain('depends_on: [first, second]');
  });

  it('appends to a block list', () => {
    const out = addDependsOn(DOC, 'fourth', 'second')!;
    const lines = out.split('\n');
    const blockIdx = lines.findIndex((l, i) => l.trim() === 'depends_on:' && i > lines.findIndex((x) => x.includes('fourth:')));
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
    const withInfer = DOC.replace('first:', 'infer:');
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
    const res = insertTaskSkeleton('nika: v1\nworkflow:\n  id: t\nmodel: mock/echo\n', 'exec')!;
    const wf = parseRichWorkflow(res.text);
    expect(wf.tasks.map((t) => t.id)).toEqual(['exec']);
  });

  it('task palette tool pick — invoke skeleton pins the tool, NO args (the check teaches)', () => {
    const res = insertTaskSkeleton(DOC, 'invoke', 'second', 'nika:jq')!;
    // The id reads as the tool, not invoke_N.
    expect(res.taskId).toBe('jq');
    expect(res.text).toContain('tool: nika:jq');
    const wf = parseRichWorkflow(res.text);
    const inserted = wf.tasks.find((t) => t.id === 'jq')!;
    expect(inserted.verb).toBe('invoke');
    expect(inserted.dependsOn).toEqual(['second']);
    // Deliberately argless — the findings voice the required args.
    const span = res.text.split('\n').slice(inserted.line, inserted.endLine + 1).join('\n');
    expect(span).not.toContain('args:');
  });

  it('a malformed tool ref falls back to the verb\'s FIRST spec starter', () => {
    const res = insertTaskSkeleton(DOC, 'invoke', undefined, 'mcp:srv/tool')!;
    expect(res.taskId).toBe('invoke');
    // One voice with the « choose a starter » door — the SSOT's minimal
    // invoke shape, not a hand-rolled skeleton.
    expect(res.text).toContain(NIKA_VERB_STARTERS.invoke[0].body.split('\n')[1].trim());
  });

  it('a tool pick never reshapes a non-invoke verb — the starter body lands', () => {
    const res = insertTaskSkeleton(DOC, 'infer', undefined, 'nika:jq')!;
    expect(res.taskId).toBe('infer');
    expect(res.text).toContain(NIKA_VERB_STARTERS.infer[0].body.split('\n')[1].trim());
  });

  it('splice with a pinned tool — insertBetween carries it (one palette everywhere)', () => {
    const res = insertBetween(DOC, 'second', 'third', 'invoke', 'nika:validate')!;
    expect(res.taskId).toBe('validate');
    expect(res.text).toContain('tool: nika:validate');
    const wf = parseRichWorkflow(res.text);
    const spliced = wf.tasks.find((t) => t.id === 'validate')!;
    expect(spliced.dependsOn).toEqual(['second']);
    expect(wf.tasks.find((t) => t.id === 'third')!.dependsOn).toContain('validate');
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
    expect(out).not.toMatch(/^ {2}fourth:[\s\S]{0,40}depends_on/m);
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

  it('duplicates a task right after the original — fresh id, same shape', () => {
    const res = duplicateTask(DOC, 'second')!;
    expect(res.taskId).toBe('second_copy');
    const wf = parseRichWorkflow(res.text);
    const order = wf.tasks.map((t) => t.id);
    expect(order).toEqual(['first', 'second', 'second_copy', 'third', 'fourth']);
    const copy = wf.tasks.find((t) => t.id === 'second_copy')!;
    expect(copy.verb).toBe('infer');
    // Inbound wiring survives the copy: the `with:` ref still reads first.
    expect(res.text).toMatch(/second_copy[\s\S]*?\$\{\{ tasks\.first\.output \}\}/);
  });

  it('keeps declared depends_on on the copy (inbound edges duplicate)', () => {
    const res = duplicateTask(DOC, 'third')!;
    const wf = parseRichWorkflow(res.text);
    expect(wf.tasks.find((t) => t.id === 'third_copy')?.dependsOn).toEqual(['first']);
  });

  it('mints collision-free copy ids on repeat', () => {
    const once = duplicateTask(DOC, 'second')!;
    const twice = duplicateTask(once.text, 'second')!;
    expect(twice.taskId).toBe('second_copy2');
  });

  it('is undefined for an unknown task', () => {
    expect(duplicateTask(DOC, 'ghost')).toBeUndefined();
  });

  it('leaves downstream refs on the ORIGINAL (no ref rewrite in the copy)', () => {
    const res = duplicateTask(DOC, 'first')!;
    const wf = parseRichWorkflow(res.text);
    // third/fourth still depend on `first`, nobody on the copy.
    expect(wf.tasks.find((t) => t.id === 'third')?.dependsOn).toEqual(['first']);
    expect(wf.tasks.find((t) => t.id === 'fourth')?.dependsOn).toEqual(['first']);
    const referenced = res.text.match(/first_copy/g) ?? [];
    expect(referenced.length).toBe(1); // only its own key line
  });

  it('splices a task INTO a dependency edge (insert-on-edge)', () => {
    const res = insertBetween(DOC, 'first', 'third', 'exec')!;
    const wf = parseRichWorkflow(res.text);
    const spliced = wf.tasks.find((t) => t.id === res.taskId)!;
    expect(spliced.verb).toBe('exec');
    expect(spliced.dependsOn).toEqual(['first']);
    // The edge is REROUTED: third now waits on the spliced task, not first.
    expect(wf.tasks.find((t) => t.id === 'third')?.dependsOn).toEqual([res.taskId]);
    // Anchored right after the upstream end.
    const order = wf.tasks.map((t) => t.id);
    expect(order.indexOf(res.taskId)).toBe(order.indexOf('first') + 1);
  });

  it('splice on a data-only edge keeps the ref, adds the ordering', () => {
    // second reads tasks.first via with: but declares NO depends_on.
    const res = insertBetween(DOC, 'first', 'second', 'invoke')!;
    const wf = parseRichWorkflow(res.text);
    expect(wf.tasks.find((t) => t.id === 'second')?.dependsOn).toEqual([res.taskId]);
    // The data ref is untouched (refs are never rewritten).
    expect(res.text).toContain('${{ tasks.first.output }}');
  });

  it('is undefined when either end is unknown', () => {
    expect(insertBetween(DOC, 'ghost', 'third', 'exec')).toBeUndefined();
    expect(insertBetween(DOC, 'first', 'ghost', 'exec')).toBeUndefined();
  });
});

describe('edge-case hunt 2026-07-06 · confirmed YAML-surgery bugs', () => {
  // Same-indent block lists are legal YAML the parser itself reads —
  // the editors must not corrupt them (was: strict > indent scan).
  const SAME_INDENT = [
    'nika: v1',
    'workflow:',
    '  id: t',
    'tasks:',
    '  a:',
    '    exec: { command: echo a }',
    '',
    '  b:',
    '    depends_on:',
    '    - a',
    '    exec: { command: echo b }',
  ].join('\n');

  it('addDependsOn appends at the ITEMS indent of a same-indent block list', () => {
    const out = addDependsOn(SAME_INDENT, 'b', 'c')!;
    const wf = parseRichWorkflow(out);
    expect(wf.tasks.find((t) => t.id === 'b')?.dependsOn).toEqual(['a', 'c']);
    // The new item rides the EXISTING items' indent — never deeper.
    expect(out).toContain('\n    - a\n    - c\n');
  });

  it('removeDependsOn removes QUOTED deps (inline and block)', () => {
    const inline = DOC.replace('depends_on: [first]', 'depends_on: ["first"]');
    const out = removeDependsOn(inline, 'third', 'first')!;
    expect(out).toBeDefined();
    expect(parseRichWorkflow(out).tasks.find((t) => t.id === 'third')?.dependsOn).toEqual([]);

    const block = DOC.replace('      - first', "      - 'first'");
    const out2 = removeDependsOn(block, 'fourth', 'first')!;
    expect(out2).toBeDefined();
    expect(parseRichWorkflow(out2).tasks.find((t) => t.id === 'fourth')?.dependsOn).toEqual([]);
  });

  it('insertBetween reroutes even when the declared dep is quoted', () => {
    const quoted = DOC.replace('depends_on: [first]', 'depends_on: ["first"]');
    const res = insertBetween(quoted, 'first', 'third', 'exec')!;
    const wf = parseRichWorkflow(res.text);
    // A triangle (['first', spliced]) is the bug; the splice must reroute.
    expect(wf.tasks.find((t) => t.id === 'third')?.dependsOn).toEqual([res.taskId]);
  });

  it('addVarDeclaration never splices INTO a multi-line var value', () => {
    const doc = [
      'nika: v1',
      'workflow:',
      '  id: t',
      'vars:',
      '  prompt: |',
      '    Summarize the input.',
      '    Keep it short.',
      'tasks:',
      '  a:',
      '    infer: { prompt: "x" }',
    ].join('\n');
    const out = addVarDeclaration(doc, 'missing')!;
    const wf = parseRichWorkflow(out);
    expect(wf.varsKeys.sort()).toEqual(['missing', 'prompt']);
    // The block scalar stays contiguous — the declaration lands AFTER it.
    expect(out).toContain('  prompt: |\n    Summarize the input.\n    Keep it short.\n  missing: ""');
  });

  it('a trailing comment documents the NEXT task — spans exclude it', () => {
    const doc = [
      'nika: v1',
      'workflow:',
      '  id: t',
      'tasks:',
      '  a:',
      '    exec: { command: echo a }',
      '',
      '  # b needs network access',
      '  b:',
      '    exec: { command: echo b }',
    ].join('\n');
    // Delete a → b keeps its doc comment.
    const del = deleteTask(doc, 'a');
    expect(del && 'text' in del && del.text).toContain('# b needs network access');
    // Duplicate a → the comment is NOT cloned onto the copy.
    const dup = duplicateTask(doc, 'a')!;
    expect(dup.text.match(/# b needs network access/g)).toHaveLength(1);
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
