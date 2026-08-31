// release-coherence.mjs - the source release is one atomic claim.
//
// Public registries can lag while an operator completes the release ceremony,
// but the repository itself must never describe several engine lines at once.
// This offline ratchet runs in `npm test` and checks every source-owned pin.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(resolve(root, name), 'utf8');
const json = (name) => JSON.parse(read(name));

const manifest = json('package.json');
const lock = json('package-lock.json');
const enginePinText = read('ENGINE_PIN');
const enginePin = enginePinText.split('\n')
  .map((line) => line.trim())
  .find((line) => line !== '' && !line.startsWith('#'));
const candidateVersion = enginePinText.match(/^# CANDIDATE_VERSION: (\d+\.\d+\.\d+)$/m)?.[1];
const specPin = read('SPEC_PIN').split('\n')
  .map((line) => line.trim())
  .find((line) => line !== '' && !line.startsWith('#'));
const changelog = read('CHANGELOG.md');
const version = manifest.version;

const failures = [];
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  failures.push(`package.json version is not stable semver: ${String(version)}`);
}
if (lock.version !== version) {
  failures.push(`package-lock.json version ${String(lock.version)} != manifest ${version}`);
}
if (lock.packages?.['']?.version !== version) {
  failures.push(`package-lock root version ${String(lock.packages?.['']?.version)} != manifest ${version}`);
}
const releaseTagPin = enginePin === `v${version}`;
const candidateCommitPin = /^[0-9a-f]{40}$/.test(enginePin ?? '') && candidateVersion === version;
if (!releaseTagPin && !candidateCommitPin) {
  failures.push(
    `ENGINE_PIN ${String(enginePin)} is neither v${version} nor an exact commit marked CANDIDATE_VERSION ${version}`,
  );
}
if (releaseTagPin && candidateVersion !== undefined) {
  failures.push('ENGINE_PIN release tag still carries a candidate marker');
}
if (!/^[0-9a-f]{40}$/.test(specPin ?? '')) {
  failures.push(`SPEC_PIN is not an exact 40-character commit: ${String(specPin)}`);
}
if (!changelog.includes(`## [${version}]`)) {
  failures.push(`CHANGELOG.md has no [${version}] release heading`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`release-coherence: ${failure}`);
  process.exit(1);
}

console.log(`release-coherence: OK - source ${version} / engine ${enginePin} / spec ${specPin.slice(0, 7)}`);
