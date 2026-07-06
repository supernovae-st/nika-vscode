import { describe, expect, it } from 'vitest';
import { severityOverrideFor } from '../core/severityMap';

describe('severityOverrideFor', () => {
  it('returns undefined with no map or no match', () => {
    expect(severityOverrideFor('NIKA-DAG-003', undefined)).toBeUndefined();
    expect(severityOverrideFor('NIKA-DAG-003', {})).toBeUndefined();
    expect(severityOverrideFor('NIKA-DAG-003', { 'NIKA-VAR-001': 'hint' })).toBeUndefined();
  });

  it('exact code match wins', () => {
    expect(severityOverrideFor('NIKA-DAG-003', { 'NIKA-DAG-003': 'error' })).toBe('error');
    expect(severityOverrideFor('nika.literal-secret', { 'nika.literal-secret': 'off' })).toBe('off');
  });

  it('glob match covers a family', () => {
    const map = { 'NIKA-SEC-*': 'error', 'NIKA-*': 'hint' };
    expect(severityOverrideFor('NIKA-SEC-001', map)).toBe('error');
    // First declared glob that matches wins.
    expect(severityOverrideFor('NIKA-DAG-003', map)).toBe('hint');
  });

  it('exact beats glob regardless of declaration order', () => {
    const map = { 'NIKA-*': 'hint', 'NIKA-DAG-003': 'error' };
    expect(severityOverrideFor('NIKA-DAG-003', map)).toBe('error');
  });

  it('glob metacharacters in codes stay literal', () => {
    // A `.` in client codes must not act as a regex wildcard.
    expect(severityOverrideFor('nikaXliteral-secret', { 'nika.literal-secret': 'off' })).toBeUndefined();
    expect(severityOverrideFor('nika.literal-secret', { 'nika.*': 'hint' })).toBe('hint');
  });

  it('unknown severity names are ignored', () => {
    expect(severityOverrideFor('NIKA-DAG-003', { 'NIKA-DAG-003': 'fatal' })).toBeUndefined();
    expect(severityOverrideFor('NIKA-DAG-003', { 'NIKA-*': 'loud', 'NIKA-DAG-*': 'warning' })).toBe('warning');
  });
});

// ─── pauseAnswer decisions (0.97.2 · the seam that bit twice) ────────────────
import { answerControlFor, encodeAnswer } from '../core/pauseAnswer';

describe('answerControlFor', () => {
  it('routes the three known modes', () => {
    expect(answerControlFor('confirm', 0)).toBe('confirm');
    expect(answerControlFor('choice', 3)).toBe('choice');
    expect(answerControlFor('input', 0)).toBe('input');
  });

  it('degrades choice-without-options and unknown modes to the INPUT BOX — never the boolean picker', () => {
    expect(answerControlFor('choice', 0)).toBe('input');
    expect(answerControlFor('multiselect', 2)).toBe('input');
  });
});

describe('encodeAnswer', () => {
  it('JSON-encodes input/choice (text stays text · numeric choices survive) and keeps confirm bare', () => {
    expect(encodeAnswer('input', '123')).toBe('"123"');
    expect(encodeAnswer('choice', '1')).toBe('"1"');
    expect(encodeAnswer('confirm', 'true')).toBe('true');
  });
});
