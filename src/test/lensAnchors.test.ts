import { describe, expect, it } from 'vitest';
import { findLensAnchors, findPermitsLine } from '../core/lensAnchors';

const lines = (s: string): string[] => s.split('\n');

const FULL = `# hello-chain — the chained hello
# every $ accounted for
nika: v1
workflow: hello-chain
description: "gather → thread → sign"
model: mock/echo
tasks:
  - id: gather
    infer:
      prompt: "a"
`;

describe('findLensAnchors (one placement law for the lens rows)', () => {
  it('anchors each row on the line it serves', () => {
    expect(findLensAnchors(lines(FULL)))
      .toEqual({ env: 2, actions: 3, explain: 4, status: 6, hasTasks: true });
  });

  it('never anchors over the header comments (operator screenshot)', () => {
    expect(findLensAnchors(lines(FULL)).env).toBe(2);
  });

  it('explain falls back to the action row without a description', () => {
    expect(findLensAnchors(lines('nika: v1\nworkflow: w\ntasks:\n')))
      .toEqual({ env: 0, actions: 1, explain: 1, status: 2, hasTasks: true });
  });

  it('actions fall back to the envelope without a workflow name', () => {
    expect(findLensAnchors(lines('nika: v1\ndescription: d\n')))
      .toEqual({ env: 0, actions: 0, explain: 1, status: 0, hasTasks: false });
  });

  it('status joins the action row when tasks: is absent', () => {
    expect(findLensAnchors(lines('nika: v1\nworkflow: w\n')).status).toBe(1);
  });

  it('a headerless file keeps every door at line 0', () => {
    expect(findLensAnchors(lines('tasks:\n  - id: a\n')))
      .toEqual({ env: 0, actions: 0, explain: 0, status: 0, hasTasks: true });
  });

  it('a task-level description (indented) never anchors Explain', () => {
    const wf = 'nika: v1\nworkflow: w\ntasks:\n  - id: a\n    description: not me\n';
    expect(findLensAnchors(lines(wf)).explain).toBe(1);
  });

  it('commented decoys never anchor', () => {
    const wf = '# workflow: decoy\n# description: decoy\nnika: v1\nworkflow: real\n';
    expect(findLensAnchors(lines(wf)))
      .toEqual({ env: 2, actions: 3, explain: 3, status: 3, hasTasks: false });
  });

  it('tolerates CRLF line endings', () => {
    expect(findLensAnchors('nika: v1\r\nworkflow: w\r\ntasks:\r\n'.split('\n')))
      .toEqual({ env: 0, actions: 1, explain: 1, status: 2, hasTasks: true });
  });

  it('stops scanning at the cap — envelope keys live at the top', () => {
    const far = [...Array<string>(450).fill('# padding'), 'nika: v1'];
    expect(findLensAnchors(far).env).toBe(0);
  });
});

describe('findPermitsLine (the tighten-the-boundary door)', () => {
  it('finds a top-level permits: block', () => {
    expect(findPermitsLine(lines('nika: v1\npermits:\n  network: []\n'))).toBe(1);
  });

  it('finds the block the engine appends at the END of the file', () => {
    // `check --infer-permits` inserts at EOF — past any envelope cap.
    const far = [...Array<string>(450).fill('# padding'), 'permits:', '  network: []'];
    expect(findPermitsLine(far)).toBe(450);
  });

  it('tolerates a trailing comment and CRLF', () => {
    expect(findPermitsLine(['permits:  # the boundary'])).toBe(0);
    expect(findPermitsLine('nika: v1\r\npermits:\r\n'.split('\n'))).toBe(1);
  });

  it('never opens on decoys — indented · commented · flow-form', () => {
    expect(findPermitsLine(lines('tasks:\n  - id: a\n    permits:\n'))).toBeUndefined();
    expect(findPermitsLine(lines('# permits:\n'))).toBeUndefined();
    expect(findPermitsLine(lines('permits: {}\n'))).toBeUndefined();
  });

  it('returns undefined when the boundary is undeclared', () => {
    expect(findPermitsLine(lines(FULL))).toBeUndefined();
  });
});
