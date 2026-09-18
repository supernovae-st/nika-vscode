// webviewPathGuard.test.ts — the generic webview→host path gate
// (maker≠checker). Claim under test: a compromised webview riding
// `dag:openSub` / `dag:openTrail` / `dag:openArtifact` gains NO arbitrary
// open, reveal or write — each surface is a capability (only what the
// extension surfaced), checked on the RAW echoed string, fails-closed.

import { describe, expect, it } from 'vitest';
import { SurfacedPaths, subCreateAllowed } from '../core/webviewPathGuard';

describe('SurfacedPaths — the sub-workflow surface (.nika belt)', () => {
  const subs = (): SurfacedPaths => {
    const s = new SurfacedPaths('.nika');
    s.replace(['./deploy.nika', 'children/build.nika', '/abs/lib.nika']);
    return s;
  };

  it('accepts a sub ref the shown graph surfaced (relative and absolute)', () => {
    expect(subs().allows('./deploy.nika')).toBe(true);
    expect(subs().allows('children/build.nika')).toBe(true);
    expect(subs().allows('/abs/lib.nika')).toBe(true);
  });

  it('rejects an arbitrary local file — the arbitrary-open/write probe', () => {
    expect(subs().allows('/etc/passwd')).toBe(false);
    expect(subs().allows('file:///etc/passwd')).toBe(false);
  });

  it('rejects a traversal ref the graph never surfaced', () => {
    expect(subs().allows('../../../../etc/cron.d/evil.nika')).toBe(false);
    expect(subs().allows('./deploy.nika/../../../etc/passwd')).toBe(false);
  });

  it('rejects a real workflow OUTSIDE the surfaced set (capability, not a filter)', () => {
    expect(subs().allows('./other-real.nika')).toBe(false);
  });

  it('rejects an encoding variant of a member — the raw string is the law', () => {
    // A lenient Uri.parse would normalize %64→d and reach the same file;
    // the raw comparison never parses, so the variant is just a non-member.
    expect(subs().allows('./%64eploy.nika')).toBe(false);
  });

  it('the suffix belt rejects a lookalike even if it drifts into the set', () => {
    const drifted = new SurfacedPaths('.nika');
    drifted.replace(['./evil.nika.evil', './trailing.nika/..', './old.nika.yaml']);
    expect(drifted.allows('./evil.nika.evil')).toBe(false);
    expect(drifted.allows('./trailing.nika/..')).toBe(false);
    expect(drifted.allows('./old.nika.yaml')).toBe(false);
  });

  it('the suffix belt rejects query/hash lookalikes on the raw string', () => {
    const drifted = new SurfacedPaths('.nika');
    drifted.replace(['./deploy.nika?evil', './deploy.nika#fragment']);
    expect(drifted.allows('./deploy.nika?evil')).toBe(false);
    expect(drifted.allows('./deploy.nika#fragment')).toBe(false);
  });

  it('an empty set opens nothing (no graph shown → nothing to open)', () => {
    expect(new SurfacedPaths('.nika').allows('./deploy.nika')).toBe(false);
  });

  it('replace() supersedes — the previous graph’s refs stop qualifying', () => {
    const s = subs();
    s.replace(['./fresh.nika']);
    expect(s.allows('./deploy.nika')).toBe(false);
    expect(s.allows('./fresh.nika')).toBe(true);
  });

  it('clear() closes the surface', () => {
    const s = subs();
    s.clear();
    expect(s.allows('./deploy.nika')).toBe(false);
  });

  it('a malformed echo (non-string) fails closed', () => {
    expect(subs().allows(undefined)).toBe(false);
    expect(subs().allows(null)).toBe(false);
    expect(subs().allows(42)).toBe(false);
    expect(subs().allows(['./deploy.nika'])).toBe(false);
  });
});

describe('SurfacedPaths — the trail surface (breadcrumb uris)', () => {
  const trail = (): SurfacedPaths => {
    const s = new SurfacedPaths('.nika');
    s.replace(['file:///work/parent.nika', 'file:///work/child.nika']);
    return s;
  };

  it('accepts a segment the last dag:trail push surfaced', () => {
    expect(trail().allows('file:///work/parent.nika')).toBe(true);
  });

  it('rejects /etc/passwd, traversal and out-of-trail uris', () => {
    expect(trail().allows('file:///etc/passwd')).toBe(false);
    expect(trail().allows('file:///work/../etc/passwd')).toBe(false);
    expect(trail().allows('file:///elsewhere/real.nika')).toBe(false);
  });

  it('an empty trail push closes the climb (fails-closed)', () => {
    const s = trail();
    s.replace([]);
    expect(s.allows('file:///work/parent.nika')).toBe(false);
  });
});

describe('SurfacedPaths — the artifact surface (set membership is the story)', () => {
  const arts = (): SurfacedPaths => {
    const s = new SurfacedPaths();
    s.replace(['/work/.nika/out/chart.svg']);
    return s;
  };

  it('accepts a pushed artifact of any file type (no suffix belt)', () => {
    const s = arts();
    s.record(['/work/.nika/out/voice.mp3', '/work/report.pdf']);
    expect(s.allows('/work/.nika/out/chart.svg')).toBe(true);
    expect(s.allows('/work/.nika/out/voice.mp3')).toBe(true);
    expect(s.allows('/work/report.pdf')).toBe(true);
  });

  it('rejects /etc/passwd and anything never pushed — revealFileInOS stays capability-bound', () => {
    expect(arts().allows('/etc/passwd')).toBe(false);
    expect(arts().allows('/work/.nika/out/../../../etc/passwd')).toBe(false);
    expect(arts().allows('/work/.nika/out/other.svg')).toBe(false);
  });

  it('record() accumulates deltas without dropping the graph’s own artifacts', () => {
    const s = arts();
    s.record(['/work/.nika/out/late.png']);
    expect(s.allows('/work/.nika/out/chart.svg')).toBe(true);
    expect(s.allows('/work/.nika/out/late.png')).toBe(true);
  });

  it('an empty set (nothing recorded) reveals nothing', () => {
    expect(new SurfacedPaths().allows('/work/.nika/out/chart.svg')).toBe(false);
  });
});

describe('subCreateAllowed — the create-on-miss WRITE belt (dag:openSub)', () => {
  it('creates only inside the workspace with the exact workflow extension', () => {
    expect(subCreateAllowed({ path: '/work/repo/sub.nika', inWorkspace: true })).toBe(true);
  });

  it('refuses a target outside the workspace — the traversal-resolved case', () => {
    // `Uri.joinPath` normalizes `..`, so a surfaced-but-traversing ref
    // resolves out of the workspace and must never be written.
    expect(subCreateAllowed({ path: '/etc/cron.d/evil.nika', inWorkspace: false })).toBe(false);
  });

  it('refuses a non-workflow extension even inside the workspace', () => {
    expect(subCreateAllowed({ path: '/work/repo/.bashrc', inWorkspace: true })).toBe(false);
    expect(subCreateAllowed({ path: '/work/repo/evil.nika.sh', inWorkspace: true })).toBe(false);
    expect(subCreateAllowed({ path: '/work/repo/sub.nika.yaml', inWorkspace: true })).toBe(false);
    expect(subCreateAllowed({ path: '/work/repo/.nika', inWorkspace: true })).toBe(false);
  });

  it('refuses both-ways-wrong targets (fails-closed on every leg)', () => {
    expect(subCreateAllowed({ path: '/etc/passwd', inWorkspace: false })).toBe(false);
  });
});
