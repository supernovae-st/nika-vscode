// chainVerify.ts — client-side walk of the journal's tamper-evidence
// chain (engine 0.96+ · Proof Arc P1).
//
// Every chained line carries `chain` = sha256 hex of the PREVIOUS
// line's exact bytes (genesis: sha256 of "nika-trace-v1"). The walk
// mirrors `nika trace verify` — same verdicts, same torn-tail law
// (a crash mid-write is NOT tampering).
//
// Pure except node's crypto (no fs, no spawn) — the hasher is injected
// nowhere because sha256 is deterministic; tests drive raw strings.

import { createHash } from 'crypto';

export type ChainVerdict =
  | { kind: 'intact'; events: number; head: string }
  | { kind: 'torn'; events: number; head: string }
  | { kind: 'broken'; line: number }
  | { kind: 'unchained' }
  | { kind: 'empty' };

const GENESIS = 'nika-trace-v1';

function sha256Hex(bytes: string): string {
  return createHash('sha256').update(bytes, 'utf-8').digest('hex');
}

/** Walk the raw NDJSON and recompute the chain — the client twin of
 *  `nika trace verify`. */
export function verifyChain(raw: string): ChainVerdict {
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) { return { kind: 'empty' }; }

  let expected = sha256Hex(GENESIS);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // A FINAL line that is not valid JSON is a torn tail (crash
      // mid-write), not tampering — the chain covers the complete lines.
      if (i === lines.length - 1) {
        return { kind: 'torn', events: i, head: expected };
      }
      return { kind: 'broken', line: i + 1 };
    }
    const recorded = (parsed as { chain?: unknown }).chain;
    if (typeof recorded !== 'string') {
      // The FIRST line decides the era; a chain that stops mid-file is
      // a break, not an era.
      if (i === 0) { return { kind: 'unchained' }; }
      return { kind: 'broken', line: i + 1 };
    }
    if (recorded !== expected) { return { kind: 'broken', line: i + 1 }; }
    expected = sha256Hex(line);
  }
  return { kind: 'intact', events: lines.length, head: expected };
}
