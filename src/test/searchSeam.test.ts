// searchSeam.test.ts · the omnibar bridges to the gate (one launcher).
//
// PR-4's canvas seam, as source belts (the searchAsyncContract idiom):
// the omnibar's two fail paths each close on a door into `nika.search`,
// and the gate accepts the query those doors carry. Four pins:
//   1 · THE PLURAL — the did-you-mean QuickPick ends on the
//       open-root-search row, the mistyped token as the query, the
//       chord taught from the ONE derivation (chordLabels).
//   2 · THE PROSE — the generated draft's confirm offers the same
//       door, the whole intent as the query (the pipeline's only
//       existing choice — no invented screen).
//   3 · THE SEED — the gate's initialQuery is typeof-guarded (the
//       runHistory idiom) and lands pre-filled in the QuickPick.
//   4 · HOST-SIDE — the seam reuses `dag:omni`; the webview never
//       speaks the command (a new one-sided kind cannot sneak in).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const ext = readFileSync(join(SRC, 'extension.ts'), 'utf-8');
const gen = readFileSync(join(SRC, 'features', 'generate.ts'), 'utf-8');
const door = readFileSync(join(SRC, 'features', 'searchGate.ts'), 'utf-8');
const web = readFileSync(join(SRC, 'webview', 'dag.ts'), 'utf-8');
const panel = readFileSync(join(SRC, 'dagPanel.ts'), 'utf-8');

describe('pin 1 · the did-you-mean plural closes on the gate', () => {
  it('the row exists and speaks the mistyped token', () => {
    expect(ext).toContain('Open root search with "${near.token}"');
  });

  it('the row executes nika.search with the token as the query', () => {
    expect(ext).toContain("commands.executeCommand('nika.search', near.token)");
  });

  it('the chord comes from the one derivation, never re-derived', () => {
    expect(ext).toContain("menuChords.get('nika.search')");
  });
});

describe('pin 2 · the prose path surfaces the same door', () => {
  it('the draft confirm offers Open root search', () => {
    expect(gen).toContain("'Open root search',");
  });

  it('the door carries the whole intent as the query', () => {
    expect(gen).toContain("executeCommand('nika.search', baseIntent)");
  });
});

describe('pin 3 · the gate accepts the seed (typeof-guarded)', () => {
  it('the initial query is guarded, never trusted', () => {
    expect(door).toContain("typeof initialQuery === 'string' ? initialQuery : ''");
  });

  it('the seed lands pre-filled in the QuickPick value and first render', () => {
    expect(door).toContain("if (seed !== '') { qp.value = seed; }");
    expect(door).toContain('render(seed);');
  });
});

describe('pin 4 · the seam is host-side (the kind is reused)', () => {
  it('the webview never speaks nika.search — dag:omni already carries the text', () => {
    expect(web).not.toContain('nika.search');
    expect(web).toContain("kind: 'dag:omni'");
  });
});

describe('pin 5 · the empty Enter opens the gate (no dead end left)', () => {
  it('the webview posts the empty text instead of bailing silently', () => {
    expect(web).toContain("kind: 'dag:omni',\n      text: '',");
  });

  it('the host routes the void to the gate, never to generate', () => {
    expect(ext).toContain("if (request.text.trim() === '')");
    expect(ext).toContain("void commands.executeCommand('nika.search');");
  });

  it('the placeholder teaches the doorway in place', () => {
    expect(panel).toContain('↵ everything');
  });
});
