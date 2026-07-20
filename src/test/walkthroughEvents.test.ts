// walkthroughEvents.test.ts — the self-verifying walkthrough, pinned
// (V2.b · annexe J §J.2). Three false completionEvents shipped with the
// first walkthrough: `proof` never checked (its button focuses a view —
// no command event ever fired), `run` was blind to every canvas path
// (▶ · ▶ mock · resume never execute nika.runWorkflow), and `timetravel`
// checked on ANY debug session of any extension. This file pins the
// honest table AND the producer twin: every `onContext:` event the
// manifest declares must have a `setContext` producer in src/ — an event
// nobody can ever fire is the broken-step class, dead by construction.

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Step { id: string; completionEvents?: string[]; media: Record<string, unknown> }

const root = path.resolve(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')) as {
  contributes: { walkthroughs: { steps: Step[] }[]; commands: { command: string }[] };
};
const steps = pkg.contributes.walkthroughs[0].steps;

describe('walkthrough completionEvents — the honest table', () => {
  it('pins the full table (every step · every event)', () => {
    expect(Object.fromEntries(steps.map((s) => [s.id, s.completionEvents]))).toEqual({
      install: ['onCommand:nika.checkBinary', 'onCommand:nika.finishSetup'],
      create: ['onCommand:nika.newWorkflow', 'onCommand:nika.initProject', 'onCommand:nika.tryDemo'],
      validate: ['onCommand:nika.checkWorkflow', 'onContext:nika.sawDiagnostics'],
      run: ['onCommand:nika.runWorkflow', 'onContext:nika.everRan'],
      dag: ['onCommand:nika.showDag'],
      break: ['onCommand:nika.explainCode', 'onContext:nika.sawFailure'],
      timetravel: ['onContext:nika.replayStarted'],
      proof: ['onView:nikaRuns', 'onCommand:nika.reproduceRun', 'onCommand:nika.exportOtel', 'onCommand:nika.verifyTrace'],
      agents: ['onCommand:nika.setupMcp', 'onCommand:nika.initProject'],
      community: ['onLink:https://github.com/supernovae-st/nika'],
    });
  });

  it('keeps the taught order — install→create→validate→run→dag→break→timetravel→proof→agents→community', () => {
    expect(steps.map((s) => s.id)).toEqual([
      'install', 'create', 'validate', 'run', 'dag', 'break', 'timetravel', 'proof', 'agents', 'community',
    ]);
  });

  it('no step completes on a generic workbench command (the any-debug false positive is dead)', () => {
    for (const s of steps) {
      for (const e of s.completionEvents ?? []) {
        expect(e, `step '${s.id}'`).not.toMatch(/^onCommand:workbench\./);
      }
    }
  });

  it('every onCommand event names a command this extension declares', () => {
    const declared = new Set(pkg.contributes.commands.map((c) => c.command));
    for (const s of steps) {
      for (const e of s.completionEvents ?? []) {
        const m = e.match(/^onCommand:(nika\..+)$/);
        if (m) { expect(declared.has(m[1]), `step '${s.id}' → ${m[1]}`).toBe(true); }
      }
    }
  });

  it('every onView event names a contributed view', () => {
    const views = new Set(
      Object.values((pkg.contributes as unknown as { views: Record<string, { id: string }[]> }).views)
        .flat().map((v) => v.id),
    );
    for (const s of steps) {
      for (const e of s.completionEvents ?? []) {
        const m = e.match(/^onView:(.+)$/);
        if (m) { expect(views.has(m[1]), `step '${s.id}' → ${m[1]}`).toBe(true); }
      }
    }
  });

  it('every onContext key has a setContext producer in src/ (an unfireable event is a broken step)', () => {
    const srcDir = path.join(root, 'src');
    const sources: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith('test')) { continue; }
          walk(full);
        } else if (entry.name.endsWith('.ts')) {
          sources.push(fs.readFileSync(full, 'utf-8'));
        }
      }
    };
    walk(srcDir);
    const all = sources.join('\n');
    for (const s of steps) {
      for (const e of s.completionEvents ?? []) {
        const m = e.match(/^onContext:([\w.]+)$/);
        if (m) {
          expect(all.includes(`'${m[1]}'`), `step '${s.id}' → no setContext producer for ${m[1]}`).toBe(true);
        }
      }
    }
  });

  it('the run/break producers live in the ONE spawn path (runLive) — every surface funnels there', () => {
    const runLive = fs.readFileSync(path.join(root, 'src', 'features', 'runLive.ts'), 'utf-8');
    expect(runLive).toContain("'nika.everRan'");
    expect(runLive).toContain("'nika.sawFailure'");
  });

  it('the replay producer fires on nika sessions ONLY (session.type gate)', () => {
    const replay = fs.readFileSync(path.join(root, 'src', 'features', 'debugReplay.ts'), 'utf-8');
    expect(replay).toMatch(/session\.type === 'nika'[\s\S]{0,200}nika\.replayStarted/);
  });
});
