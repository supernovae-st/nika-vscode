// Build the final old-ID source tree without mutating the canonical manifest.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const destination = resolve(process.argv[2] ?? '');
assert(process.argv[2], 'Pass an absent destination directory');
assert(!existsSync(destination), 'Destination must not exist');
const source = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.equal(source.name, 'nika');
assert.equal(source.publisher, 'supernovae');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
for (const relative of tracked) {
  const target = resolve(destination, relative);
  assert(target.startsWith(destination + '/'));
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(root, relative), target);
  if (/\.(ts|mjs|cjs|md|json)$/.test(relative) && !['CHANGELOG.md', 'scripts/prepare-legacy-release.mjs', 'scripts/check-canonical-listings.mjs', 'scripts/release-proof.test.mjs'].includes(relative)) {
    const text = readFileSync(target, 'utf8');
    writeFileSync(target, text.replace(/supernovae\.nika(?![\w-])/g, 'supernovae.nika-lang'));
  }
}
const manifestFile = resolve(destination, 'package.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
manifest.name = 'nika-lang';
assert.equal(manifest.version, source.version);
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
const lockFile = resolve(destination, 'package-lock.json');
const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
lock.name = 'nika-lang';
lock.packages[''].name = 'nika-lang';
writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
const banner = '# Nika has moved to supernovae.nika\n\n' +
  'This is the final update for the old identifier, supernovae.nika-lang. ' +
  'It retains the editor features and your existing settings, journals and extension storage.\n\n' +
  'For future updates, disable this old extension, then install ' +
  '[Nika on VS Marketplace](https://marketplace.visualstudio.com/items?itemName=supernovae.nika) or ' +
  '[Nika on Open VSX](https://open-vsx.org/extension/supernovae/nika). ' +
  'Reload the editor after switching. Keep only one identifier enabled to avoid duplicate commands and engine processes.\n\n' +
  'The new identifier has separate extension storage and may ask for engine-install consent again. ' +
  'Your workspace settings and engine-owned journals stay where they are. ' +
  'Old deep links continue to work while this legacy extension is enabled; new links use vscode://supernovae.nika/.\n\n';
const readmeFile = resolve(destination, 'README.md');
writeFileSync(readmeFile, banner + readFileSync(readmeFile, 'utf8'));
const changelogFile = resolve(destination, 'CHANGELOG.md');
writeFileSync(changelogFile, '# Legacy identifier final update · ' + source.version + '\n\n' +
  'This package remains supernovae.nika-lang. Its README points to the new supernovae.nika listing. ' +
  'Existing editor functionality is retained; installation of the new identifier is an explicit user action.\n\n' +
  readFileSync(changelogFile, 'utf8'));
// A redirect must not become a hollow package: compare every functional contribution.
assert.deepEqual(manifest.contributes, JSON.parse(JSON.stringify(source.contributes).replace(/supernovae\.nika(?![\w-])/g, 'supernovae.nika-lang')));
assert.equal(manifest.main, source.main);
assert.deepEqual(manifest.activationEvents, source.activationEvents);
assert.deepEqual(manifest.capabilities, source.capabilities);
console.log('Legacy source prepared: supernovae.nika-lang@' + source.version);
