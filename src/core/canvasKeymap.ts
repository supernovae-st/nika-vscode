// canvasKeymap.ts — the canvas gesture table, ONE source.
//
// Two surfaces read this list: the in-canvas explainer (`?` on the
// canvas) and the "Nika: Canvas Accessibility Help" command (the
// screen-reader-ready QuickPick, linked from the walkthrough). One
// array, zero drift between them. The editor-side chord family is a
// different table by design — it lives in contributes.keybindings and
// DESIGN.md §7b, and the help command derives it from package.json.

export const CANVAS_KEYMAP: ReadonlyArray<readonly [string, string]> = [
  ['Tab', 'next task'],
  ['↑↓', 'dep / dependent'],
  ['←→', 'prev / next'],
  ['⏎', 'open YAML'],
  ['R', 'run'],
  ['M', 'mock run'],
  ['S', 'stop'],
  ['F', 'fit'],
  ['A', 'auto-layout'],
  ['W', 'waves'],
  ['H', 'heatmap'],
  ['T', 'timeline'],
  ['P', 'audit'],
  ['D', 'dataflow'],
  ['G', 'follow run'],
  ['K', 'actions (focused) · command'],
  ['N', 'add a task'],
  ['/', 'filter'],
  ['⌘D', 'duplicate'],
  ['C', 'connect — wire a task after this one'],
  ['⌥←↑↓→', 'nudge the card (8px grid)'],
  ['X', 'what-if (simulate fail)'],
  ['Space', 'peek (pin the card story)'],
  ['⇧V', 'display properties (density)'],
  ['⌥F1', 'accessibility help'],
  ['Esc', 'clear'],
  ['?', 'this card'],
];
