import { describe, expect, it } from 'vitest';
import {
  dependsRewrite, descendantsOf, fanoutRewrite, findTaskKey, gateRewrite,
  gateShapes, taskKeyRewrite, upstreamCandidates, type TaskRange,
} from '../core/flowEdit';

const WF = `nika: v1
workflow: w
tasks:
  - id: gather
    infer:
      prompt: "a"
  - id: thread
    depends_on: [gather]
    when: \${{ vars.publish }}
    infer:
      prompt: "b"
  - id: sign
    depends_on:
      - thread
    exec:
      command: "sign"
`;

const TASKS: TaskRange[] = [
  { id: 'gather', line: 3, endLine: 5, dependsOn: [] },
  { id: 'thread', line: 6, endLine: 10, dependsOn: ['gather'] },
  { id: 'sign', line: 11, endLine: 15, dependsOn: ['thread'] },
];

describe('flowEdit (wire · gate · fan out)', () => {
  it('finds flow and block task keys, block extent included', () => {
    const lines = WF.split('\n');
    expect(findTaskKey(lines, TASKS[1], 'depends_on')).toMatchObject({ line: 7, end: 7 });
    expect(findTaskKey(lines, TASKS[1], 'when')).toMatchObject({ line: 8 });
    const block = findTaskKey(lines, TASKS[2], 'depends_on');
    expect(block).toMatchObject({ line: 12, end: 13 });
    expect(findTaskKey(lines, TASKS[0], 'depends_on')).toBeUndefined();
  });

  it('descendants are cycle territory — they leave the candidate list', () => {
    expect(descendantsOf(TASKS, 'gather')).toEqual(new Set(['thread', 'sign']));
    expect(upstreamCandidates(TASKS, 'gather')).toEqual([]);
    expect(upstreamCandidates(TASKS, 'sign').map((t) => t.id)).toEqual(['gather', 'thread']);
  });

  it('rewrites an existing flow depends_on in place', () => {
    const next = dependsRewrite(WF, TASKS[1], ['gather', 'sign'])!;
    expect(next).toContain('    depends_on: [gather, sign]');
  });

  it('collapses a block-list depends_on to the flow form', () => {
    const next = dependsRewrite(WF, TASKS[2], ['thread', 'gather'])!;
    expect(next).toContain('    depends_on: [thread, gather]');
    expect(next).not.toContain('      - thread');
  });

  it('inserts a fresh depends_on right after the id line', () => {
    const next = dependsRewrite(WF, TASKS[0], ['sign'])!;
    expect(next.split('\n')[4]).toBe('    depends_on: [sign]');
  });

  it('an empty pick removes the key — and removing the absent is a no-op', () => {
    const next = dependsRewrite(WF, TASKS[1], [])!;
    expect(next).not.toContain('depends_on: [gather]');
    expect(dependsRewrite(WF, TASKS[0], [])).toBe(WF);
  });

  it('gates write the wrapped canonical form, replacing in place', () => {
    const next = gateRewrite(WF, TASKS[1], "tasks.gather.status == 'success'")!;
    expect(next).toContain("    when: ${{ tasks.gather.status == 'success' }}");
    expect(next).not.toContain('vars.publish');
  });

  it('a fresh when: lands after depends_on — the canonical order', () => {
    const next = gateRewrite(WF, TASKS[2], 'vars.publish')!;
    const lines = next.split('\n');
    expect(lines[14]).toBe('    when: ${{ vars.publish }}');
    expect(lines[13]).toBe('      - thread');
  });

  it('a fresh for_each lands after when:, unquoted like the spec', () => {
    const next = fanoutRewrite(WF, TASKS[1], 'vars.urls')!;
    const lines = next.split('\n');
    expect(lines[9]).toBe('    for_each: ${{ vars.urls }}');
    expect(lines[8]).toContain('when:');
  });

  it('the gate register speaks CEL v0.1 and names the edge it needs', () => {
    const shapes = gateShapes(['publish'], [TASKS[0]]);
    expect(shapes.map((s) => s.expr)).toEqual([
      "vars.publish == 'value'",
      'vars.publish',
      "tasks.gather.status == 'success'",
      'size(tasks.gather.output) > 0',
    ]);
    expect(shapes[2].needsTask).toBe('gather');
    expect(shapes[0].needsTask).toBeUndefined();
  });

  it('refuses a moved anchor — never a blind write', () => {
    expect(taskKeyRewrite(WF, { ...TASKS[0], line: 4 }, 'when', 'x')).toBeUndefined();
  });
});

describe('descendantsOf at scale (the linear-walk law)', () => {
  const chain = (n: number): TaskRange[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `t${i}`,
      line: i,
      endLine: i,
      dependsOn: i > 0 ? [`t${i - 1}`] : [],
    }));

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
      { id: 'root', line: 0, endLine: 0, dependsOn: [] },
      { id: 'left', line: 1, endLine: 1, dependsOn: ['root'] },
      { id: 'right', line: 2, endLine: 2, dependsOn: ['root'] },
      { id: 'join', line: 3, endLine: 3, dependsOn: ['left', 'right'] },
    ];
    expect(descendantsOf(tasks, 'root')).toEqual(new Set(['left', 'right', 'join']));
    expect(upstreamCandidates(tasks, 'left').map((t) => t.id)).toEqual(['root', 'right']);
  });
});
