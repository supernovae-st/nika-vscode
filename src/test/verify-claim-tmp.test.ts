// TEMP adversarial verification — deleted after run.
import { describe, expect, it } from 'vitest';
import { parseRichWorkflow, topoKey } from '../workflowParser';
import { addDependsOn } from '../core/structuralFixes';
import { clientDagFor } from '../core/clientDag';

const DOC = [
  'nika: v1',
  'workflow: fanin',
  'model: mock/echo',
  '',
  'tasks:',
  '  - id: shard',
  '    exec:',
  '      command: echo shard',
  '',
  '  - id: merge',
  '    depends_on: [shard]  # fan-in',
  '    exec:',
  '      command: echo merge',
].join('\n');

describe('claim verification', () => {
  it('A · parser drops inline depends_on with trailing comment', () => {
    const wf = parseRichWorkflow(DOC);
    const merge = wf.tasks.find((t) => t.id === 'merge')!;
    console.log('PARSED dependsOn for merge:', JSON.stringify(merge.dependsOn));
    console.log('topoKey:', topoKey(wf));
    expect(merge.dependsOn).toEqual([]); // claim says [] — comment kills the parse
  });

  it('A2 · control: without the comment, dep parses', () => {
    const clean = DOC.replace('[shard]  # fan-in', '[shard]');
    const merge = parseRichWorkflow(clean).tasks.find((t) => t.id === 'merge')!;
    expect(merge.dependsOn).toEqual(['shard']);
  });

  it('B · clientDagFor (degraded canvas) shows no shard→merge edge', () => {
    const dag = clientDagFor(DOC, 'file:///t.nika.yaml', 't.nika.yaml');
    console.log('EDGES:', JSON.stringify(dag.edges));
    expect(dag.edges.some((e) => e.source === 'shard' && e.target === 'merge')).toBe(false);
  });

  it('C · re-connect writes a duplicated entry', () => {
    const out = addDependsOn(DOC, 'merge', 'shard');
    console.log('addDependsOn result line:', out?.split('\n').find((l) => l.includes('depends_on')));
    expect(out).toBeDefined(); // guard did NOT catch the existing dep
    expect(out!).toContain('depends_on: [shard, shard]  # fan-in'); // duplicate written
  });
});
