// firstContact.test.ts — the missing wire's decision table, pinned
// (V-SOTA.A). This IS the re-pinned first-run journey: the auto-run
// changed the gesture budget, and this file is where the new counts
// live as executable truth.
//
//   journey « cold → first green » (no binary at install):
//     before · 4 gestures  (Finish Setup · consent · Try the demo · ▶ mock)
//     after  · 2 gestures  (Finish Setup · consent) — the wire stays armed
//                          and the demo runs ITSELF when the engine lands
//   journey « binary present → first green »:
//     before · 2 gestures  (Try the demo · ▶ mock)
//     after  · 0 gestures  — the demo opens and runs itself at activation
//
// The guard: a workspace already carrying *.nika.yaml is an existing
// user's territory — the wire never auto-opens there, whatever the keys
// say. One shot ever: armed dies with the firstActivation key (burned at
// arm time, host-side), flown dies within the session.

import { describe, expect, it } from 'vitest';
import { firstContactMove } from '../core/firstContact';

const FIRST = { armed: true, flown: false };

describe('firstContactMove — the wire (V-SOTA.A)', () => {
  it('the real first contact with an engine auto-runs the demo — 0 gestures to first green', () => {
    expect(firstContactMove({ ...FIRST, binaryAvailable: true, workspaceHasWorkflows: false }))
      .toBe('auto-demo');
  });

  it('a workspace that already has workflows is never auto-opened (existing territory)', () => {
    expect(firstContactMove({ ...FIRST, binaryAvailable: true, workspaceHasWorkflows: true }))
      .toBe('walkthrough');
  });

  it('cold install greets now and KEEPS the wire armed — the aha fires when the engine lands', () => {
    // greet-and-wait ≠ disarm: after Finish Setup lands the binary this
    // session, the move recomputes to auto-demo (or walkthrough if files
    // appeared meanwhile) — first green costs the install gestures only.
    expect(firstContactMove({ ...FIRST, binaryAvailable: false, workspaceHasWorkflows: false }))
      .toBe('greet-and-wait');
    expect(firstContactMove({ ...FIRST, binaryAvailable: false, workspaceHasWorkflows: true }))
      .toBe('greet-and-wait');
  });

  it('not first contact (or already flown) → nothing, whatever else is true', () => {
    for (const binaryAvailable of [true, false]) {
      for (const workspaceHasWorkflows of [true, false]) {
        expect(firstContactMove({ armed: false, flown: false, binaryAvailable, workspaceHasWorkflows }))
          .toBe('none');
        expect(firstContactMove({ armed: true, flown: true, binaryAvailable, workspaceHasWorkflows }))
          .toBe('none');
      }
    }
  });

  it('the one shot cannot resurrect: flown wins over every other fact', () => {
    expect(firstContactMove({ armed: true, flown: true, binaryAvailable: true, workspaceHasWorkflows: false }))
      .toBe('none');
  });
});
