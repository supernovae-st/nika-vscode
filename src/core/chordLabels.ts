// chordLabels.ts — the ⌘K chord family as teaching labels (pure).
//
// ONE derivation from package.json `contributes.keybindings` serves
// every surface that prints a chord (the canvas a11y help QuickPick ·
// the status-bar menu rows), so the hub teaches its own shortcuts and
// the two surfaces can never drift apart (Raycast law: each action
// shows its shortcut at the point of use).

export interface KeybindingContribution {
  command: string;
  key: string;
  mac?: string;
  when?: string;
}

/** `cmd+k cmd+e` → `⌘+k ⌘+e` · `ctrl+k ctrl+e` → `Ctrl+k Ctrl+e` — the
 *  a11y-help voice, shared verbatim so chords print identically. */
export function prettyChord(
  b: { key: string; mac?: string },
  isMac: boolean,
): string {
  return (isMac && b.mac ? b.mac : b.key)
    .replace(/\bcmd\b/g, '⌘')
    .replace(/\bctrl\b/g, 'Ctrl');
}

/** Per-command chord labels for menu rows (first binding wins). */
export function chordLabels(
  keybindings: readonly KeybindingContribution[] | undefined,
  isMac: boolean,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of keybindings ?? []) {
    if (!out.has(b.command)) { out.set(b.command, prettyChord(b, isMac)); }
  }
  return out;
}
