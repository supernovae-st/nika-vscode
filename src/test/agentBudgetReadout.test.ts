import { describe, expect, it } from 'vitest';
import { agentBudgetReadout, agentTurnAdvanced } from '../webview/agentBudgetReadout';

describe('agent token meter is a recorded ratio, not predicted progress', () => {
  it('renders zero and positive usage against a positive declared budget', () => {
    expect(agentBudgetReadout(0, 100).fraction).toBe(0);
    expect(agentBudgetReadout(25, 100).fraction).toBe(0.25);
  });
  it('clips paint at the limit but preserves actual over-budget usage in the accessible text', () => {
    expect(agentBudgetReadout(125, 100)).toMatchObject({ fraction: 1, title: '125 of 100 tokens used' });
  });
  it.each([undefined, 0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('does not invent a ratio for budget %s', (budget) => {
    const value = agentBudgetReadout(5, budget);
    expect(value.fraction).toBeUndefined();
    expect(value.text).toBe('5 tk');
  });
  it.each([-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])('does not display an invalid token count as measured usage: %s', (used) => {
    expect(agentBudgetReadout(used, 100)).toEqual({ text: '? tk', title: 'Token usage unavailable; no ratio can be shown' });
  });
  it('distinguishes a declared zero budget from an absent budget', () => {
    expect(agentBudgetReadout(0, 0).title).toContain('declared budget is zero');
    expect(agentBudgetReadout(0, undefined).title).toContain('no declared budget');
  });
});

describe('agent turn effects follow recorded increases only', () => {
  it('lights a new observed turn', () => { expect(agentTurnAdvanced(1, 2)).toBe(true); });
  it.each([[undefined, 1], [2, 2], [2, 1], [-1, 2], [0, NaN], [1.5, 2], [1, undefined]])('stays quiet for %s → %s', (before, after) => {
    expect(agentTurnAdvanced(before, after)).toBe(false);
  });
});
