// notify.ts — the notification diet (annexe A #12), as a seam.
//
// Three lanes, one law each:
// - SUCCESS that needs no decision → a status-bar flash, the toast dies
//   (`flashStatus` — 4s, codicons allowed).
// - INFORMATIVE toast that survives → it carries « Don't show again »
//   (`informSoftly` — per-toast globalState key, muted = silent skip).
// - ERROR carrying its fix → untouched by this module: the fix button
//   IS the message (annexe D anatomy owns those).
//
// Outcome answers to a direct gesture (« no traces found », « open a
// .nika.yaml first ») are NOT mutable: a muted outcome would turn the
// gesture into a silent dead end — they stay plain toasts by design.

import * as vscode from 'vscode';

let ctx: vscode.ExtensionContext | undefined;

/** Wire the globalState home once at activation. */
export function initNotify(context: vscode.ExtensionContext): void {
  ctx = context;
}

export const DONT_SHOW_AGAIN = "Don't show again";

const mutedKey = (id: string): string => `nika.toastMuted.${id}`;

/** A success that needs no decision — a 4s status-bar flash, no toast. */
export function flashStatus(message: string, ms = 4000): void {
  vscode.window.setStatusBarMessage(message, ms);
}

/**
 * An informative toast with the diet's mute affordance. Returns the
 * picked action (never the mute row — muting answers itself), or
 * undefined when dismissed or already muted.
 */
export async function informSoftly(
  id: string,
  message: string,
  ...items: string[]
): Promise<string | undefined> {
  if (ctx?.globalState.get<boolean>(mutedKey(id))) { return undefined; }
  const pick = await vscode.window.showInformationMessage(message, ...items, DONT_SHOW_AGAIN);
  if (pick === DONT_SHOW_AGAIN) {
    await ctx?.globalState.update(mutedKey(id), true);
    return undefined;
  }
  return pick;
}
