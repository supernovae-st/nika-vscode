// severityMap.ts — per-code diagnostic severity remapping (pure).
//
// The `nika.diagnostics.severity` setting maps finding codes to a severity
// name, Ruff/ESLint-style: exact codes win over globs, `off` hides the
// finding entirely. Codes: engine `NIKA-DAG-003` families and the client
// lints (`nika.literal-secret` · `nika.redundant-dep` · `nika.unused-schema`).

export type SeverityName = 'error' | 'warning' | 'info' | 'hint' | 'off';

const SEVERITY_NAMES: ReadonlySet<string> = new Set(['error', 'warning', 'info', 'hint', 'off']);

/** Glob → anchored regex (`*` is the only wildcard — code sets are flat). */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.*+?^${}()|[\]\\]/g, (ch) => (ch === '*' ? '.*' : `\\${ch}`));
  return new RegExp(`^${escaped}$`);
}

/**
 * Resolve the configured override for a finding code.
 *
 * Precedence: exact key > glob key (first declared glob wins — object key
 * order is the author's order). Unknown severity names are ignored rather
 * than swallowed into a surprise default.
 */
export function severityOverrideFor(
  code: string,
  map: Readonly<Record<string, string>> | undefined,
): SeverityName | undefined {
  if (!map) { return undefined; }
  const exact = map[code];
  if (exact !== undefined && SEVERITY_NAMES.has(exact)) {
    return exact as SeverityName;
  }
  for (const [key, value] of Object.entries(map)) {
    if (!key.includes('*') || !SEVERITY_NAMES.has(value)) { continue; }
    if (globToRegExp(key).test(code)) {
      return value as SeverityName;
    }
  }
  return undefined;
}
