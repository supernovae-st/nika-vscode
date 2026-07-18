// grammarCanary.ts — the generation-floor probe (D-V8, product side).
//
// This extension writes the refonte grammar (`workflow:` object ·
// `tasks:` map). A shipped pre-refonte engine rejects that shape at
// parse (NIKA-PARSE-019 · parse_fatal). One tiny canary document +
// one verdict reader — shared by the runtime Station probe and the
// e2e floor gate, so « does this binary speak our grammar? » has
// exactly one definition.

/** The smallest refonte document — map-form workflow, tasks map. */
export const GRAMMAR_CANARY_DOC = [
  'nika: v1',
  'workflow:',
  '  id: canary',
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
