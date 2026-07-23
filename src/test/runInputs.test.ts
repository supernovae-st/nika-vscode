// runInputs.test.ts — the run-with-inputs argv contract.
import { describe, expect, it } from 'vitest';
import { budgetError, extraArgsFor } from '../core/runInputs';

describe('extraArgsFor', () => {
  it('answers become --var pairs in declaration order', () => {
    const m = new Map([['url', 'https://a.dev'], ['topic', 'release notes']]);
    expect(extraArgsFor(m)).toEqual(['--var', 'url=https://a.dev', '--var', 'topic=release notes']);
  });

  it('a ceiling appends --max-cost-usd · empty stays unbounded', () => {
    expect(extraArgsFor(new Map(), '0.50')).toEqual(['--max-cost-usd', '0.50']);
    expect(extraArgsFor(new Map(), '  ')).toEqual([]);
    expect(extraArgsFor(new Map())).toEqual([]);
  });

  it('values ride argv verbatim — spaces and = survive unquoted', () => {
    const m = new Map([['q', 'a=b c']]);
    expect(extraArgsFor(m)).toEqual(['--var', 'q=a=b c']);
  });
});

describe('budgetError', () => {
  it('empty is unbounded — no error', () => {
    expect(budgetError('')).toBeUndefined();
    expect(budgetError('   ')).toBeUndefined();
  });

  it('a positive amount passes', () => {
    expect(budgetError('0.5')).toBeUndefined();
    expect(budgetError('2')).toBeUndefined();
  });

  it('junk and non-positive name the problem', () => {
    expect(budgetError('abc')).toMatch(/dollar amount/);
    expect(budgetError('0')).toMatch(/positive/);
    expect(budgetError('-1')).toMatch(/positive/);
  });
});
