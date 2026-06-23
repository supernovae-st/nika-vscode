import { describe, it, expect } from 'vitest';
import { annotateDataFlow, collectDataFlow } from '../core/dataflow';
import type { DagEdge, DagNode } from '../core/cliContract';

const DOC = [
  'nika: v1',
  'workflow: flow',
  'model: mock/echo',
  '',
  'tasks:',
  '  - id: fetch_page',
  '    invoke:',
  '      tool: nika:fetch',
  '      args: { url: "https://x.com" }',
  '',
  '  - id: summarize',
  '    depends_on: [fetch_page]',
  '    with:',
  '      page: ${{ tasks.fetch_page.output }}',
  '    infer:',
  '      prompt: "sum ${{ with.page }}"',
  '',
  '  - id: gate',
  '    depends_on: [summarize, fetch_page]',
  '    when: "tasks.summarize.status == \'success\'"',
  '    exec:',
  '      command: echo ok',
  '',
  '  - id: ship',
  '    depends_on: [gate]',
  '    infer:',
  '      prompt: "use ${{ tasks.summarize.output.title }} inline"',
].join('\n');

function nodes(...ids: string[]): DagNode[] {
  return ids.map((id) => ({ id, label: id, verb: 'exec', status: 'pending' as const, dependsOn: [] }));
}

function edge(source: string, target: string): DagEdge {
  return { id: `${source}->${target}`, source, target, isDataEdge: false };
}

describe('collectDataFlow', () => {
  it('collects with-block aliases, bare CEL refs, and inline refs', () => {
    const flow = collectDataFlow(DOC);
    expect(flow.inputs.get('summarize')).toEqual([
      { alias: 'page', from: 'fetch_page', path: 'output' },
    ]);
    // gate reads summarize.status from bare CEL inside when:
    expect(flow.inputs.get('gate')).toEqual([
      { alias: '', from: 'summarize', path: 'status' },
    ]);
    // ship references a deep output path inline (no alias)
    expect(flow.inputs.get('ship')).toEqual([
      { alias: '', from: 'summarize', path: 'output.title' },
    ]);
    expect(flow.inputs.has('fetch_page')).toBe(false);
  });

  it('dedupes repeated refs and ignores self-references', () => {
    const doc = DOC.replace('"use ${{ tasks.summarize.output.title }} inline"',
      '"${{ tasks.summarize.output.title }} ${{ tasks.summarize.output.title }} ${{ tasks.ship.output }}"');
    const flow = collectDataFlow(doc);
    expect(flow.inputs.get('ship')).toEqual([
      { alias: '', from: 'summarize', path: 'output.title' },
    ]);
  });
});

describe('annotateDataFlow', () => {
  it('marks carrying edges with the alias label, leaves order-only edges gray', () => {
    const allNodes = nodes('fetch_page', 'summarize', 'gate', 'ship');
    const allEdges = [
      edge('fetch_page', 'summarize'),
      edge('summarize', 'gate'),
      edge('fetch_page', 'gate'),   // order-only: gate never reads fetch_page
      edge('gate', 'ship'),         // order-only: ship reads SUMMARIZE, not gate
    ];
    const { nodes: outNodes, edges: out } = annotateDataFlow(DOC, allNodes, allEdges);
    const byId = new Map(out.map((e) => [e.id, e]));

    expect(byId.get('fetch_page->summarize')).toMatchObject({ isDataEdge: true, label: 'page' });
    expect(byId.get('summarize->gate')).toMatchObject({ isDataEdge: true, label: 'status' });
    expect(byId.get('fetch_page->gate')?.isDataEdge).toBe(false);
    expect(byId.get('gate->ship')?.isDataEdge).toBe(false); // the data skips a hop — honest

    const ship = outNodes.find((n) => n.id === 'ship');
    expect(ship?.bindingsIn).toEqual([{ alias: '', from: 'summarize', path: 'output.title' }]);
  });

  it('surfaces refs without depends_on as GHOST edges (DAG-003 made visible)', () => {
    const allEdges = [edge('fetch_page', 'summarize')];
    const { edges: out, ghosts } = annotateDataFlow(
      DOC,
      nodes('fetch_page', 'summarize', 'gate', 'ship'),
      allEdges,
    );
    // Real edges untouched in count — the missing wires live separately.
    expect(out).toHaveLength(1);
    const ids = ghosts.map((g) => g.id).sort();
    expect(ids).toEqual(['ghost:summarize->gate', 'ghost:summarize->ship']);
    for (const g of ghosts) {
      expect(g.ghost).toBe(true);
      expect(g.isDataEdge).toBe(true);
      expect(g.label).toBeTruthy();
    }
    // Unknown source ids never ghost (typo'd task = oracle territory).
    const { ghosts: none } = annotateDataFlow(DOC, nodes('summarize'), []);
    expect(none.every((g) => g.source === 'summarize' || g.target === 'summarize')).toBe(true);
  });

  it('never mutates its inputs', () => {
    const e = [edge('fetch_page', 'summarize')];
    annotateDataFlow(DOC, nodes('fetch_page', 'summarize'), e);
    expect(e[0].isDataEdge).toBe(false);
    expect(e[0].label).toBeUndefined();
  });
});
