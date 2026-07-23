// runInputs.ts — the run-with-inputs contract (pure).
//
// The check report's `requirements.vars_required` IS the input contract
// (the engine derives it; the extension never re-guesses). Answers plus
// an optional spend ceiling become the exact extra argv `run` takes —
// argv arrays, never a shell string, so values need no quoting.

/** Answers → `--var k=v` pairs (declaration order preserved), plus the
 *  ceiling when one was given. */
export function extraArgsFor(
  answers: ReadonlyMap<string, string>,
  budgetUsd?: string,
): string[] {
  const args: string[] = [];
  for (const [k, v] of answers) {
    args.push('--var', `${k}=${v}`);
  }
  const b = (budgetUsd ?? '').trim();
  if (b) { args.push('--max-cost-usd', b); }
  return args;
}

/** Input-box validator for the ceiling: empty = unbounded (fine); a
 *  positive dollar amount passes; anything else names the problem. */
export function budgetError(raw: string): string | undefined {
  const s = raw.trim();
  if (s === '') { return undefined; }
  const n = Number(s);
  if (!Number.isFinite(n)) { return 'A dollar amount (e.g. 0.50) — or empty for unbounded'; }
  if (n <= 0) { return 'The ceiling must be positive — empty means unbounded'; }
  return undefined;
}
