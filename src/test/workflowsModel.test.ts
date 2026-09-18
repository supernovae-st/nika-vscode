// workflowsModel.test.ts — the Workflows attention contract.
//
// Three parse stories (ok · empty · unparseable), three attention
// sections (Findings · Clean · Unchecked), and the honesty rules:
// broken files lead outside any section, the absence of a check never
// dresses up as clean, and a lone section dissolves to flat.

import { describe, it, expect } from 'vitest';
import {
  classifyWorkflow,
  groupWorkflows,
  type WorkflowFileFacts,
} from '../core/workflowsModel';

type T = { id: string };

const row = (
  fsPath: string,
  parse: WorkflowFileFacts<T>['parse'],
  badge: WorkflowFileFacts<T>['badge'],
): WorkflowFileFacts<T> => ({ fsPath, parse, badge });

const OK = { kind: 'ok', tasks: [{ id: 'a' }] } as const;

describe('classifyWorkflow — three stories, discriminated', () => {
  it('tasks → ok, zero tasks → empty, a failed read → unparseable', () => {
    expect(classifyWorkflow({ kind: 'read', tasks: [{ id: 'a' }] }))
      .toEqual({ kind: 'ok', tasks: [{ id: 'a' }] });
    expect(classifyWorkflow({ kind: 'read', tasks: [] })).toEqual({ kind: 'empty' });
    expect(classifyWorkflow({ kind: 'unreadable', message: 'EACCES: permission denied' }))
      .toEqual({ kind: 'unparseable', message: 'EACCES: permission denied' });
  });
});

describe('groupWorkflows — partition by attention', () => {
  it('splits Findings · Clean · Unchecked and leads with unparseable outside any section', () => {
    const g = groupWorkflows([
      row('/w/clean.nika', OK, { kind: 'clean' }),
      row('/w/broken.nika', { kind: 'unparseable', message: 'EISDIR' }, undefined),
      row('/w/findings.nika', OK, { kind: 'findings', count: 2 }),
      row('/w/unchecked.nika', OK, undefined),
    ], true);
    expect(g.unparseable.map((r) => r.fsPath)).toEqual(['/w/broken.nika']);
    expect(g.sections.map((s) => s.label)).toEqual(['Findings — 1', 'Clean — 1', 'Unchecked — 1']);
    expect(g.sections.map((s) => s.id)).toEqual([
      'workflows.section.findings', 'workflows.section.clean', 'workflows.section.unchecked',
    ]);
    expect(g.flat).toEqual([]);
  });

  it('an unchecked section says « engine off » when the service is down — never when it runs', () => {
    const rows = [
      row('/w/a.nika', OK, undefined),
      row('/w/b.nika', OK, { kind: 'clean' }),
    ];
    const down = groupWorkflows(rows, false);
    const up = groupWorkflows(rows, true);
    expect(down.sections.find((s) => s.key === 'unchecked')?.description).toBe('engine off');
    expect(up.sections.find((s) => s.key === 'unchecked')?.description).toBeUndefined();
  });

  it('a lone section dissolves to flat — one answer needs no headline', () => {
    const g = groupWorkflows([
      row('/w/b.nika', OK, { kind: 'clean' }),
      row('/w/a.nika', OK, { kind: 'clean' }),
    ], true);
    expect(g.sections).toEqual([]);
    expect(g.flat.map((r) => r.fsPath)).toEqual(['/w/a.nika', '/w/b.nika']);
  });

  it('unparseable rows survive the flatten — they lead even over a lone section', () => {
    const g = groupWorkflows([
      row('/w/ok.nika', OK, { kind: 'clean' }),
      row('/w/broken.nika', { kind: 'unparseable', message: 'ENOENT' }, undefined),
    ], true);
    expect(g.unparseable).toHaveLength(1);
    expect(g.sections).toEqual([]);
    expect(g.flat.map((r) => r.fsPath)).toEqual(['/w/ok.nika']);
  });

  it('sorts by path inside each section', () => {
    const g = groupWorkflows([
      row('/w/z.nika', OK, { kind: 'clean' }),
      row('/w/a.nika', OK, { kind: 'clean' }),
      row('/w/m.nika', OK, { kind: 'findings', count: 1 }),
      row('/w/b.nika', OK, { kind: 'findings', count: 3 }),
    ], true);
    expect(g.sections[0].files.map((r) => r.fsPath)).toEqual(['/w/b.nika', '/w/m.nika']);
    expect(g.sections[1].files.map((r) => r.fsPath)).toEqual(['/w/a.nika', '/w/z.nika']);
  });

  it('never loses nor duplicates a row across the partition', () => {
    const rows = [
      row('/w/a.nika', OK, { kind: 'clean' }),
      row('/w/b.nika', { kind: 'empty' }, undefined),
      row('/w/c.nika', { kind: 'unparseable', message: 'x' }, undefined),
      row('/w/d.nika', OK, { kind: 'findings', count: 1 }),
    ];
    const g = groupWorkflows(rows, true);
    const seen = [
      ...g.unparseable.map((r) => r.fsPath),
      ...g.sections.flatMap((s) => s.files.map((r) => r.fsPath)),
      ...g.flat.map((r) => r.fsPath),
    ];
    expect(seen.sort()).toEqual(rows.map((r) => r.fsPath).sort());
  });

  it('disambiguates colliding basenames with the relative folder', () => {
    const g = groupWorkflows([
      row('/ws/flows/deploy.nika', OK, { kind: 'clean' }),
      row('/ws/jobs/deploy.nika', OK, { kind: 'clean' }),
      row('/ws/solo.nika', OK, { kind: 'clean' }),
    ], true);
    const hints = new Map(g.flat.map((r) => [r.fsPath, r.dirHint]));
    expect(hints.get('/ws/flows/deploy.nika')).toBe('flows');
    expect(hints.get('/ws/jobs/deploy.nika')).toBe('jobs');
    expect(hints.get('/ws/solo.nika')).toBeUndefined();
  });

  it('a nested collision leaves the shallow twin hintless — the deep hint alone tells them apart', () => {
    const g = groupWorkflows([
      row('/ws/deploy.nika', OK, { kind: 'clean' }),
      row('/ws/deep/deploy.nika', OK, { kind: 'clean' }),
    ], true);
    const hints = new Map(g.flat.map((r) => [r.fsPath, r.dirHint]));
    expect(hints.get('/ws/deploy.nika')).toBeUndefined();
    expect(hints.get('/ws/deep/deploy.nika')).toBe('deep');
  });

  it('empty input → nothing everywhere', () => {
    expect(groupWorkflows([], true)).toEqual({ unparseable: [], sections: [], flat: [] });
  });
});
