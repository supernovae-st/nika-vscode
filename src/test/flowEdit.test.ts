import { describe, expect, it } from 'vitest';
import {
  afterRewrite, bindingInsert, descendantsOf, fanoutRewrite, findTaskKey, gateRewrite,
  gateShapes, islandKeyRewrite, taskKeyRewrite, upstreamCandidates, type TaskRange,
} from '../core/flowEdit';
import { parseRichWorkflow } from '../workflowParser';

const WF = `nika: v1
workflow:
  id: w
tasks:
  gather:
    infer:
      prompt: "a"
  thread:
    after: { gather: succeeded }
    when: \${{ vars.publish }}
    infer:
      prompt: "b"
  sign:
    after:
      thread: terminal
    exec:
      command: ["sign"]
`;

const range = (
  id: string, line: number, endLine: number,
  after: Record<string, string> = {}, producers: string[] = Object.keys(after),
): TaskRange => ({ id, line, endLine, after, producers });

const TASKS: TaskRange[] = [
  range('gather', 4, 6),
  range('thread', 7, 11, { gather: 'succeeded' }),
  range('sign', 12, 16, { thread: 'terminal' }),
];

describe('flowEdit (order on state · gate · fan out)', () => {
  it('finds flow and block task keys, block extent included', () => {
    const lines = WF.split('\n');
    expect(findTaskKey(lines, TASKS[1], 'after')).toMatchObject({ line: 8, end: 8 });
    expect(findTaskKey(lines, TASKS[1], 'when')).toMatchObject({ line: 9 });
    const block = findTaskKey(lines, TASKS[2], 'after');
    expect(block).toMatchObject({ line: 13, end: 14 });
    expect(findTaskKey(lines, TASKS[0], 'after')).toBeUndefined();
  });

  it('descendants are cycle territory — they leave the candidate list', () => {
    expect(descendantsOf(TASKS, 'gather')).toEqual(new Set(['thread', 'sign']));
    expect(upstreamCandidates(TASKS, 'gather')).toEqual([]);
    expect(upstreamCandidates(TASKS, 'sign').map((t) => t.id)).toEqual(['gather', 'thread']);
  });

  it('data producers count as edges too — a with-fed consumer is a descendant', () => {
    const tasks: TaskRange[] = [
      range('fetch', 0, 0),
      { id: 'digest', line: 1, endLine: 1, after: {}, producers: ['fetch'] }, // with: binding
    ];
    expect(descendantsOf(tasks, 'fetch')).toEqual(new Set(['digest']));
    expect(upstreamCandidates(tasks, 'fetch')).toEqual([]);
  });

  it('rewrites an existing flow after in place, predicates carried', () => {
    const next = afterRewrite(WF, TASKS[1], [['gather', 'succeeded'], ['sign', 'terminal']])!;
    expect(next).toContain('    after: { gather: succeeded, sign: terminal }');
  });

  it('collapses a block-map after to the flow form', () => {
    const next = afterRewrite(WF, TASKS[2], [['thread', 'terminal'], ['gather', 'succeeded']])!;
    expect(next).toContain('    after: { thread: terminal, gather: succeeded }');
    expect(next).not.toContain('      thread: terminal');
  });

  it('inserts a fresh after right after the key line', () => {
    const next = afterRewrite(WF, TASKS[0], [['sign', 'succeeded']])!;
    expect(next.split('\n')[5]).toBe('    after: { sign: succeeded }');
  });

  it('an empty pick removes the key — and removing the absent is a no-op', () => {
    const next = afterRewrite(WF, TASKS[1], [])!;
    expect(next).not.toContain('after: { gather: succeeded }');
    expect(afterRewrite(WF, TASKS[0], [])).toBe(WF);
  });

  it('gates write the wrapped canonical form, replacing in place', () => {
    const next = gateRewrite(WF, TASKS[1], 'size(with.doc) > 0')!;
    expect(next).toContain('    when: ${{ size(with.doc) > 0 }}');
    expect(next).not.toContain('vars.publish');
  });

  it('a fresh when: lands after after: — the canonical order', () => {
    const next = gateRewrite(WF, TASKS[2], 'vars.publish')!;
    const lines = next.split('\n');
    expect(lines[15]).toBe('    when: ${{ vars.publish }}');
    expect(lines[14]).toBe('      thread: terminal');
  });

  it('a fresh for_each lands after when:, unquoted like the spec', () => {
    const next = fanoutRewrite(WF, TASKS[1], 'vars.urls')!;
    const lines = next.split('\n');
    expect(lines[10]).toBe('    for_each: ${{ vars.urls }}');
    expect(lines[9]).toContain('when:');
  });

  it('a binding grows an existing block with: and suffixes a taken alias', () => {
    const wf = [
      'nika: v1',
      'workflow:',
      '  id: w',
      'tasks:',
      '  gather:',
      '    infer:',
      '      prompt: "a"',
      '  digest:',
      '    with:',
      '      doc: ${{ tasks.gather.output }}',
      '    infer:',
      '      prompt: "${{ with.doc }}"',
      '',
    ].join('\n');
    const digest = range('digest', 7, 11, {}, ['gather']);
    const bound = bindingInsert(wf, digest, 'doc', 'tasks.gather.status', ['doc'])!;
    expect(bound.alias).toBe('doc_2');
    expect(bound.text).toContain('      doc_2: ${{ tasks.gather.status }}');
  });

  it('a binding creates the with: block at the head of the task shape', () => {
    const bound = bindingInsert(WF, TASKS[2], 'thread', 'tasks.thread.output', [])!;
    expect(bound.alias).toBe('thread');
    const lines = bound.text.split('\n');
    expect(lines[13]).toBe('    with:');
    expect(lines[14]).toBe('      thread: ${{ tasks.thread.output }}');
    expect(lines[15]).toBe('    after:');
  });

  it('the gate register is LOCAL — upstream state is after:, upstream value hoists', () => {
    const shapes = gateShapes(['publish'], ['doc'], [TASKS[0]]);
    expect(shapes.map((s) => s.id)).toEqual([
      'var-eq-publish',
      'var-flag-publish',
      'with-content-doc',
      'after-gather',
      'content-gather',
    ]);
    const whens = shapes.filter((s) => s.action.kind === 'when');
    // Every when: expression reads local namespaces only — never tasks.*
    for (const s of whens) {
      expect(s.action.kind === 'when' && s.action.expr).not.toMatch(/\btasks\./);
    }
    const after = shapes.find((s) => s.id === 'after-gather')!;
    expect(after.action).toEqual({ kind: 'after', producer: 'gather', predicate: 'succeeded' });
    const hoist = shapes.find((s) => s.id === 'content-gather')!;
    expect(hoist.action.kind).toBe('bind-when');
    if (hoist.action.kind === 'bind-when') {
      expect(hoist.action.exprOf('gather')).toBe('size(with.gather) > 0');
    }
  });

  it('refuses a moved anchor — never a blind write', () => {
    expect(taskKeyRewrite(WF, { ...TASKS[0], line: 5 }, 'when', 'x')).toBeUndefined();
  });
});

