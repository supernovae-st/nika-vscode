import { describe, expect, it } from 'vitest';
import { drillPath, formatXrayValue, parseTraceOutputs, xrayHintsForText } from '../core/xray';

const ev = (kind: string, task: string, output?: string): string => JSON.stringify({
  id: { uuid: 'x' }, timestamp: 1, kind, run: null, correlation: null,
  fields: [
    { key: 'task', value: task },
    ...(output !== undefined ? [{ key: 'output', value: output }] : []),
  ],
});

const TRACE = [
  ev('task_started', 'fetch'),
  ev('task_completed', 'fetch', JSON.stringify({ title: 'Hello HN', items: [{ id: 1 }, { id: 2 }] })),
  ev('task_completed', 'note', '"a plain string output"'),
  ev('task_completed', 'silent'), // secret-tainted: engine stamped NO output
  '{corrupt',
].join('\n');

describe('parseTraceOutputs', () => {
  it('keeps full recorded outputs per task; no-output tasks stay absent', () => {
    const o = parseTraceOutputs(TRACE);
    expect((o.get('fetch') as { title: string }).title).toBe('Hello HN');
    expect(o.get('note')).toBe('a plain string output');
    expect(o.has('silent')).toBe(false);
  });
});

describe('drillPath + formatXrayValue', () => {
  it('drills objects and array indices; breaks honestly', () => {
    const v = { items: [{ id: 7 }] };
    expect(drillPath(v, ['items', '0', 'id'])).toBe(7);
    expect(drillPath(v, ['items', '3'])).toBeUndefined();
    expect(drillPath(v, ['nope'])).toBeUndefined();
  });

  it('truncates loudly, never silently', () => {
    expect(formatXrayValue('x'.repeat(100))!.endsWith('…')).toBe(true);
    expect(formatXrayValue({ a: 1 })).toBe('{"a":1}');
    expect(formatXrayValue(undefined)).toBeUndefined();
  });
});

describe('xrayHintsForText', () => {
  const outputs = parseTraceOutputs(TRACE);

  it('resolves output refs and drills paths; unrecorded stays silent', () => {
    const yaml = [
      'tasks:',
      '  - id: digest',
      '    infer:',
      '      prompt: "Use ${{ tasks.fetch.output.title }} and ${{ tasks.fetch.output }}"',
      '      note: "${{ tasks.ghost.output }} ${{ tasks.silent.output }}"',
    ].join('\n');
    const hints = xrayHintsForText(yaml, outputs);
    expect(hints).toHaveLength(2);
    expect(hints[0].label).toBe(' = "Hello HN"');
    expect(hints[1].label.startsWith(' = {"title"')).toBe(true);
    // ghost (never ran) and silent (no recorded output) yield NOTHING.
  });

  it('status refs are not recorded values — no invention', () => {
    const hints = xrayHintsForText('when: "${{ tasks.fetch.status }}"', outputs);
    expect(hints).toHaveLength(0);
  });
});
