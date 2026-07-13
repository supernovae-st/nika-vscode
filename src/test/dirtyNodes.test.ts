import { describe, expect, it } from 'vitest';
import { computeDirty, taskFingerprints } from '../core/dirtyNodes';
import { mergeRunHashes, parseCanvasState } from '../core/canvasState';

const WF = `nika: v1
workflow:
  id: probe
model: mock/echo
tasks:
  seed:
    infer:
      prompt: "Name three colors."
  branch_a:
    depends_on: [seed]
    infer:
      prompt: "Comment briefly."
  branch_b:
    depends_on: [seed]
    infer:
      prompt: "Count lines."
  join:
    depends_on: [branch_a, branch_b]
    infer:
      prompt: "Merge."
`;

describe('taskFingerprints (reformat-stable · change-sensitive)', () => {
  it('is stable under reindentation, blank lines, comments and key order', () => {
    const base = taskFingerprints(WF);
    const reformatted = `nika: v1
workflow:
  id: probe
model: mock/echo
tasks:
  seed:
    infer:
        prompt:    "Name three colors."

    # a new comment does not dirty anything
  branch_a:
    infer:
      prompt: "Comment briefly."
    depends_on: [seed]
  branch_b:
    depends_on: [seed]
    infer:
      prompt: "Count lines."
  join:
    depends_on: [branch_a, branch_b]
    infer:
      prompt: "Merge."
`;
    const after = taskFingerprints(reformatted);
    for (const id of ['seed', 'branch_a', 'branch_b', 'join']) {
      expect(after.get(id), id).toBe(base.get(id));
    }
  });

  it('changes when the prompt, deps or when change', () => {
    const base = taskFingerprints(WF);
    expect(taskFingerprints(WF.replace('Name three colors.', 'Name four colors.')).get('seed'))
      .not.toBe(base.get('seed'));
    expect(taskFingerprints(WF.replace('depends_on: [branch_a, branch_b]', 'depends_on: [branch_a]')).get('join'))
      .not.toBe(base.get('join'));
    expect(taskFingerprints(WF.replace('  join:\n', '  join:\n    when: "${{ 1 > 0 }}"\n')).get('join'))
      .not.toBe(base.get('join'));
  });

  it('the ENVELOPE model is part of every inheriting task substance', () => {
    const base = taskFingerprints(WF);
    const swapped = taskFingerprints(WF.replace('model: mock/echo', 'model: ollama/llama3.2'));
    for (const id of ['seed', 'join']) {
      expect(swapped.get(id), id).not.toBe(base.get(id));
    }
  });
});

describe('computeDirty (direct + downstream cone)', () => {
  const recorded = taskFingerprints(WF);

  it('an untouched workflow against its own record is fully clean', () => {
    const res = computeDirty(WF, recorded);
    expect(res.direct.size).toBe(0);
    expect(res.stale.size).toBe(0);
  });

  it('editing seed stales the whole cone; a sibling edit stays local', () => {
    const res = computeDirty(WF.replace('Name three colors.', 'Name five.'), recorded);
    expect([...res.direct]).toEqual(['seed']);
    expect([...res.stale].sort()).toEqual(['branch_a', 'branch_b', 'join', 'seed']);

    const local = computeDirty(WF.replace('Count lines.', 'Count words.'), recorded);
    expect([...local.direct]).toEqual(['branch_b']);
    expect([...local.stale].sort()).toEqual(['branch_b', 'join']);
  });

  it('a NEW task is stale (and stales its cone) once a record exists', () => {
    const withNew = WF.replace('  join:', `  extra:
    depends_on: [seed]
    infer:
      prompt: "Extra."
  join:`);
    const res = computeDirty(withNew, recorded);
    expect(res.direct.has('extra')).toBe(true);
  });

  it('an EMPTY record shows no badges (first-run state, not noise)', () => {
    const res = computeDirty(WF, new Map());
    expect(res.stale.size).toBe(0);
  });
});

describe('canvas-state sidecar (pure parse/merge)', () => {
  it('roundtrips through merge and strict-parses', () => {
    const hashes = taskFingerprints(WF);
    const state = mergeRunHashes(undefined, 'probe.nika.yaml', hashes, '2026-07-05T05:00:00Z');
    const parsed = parseCanvasState(JSON.stringify(state));
    expect(parsed?.workflows['probe.nika.yaml']?.taskHashes.seed).toBe(hashes.get('seed'));
  });

  it('merge preserves earlier successes not in this run (partial-failure runs)', () => {
    const first = mergeRunHashes(undefined, 'w.nika.yaml', new Map([['a', '1'], ['b', '2']]), 't1');
    const second = mergeRunHashes(first, 'w.nika.yaml', new Map([['b', '3']]), 't2');
    expect(second.workflows['w.nika.yaml'].taskHashes).toEqual({ a: '1', b: '3' });
  });

  it('rejects corrupt or foreign shapes instead of guessing', () => {
    expect(parseCanvasState('not json')).toBeUndefined();
    expect(parseCanvasState('{"version":2,"workflows":{}}')).toBeUndefined();
    expect(parseCanvasState('{"version":1,"workflows":{"w":{"taskHashes":null}}}')).toBeUndefined();
    expect(parseCanvasState('{"version":1}')).toBeUndefined();
  });
});
