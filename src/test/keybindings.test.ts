// keybindings.test.ts — the ⌘K chord family contract (DESIGN.md §7b).
//
// Every editor-side gesture lives on the ctrl+k chord prefix, second
// stroke modified and when-scoped. This belt holds three promises:
// the family shape (prefix + when + a real command), the family's own
// second strokes never collide, and no second stroke lands on a chord
// the DEFAULT keymap already owns. The default-occupied table below is
// the documented `ctrl+k ctrl+<x>` surface (comment/fold/hover/theme/
// close/trim/… — C · D · F · I · J · L · O · Q · R · S · T · U · W ·
// X and the digits); the integration suite re-proves it against the
// LIVE editor's default-keybindings dump (the runtime authority —
// test-integration/suite/keybindings.test.ts). D notably is NOT free:
// upstream binds ⌘K ⌘D to moveSelectionToNextFindMatch, which is why
// the demo rides H, not its initial. The dump arbiter also found the
// family's ONE accepted shadow — ⌘K ⌘B sits on setSelectionAnchor in
// plain editors; fork-from-task keeps it inside nika files (pinned
// there, absent from this table so the family's own B stays legal).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chordLabels, prettyChord } from '../core/chordLabels';

interface Keybinding { command: string; key: string; mac?: string; when?: string }
interface Command { command: string }

const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'),
) as {
  contributes: { keybindings: Keybinding[]; commands: Command[] };
};

const bindings = pkg.contributes.keybindings;
const known = new Set(pkg.contributes.commands.map((c) => c.command));

/** Second strokes the DEFAULT keymap already binds on ctrl+k ctrl+<x>. */
const DEFAULT_OCCUPIED = new Set([
  'c', 'd', 'f', 'i', 'j', 'l', 'o', 'q', 'r', 's', 't', 'u', 'w', 'x',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
]);

const secondStroke = (key: string): string | undefined =>
  /^ctrl\+k ctrl\+(.+)$/.exec(key)?.[1];

describe('the ⌘K chord family (DESIGN.md §7b)', () => {
  it('every binding rides the ctrl+k prefix, mac mirrors it on cmd+k', () => {
    for (const b of bindings) {
      expect(b.key, b.command).toMatch(/^ctrl\+k ctrl\+.$/);
      expect(b.mac, b.command).toBe(b.key.replaceAll('ctrl', 'cmd'));
    }
  });

  it('every binding is when-scoped and points at a declared command', () => {
    for (const b of bindings) {
      expect(b.when, b.command).toBeTruthy();
      expect(b.when).toMatch(/editorLangId == 'nika'/);
      expect(known.has(b.command), `${b.command} is not a declared command`).toBe(true);
    }
  });

  it('the family never collides with itself (one second stroke, one gesture)', () => {
    const strokes = bindings.map((b) => secondStroke(b.key));
    expect(new Set(strokes).size).toBe(strokes.length);
  });

  it('no second stroke lands on a default-keymap chord', () => {
    for (const b of bindings) {
      const s = secondStroke(b.key);
      expect(s, b.key).toBeDefined();
      expect(DEFAULT_OCCUPIED.has(s!), `${b.key} shadows a default chord`).toBe(false);
    }
  });

  it('the flight-recorder tier is wired: A/B diff · rePlay · Branch · Verify', () => {
    const byCommand = new Map(bindings.map((b) => [b.command, b.key]));
    expect(byCommand.get('nika.diffTraces')).toBe('ctrl+k ctrl+a');
    expect(byCommand.get('nika.replayTrace')).toBe('ctrl+k ctrl+p');
    expect(byCommand.get('nika.forkFromTask')).toBe('ctrl+k ctrl+b');
    expect(byCommand.get('nika.verifyTrace')).toBe('ctrl+k ctrl+v');
    // The flight-recorder chords answer from the canvas too.
    for (const cmd of ['nika.diffTraces', 'nika.replayTrace', 'nika.forkFromTask', 'nika.verifyTrace']) {
      const b = bindings.find((x) => x.command === cmd);
      expect(b?.when).toContain("activeWebviewPanelId == 'nika.dagView'");
    }
  });

  it('the demo rides H (Hands-on) — D is a default chord, so H it is', () => {
    const demo = bindings.find((b) => b.command === 'nika.tryDemo');
    expect(demo?.key).toBe('ctrl+k ctrl+h');
    expect(demo?.mac).toBe('cmd+k cmd+h');
    expect(demo?.when).toContain("activeWebviewPanelId == 'nika.dagView'");
  });
});

describe('the teaching labels (core/chordLabels — menu + a11y, one voice)', () => {
  it('prettyChord speaks the a11y-help dialect on both platforms', () => {
    const b = { key: 'ctrl+k ctrl+e', mac: 'cmd+k cmd+e' };
    expect(prettyChord(b, true)).toBe('⌘+k ⌘+e');
    expect(prettyChord(b, false)).toBe('Ctrl+k Ctrl+e');
  });

  it('the real manifest teaches every family chord, demo included', () => {
    const labels = chordLabels(bindings, true);
    expect(labels.get('nika.runWorkflow')).toBe('⌘+k ⌘+e');
    expect(labels.get('nika.checkWorkflow')).toBe('⌘+k ⌘+k');
    expect(labels.get('nika.showDag')).toBe('⌘+k ⌘+g');
    expect(labels.get('nika.replayTrace')).toBe('⌘+k ⌘+p');
    expect(labels.get('nika.tryDemo')).toBe('⌘+k ⌘+h');
  });
});
