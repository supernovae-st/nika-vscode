import { describe, it, expect } from 'vitest';
import { annotateDataFlow, collectDataFlow, edgeKindOfPath } from '../core/dataflow';
import type { DagNode } from '../core/cliContract';

const DOC = [
  'nika: v1',
  'workflow:',
  '  id: flow',
  'model: mock/echo',
  '',
  'tasks:',
  '  fetch_page:',
  '    invoke:',
  '      tool: nika:fetch',
  '      args: { url: "https://x.com" }',
  '',
  '  summarize:',
  '    with:',
  '      page: ${{ tasks.fetch_page.output }}',
  '    infer:',
  '      prompt: "sum ${{ with.page }}"',
  '',
  '  gate:',
  '    after: { fetch_page: succeeded }',
  '    with:',
  '      outcome: ${{ tasks.summarize.status }}',
  '    when: ${{ with.outcome == \'success\' }}',
  '    exec:',
  '      command: ["echo", "ok"]',
  '',
  '  ship:',
  '    after: { gate: succeeded }',
  '    with:',
  '      title: ${{ tasks.summarize.output.title }}',
  '    infer:',
  '      prompt: "use ${{ with.title }} inline"',
].join('\n');

function nodes(...ids: string[]): DagNode[] {
  return ids.map((id) => ({ id, label: id, verb: 'exec', status: 'pending' as const, producers: [] }));
}

describe('edgeKindOfPath (the 03-dag §with role table)', () => {
  it('maps the referenced field shape to the edge role', () => {
    expect(edgeKindOfPath('output')).toBe('value');
    expect(edgeKindOfPath('output.title')).toBe('value');
    expect(edgeKindOfPath('summary')).toBe('value'); // named binding
    expect(edgeKindOfPath('status')).toBe('terminal-observation');
    expect(edgeKindOfPath('duration_ms')).toBe('terminal-observation');
    expect(edgeKindOfPath('started_at')).toBe('terminal-observation');
    expect(edgeKindOfPath('ended_at')).toBe('terminal-observation');
    expect(edgeKindOfPath('error')).toBe('failure-observation');
  });
});

describe('collectDataFlow', () => {
  it('collects with-block bindings only — the boundary is the scanner', () => {
    const flow = collectDataFlow(DOC);
    expect(flow.inputs.get('summarize')).toEqual([
      { alias: 'page', from: 'fetch_page', path: 'output' },
    ]);
    // gate observes summarize.status through its binding — named, typed.
    expect(flow.inputs.get('gate')).toEqual([
      { alias: 'outcome', from: 'summarize', path: 'status' },
    ]);
    // ship imports a deep output path under an alias.
    expect(flow.inputs.get('ship')).toEqual([
      { alias: 'title', from: 'summarize', path: 'output.title' },
    ]);
    expect(flow.inputs.has('fetch_page')).toBe(false);
  });

  it('a tasks.* ref OUTSIDE the boundary is never an input (VAR-021 territory)', () => {
    // The pre-W2 scanner promoted body refs to edges; W2 stays as strict
    // as the server — the ref below is a parse REJECTION engine-side,
    // and the client sketch must not invent a wire from it.
    const doc = DOC.replace('"use ${{ with.title }} inline"', '"use ${{ tasks.gate.output }} inline"');
    const flow = collectDataFlow(doc);
    expect(flow.inputs.get('ship')).toEqual([
      { alias: 'title', from: 'summarize', path: 'output.title' },
    ]);
  });

  it('dedupes repeated refs and ignores self-references', () => {
    const doc = DOC.replace(
      '      title: ${{ tasks.summarize.output.title }}',
      '      title: ${{ tasks.summarize.output.title }}\n      again: ${{ tasks.summarize.output.title }}\n      self: ${{ tasks.ship.output }}',
    );
    const flow = collectDataFlow(doc);
    expect(flow.inputs.get('ship')).toEqual([
      { alias: 'title', from: 'summarize', path: 'output.title' },
      { alias: 'again', from: 'summarize', path: 'output.title' },
    ]);
  });
});

describe('annotateDataFlow', () => {
  it('surfaces the declared bindings per node — edges stay untouched', () => {
    const allNodes = nodes('fetch_page', 'summarize', 'gate', 'ship');
    const { nodes: outNodes } = annotateDataFlow(DOC, allNodes);
    const byId = new Map(outNodes.map((n) => [n.id, n]));
    expect(byId.get('summarize')?.bindingsIn).toEqual([
      { alias: 'page', from: 'fetch_page', path: 'output' },
    ]);
    expect(byId.get('gate')?.bindingsIn).toEqual([
      { alias: 'outcome', from: 'summarize', path: 'status' },
    ]);
    expect(byId.get('ship')?.bindingsIn).toEqual([
      { alias: 'title', from: 'summarize', path: 'output.title' },
    ]);
    expect(byId.get('fetch_page')?.bindingsIn).toBeUndefined();
  });

  it('never mutates its inputs', () => {
    const input = nodes('fetch_page', 'summarize');
    annotateDataFlow(DOC, input);
    expect(input.every((n) => n.bindingsIn === undefined)).toBe(true);
  });
});
