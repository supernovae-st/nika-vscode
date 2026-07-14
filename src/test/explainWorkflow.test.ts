// explainWorkflow.test.ts — the deterministic narration stays traceable
// to engine facts: waves narrated, costs quoted, risks named — and the
// story is honest about what it does NOT know (no report · cycles).

import { describe, it, expect } from 'vitest';
import { explainWorkflow } from '../core/explainWorkflow';
import type { CheckReport, DagGraph } from '../core/cliContract';

const graph: DagGraph = {
  workflowName: 'seo-brief',
  nodes: [
    { id: 'fetch', label: 'fetch', verb: 'invoke', tool: 'nika:fetch', status: 'pending', producers: [] },
    { id: 'summarize', label: 'summarize', verb: 'infer', model: 'mistral/mistral-small', status: 'pending', producers: ['fetch'] },
    { id: 'title', label: 'title', verb: 'infer', model: 'mistral/mistral-small', status: 'pending', producers: ['fetch'], when: 'vars.want_title' },
  ],
  edges: [
    { id: 'fetch->summarize:value:page', source: 'fetch', target: 'summarize', kind: 'value', label: 'page' },
    { id: 'fetch->title:control:succeeded', source: 'fetch', target: 'title', kind: 'control', predicate: 'succeeded' },
  ],
};

const report: CheckReport = {
  report_version: 3,
  conformance: [],
  waves: [[0], [1, 2]],
  cost: {
    tasks: [
      { task: 'summarize', model: 'mistral/mistral-small', usd: 0.004 },
      { task: 'title', model: 'mistral/mistral-small', usd: 0.001 },
    ],
    bounded_total_usd: 0.005,
    min_path_total_usd: 0.001,
  },
  secret_leaks: [],
  secret_egresses: [],
  capability_escapes: [],
  schema_findings: [],
  unknown_tools: [],
  schema_lints: [],
  hints: [],
  analysis: {
    width: 2,
    width_witness: ['summarize', 'title'],
    pinch_points: ['fetch'],
    blast_radius: [{ task: 'fetch', blocks: 2 }],
  },
};

describe('explainWorkflow (deterministic narration)', () => {
  it('narrates the engine waves with verbs, models, gates and parallelism', () => {
    const md = explainWorkflow(graph, report);
    expect(md).toContain('# seo-brief — what this workflow does');
    expect(md).toContain('**3 tasks · 2 typed edges**');
    expect(md).toContain('1. **fetch** (invoke · nika:fetch)');
    expect(md).toContain('2 tasks run in parallel');
    expect(md).toContain('runs only when `vars.want_title`');
    // Engine waves in play — no derived-from-graph caveat.
    expect(md).not.toContain('derived from the graph');
  });

  it('quotes the cost ceiling and the top priced tasks', () => {
    const md = explainWorkflow(graph, report);
    expect(md).toContain('Bounded ceiling: **$0.0050**');
    expect(md).toContain('cheapest path $0.0010');
    expect(md).toContain('`summarize` up to $0.0040');
  });

  it('names the structural risks the engine analysis sees', () => {
    const md = explainWorkflow(graph, report);
    expect(md).toContain('pinch point: `fetch`');
    expect(md).toContain('`fetch` failing blocks 2 downstream tasks');
    expect(md).toContain('Secret flow: clean');
  });

  it('flags the unbounded ceiling as a FLOOR, loudly', () => {
    const md = explainWorkflow(graph, {
      ...report,
      cost: { ...report.cost, has_unbounded: true, bounded_total_usd: 0.005 },
    });
    expect(md).toContain('The ceiling is a FLOOR');
  });

  it('stays honest without a report: derived waves + no invented cost', () => {
    const md = explainWorkflow(graph);
    expect(md).toContain('derived from the graph');
    expect(md).toContain('1. **fetch**');
    expect(md).toContain('No check report yet');
    expect(md).not.toContain('Bounded ceiling');
  });

  it('surfaces cycle leftovers instead of hiding them', () => {
    const cyclic: DagGraph = {
      workflowName: 'loop',
      nodes: [
        { id: 'a', label: 'a', verb: 'exec', status: 'pending', producers: ['b'] },
        { id: 'b', label: 'b', verb: 'exec', status: 'pending', producers: ['a'] },
      ],
      edges: [
        { id: 'a->b:control:succeeded', source: 'a', target: 'b', kind: 'control', predicate: 'succeeded' },
        { id: 'b->a:control:succeeded', source: 'b', target: 'a', kind: 'control', predicate: 'succeeded' },
      ],
    };
    const md = explainWorkflow(cyclic);
    expect(md).toContain('never reached a wave');
  });

  it('a recovery edge never orders the waves (a parking read)', () => {
    const withRecovery: DagGraph = {
      ...graph,
      edges: [
        ...graph.edges,
        // summarize's on_error.recover reads title — NOT an ordering
        // edge; the waves must not serialize summarize behind title.
        { id: 'title->summarize:recovery:', source: 'title', target: 'summarize', kind: 'recovery' },
      ],
    };
    const md = explainWorkflow(withRecovery);
    expect(md).not.toContain('never reached a wave');
  });
});