describe('islandKeyRewrite (the server-island position)', () => {
  const DOC = [
    'nika: v1',
    'workflow:',
    '  id: w',
    'model: mock/echo',
    'tasks:',
    '  a:',
    '    infer:',
    '      prompt: "hi"',
    '',
  ].join('\n');

  it('writes the key with an EMPTY value — trailing space, island-servable', () => {
    const wf = parseRichWorkflow(DOC);
    const next = islandKeyRewrite(DOC, wf.tasks[0], 'when');
    expect(next).toBeDefined();
    expect(next).toContain('    when: \n');
  });

  it('an existing value is cleared to the island position, not duplicated', () => {
    const wf = parseRichWorkflow(DOC);
    const gated = gateRewrite(DOC, wf.tasks[0], 'vars.publish');
    const wf2 = parseRichWorkflow(gated ?? '');
    const next = islandKeyRewrite(gated ?? '', wf2.tasks[0], 'when');
    expect(next).toBeDefined();
    expect(next).toContain('    when: \n');
    expect((next?.match(/when:/g) ?? []).length).toBe(1);
  });

  it('for_each rides the same door', () => {
    const wf = parseRichWorkflow(DOC);
    const next = islandKeyRewrite(DOC, wf.tasks[0], 'for_each');
    expect(next).toContain('    for_each: \n');
  });
});

describe('descendantsOf at scale (the linear-walk law)', () => {
  const chain = (n: number): TaskRange[] =>
    Array.from({ length: n }, (_, i) => (
      i > 0
        ? range(`t${i}`, i, i, { [`t${i - 1}`]: 'succeeded' })
        : range(`t${i}`, i, i)
    ));

  it('a 2000-task chain resolves instantly and completely', () => {
    const tasks = chain(2000);
    const started = Date.now();
    const desc = descendantsOf(tasks, 't0');
    expect(desc.size).toBe(1999);
    expect(desc.has('t1999')).toBe(true);
    expect(desc.has('t0')).toBe(false);
    // The naive O(V·E) form took seconds here; linear stays far under
    // an interactive budget even on CI's slowest runner.
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('a diamond converges once — shared descendants are not re-walked', () => {
    const tasks: TaskRange[] = [
      range('root', 0, 0),
      range('left', 1, 1, { root: 'succeeded' }),
      range('right', 2, 2, { root: 'succeeded' }),
      range('join', 3, 3, { left: 'succeeded', right: 'succeeded' }),
    ];
    expect(descendantsOf(tasks, 'root')).toEqual(new Set(['left', 'right', 'join']));
    expect(upstreamCandidates(tasks, 'left').map((t) => t.id)).toEqual(['root', 'right']);
  });
});
