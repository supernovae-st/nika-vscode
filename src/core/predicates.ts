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

/** The closed predicate set — the CURRENT engine dialect. */
export const AFTER_PREDICATES = ['success', 'failure', 'skipped', 'terminal'] as const;

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
};
