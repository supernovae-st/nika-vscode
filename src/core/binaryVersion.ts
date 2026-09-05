// binaryVersion.ts — the post-download receipt: does the binary on disk
// report the version we just resolved?
//
// SHA256SUMS proves the download; this proves the INSTALL. A wrong binary in
// storage (a truncated extraction that still launches, a stale asset served
// under a new tag) must be refused, not shipped. Pure functions with no
// module-level state — the only side effect is the `--version` probe itself.

import { execFile } from 'child_process';

/** Candidate source floor. Publication still requires the release receipts. */
export const MINIMUM_ENGINE_VERSION = '0.118.2';

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function semver(version: string): RegExpExecArray | null {
  const match = VERSION_PATTERN.exec(version);
  if (match?.[4]?.split('.').some((part) => /^0\d+$/.test(part))) { return null; }
  return match;
}

/** Parse the whole current engine banner, never a semver substring. */
export function parseBinaryVersion(banner: string): string | null {
  const match = /^nika[ \t]+(\S+)(?:[ \t]+\([a-f0-9]+\))?$/.exec(banner.trim());
  return match && semver(match[1]) ? match[1] : null;
}

/** One patch-aware support policy shared by admission and the installer. */
export function engineSupportError(version: string | null): string | null {
  const update = `Update or select a stable Nika engine >= ${MINIMUM_ENGINE_VERSION}. Static editor features remain available.`;
  const parsed = version === null ? null : semver(version);
  if (!parsed) { return `The selected binary did not report a valid Nika version. ${update}`; }
  if (parsed[4]) { return `Nika ${version} is a prerelease and is not supported. ${update}`; }
  const actual = parsed.slice(1, 4).map(BigInt);
  const floor = MINIMUM_ENGINE_VERSION.split('.').map(BigInt);
  for (let i = 0; i < floor.length; i++) {
    if (actual[i] > floor[i]) { return null; }
    if (actual[i] < floor[i]) { return `Nika ${version} is below the supported engine minimum. ${update}`; }
  }
  return null;
}

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
      resolve(parseBinaryVersion(`${stdout}\n${stderr}`));
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
