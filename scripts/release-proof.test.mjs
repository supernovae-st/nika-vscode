import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  assertVersionReceipt,
  checksumForAsset,
  installPinnedEngine,
  readPinnedRelease,
  releaseAsset,
} from './pinned-engine.mjs';

const root = resolve(import.meta.dirname, '..');

test('the integration launcher cannot fall back to Homebrew or PATH', () => {
  const launcher = readFileSync(resolve(root, 'src/test-integration/runFirstContact.ts'), 'utf8');
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  assert.doesNotMatch(launcher, /Cellar|homebrew\/bin|usr\/local\/bin|no released engine|skipped/);
  assert.match(launcher, /process\.env\.NIKA_BIN/);
  assert.match(packageJson.scripts['test:integration'], /scripts\/run-integration\.mjs/);
});

test('the release ceremony fails closed and gates before packaging', () => {
  const workflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8');
  assert.match(workflow, /\[ -n "\$OVSX_PAT" \].*exit 1/);
  assert.match(workflow, /\[ -n "\$VSCE_PAT" \].*exit 1/);
  assert.doesNotMatch(workflow, /HAS_OVSX|HAS_VSCE|if: env\.HAS_/);
  assert.ok(workflow.indexOf('npm audit --audit-level=low') < workflow.indexOf('npm run test:integration'));
  assert.ok(workflow.indexOf('npm run test:integration') < workflow.indexOf('npx vsce package'));
  for (const action of workflow.matchAll(/uses:\s+([^\s#]+)/g)) {
    assert.match(action[1], /@[0-9a-f]{40}$/, `action is not SHA-pinned: ${action[1]}`);
  }
});

test('ENGINE_PIN must name an exact public stable release', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nika-pin-test-'));
  try {
    writeFileSync(join(dir, 'ENGINE_PIN'), '# comment\nv0.116.2\n');
    assert.deepEqual(readPinnedRelease(dir), { tag: 'v0.116.2', version: '0.116.2' });
    writeFileSync(join(dir, 'ENGINE_PIN'), `${'a'.repeat(40)}\n`);
    assert.throws(() => readPinnedRelease(dir), /public stable release tag/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('platform mapping names only real release assets', () => {
  assert.equal(releaseAsset('darwin', 'arm64', '0.116.2'), 'nika-macos-arm64-0.116.2.tar.gz');
  assert.equal(releaseAsset('linux', 'x64', '0.116.2'), 'nika-linux-x64-0.116.2.tar.gz');
  assert.throws(() => releaseAsset('win32', 'x64', '0.116.2'), /no public asset/);
});

test('checksum selection is exact and unique', () => {
  const asset = 'nika-linux-x64-0.116.2.tar.gz';
  const hash = 'ab'.repeat(32);
  assert.equal(checksumForAsset(`${hash}  ${asset}\n`, asset), hash);
  assert.throws(() => checksumForAsset('', asset), /found 0/);
  assert.throws(() => checksumForAsset(`${hash}  ${asset}\n${hash} *${asset}\n`, asset), /found 2/);
});

test('version receipt refuses a stale binary', () => {
  assert.doesNotThrow(() => assertVersionReceipt('nika 0.116.2 (c4cdbeafb)\n', '0.116.2'));
  assert.throws(() => assertVersionReceipt('nika 0.116.0 (old)\n', '0.116.2'), /version mismatch/);
});

test('a corrupt public archive is refused before extraction', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nika-pin-download-test-'));
  let extractionCalls = 0;
  try {
    writeFileSync(join(dir, 'ENGINE_PIN'), 'v0.116.2\n');
    const asset = releaseAsset(process.platform, process.arch, '0.116.2');
    const archive = Buffer.from('not the published bytes');
    const wrongHash = createHash('sha256').update('different').digest('hex');
    const fetchImpl = async (url) => {
      const body = Buffer.from(url.endsWith('SHA256SUMS') ? `${wrongHash}  ${asset}\n` : archive);
      return {
        ok: true,
        status: 200,
        url,
        arrayBuffer: async () => body,
      };
    };
    await assert.rejects(
      installPinnedEngine({
        rootDir: dir,
        fetchImpl,
        tempRoot: dir,
        execFileSyncImpl: () => { extractionCalls += 1; return ''; },
      }),
      /SHA256 mismatch/,
    );
    assert.equal(extractionCalls, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
