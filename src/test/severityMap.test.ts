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
