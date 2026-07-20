// firstGreen.ts — the one confetti, ever.
//
// Peak-end: a run's memory is fixed by its peak and its end, and the
// FIRST completed verdict a machine ever sees is both at once. One
// celebration on the canvas, then never again — afterwards the quiet
// settle cascade and the verdict banner carry every green close. Mock
// runs count: the auto-demo's first green IS the aha this exists for.
import * as vscode from 'vscode';
import type { DagPanel } from '../dagPanel';

const KEY = 'nika.firstGreenRun.v1';

let ctx: vscode.ExtensionContext | undefined;

/** Wired once in activate() — the communityAsk seam shape. */
export function initFirstGreen(context: vscode.ExtensionContext): void {
  ctx = context;
}

/** After a run settles: celebrates the first `completed` verdict ever.
 *  The flag persists BEFORE the webview hears — one shot per machine,
 *  even if the panel dies mid-fall. Returns whether it fired, so the
 *  caller can hold the community toast out of the confetti's way. */
export function maybeCelebrateFirstGreen(verdict: string, panel: DagPanel): boolean {
  if (verdict !== 'completed' || ctx === undefined || ctx.globalState.get<boolean>(KEY) === true) {
    return false;
  }
  void ctx.globalState.update(KEY, true);
  panel.celebrate();
  return true;
}
