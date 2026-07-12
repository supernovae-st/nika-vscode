// lensVocab.ts — one voice for the editor's lens doors.
//
// A lens title is a call, not a caption: « choose your model », never a
// bare « model » (the operator pass 2026-07-13 — a naked noun tells the
// author nothing about what the click writes). Every language-line door
// takes its words from HERE so the vocabulary cannot fork per surface —
// the same one-voice law the engine holds at its display band. Codicon
// prefixes ride along: the title IS the door, glyph and words together.

/** `model:` — the catalog picker (local-first). */
export const MODEL_DOOR = '$(arrow-swap) choose your model';

/**
 * A bare verb key — starters for the three authored bodies, the
 * tool register for `invoke` (its body IS the tool choice).
 */
export function verbDoorTitle(verb: string, glyph: string): string {
  return `${glyph} ${verb === 'invoke' ? 'choose your tool' : 'choose a starter'}`;
}

/** `- id:` — run THIS task and its upstream cone only. */
export const RERUN_DOOR = '$(debug-restart) re-run';

/** `- id:` — focus the task in the DAG; the refs tail keeps ⇧F12 honest. */
export function graphDoorTitle(refCount: number): string {
  const tail = refCount > 0 ? ` · ${refCount} ref${refCount === 1 ? '' : 's'}` : '';
  return `$(target) see it in the graph${tail}`;
}

/** `tasks:` — the growth door; the palette's vocabulary from the editor. */
export const ADD_TASK_DOOR = '$(add) add a task';

/** Status row, boundary undeclared — the one-gesture default-deny. */
export const DECLARE_BOUNDARY_DOOR = '$(shield) declare the boundary';

/** An existing `permits:` block — recompute the tightest boundary. */
export const TIGHTEN_BOUNDARY_DOOR = '$(shield) tighten the boundary';

/** Status row, required vars — the ready-to-paste run line. */
export function varsDoorTitle(count: number): string {
  return count === 1
    ? '$(symbol-variable) 1 var rides --var'
    : `$(symbol-variable) ${count} vars ride --var`;
}

/** An `infer:`/`agent:` with no `schema:` — the typed-unit move. */
export const TYPE_OUTPUT_DOOR = '$(symbol-structure) type its output';

/** `outputs:` (and the dead-spend status CTA) — the workflow's return. */
export const PUBLISH_DOOR = '$(export) choose what it publishes';

/** `vars:` — grow the input half of the callable contract. */
export const DECLARE_INPUT_DOOR = '$(symbol-parameter) declare an input';

/** `vars:` with untyped rows — promote them to the callable form. */
export function makeCallableDoorTitle(untypedCount: number): string {
  return `$(plug) make it callable · ${untypedCount} untyped`;
}

/** `depends_on:` — re-pick what this task waits for (cycle-safe). */
export const WIRE_INPUTS_DOOR = '$(link) wire its inputs';

/** `when:` — swap the CEL gate (⌁ is the when-inlay's own glyph). */
export const GATE_DOOR = '⌁ choose a gate';

/** `for_each:` — swap the collection the task maps over. */
export const COLLECTION_DOOR = '$(symbol-array) choose the collection';
