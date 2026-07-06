// tracePersist.test.ts — the `--resume` substrate on disk (ADR-099).
//
// ONE filename convention (`.nika/traces/<slug>-<stamp>.ndjson`) is shared
// by the writer, the reader and the Runs-view glob; these tests pin the
// two invariants that keep it safe on a real filesystem:
//   · the tail match is EXACT — workflow `a` must never pick up (or,
//     worse, PRUNE) sibling `a-b`'s traces (the prefix trap)
//   · retention keeps the newest N of THIS workflow only

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { latestTraceFor, persistTrace } from '../core/tracePersist';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'nika-traces-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const wf = (name: string): string => path.join(root, name);
const tracesDir = (): string => path.join(root, '.nika', 'traces');
const seedFile = (file: string, content = '{}'): void => {
  fs.mkdirSync(tracesDir(), { recursive: true });
  fs.writeFileSync(path.join(tracesDir(), file), content, 'utf-8');
};

describe('latestTraceFor', () => {
  it('is undefined when the workflow never ran (no dir · no throw)', () => {
    expect(latestTraceFor(wf('probe.nika.yaml'))).toBeUndefined();
  });

  it('picks the newest stamp of THIS workflow (stamps sort lexically)', () => {
    seedFile('probe-2020-07-01T10-00-00.ndjson');
    seedFile('probe-2020-07-03T09-30-00.ndjson');
    seedFile('probe-2020-07-02T23-59-59.ndjson');
    expect(latestTraceFor(wf('probe.nika.yaml')))
      .toBe(path.join(tracesDir(), 'probe-2020-07-03T09-30-00.ndjson'));
  });

  it('never picks a sibling workflow sharing the prefix (`a` vs `a-b`)', () => {
    seedFile('a-b-2020-07-03T09-30-00.ndjson');
    expect(latestTraceFor(wf('a.nika.yaml'))).toBeUndefined();
    seedFile('a-2020-07-01T10-00-00.ndjson');
    expect(latestTraceFor(wf('a.nika.yaml')))
      .toBe(path.join(tracesDir(), 'a-2020-07-01T10-00-00.ndjson'));
  });

  it('resolves the slug for both workflow extensions', () => {
    seedFile('probe-2020-07-01T10-00-00.ndjson');
    expect(latestTraceFor(wf('probe.nika.yaml'))).toBeTruthy();
    expect(latestTraceFor(wf('probe.yaml'))).toBeTruthy();
  });
});

describe('persistTrace', () => {
  it('writes <slug>-<stamp>.ndjson next to the workflow, readable back', () => {
    persistTrace(wf('probe.nika.yaml'), '{"kind":"workflow_started"}\n');
    const files = fs.readdirSync(tracesDir());
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^probe-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.ndjson$/);
    expect(latestTraceFor(wf('probe.nika.yaml'))).toBe(path.join(tracesDir(), files[0]));
  });

  it('keeps the newest N of this workflow only', () => {
    for (let d = 1; d <= 4; d++) { seedFile(`probe-2020-07-0${d}T10-00-00.ndjson`); }
    persistTrace(wf('probe.nika.yaml'), 'x', 3);
    const files = fs.readdirSync(tracesDir()).sort();
    expect(files).toHaveLength(3);
    // The two oldest seeded stamps were pruned; the fresh write (today's
    // stamp, > 2020-*) survives with the two newest seeds.
    expect(files[0]).toBe('probe-2020-07-03T10-00-00.ndjson');
    expect(files[1]).toBe('probe-2020-07-04T10-00-00.ndjson');
    expect(files[2]).toMatch(/^probe-\d{4}-/);
  });

  it('NEVER prunes a sibling workflow sharing the prefix (the data-loss trap)', () => {
    for (let d = 1; d <= 9; d++) { seedFile(`a-b-2020-07-0${d}T10-00-00.ndjson`); }
    for (let d = 1; d <= 9; d++) { seedFile(`a-2020-07-0${d}T11-00-00.ndjson`); }
    persistTrace(wf('a.nika.yaml'), 'x', 2);
    const files = fs.readdirSync(tracesDir());
    // All 9 of a-b's traces intact; a's own pruned down to keep=2.
    expect(files.filter((f) => f.startsWith('a-b-'))).toHaveLength(9);
    expect(files.filter((f) => !f.startsWith('a-b-'))).toHaveLength(2);
  });

  it('a stray non-stamp file with the slug prefix is never touched', () => {
    seedFile('probe-notes.ndjson');
    for (let d = 1; d <= 3; d++) { seedFile(`probe-2020-07-0${d}T10-00-00.ndjson`); }
    persistTrace(wf('probe.nika.yaml'), 'x', 1);
    const files = fs.readdirSync(tracesDir());
    expect(files).toContain('probe-notes.ndjson');
    expect(files.filter((f) => f !== 'probe-notes.ndjson')).toHaveLength(1);
  });

  it('never throws when the traces dir cannot exist (garnish law)', () => {
    // Point the "workflow" INTO a file so `.nika/traces` mkdir must fail.
    const blocker = wf('blocker');
    fs.writeFileSync(blocker, 'not a dir', 'utf-8');
    expect(() => persistTrace(path.join(blocker, 'x.nika.yaml'), 'x')).not.toThrow();
    expect(latestTraceFor(path.join(blocker, 'x.nika.yaml'))).toBeUndefined();
  });
});

