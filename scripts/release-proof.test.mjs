import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { runIntegration, runSuite } from './run-integration.mjs';
import {
  assertVersionReceipt,
  checksumForAsset,
  installPinnedEngine,
  readPinnedRelease,
  releaseAsset,
  releaseReceipt,
} from './pinned-engine.mjs';

const root = resolve(import.meta.dirname, '..');

function httpResponse(url, body, headers = {}) {
  const response = new Response(body, { headers });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

for (const mode of ['declared', 'chunked', 'underreported', 'invalid-length']) {
  test(`release download refuses ${mode} oversized metadata before archive fetch or extraction`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nika-pin-bounded-'));
    let extractionCalls = 0;
    const requests = [];
    let cancelled = false;
    try {
      writeFileSync(join(dir, 'ENGINE_PIN'), 'v0.116.2\n');
      const fetchImpl = async (url) => {
        requests.push(url);
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(64 * 1024));
            controller.enqueue(new Uint8Array(1));
          },
          pull(controller) { controller.error(new Error('body consumed past size boundary')); },
          cancel() { cancelled = true; },
        }, { highWaterMark: 0 });
        const length = { declared: '65537', underreported: '1', 'invalid-length': '1e9' }[mode];
        return httpResponse(url, stream, length ? { 'content-length': length } : {});
      };
      await assert.rejects(installPinnedEngine({
        rootDir: dir, tempRoot: dir, fetchImpl,
        execFileSyncImpl: () => { extractionCalls += 1; },
      }), /download limit|invalid content-length/);
      assert.equal(extractionCalls, 0);
      assert.equal(requests.length, 1, 'metadata refusal must precede archive admission');
      assert.ok(cancelled, 'the rejected response body must be cancelled');
      assert.deepEqual(readdirSync(dir), ['ENGINE_PIN'], 'owned scratch must be removed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('an oversized archive header is refused before its first read or extraction', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nika-pin-archive-bound-'));
  let reads = 0;
  let cancelled = false;
  try {
    writeFileSync(join(dir, 'ENGINE_PIN'), 'v0.116.2\n');
    const asset = releaseAsset(process.platform, process.arch, '0.116.2');
    const { sha256 } = releaseReceipt('v0.116.2', asset);
    const fetchImpl = async (url) => {
      if (url.endsWith('SHA256SUMS')) return httpResponse(url, `${sha256}  ${asset}\n`);
      return httpResponse(url, new ReadableStream({
        pull() { reads += 1; },
        cancel() { cancelled = true; },
      }, { highWaterMark: 0 }), { 'content-length': String(256 * 1024 * 1024 + 1) });
    };
    await assert.rejects(installPinnedEngine({
      rootDir: dir, tempRoot: dir, fetchImpl,
      execFileSyncImpl: () => assert.fail('refused archive reached extraction'),
    }), /download limit/);
    assert.equal(reads, 0);
    assert.ok(cancelled);
    assert.deepEqual(readdirSync(dir), ['ENGINE_PIN']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exact-limit metadata in tiny chunks preserves bytes before anchored archive refusal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nika-pin-exact-bound-'));
  const requests = [];
  try {
    writeFileSync(join(dir, 'ENGINE_PIN'), 'v0.116.2\n');
    const asset = releaseAsset(process.platform, process.arch, '0.116.2');
    const { sha256 } = releaseReceipt('v0.116.2', asset);
    const sums = Buffer.from(`${sha256}  ${asset}\n`.padEnd(64 * 1024, ' '));
    const fetchImpl = async (url) => {
      requests.push(url);
      if (!url.endsWith('SHA256SUMS')) return httpResponse(url, 'foreign archive');
      let offset = 0;
      return httpResponse(url, new ReadableStream({
        pull(controller) {
          if (offset === sums.length) controller.close();
          else controller.enqueue(sums.subarray(offset, ++offset));
        },
      }));
    };
    await assert.rejects(installPinnedEngine({
      rootDir: dir, tempRoot: dir, fetchImpl,
      execFileSyncImpl: () => assert.fail('foreign archive reached extraction'),
    }), /archive digest mismatch/);
    assert.equal(requests.length, 2);
    assert.deepEqual(readdirSync(dir), ['ENGINE_PIN']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the publishing runbook names the live standalone release owner', () => {
  const runbook = readFileSync(resolve(root, 'PUBLISHING.md'), 'utf8');
  assert.match(runbook, /https:\/\/github\.com\/supernovae-st\/nika-vscode/);
  assert.doesNotMatch(runbook, /inert inside|live on split|git subtree split/);
  assert.match(runbook, /not a cross-registry transaction/);
});

test('publishing readiness compiles before the belt and records immutable public receipts', () => {
  const runbook = readFileSync(resolve(root, 'PUBLISHING.md'), 'utf8');
  assert(runbook.indexOf('npm run compile') >= 0);
  assert(runbook.indexOf('npm run compile') < runbook.indexOf('npm test'));
  assert.match(runbook, /scripts\/pinned-engine\.mjs/);
  assert.match(runbook, /RELEASE_RECEIPTS/);
  assert.match(runbook, /tree equality/);
});

test('integration failures cannot bypass owned engine cleanup', () => {
  for (const file of [
    'scripts/run-integration.mjs',
    'src/test-integration/runTests.ts',
    'src/test-integration/runFirstContact.ts',
    'src/test-integration/runRestrictedWorkspace.ts',
  ]) {
    const source = readFileSync(resolve(root, file), 'utf8');
    assert.doesNotMatch(source, /process\.exit\(/, `${file} bypasses finally`);
  }
});

test('integration releases the exact installed engine after any suite fails', async () => {
  const suites = ['out-integration/runRestrictedWorkspace.js', 'out-integration/runTests.js', 'out-integration/runFirstContact.js'];
  for (const failingSuite of [null, ...suites]) {
    let cleanupCount = 0;
    const calls = [];
    const failure = new Error('host failed');
    const run = runIntegration({
      installEngine: async () => ({
        binaryPath: '/owned/verified/nika', version: '0.118.1',
        cleanup: () => { cleanupCount += 1; },
      }),
      environment: { NIKA_BIN: '/unverified/nika', NIKA_ENGINE_VERSION: '0.116.2' },
      log: () => {},
      run: (script, env) => {
        calls.push(script);
        assert.equal(env.NIKA_BIN, '/owned/verified/nika');
        assert.equal(env.NIKA_ENGINE_VERSION, '0.118.1');
        if (script === failingSuite) throw failure;
      },
    });
    if (failingSuite) await assert.rejects(run, (error) => error === failure);
    else await run;
    assert.equal(cleanupCount, 1);
    assert.deepEqual(calls, failingSuite ? suites.slice(0, suites.indexOf(failingSuite) + 1) : suites);
  }
});

test('first-contact-only remains an explicit one-suite run and cleans up', async () => {
  const calls = [];
  await runIntegration({
    firstContactOnly: true,
    installEngine: async () => ({ cleanup: () => calls.push('cleanup') }),
    environment: {}, log: () => {},
    run: (script) => calls.push(script),
  });
  assert.deepEqual(calls, ['out-integration/runFirstContact.js', 'cleanup']);
});

test('suite success, failure and timeout all terminate only their owned process group', () => {
  for (const result of [
    { pid: 42, status: 0 },
    { pid: 42, status: 7 },
    { pid: 42, status: null, signal: 'SIGKILL', error: new Error('timeout') },
  ]) {
    const killed = [];
    const run = () => runSuite('fixture.js', {}, {
      spawn: (_file, _args, options) => {
        assert.equal(options.timeout, 600_000);
        assert.equal(options.killSignal, 'SIGKILL');
        assert.equal(options.detached, true);
        return result;
      },
      kill: (pid) => killed.push(pid),
    });
    if (result.status === 0) run();
    else assert.throws(run, /failed|timeout/);
    assert.deepEqual(killed, [-42]);
  }
});

test('suite deadline terminates a real stalled launcher and refuses invalid bounds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nika-suite-deadline-'));
  try {
    const fixture = join(dir, 'stall.cjs');
    writeFileSync(fixture, 'setInterval(() => {}, 1000);\n');
    const started = Date.now();
    assert.throws(() => runSuite(fixture, {}, { timeoutMs: 200 }), /ETIMEDOUT/);
    assert.ok(Date.now() - started < 5000, 'stalled suite escaped its deadline');
    for (const timeoutMs of [0, -1, Infinity, NaN]) {
      assert.throws(() => runSuite(fixture, {}, { timeoutMs }), /positive finite integer/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

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
  assert.doesNotMatch(workflow, /skipDuplicate:\s*true|skip-duplicate/);
  assert.equal(workflow.match(/skipDuplicate:\s*false/g)?.length, 2);
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

test('the 0.116.2 public assets have version-controlled immutable anchors', () => {
  const expectedCommit = 'c4cdbeafb58fe3705beb1d1000a14a8d18efc973';
  const receipts = new Map([
    ['nika-linux-arm64-0.116.2.tar.gz', '278f11c927e793cc51cae98ee04dde498a51a8af925733772828053f94d79c20'],
    ['nika-linux-x64-0.116.2.tar.gz', '5b94ebab8ea5a3e915c33d8b712400dd80e9c8f559d652cb288c38af23356024'],
    ['nika-macos-arm64-0.116.2.tar.gz', '5c66aafc4127fcf3383477badf13690614973075a640512136517f376d716f86'],
    ['nika-macos-x64-0.116.2.tar.gz', '6cb60636b21817260f7e6ae06cb1f521f96c07c960e7347467e60692236a2142'],
  ]);
  for (const [asset, sha256] of receipts) {
    assert.deepEqual(releaseReceipt('v0.116.2', asset), { commit: expectedCommit, sha256 });
  }
  assert.throws(
    () => releaseReceipt('v0.116.3', 'nika-linux-x64-0.116.3.tar.gz'),
    /no version-controlled release receipt/,
  );
});

test('version receipt refuses stale or foreign build identities', () => {
  const commit = 'c4cdbeafb58fe3705beb1d1000a14a8d18efc973';
  assert.doesNotThrow(() => assertVersionReceipt('nika 0.116.2 (c4cdbeafb)\n', '0.116.2', commit));
  assert.throws(
    () => assertVersionReceipt('nika 0.116.0 (c4cdbeafb)\n', '0.116.2', commit),
    /identity mismatch/,
  );
  assert.throws(
    () => assertVersionReceipt('nika 0.116.2 (deadbeef0)\n', '0.116.2', commit),
    /identity mismatch/,
  );
  for (const output of [
    'unrelated program\nnika 0.116.2 (c4cdbeafb)\n',
    'nika 0.116.2 (c4cdbeafb)\nnika 0.118.1 (deadbeef0)\n',
    'nika 0.116.2 (c4cdbeafb)\nextra diagnostics\n',
  ]) {
    assert.throws(() => assertVersionReceipt(output, '0.116.2', commit), /identity mismatch/);
  }
});

test('deadbeef0 archive and co-modified SHA256SUMS cannot replace the anchored release', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nika-pin-download-test-'));
  let extractionCalls = 0;
  try {
    writeFileSync(join(dir, 'ENGINE_PIN'), 'v0.116.2\n');
    const asset = releaseAsset(process.platform, process.arch, '0.116.2');
    const archive = Buffer.from('#!/bin/sh\necho "nika 0.116.2 (deadbeef0)"\n');
    const coModifiedHash = createHash('sha256').update(archive).digest('hex');
    const fetchImpl = async (url) => {
      const body = Buffer.from(url.endsWith('SHA256SUMS') ? `${coModifiedHash}  ${asset}\n` : archive);
      return httpResponse(url, body);
    };
    await assert.rejects(
      installPinnedEngine({
        rootDir: dir,
        fetchImpl,
        tempRoot: dir,
        execFileSyncImpl: () => { extractionCalls += 1; return ''; },
      }),
      /SHA256SUMS drift/,
    );
    assert.equal(extractionCalls, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
