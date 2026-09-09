/** Presentation of recorded counts, never a forecast or execution verdict. */
export function agentBudgetReadout(used: number, budget: number | undefined): {
  text: string;
  title: string;
  fraction?: number;
} {
  if (!Number.isSafeInteger(used) || used < 0) {
    return { text: '? tk', title: 'Token usage unavailable; no ratio can be shown' };
  }
  const text = `${used} tk`;
  if (budget === undefined) { return { text, title: `${used} tokens used; no declared budget` }; }
  if (budget === 0) { return { text, title: `${used} tokens used; declared budget is zero, so no ratio can be shown` }; }
  if (!Number.isSafeInteger(budget) || budget < 0) {
    return { text, title: `${used} tokens used; declared budget is unavailable` };
  }
  return { text, title: `${used} of ${budget} tokens used`, fraction: Math.min(1, used / budget) };
}

/** Light the loop band only for a newly observed, increasing turn count. */
export function agentTurnAdvanced(before: number | undefined, after: number | undefined): boolean {
  return before !== undefined && after !== undefined
    && Number.isSafeInteger(before) && before >= 0
    && Number.isSafeInteger(after) && after > before;
}
