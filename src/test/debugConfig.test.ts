import { describe, expect, it } from 'vitest';

import { matchWorkflowFiles, mergeLaunchConfig, replayConfig, workflowNameOf } from '../core/debugConfig';

describe('workflowNameOf', () => {
  it('a # inside quotes is part of the name, never a comment (0.97.3)', () => {
    // The extractor divergence: the old mixed regex truncated
    // `"deploy #7"` to `deploy`, so a quoted-hash workflow never
    // exact-matched its own journal in the F5 direction while fork
    // (the real parser) matched it fine. The identity line is `nika:`
    // (the nine-key envelope · nika 0.109) — same law, one line.
    expect(workflowNameOf('nika: "deploy #7"\n')).toBe('deploy #7');
    expect(workflowNameOf("nika: 'deploy #7'\n")).toBe('deploy #7');
    expect(workflowNameOf('nika: deploy #7 is a comment\n')).toBe('deploy');
    expect(workflowNameOf('nika: ""\n')).toBeUndefined();
  });

  it('reads the workflow name across quoting styles and comments', () => {
    expect(workflowNameOf('nika: deploy\ntasks: []\n')).toBe('deploy');
    expect(workflowNameOf('nika: "quoted name"\n')).toBe('quoted name');
    expect(workflowNameOf("nika: 'single'\n")).toBe('single');
    expect(workflowNameOf('nika: tail # trailing comment\n')).toBe('tail');
  });

  it('never matches nested or commented keys — and the dead marker is not a name', () => {
    expect(workflowNameOf('  nika: nested\n')).toBeUndefined();
    expect(workflowNameOf('# nika: ghost\n')).toBeUndefined();
    expect(workflowNameOf('tasks: []\n')).toBeUndefined();
    // The previous envelope (`nika: v1` + `workflow: { id }`) is refused
    // by the engine (NIKA-PARSE-005); it carries no name for the journal.
    expect(workflowNameOf('nika: v1\nworkflow:\n  id: deploy\n')).toBeUndefined();
  });
});

describe('matchWorkflowFiles', () => {
  it('returns every match in document order', () => {
    const files = [
      { path: '/a/one.nika.yaml', text: 'nika: alpha\n' },
      { path: '/b/two.nika.yaml', text: 'nika: beta\n' },
      { path: '/c/three.nika.yaml', text: 'nika: alpha\n' },
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
