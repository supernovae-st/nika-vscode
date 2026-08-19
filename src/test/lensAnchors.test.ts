import { describe, expect, it } from 'vitest';
import { findLensAnchors, findPermitsLine } from '../core/lensAnchors';

const lines = (s: string): string[] => s.split('\n');

const FULL = `# hello-chain — the chained hello
# every $ accounted for
nika: hello-chain
model: mock/echo
tasks:
  gather:
    infer:
      prompt: "a"
`;

describe('findLensAnchors (one placement law for the lens rows · the nine-key envelope)', () => {
  it('anchors each row on the line it serves — the identity line carries the doors, tasks: the status', () => {
    // nika 0.109: `nika: <id>` is the ONE identity line (no `workflow:`
    // object, no top-level `description:`) — the project door, the action
    // row and Explain all sit on it; the status row sits on `tasks:`.
    expect(findLensAnchors(lines(FULL)))
      .toEqual({ env: 2, actions: 2, explain: 2, status: 4, hasTasks: true });
  });

  it('never anchors over the header comments (operator screenshot)', () => {
    expect(findLensAnchors(lines(FULL)).env).toBe(2);
  });

  it('a description is a # comment above nika: — it never anchors anything', () => {
    expect(findLensAnchors(lines('# what this does\nnika: w\ntasks:\n')))
      .toEqual({ env: 1, actions: 1, explain: 1, status: 2, hasTasks: true });
  });

  it('status joins the identity line when tasks: is absent', () => {
    expect(findLensAnchors(lines('nika: w\n')).status).toBe(0);
    expect(findLensAnchors(lines('nika: w\n')).hasTasks).toBe(false);
  });

  it('a headerless file keeps every door at line 0', () => {
    expect(findLensAnchors(lines('tasks:\n  a:\n')))
      .toEqual({ env: 0, actions: 0, explain: 0, status: 0, hasTasks: true });
  });

  it('a task-level description (indented) never anchors Explain', () => {
    const wf = 'nika: w\ntasks:\n  a:\n    description: not me\n';
    expect(findLensAnchors(lines(wf)).explain).toBe(0);
  });

  it('commented decoys never anchor', () => {
    const wf = '# workflow: decoy\n# description: decoy\nnika: real\n';
    expect(findLensAnchors(lines(wf)))
      .toEqual({ env: 2, actions: 2, explain: 2, status: 2, hasTasks: false });
  });

  it('a pre-migration file (the dead workflow: object) still anchors its doors while it is being moved', () => {
    // The engine refuses that file (NIKA-PARSE-005); the editor keeps the
    // doors on their old lines so the migration itself stays reachable.
    expect(findLensAnchors(lines('nika: v1\nworkflow:\n  id: w\ntasks:\n')))
      .toEqual({ env: 0, actions: 1, explain: 1, status: 3, hasTasks: true });
  });

  it('tolerates CRLF line endings', () => {
    expect(findLensAnchors('nika: w\r\nmodel: mock/echo\r\ntasks:\r\n'.split('\n')))
      .toEqual({ env: 0, actions: 0, explain: 0, status: 2, hasTasks: true });
  });

  it('stops scanning at the cap — envelope keys live at the top', () => {
    const far = [...Array<string>(450).fill('# padding'), 'nika: t'];
    expect(findLensAnchors(far).env).toBe(0);
  });
});

describe('findPermitsLine (the tighten-the-boundary door)', () => {
  it('finds a top-level permits: block', () => {
    expect(findPermitsLine(lines('nika: t\npermits:\n  network: []\n'))).toBe(1);
  });

  it('finds the block the engine appends at the END of the file', () => {
    // `check --infer-permits` inserts at EOF — past any envelope cap.
    const far = [...Array<string>(450).fill('# padding'), 'permits:', '  network: []'];
    expect(findPermitsLine(far)).toBe(450);
  });

  it('tolerates a trailing comment and CRLF', () => {
    expect(findPermitsLine(['permits:  # the boundary'])).toBe(0);
    expect(findPermitsLine('nika: t\r\npermits:\r\n'.split('\n'))).toBe(1);
  });

  it('never opens on decoys — indented · commented · flow-form', () => {
    expect(findPermitsLine(lines('tasks:\n  a:\n    permits:\n'))).toBeUndefined();
    expect(findPermitsLine(lines('# permits:\n'))).toBeUndefined();
    expect(findPermitsLine(lines('permits: {}\n'))).toBeUndefined();
  });

  it('returns undefined when the boundary is undeclared', () => {
    expect(findPermitsLine(lines(FULL))).toBeUndefined();
  });
});
