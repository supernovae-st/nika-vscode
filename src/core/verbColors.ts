// The verb band, in the EDITOR: the four verb keys carry their canonical
// hues (design SSOT · NIKA_VERB_HEX) via user-level
// `editor.tokenColorCustomizations` textMate rules. An extension cannot
// DEFAULT these (configurationDefaults excludes token customizations —
// docs/color-theme), so the write is a consented command: one click, the
// exact brand band in every theme, reversible in settings.
import { NIKA_VERB_HEX, type NikaVerbName } from '../design-tokens.generated';

/**
 * The grammar's per-verb capture scopes (syntaxes/nika.tmLanguage.json).
 * Each rides a WELL-KNOWN TextMate family so every theme colors the four
 * verbs DISTINCTLY out of the box (blue · orange · teal · purple ≈ the
 * brand band); the `.verb.<verb>.nika` tail is the exact-hex target this
 * command writes.
 */
export const VERB_SCOPE: Record<NikaVerbName, string> = {
  infer: 'constant.language.verb.infer.nika',
  exec: 'string.other.verb.exec.nika',
  invoke: 'support.type.verb.invoke.nika',
  agent: 'keyword.control.verb.agent.nika',
};

type TextMateRule = { scope: string; settings: { foreground?: string; fontStyle?: string } };
type TokenCustomizations = { textMateRules?: TextMateRule[] } & Record<string, unknown>;

/** The four rules this feature owns — keyed by their exact scopes. */
export function verbBandRules(): TextMateRule[] {
  return (Object.keys(VERB_SCOPE) as NikaVerbName[]).map((verb) => ({
    scope: VERB_SCOPE[verb],
    settings: { foreground: NIKA_VERB_HEX[verb], fontStyle: 'bold' },
  }));
}

/**
 * Merge the verb band into an existing `editor.tokenColorCustomizations`
 * value: rules for OUR scopes are replaced in place, every other rule and
 * key is preserved byte-for-byte. Pure — the caller owns the config write.
 */
export function mergeVerbBand(existing: unknown): TokenCustomizations {
  const base: TokenCustomizations =
    existing && typeof existing === 'object' ? { ...(existing as TokenCustomizations) } : {};
  const ours = new Set<string>(Object.values(VERB_SCOPE));
  const kept = (Array.isArray(base.textMateRules) ? base.textMateRules : []).filter(
    (r) => !(r && typeof r.scope === 'string' && ours.has(r.scope)),
  );
  base.textMateRules = [...kept, ...verbBandRules()];
  return base;
}

/** True when every verb rule is already present with the canonical hue. */
export function verbBandApplied(existing: unknown): boolean {
  const rules =
    existing && typeof existing === 'object'
      ? (existing as TokenCustomizations).textMateRules
      : undefined;
  if (!Array.isArray(rules)) {
    return false;
  }
  return (Object.keys(VERB_SCOPE) as NikaVerbName[]).every((verb) =>
    rules.some(
      (r) =>
        r &&
        r.scope === VERB_SCOPE[verb] &&
        r.settings?.foreground?.toLowerCase() === NIKA_VERB_HEX[verb].toLowerCase(),
    ),
  );
}
