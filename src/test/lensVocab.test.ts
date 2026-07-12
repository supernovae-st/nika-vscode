import { describe, expect, it } from 'vitest';
import {
  ADD_TASK_DOOR, COLLECTION_DOOR, DECLARE_BOUNDARY_DOOR, DECLARE_INPUT_DOOR,
  GATE_DOOR, graphDoorTitle, makeCallableDoorTitle, MODEL_DOOR, PUBLISH_DOOR,
  RERUN_DOOR, TIGHTEN_BOUNDARY_DOOR, TYPE_OUTPUT_DOOR, varsDoorTitle,
  verbDoorTitle, WIRE_INPUTS_DOOR,
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

  it('the contract doors speak the same voice', () => {
    expect(TYPE_OUTPUT_DOOR).toBe('$(symbol-structure) type its output');
    expect(PUBLISH_DOOR).toBe('$(export) choose what it publishes');
    expect(DECLARE_INPUT_DOOR).toBe('$(symbol-parameter) declare an input');
    expect(makeCallableDoorTitle(2)).toBe('$(plug) make it callable · 2 untyped');
  });

  it('the flow doors speak the same voice — the gate wears the when-glyph', () => {
    expect(WIRE_INPUTS_DOOR).toBe('$(link) wire its inputs');
    expect(GATE_DOOR).toBe('⌁ choose a gate');
    expect(COLLECTION_DOOR).toBe('$(symbol-array) choose the collection');
  });

  it('every door is a lowercase call, codicon aside', () => {
    const doors = [
      MODEL_DOOR, RERUN_DOOR, ADD_TASK_DOOR, DECLARE_BOUNDARY_DOOR,
      TIGHTEN_BOUNDARY_DOOR, graphDoorTitle(2), varsDoorTitle(2),
      TYPE_OUTPUT_DOOR, PUBLISH_DOOR, DECLARE_INPUT_DOOR, makeCallableDoorTitle(1),
      WIRE_INPUTS_DOOR, GATE_DOOR, COLLECTION_DOOR,
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
