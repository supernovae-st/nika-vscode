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
  | { kind: 'unreadable' }
  | { kind: 'empty' };

const GENESIS = 'nika-trace-v1';

function sha256Hex(bytes: string): string {
  return createHash('sha256').update(bytes, 'utf-8').digest('hex');
}

/** Walk the raw NDJSON and recompute the chain — the client twin of
 *  `nika trace verify`. */
export function verifyChain(raw: string): ChainVerdict {
  // Mirror Rust str::lines(): split on \n, strip ONE trailing \r per
  // segment — the engine verifies a CRLF-re-encoded journal INTACT, so
  // hashing the \r into the line manufactured a false BROKEN (the
  // re-encode-vs-edit class, journal side). Line numbers are FILE
  // lines (blanks counted, engine parity), events counted explicitly.
  const segments = raw.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  let expected = sha256Hex(GENESIS);
  let events = 0;
  let sawAny = false;
  for (let i = 0; i < segments.length; i++) {
    const line = segments[i];
    if (line.trim().length === 0) { continue; }
    sawAny = true;
    const isLast = segments.slice(i + 1).every((l) => l.trim().length === 0);
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // A FINAL line that is not valid JSON is a torn tail (crash
      // mid-write), not tampering — but ONLY behind a verified prefix:
      // a one-line garbage file is UNREADABLE, never a green (the
      // engine's exact hardening — torn requires verified > 0).
      if (isLast && events > 0) {
        return { kind: 'torn', events, head: expected };
      }
      return events > 0 ? { kind: 'broken', line: i + 1 } : { kind: 'unreadable' };
    }
    const recorded = (parsed as { chain?: unknown }).chain;
    if (typeof recorded !== 'string') {
      // The FIRST line decides the era; a chain that stops mid-file is
      // a break, not an era.
      if (events === 0) { return { kind: 'unchained' }; }
      return { kind: 'broken', line: i + 1 };
    }
    if (recorded !== expected) { return { kind: 'broken', line: i + 1 }; }
    expected = sha256Hex(line);
    events += 1;
  }
  if (!sawAny) { return { kind: 'empty' }; }
  return { kind: 'intact', events, head: expected };
}
