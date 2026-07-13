import { describe, expect, it } from 'vitest';

import { matchWorkflowFiles, mergeLaunchConfig, replayConfig, workflowNameOf } from '../core/debugConfig';

describe('workflowNameOf', () => {
  it('a # inside quotes is part of the name, never a comment (0.97.3)', () => {
    // The extractor divergence: the old mixed regex truncated
    // `"deploy #7"` to `deploy`, so a quoted-hash workflow never
    // exact-matched its own journal in the F5 direction while fork
    // (the real parser) matched it fine.
    expect(workflowNameOf('workflow:\n  id: "deploy #7"\n')).toBe('deploy #7');
    expect(workflowNameOf("workflow:\n  id: 'deploy #7'\n")).toBe('deploy #7');
    expect(workflowNameOf('workflow:\n  id: deploy #7 is a comment\n')).toBe('deploy');
    expect(workflowNameOf('workflow:\n  id: ""\n')).toBeUndefined();
  });

  it('reads the workflow name across quoting styles and comments', () => {
    expect(workflowNameOf('nika: v1\nworkflow:\n  id: deploy\ntasks: []\n')).toBe('deploy');
    expect(workflowNameOf('workflow:\n  id: "quoted name"\n')).toBe('quoted name');
    expect(workflowNameOf("workflow:\n  id: 'single'\n")).toBe('single');
    expect(workflowNameOf('workflow:\n  id: tail # trailing comment\n')).toBe('tail');
  });

  it('never matches nested or commented keys', () => {
    expect(workflowNameOf('  workflow: nested\n')).toBeUndefined();
    expect(workflowNameOf('# workflow: ghost\n')).toBeUndefined();
    expect(workflowNameOf('tasks: []\n')).toBeUndefined();
  });
});

describe('matchWorkflowFiles', () => {
  it('returns every match in document order', () => {
    const files = [
      { path: '/a/one.nika.yaml', text: 'workflow:\n  id: alpha\n' },
      { path: '/b/two.nika.yaml', text: 'workflow:\n  id: beta\n' },
      { path: '/c/three.nika.yaml', text: 'workflow:\n  id: alpha\n' },
    ];
    expect(matchWorkflowFiles(files, 'alpha')).toEqual(['/a/one.nika.yaml', '/c/three.nika.yaml']);
    expect(matchWorkflowFiles(files, 'gamma')).toEqual([]);
  });
});

describe('replayConfig', () => {
  it('builds the one launch shape the adapter accepts', () => {
    const cfg = replayConfig('/w/deploy.nika.yaml', '/w/.nika/traces/run.ndjson');
    expect(cfg.type).toBe('nika');
    expect(cfg.request).toBe('launch');
    expect(cfg.workflow).toBe('/w/deploy.nika.yaml');
    expect(cfg.replay).toBe('/w/.nika/traces/run.ndjson');
    expect(cfg.name).toBe('Replay run.ndjson');
  });
});

describe('mergeLaunchConfig', () => {
  it('resolved paths beat the generated snippet empty strings', () => {
    const cfg = mergeLaunchConfig(
      { type: 'nika', request: 'launch', name: 'Replay latest run', workflow: '${file}', replay: '' },
      '/w/deploy.nika.yaml',
      '/w/.nika/traces/run.ndjson',
    );
    expect(cfg.replay).toBe('/w/.nika/traces/run.ndjson');
    expect(cfg.workflow).toBe('/w/deploy.nika.yaml');
    expect(cfg.name).toBe('Replay latest run');
  });

  it('keeps user extras and fills a missing name', () => {
    const cfg = mergeLaunchConfig({ stopOnEntry: true }, '/w/a.nika.yaml', '/t/r.ndjson');
    expect(cfg.stopOnEntry).toBe(true);
    expect(cfg.name).toBe('Replay r.ndjson');
    expect(cfg.type).toBe('nika');
  });
});
