// lintBaseline.ts — the grandfathered-debt ratchet for workspace lint
// (pure · the core layer stays vitest-testable).
//
// Adopting nika on an existing workspace can surface hundreds of legacy
// findings at once; a wall of red trains people to ignore the Problems
// panel. The ratchet (the same policy the studio ships on its own
// checkers): a captured baseline records the KNOWN debt as per
// (file::code) COUNTS — counts are line-drift-robust where positions are
// not. Findings within the baseline demote to Information (visible ·
// quiet); anything BEYOND it keeps its true severity. Debt burns down
// by re-capturing after intentional cleanups — it can never silently grow.

/** Per (relPath::code) counts — the whole baseline file shape. */
export interface LintBaseline {
  /** ISO date of the capture — provenance, not behavior. */
  captured: string;
  counts: Record<string, number>;
}

export const BASELINE_REL_PATH = '.nika/lint-baseline.json';

export function baselineKey(relPath: string, code: string): string {
  return `${relPath}::${code}`;
}

export function parseBaseline(raw: string): LintBaseline | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) { return undefined; }
    const counts = (parsed as { counts?: unknown }).counts;
    if (typeof counts !== 'object' || counts === null) { return undefined; }
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(counts as Record<string, unknown>)) {
      if (typeof v === 'number' && v > 0) { clean[k] = Math.floor(v); }
    }
    return { captured: String((parsed as { captured?: unknown }).captured ?? ''), counts: clean };
  } catch {
    return undefined;
  }
}

/**
 * Split one file's finding codes into grandfathered/fresh. Callers pass
 * codes in DOCUMENT ORDER — the first `baseline[key]` occurrences of a
 * code are the old debt (stable · deterministic), the surplus is new.
 * Returns a parallel array: true = grandfathered (demote), false = fresh.
 */
export function grandfatherMask(
  relPath: string,
  codes: readonly string[],
  baseline: LintBaseline | undefined,
): boolean[] {
  if (!baseline) { return codes.map(() => false); }
  const budget = new Map<string, number>();
  return codes.map((code) => {
    const key = baselineKey(relPath, code);
    const used = budget.get(key) ?? 0;
    const allowed = baseline.counts[key] ?? 0;
    if (used < allowed) {
      budget.set(key, used + 1);
      return true;
    }
    return false;
  });
}

/** Fold the CURRENT findings into a fresh baseline (the capture verb). */
export function captureBaseline(
  perFile: ReadonlyMap<string, readonly string[]>,
  isoDate: string,
): LintBaseline {
  const counts: Record<string, number> = {};
  for (const [relPath, codes] of perFile) {
    for (const code of codes) {
      const key = baselineKey(relPath, code);
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  return { captured: isoDate, counts: sorted };
}
