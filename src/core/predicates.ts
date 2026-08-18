// predicates.ts — the `after:` outcome-class spellings, ONE module.
//
// The ontology (spec 03 · gate algebra v2): a control edge admits on
// its predicate's pass-set. The SPELLINGS are a closed set the doors
// write and the chips read — and this table was the R5 FLIP POINT
// (D-V10): spec #118 renamed `succeeded → success` · `failed → failure`
// while every RELEASED engine still spoke the old forms, so the table
// held them deliberately. v0.106.0 shipped the lane on 2026-07-27 and
// the brew binary refuses the old spellings (NIKA-DAG-005) — the flip
// this module was built for, exercised exactly as designed: one line,
// every consumer follows, zero hunt.
//
// nika 0.109 (the nine-key envelope) added `unwind`: not a settle-state
// comparison but the E_f ATTACHMENT (spec 03 §unwind) — the task that
// declares `after: { x: unwind }` is a cleanup unit (`kind: "finally"`
// in graph_format 3), never scheduled, run once `x` has STARTED and
// settles (success · failure · timeout · cancel). It replaced the
// `on_finally:` block (dead · NIKA-PARSE-005): one grammar for a task.

/** The closed predicate set — the CURRENT engine dialect (nika 0.109). */
export const AFTER_PREDICATES = ['success', 'failure', 'skipped', 'terminal', 'unwind'] as const;

export type AfterPredicate = (typeof AFTER_PREDICATES)[number];

/** The strict default the doors write for a fresh entry. */
export const DEFAULT_PREDICATE: AfterPredicate = 'success';

export function isAfterPredicate(value: string): value is AfterPredicate {
  return (AFTER_PREDICATES as readonly string[]).includes(value);
}

/** The pass-set each predicate admits (gate algebra v2, verbatim) —
 *  the hover pedagogy and the future admission lens read this, never
 *  a re-derivation. */
export const PREDICATE_ADMITS: Record<AfterPredicate, readonly string[]> = {
  success: ['success'],
  failure: ['failure'],
  skipped: ['skipped'],
  terminal: ['success', 'failure', 'skipped', 'cancelled'],
  // unwind fires for a producer that STARTED, whatever it settled to
  // (timeout is a failure · cancel included) — a producer that never
  // ran (gate refused · skipped) unwinds nothing (spec 03 §unwind).
  unwind: ['success', 'failure', 'cancelled'],
};

/** The attachment predicate — the one `after:` spelling that does NOT
 *  order in G_p: it makes the declaring task a cleanup unit. */
export const UNWIND_PREDICATE: AfterPredicate = 'unwind';
