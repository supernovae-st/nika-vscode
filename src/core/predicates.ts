// predicates.ts — the `after:` outcome-class spellings, ONE module.
//
// The ontology (spec 03 · gate algebra v2): a control edge admits on
// its predicate's pass-set. The SPELLINGS are a closed set the doors
// write and the chips read — and they are the R5 FLIP POINT (D-V10):
// spec #118 renames `succeeded → success` · `failed → failure`; every
// engine shipping tonight still speaks the old spellings, so the
// extension does too. When the engine's lane lands, THIS table flips
// and every consumer follows — one line, zero hunt.

/** The closed predicate set — the CURRENT engine dialect. */
export const AFTER_PREDICATES = ['succeeded', 'failed', 'skipped', 'terminal'] as const;

export type AfterPredicate = (typeof AFTER_PREDICATES)[number];

/** The strict default the doors write for a fresh entry. */
export const DEFAULT_PREDICATE: AfterPredicate = 'succeeded';

export function isAfterPredicate(value: string): value is AfterPredicate {
  return (AFTER_PREDICATES as readonly string[]).includes(value);
}

/** The pass-set each predicate admits (gate algebra v2, verbatim) —
 *  the hover pedagogy and the future admission lens read this, never
 *  a re-derivation. */
export const PREDICATE_ADMITS: Record<AfterPredicate, readonly string[]> = {
  succeeded: ['success'],
  failed: ['failure'],
  skipped: ['skipped'],
  terminal: ['success', 'failure', 'skipped', 'cancelled'],
};
