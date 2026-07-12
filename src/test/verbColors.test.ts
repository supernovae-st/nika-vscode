import { describe, expect, it } from 'vitest';
import { mergeVerbBand, verbBandApplied, verbBandRules, VERB_SCOPE } from '../core/verbColors';
import { NIKA_VERB_HEX } from '../design-tokens.generated';

describe('the verb band settings merge', () => {
  it('carries the four canonical hues from the design SSOT', () => {
    const rules = verbBandRules();
    expect(rules).toHaveLength(4);
    for (const rule of rules) {
      const verb = (Object.keys(VERB_SCOPE) as (keyof typeof VERB_SCOPE)[]).find(
        (v) => VERB_SCOPE[v] === rule.scope,
      );
      expect(verb, rule.scope).toBeDefined();
      expect(rule.settings.foreground).toBe(NIKA_VERB_HEX[verb as keyof typeof NIKA_VERB_HEX]);
    }
  });

  it('preserves foreign rules and keys, replaces stale nika rules in place', () => {
    const existing = {
      comments: 'keep-me',
      textMateRules: [
        { scope: 'comment.line', settings: { foreground: '#123456' } },
        { scope: VERB_SCOPE.infer, settings: { foreground: '#000000' } },
      ],
    };
    const merged = mergeVerbBand(existing);
    expect(merged.comments).toBe('keep-me');
    const scopes = (merged.textMateRules ?? []).map((r) => r.scope);
    expect(scopes).toContain('comment.line');
    expect(scopes.filter((s) => s === VERB_SCOPE.infer)).toHaveLength(1);
    const infer = (merged.textMateRules ?? []).find((r) => r.scope === VERB_SCOPE.infer);
    expect(infer?.settings.foreground).toBe(NIKA_VERB_HEX.infer);
  });

  it('answers applied only when all four hues are canonical', () => {
    expect(verbBandApplied(undefined)).toBe(false);
    expect(verbBandApplied({})).toBe(false);
    expect(verbBandApplied(mergeVerbBand({}))).toBe(true);
    const drifted = mergeVerbBand({});
    (drifted.textMateRules ?? [])[3]!.settings.foreground = '#ffffff';
    expect(verbBandApplied(drifted)).toBe(false);
  });

  it('the grammar file carries exactly the four scopes it targets', async () => {
    const fs = await import('fs');
    const grammar = fs.readFileSync('syntaxes/nika.tmLanguage.json', 'utf8');
    for (const scope of Object.values(VERB_SCOPE)) {
      expect(grammar).toContain(scope);
    }
  });
});
