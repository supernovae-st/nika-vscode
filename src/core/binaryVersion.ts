// binaryVersion.ts — the post-download receipt: does the binary on disk
// report the version we just resolved?
//
// SHA256SUMS proves the download; this proves the INSTALL. A wrong binary in
// storage (a truncated extraction that still launches, a stale asset served
// under a new tag) must be refused, not shipped. Pure functions with no
// module-level state — the only side effect is the `--version` probe itself.

import { execFile } from 'child_process';

/** Semver core + an optional prerelease/build tail: the version is the
 *  binary's identity, the tail is part of it (1.2.3 ≠ 1.2.3-rc.1). */
const VERSION_PATTERN = /([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)/;

/** Runs `binaryPath --version` and returns the version it reports, or null
 *  when the binary cannot run or its banner carries no semver. */
export function probeBinaryVersion(binaryPath: string, timeoutMs = 5000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(binaryPath, ['--version'], { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        resolve(null);
        return;
      }
      // Engines print their banner on stdout; a wrapper script may use
      // stderr — the version is legitimate on either.
      const m = VERSION_PATTERN.exec(`${stdout}\n${stderr}`);
      resolve(m ? m[1] : null);
    });
  });
}

/** null when the receipt holds; a refusal message when it does not. */
export function versionReceiptError(installed: string | null, expected: string): string | null {
  if (installed === null) {
    return `the installed binary did not report a version (expected ${expected}) · refusing an unverifiable install`;
  }
  if (installed !== expected) {
    return `version mismatch: downloaded ${expected} but the installed binary reports ${installed} · refusing the wrong binary`;
  }
  return null;
}
