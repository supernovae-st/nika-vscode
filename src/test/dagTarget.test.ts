// dagTarget.test.ts — the bare Show-DAG ladder, every rung.
import { describe, expect, it } from 'vitest';
import { pickDagTarget } from '../core/dagTarget';

const base = { activeIsWorkflow: false, visibleWorkflows: [], workspaceWorkflows: [] };

describe('pickDagTarget', () => {
  it('the active workflow editor wins over everything', () => {
    expect(pickDagTarget({
      ...base,
      activeIsWorkflow: true,
      panelHeld: 'file:///a.nika',
      visibleWorkflows: ['file:///b.nika'],
      workspaceWorkflows: ['file:///c.nika'],
    })).toEqual({ kind: 'active' });
  });

  it('a canvas already holding a workflow re-shows it (the focus-theft class)', () => {
    expect(pickDagTarget({
      ...base,
      panelHeld: 'file:///a.nika',
      visibleWorkflows: ['file:///b.nika'],
    })).toEqual({ kind: 'held', uri: 'file:///a.nika' });
  });

  it('exactly one visible workflow editor wins when nothing is held', () => {
    expect(pickDagTarget({
      ...base,
      visibleWorkflows: ['file:///b.nika'],
      workspaceWorkflows: ['file:///b.nika', 'file:///c.nika'],
    })).toEqual({ kind: 'visible', uri: 'file:///b.nika' });
  });

  it('two visible workflows are ambiguous — fall through the ladder', () => {
    expect(pickDagTarget({
      ...base,
      visibleWorkflows: ['file:///a.nika', 'file:///b.nika'],
      workspaceWorkflows: ['file:///a.nika', 'file:///b.nika'],
    })).toEqual({ kind: 'welcome' });
  });

  it('a single workspace workflow is unambiguous even with zero editors', () => {
    expect(pickDagTarget({
      ...base,
      workspaceWorkflows: ['file:///only.nika'],
    })).toEqual({ kind: 'workspace', uri: 'file:///only.nika' });
  });

  it('an empty workspace lands on the welcome home', () => {
    expect(pickDagTarget(base)).toEqual({ kind: 'welcome' });
  });

  it('many workspace workflows without other signals stay honest — welcome', () => {
    expect(pickDagTarget({
      ...base,
      workspaceWorkflows: ['file:///a.nika', 'file:///b.nika'],
    })).toEqual({ kind: 'welcome' });
  });
});
