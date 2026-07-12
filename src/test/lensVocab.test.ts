import { describe, expect, it } from 'vitest';
import {
  ADD_TASK_DOOR, DECLARE_BOUNDARY_DOOR, graphDoorTitle, MODEL_DOOR,
  RERUN_DOOR, TIGHTEN_BOUNDARY_DOOR, varsDoorTitle, verbDoorTitle,
} from '../core/lensVocab';
import { VERB_ITEMS } from '../core/verbPalette';

describe('lensVocab (one voice for the lens doors)', () => {
  it('the model line invites the choice — never a bare noun', () => {
    expect(MODEL_DOOR).toBe('$(arrow-swap) choose your model');
  });

  it('every verb door leads with its glyph and a call', () => {
    for (const { verb, glyph } of VERB_ITEMS) {
      const title = verbDoorTitle(verb, glyph);
      expect(title.startsWith(`${glyph} `)).toBe(true);
      expect(title).toContain('choose');
    }
  });

  it('invoke offers the tool; the authored verbs offer a starter', () => {
    expect(verbDoorTitle('invoke', '◆')).toBe('◆ choose your tool');
    expect(verbDoorTitle('infer', '◇')).toBe('◇ choose a starter');
    expect(verbDoorTitle('exec', '▷')).toBe('▷ choose a starter');
    expect(verbDoorTitle('agent', '✦')).toBe('✦ choose a starter');
  });

  it('the graph door speaks — and its refs tail pluralizes honestly', () => {
    expect(graphDoorTitle(0)).toBe('$(target) see it in the graph');
    expect(graphDoorTitle(1)).toBe('$(target) see it in the graph · 1 ref');
    expect(graphDoorTitle(3)).toBe('$(target) see it in the graph · 3 refs');
  });

  it('the vars door conjugates with its count', () => {
    expect(varsDoorTitle(1)).toBe('$(symbol-variable) 1 var rides --var');
    expect(varsDoorTitle(2)).toBe('$(symbol-variable) 2 vars ride --var');
  });

  it('every door is a lowercase call, codicon aside', () => {
    const doors = [
      MODEL_DOOR, RERUN_DOOR, ADD_TASK_DOOR, DECLARE_BOUNDARY_DOOR,
      TIGHTEN_BOUNDARY_DOOR, graphDoorTitle(2), varsDoorTitle(2),
      ...VERB_ITEMS.map((v) => verbDoorTitle(v.verb, v.glyph)),
    ];
    for (const door of doors) {
      const words = door.replace(/\$\([a-z-]+\)\s*/, '');
      expect(words).toBe(words.toLowerCase());
      expect(words.length).toBeGreaterThan(0);
    }
  });

  it('the two boundary doors share the shield and the noun', () => {
    for (const door of [DECLARE_BOUNDARY_DOOR, TIGHTEN_BOUNDARY_DOOR]) {
      expect(door.startsWith('$(shield) ')).toBe(true);
      expect(door).toContain('the boundary');
    }
  });
});
