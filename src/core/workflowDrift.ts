// workflowDrift.ts — is the file on disk the definition this run recorded?
//
// In CONTENT terms, not byte terms: an editor re-encoding CRLF↔LF (or
// adding a BOM) cannot move a task line, and the raw byte-compare cried
// « definition drifted » on exactly that churn (the 0.96.0 engine
// review's finding — engine #247 is the server-side twin of this rule).
// Raw match first; then LF normal forms — against the recorded raw
// (LF-recorded file later saved as CRLF) and against the recorded
// `workflow_sha256_lf` sibling when the journal carries one
// (CRLF-recorded file later saved as LF). Only a content change
// survives all three compares.

import { createHash } from 'crypto';

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** LF normal form: UTF-8 BOM stripped, CRLF → LF — byte-faithful via
 *  latin1 (a 1:1 byte↔char encoding; a lone \r stays content, mirroring
 *  the engine: no editor produces old-Mac endings today). */
export function lfNormalForm(bytes: Buffer): Buffer {
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = bom ? bytes.subarray(3) : bytes;
  return Buffer.from(body.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
}

/** The four-quadrant drift verdict. `recordedLf` is the journal's
 *  `workflow_sha256_lf` when present (0.97+ engines · CRLF/BOM sources). */
export function workflowDrifted(current: Buffer, recordedRaw: string, recordedLf?: string): boolean {
  if (sha256(current) === recordedRaw) { return false; }
  const lfSha = sha256(lfNormalForm(current));
  return lfSha !== recordedRaw && lfSha !== recordedLf;
}
