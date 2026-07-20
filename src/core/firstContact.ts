// firstContact.ts — the missing wire, as a pure decision (V-SOTA.A).
//
// The audit's headline: every piece of the aha existed — the demo, the
// mock provider, the canvas, the walkthrough — and the first activation
// wired NONE of them together. This table is the wire: on a machine's
// FIRST contact ever, the demo opens and runs ITSELF on mock/echo (zero
// key · zero network · zero spend — consent is trivially satisfied and
// the banner says so), and the walkthrough follows as optional depth.
//
// The first-run gesture budget, pinned (firstContact.test.ts):
//   before · binary present:  2 gestures to first green (Try the demo · ▶ mock)
//   before · cold install:    4 gestures (Finish Setup · consent · demo · ▶)
//   after  · binary present:  0 gestures — the demo runs itself
//   after  · cold install:    install gestures only, then 0 — the wire
//                             stays armed and fires when the engine lands
//
// Pure derive — provable without VS Code.

/** What the host does about first contact at this instant. */
export type FirstContactMove =
  /** Not first contact (or the one shot already flew) — nothing. */
  | 'none'
  /** Engine not here yet — greet with the walkthrough now (the door
   *  leads the install) and KEEP the wire armed: a binary that lands
   *  mid-session (Finish Setup) still gets the aha, zero gestures. */
  | 'greet-and-wait'
  /** First contact but the workspace already carries workflows — an
   *  existing user's territory: never auto-open the demo there. The
   *  walkthrough greets, the wire disarms. */
  | 'walkthrough'
  /** The real first contact (virgin workspace or none) with an engine:
   *  open the demo AND run it on mock — the DAG lights itself. */
  | 'auto-demo';

export interface FirstContactFacts {
  /** This machine never activated the extension before (both the
   *  first-activation key AND the legacy walkthrough key were unset —
   *  an UPDATING user carries walkthroughShown and is never re-greeted). */
  armed: boolean;
  /** The one shot already fired this session. */
  flown: boolean;
  binaryAvailable: boolean;
  /** The open workspace already contains *.nika.yaml files. */
  workspaceHasWorkflows: boolean;
}

export function firstContactMove(f: FirstContactFacts): FirstContactMove {
  if (!f.armed || f.flown) { return 'none'; }
  if (!f.binaryAvailable) { return 'greet-and-wait'; }
  return f.workspaceHasWorkflows ? 'walkthrough' : 'auto-demo';
}
