import type { CliResult } from './spawn';

/** Recorded facts are not a proof of their origin, integrity or lifecycle. */
export const TRACE_INTEGRITY_NOTICE =
  'Integrity not verified by this view. Verify Journal asks the engine for the current chain, seal and anchor verdicts; recorded completion alone is not proof.';

/** Admit the machine envelope, preserving every engine-owned proof field.
 * This adapter checks format and request/exit binding, never recomputes tiers. */
export function traceVerificationDocument(result: CliResult, trace: string): string | undefined {
  if (result.err) { return undefined; }
  let value: unknown;
  try { value = JSON.parse(result.stdout); } catch { return undefined; }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) { return undefined; }
  const doc = value as Record<string, unknown>;
  if (doc.verify_version !== 1 || doc.trace !== trace
    || !Number.isInteger(doc.exit) || (doc.exit as number) < 0 || (doc.exit as number) > 255
    || doc.exit !== result.code || typeof doc.tier !== 'string' || doc.tier.length === 0
    || !Array.isArray(doc.lines) || !doc.lines.every((line) => typeof line === 'string')) {
    return undefined;
  }
  return JSON.stringify(doc, null, 2) + '\n';
}
