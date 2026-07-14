// The keystroke-DAG anti-flicker gate: topoKey must be BLIND to prose
// edits and SENSITIVE to topology moves — that property IS the feature
// (a wrong key either flickers the panel per keystroke or freezes it).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { clientDagFor } from '../core/clientDag';
import { parseRichWorkflow, topoKey } from '../workflowParser';

const SIGNATURE = readFileSync(
  join(__dirname, 'fixtures', 'signature-demo.nika.yaml'),
  'utf8',
);

const keyOf = (text: string): string => topoKey(parseRichWorkflow(text));

describe('topoKey — blind to prose, sensitive to topology', () => {
  it('is stable across prompt/comment/whitespace edits', () => {
    const base = keyOf(SIGNATURE);
    expect(keyOf(SIGNATURE.replace('Draft concise release notes', 'Write DETAILED notes'))).toBe(base);
    expect(keyOf(SIGNATURE.replace('# SIGNATURE DEMO', '# renamed header comment'))).toBe(base);
    expect(keyOf(SIGNATURE + '\n\n# trailing comment\n')).toBe(base);
    // Model swaps are cosmetics, not topology (cards re-read at save).
    expect(keyOf(SIGNATURE.replace('model: mock/echo', 'model: ollama/llama3.2'))).toBe(base);
  });

  it('moves when a task is added, renamed, or an edge changes', () => {
    const base = keyOf(SIGNATURE);
    expect(keyOf(SIGNATURE.replace('draft:', 'draft2:'))).not.toBe(base);
    // A control-edge change (after entry) moves the key…
    expect(keyOf(SIGNATURE.replace('after: { discover: succeeded }', 'after: { draft: succeeded }'))).not.toBe(base);
    // …a PREDICATE change too (the gate is topology in W2)…
    expect(keyOf(SIGNATURE.replace('after: { discover: succeeded }', 'after: { discover: terminal }'))).not.toBe(base);
    // …and a data-edge change (the binding IS the edge).
    expect(keyOf(SIGNATURE.replace('notes: ${{ tasks.draft.output }}', 'notes: ${{ tasks.digest.output }}'))).not.toBe(base);
    // W1: a task must live INSIDE the tasks block (the old list form let
    // an appended `- id:` count from anywhere — the map parser is scoped).
    expect(
      keyOf(SIGNATURE.replace('\noutputs:', '\n  extra:\n    exec:\n      command: ["true"]\n\noutputs:')),
    ).not.toBe(base);
  });

  it('clientDagFor projects the signature shape (9 nodes, diamond, typed)', () => {
    const g = clientDagFor(SIGNATURE, 'file:///demo.nika.yaml', 'demo');
    expect(g.nodes).toHaveLength(9);
    expect(g.nodes.map((n) => n.id)).toContain('stats');
    // Both diamond arms exist — and each carries its graph_format 2 kind:
    // stats reads discover.output through with: (value edge), digest
    // orders on discover's state (control edge, predicate carried).
    const statsArm = g.edges.find((e) => e.source === 'discover' && e.target === 'stats');
    expect(statsArm).toMatchObject({ kind: 'value', label: 'files' });
    const digestArm = g.edges.find((e) => e.source === 'discover' && e.target === 'digest');
    expect(digestArm).toMatchObject({ kind: 'control', predicate: 'succeeded' });
  });

  it('meets the keystroke budget — parse+key well under 30ms on 9 tasks', () => {
    const start = performance.now();
    for (let i = 0; i < 50; i++) { keyOf(SIGNATURE); }
    const perCall = (performance.now() - start) / 50;
    expect(perCall).toBeLessThan(30);
  });
});
