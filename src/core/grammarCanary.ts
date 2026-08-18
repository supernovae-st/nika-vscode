// grammarCanary.ts — the generation-floor probe (D-V8, product side).
//
// This extension writes the nine-key envelope (0.109 · `nika: <name>` is
// the mark AND the identity · `tasks:` the discriminant). A shipped
// previous-generation engine (0.108 · `nika: v1` + `workflow: { id }`)
// refuses that mark at parse (NIKA-PARSE-003 · parse_fatal), and a
// next-generation engine refuses the OLD document the same way
// (NIKA-PARSE-005 · `workflow` unknown) — so the canary MUST be the
// document this extension writes, or the answer inverts (measured
// 2026-08-18: the 0.108 canary against a 0.109 engine read as « the
// engine is older », while every scaffold it wrote was refused). One
// tiny canary document + one verdict reader — shared by the runtime
// Station probe and the e2e floor gate (src/test/lspHarness.ts imports
// THIS constant), so « does this binary speak our grammar? » has
// exactly one definition.

/** The smallest nine-key document — the mark, a model, one task. */
export const GRAMMAR_CANARY_DOC = [
  'nika: canary',
  'model: mock/echo',
  'tasks:',
  '  probe:',
  '    infer:',
  '      prompt: "hi"',
  '',
].join('\n');

/** Read a `check --json` report: did the ENVELOPE parse? (Findings are
 *  fine — a parse_fatal refusal is the generation tell.) */
export function grammarAccepted(checkStdout: string): boolean | undefined {
  try {
    const report = JSON.parse(checkStdout) as { parse_fatal?: unknown };
    return report.parse_fatal !== true;
  } catch {
    return undefined;
  }
}