// ─── the dir-wide pruner (0.97.1) — status-aware, protect-aware ──────────────
// The 0.97.0 review's CRITICAL: the old dir pruner was blind to what a
// journal IS. These pin the two guards: a PAUSED journal (the resume
// substrate of an answerable run) survives any ranking, and the imminent
// spawn's own --resume target survives even when it ranks last.
import { isPausedJournal, pruneTraces } from '../core/tracePersist';

const PAUSED_TAIL =
  '{"kind":"task_started","fields":[{"key":"task","value":"ask"}]}\n' +
  '{"kind":"workflow_paused","fields":[{"key":"task","value":"ask"}]}\n';
const DONE_TAIL = '{"kind":"workflow_completed","fields":[]}\n';

describe('pruneTraces (dir-wide · 0.97.1 guards)', () => {
  const seedAt = (file: string, content: string, ageMs: number): string => {
    seedFile(file, content);
    const full = path.join(tracesDir(), file);
    const t = new Date(Date.now() - ageMs);
    fs.utimesSync(full, t, t);
    return full;
  };

  it('keeps the newest N and deletes the rest', () => {
    seedAt('old-1.ndjson', DONE_TAIL, 30_000);
    seedAt('old-2.ndjson', DONE_TAIL, 20_000);
    seedAt('new-1.ndjson', DONE_TAIL, 1_000);
    pruneTraces(root, 1);
    expect(fs.existsSync(path.join(tracesDir(), 'new-1.ndjson'))).toBe(true);
    expect(fs.existsSync(path.join(tracesDir(), 'old-1.ndjson'))).toBe(false);
    expect(fs.existsSync(path.join(tracesDir(), 'old-2.ndjson'))).toBe(false);
  });

  it('NEVER deletes a paused journal — the answerable run survives any ranking', () => {
    const paused = seedAt('paused-old.ndjson', PAUSED_TAIL, 60_000);
    seedAt('done-old.ndjson', DONE_TAIL, 50_000);
    seedAt('new.ndjson', DONE_TAIL, 1_000);
    pruneTraces(root, 1);
    expect(fs.existsSync(paused)).toBe(true);
    expect(fs.existsSync(path.join(tracesDir(), 'done-old.ndjson'))).toBe(false);
  });

  it('NEVER deletes the protected --resume target of the imminent spawn', () => {
    const target = seedAt('fork-source.ndjson', DONE_TAIL, 90_000);
    seedAt('mid.ndjson', DONE_TAIL, 40_000);
    seedAt('new.ndjson', DONE_TAIL, 1_000);
    pruneTraces(root, 1, target);
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.existsSync(path.join(tracesDir(), 'mid.ndjson'))).toBe(false);
  });

  it('keep<=0 or non-finite = unlimited (never deletes)', () => {
    seedAt('a.ndjson', DONE_TAIL, 10_000);
    seedAt('b.ndjson', DONE_TAIL, 5_000);
    pruneTraces(root, 0);
    pruneTraces(root, Number.NaN);
    expect(fs.readdirSync(tracesDir()).length).toBe(2);
  });
});

describe('isPausedJournal', () => {
  it('reads the pause from the tail and the completion as not-paused', () => {
    seedFile('p.ndjson', PAUSED_TAIL);
    seedFile('d.ndjson', DONE_TAIL);
    expect(isPausedJournal(path.join(tracesDir(), 'p.ndjson'))).toBe(true);
    expect(isPausedJournal(path.join(tracesDir(), 'd.ndjson'))).toBe(false);
  });

  it('treats an unreadable file as paused — protection over reclamation', () => {
    expect(isPausedJournal(path.join(tracesDir(), 'absent.ndjson'))).toBe(true);
  });
});
