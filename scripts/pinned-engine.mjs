// Resolve the integration engine from ENGINE_PIN, never from PATH.
//
// The release archive and its SHA256SUMS entry are the public user artifact.
// Integration tests execute that exact artifact and then prove its version
// receipt before a VS Code host is allowed to start.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const RELEASES = 'https://github.com/supernovae-st/nika/releases/download';
// Admission bounds apply before buffering, independently of mutable HTTP
// metadata. The reviewed archives are below 20 MiB; leave explicit headroom
// for future releases without granting the response unbounded memory.
const MAX_CHECKSUM_BYTES = 64 * 1024;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;

// Version-controlled release receipts are independent of GitHub's mutable
// asset store. A replaced archive cannot bless itself by replacing
// SHA256SUMS too: both its digest and the binary's build commit must still
// match this reviewed source anchor. Every ENGINE_PIN bump adds one receipt.
const RELEASE_RECEIPTS = Object.freeze({
  'v0.120.1': Object.freeze({
    commit: '9d554c84c8a63144c36e7245fee641e6bfc7349f',
    assets: Object.freeze({
      'nika-linux-arm64-0.120.1.tar.gz': 'cd3354a7c3555f59bbd6781e2a1e6d806bc2f537bdd41d63e4346e4803d3654b',
      'nika-linux-x64-0.120.1.tar.gz': '403112258264381efbb3200fc067742123e7fcccdc877301fc70f974439b0193',
      'nika-macos-arm64-0.120.1.tar.gz': '10e51b8d1dfdd4b5aa09eefb2c0f9ea7ba82896db8e2f0c3f457c00f8816b5fe',
      'nika-macos-x64-0.120.1.tar.gz': 'cf450c2a58d98d6ec14a93f9f145dbcd5d1bf071b2cc9d2dc1f4731774b13517',
    }),
  }),
  'v0.120.0': Object.freeze({
    commit: 'f6155d1be080973500a4793e01dbec93faa451b4',
    assets: Object.freeze({
      'nika-linux-arm64-0.120.0.tar.gz': 'b68c4a77f1fef79b8211ab1f7418c276789f2a0e6cfa428d34212e32f63bd4ee',
      'nika-linux-x64-0.120.0.tar.gz': '7cb2b5a3eaf723b03cc990348bf9bf770d1db7cfe15634b1c28ae18bf419ddd7',
      'nika-macos-arm64-0.120.0.tar.gz': '22e0947b4eddb02cfecd4f2b55e7f7aef6e563ef95332fb084f76d9d34748618',
      'nika-macos-x64-0.120.0.tar.gz': '1a4fe3ad8a11ea9308dad8167c286c364cad9d471e9f2ec1c49a03c5a055983e',
    }),
  }),
  'v0.118.7': Object.freeze({
    commit: 'f3a31a6ee00766e4b010379c535bca994631d637',
    assets: Object.freeze({
      'nika-linux-arm64-0.118.7.tar.gz': '79134d541779a56ff9eefe2a522984e58247986c758ce5ab5d32c5dcaedb40bc',
      'nika-linux-x64-0.118.7.tar.gz': '89d9a1680ede12e34c292160f274e63e4eee751aaa5c30d382741c90d9b8dc06',
      'nika-macos-arm64-0.118.7.tar.gz': 'ab666fabdba31b56de1a55ad1bd11466687f46a812f8135276b0276d3de4b56b',
      'nika-macos-x64-0.118.7.tar.gz': 'f2c96792b1c009092490695d156d51e8b6367b0fbc818352423a549f55d4e89d',
    }),
  }),

  'v0.116.2': Object.freeze({
    commit: 'c4cdbeafb58fe3705beb1d1000a14a8d18efc973',
    assets: Object.freeze({
      'nika-linux-arm64-0.116.2.tar.gz': '278f11c927e793cc51cae98ee04dde498a51a8af925733772828053f94d79c20',
      'nika-linux-x64-0.116.2.tar.gz': '5b94ebab8ea5a3e915c33d8b712400dd80e9c8f559d652cb288c38af23356024',
      'nika-macos-arm64-0.116.2.tar.gz': '5c66aafc4127fcf3383477badf13690614973075a640512136517f376d716f86',
      'nika-macos-x64-0.116.2.tar.gz': '6cb60636b21817260f7e6ae06cb1f521f96c07c960e7347467e60692236a2142',
    }),
  }),
});

export function readPinnedRelease(rootDir) {
  const pin = readFileSync(resolve(rootDir, 'ENGINE_PIN'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '' && !line.startsWith('#'));
  const match = /^v(\d+\.\d+\.\d+)$/.exec(pin ?? '');
  if (!match) {
    throw new Error(
      `integration requires a public stable release tag in ENGINE_PIN, got ${String(pin)}`,
    );
  }
  return { tag: pin, version: match[1] };
}

export function releaseAsset(platform, arch, version) {
  const target = new Map([
    ['darwin:arm64', 'macos-arm64'],
    ['darwin:x64', 'macos-x64'],
    ['linux:arm64', 'linux-arm64'],
    ['linux:x64', 'linux-x64'],
  ]).get(`${platform}:${arch}`);
  if (!target) {
    throw new Error(`ENGINE_PIN integration has no public asset for ${platform}/${arch}`);
  }
  return `nika-${target}-${version}.tar.gz`;
}

export function releaseReceipt(tag, assetName) {
  const receipt = RELEASE_RECEIPTS[tag];
  const sha256 = receipt?.assets[assetName];
  if (!receipt || !sha256) {
    throw new Error(`no version-controlled release receipt for ${tag} / ${assetName}`);
  }
  return { commit: receipt.commit, sha256 };
}

export function checksumForAsset(sums, assetName) {
  const escaped = assetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^([0-9a-fA-F]{64})\\s+\\*?${escaped}$`);
  const matches = sums.split(/\r?\n/)
    .map((line) => pattern.exec(line.trim()))
    .filter((match) => match !== null);
  if (matches.length !== 1) {
    throw new Error(
      `SHA256SUMS must contain exactly one entry for ${assetName}, found ${matches.length}`,
    );
  }
  return matches[0][1].toLowerCase();
}

export function assertVersionReceipt(output, expectedVersion, expectedCommit) {
  const match = /^nika (\d+\.\d+\.\d+) \(([0-9a-f]{9})\)\r?\n?$/.exec(output);
  const reportedVersion = match?.[1];
  const reportedCommit = match?.[2];
  const anchoredCommit = expectedCommit.slice(0, 9);
  if (reportedVersion !== expectedVersion || reportedCommit !== anchoredCommit) {
    throw new Error(
      `ENGINE_PIN identity mismatch: expected ${expectedVersion} (${anchoredCommit}), `
      + `binary reported ${String(reportedVersion)} (${String(reportedCommit)})`,
    );
  }
}

async function download(url, fetchImpl, maxBytes) {
  const response = await fetchImpl(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
    headers: { 'user-agent': 'nika-vscode-release-proof' },
  });
  let reader;
  try {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} downloading ${url}`);
    }
    if (!response.url.startsWith('https://')) {
      throw new Error(`refusing non-HTTPS download response: ${response.url}`);
    }
    const length = response.headers.get('content-length');
    if (length !== null) {
      const declared = Number(length);
      if (!/^\d+$/.test(length) || !Number.isSafeInteger(declared)) {
        throw new Error(`invalid content-length downloading ${url}`);
      }
      if (declared > maxBytes) {
        throw new Error(`download limit ${maxBytes} bytes exceeded for ${url}`);
      }
    }
    if (!response.body) throw new Error(`missing download body for ${url}`);
    reader = response.body.getReader();
    // Coalesce tiny chunks instead of retaining one object per byte. Even a
    // compliant byte count must not buy an unbounded chunk-metadata budget.
    let bytes = Buffer.alloc(0);
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return bytes.subarray(0, size);
      if (value.byteLength > maxBytes - size) {
        throw new Error(`download limit ${maxBytes} bytes exceeded for ${url}`);
      }
      const required = size + value.byteLength;
      if (required > bytes.length) {
        const capacity = Math.min(maxBytes, Math.max(required, 64 * 1024, bytes.length * 2));
        const grown = Buffer.alloc(capacity);
        bytes.copy(grown, 0, 0, size);
        bytes = grown;
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
  } finally {
    // Await cancellation before removing owned scratch. Header refusal also
    // owns its unread body, and a failed checksum never starts the archive.
    if (reader) {
      try { await reader.cancel(); } catch { /* preserve the admission failure */ }
      reader.releaseLock();
    } else if (response.body) {
      try { await response.body.cancel(); } catch { /* preserve the admission failure */ }
    }
  }
}

export async function installPinnedEngine({
  rootDir,
  platform = process.platform,
  arch = process.arch,
  fetchImpl = globalThis.fetch,
  execFileSyncImpl = execFileSync,
  tempRoot = tmpdir(),
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('global fetch is unavailable');
  }
  const { tag, version } = readPinnedRelease(rootDir);
  const assetName = releaseAsset(platform, arch, version);
  const receipt = releaseReceipt(tag, assetName);
  const baseUrl = `${RELEASES}/${tag}`;
  const workDir = mkdtempSync(join(tempRoot, 'nika-vscode-engine-'));

  try {
    const sumsBytes = await download(`${baseUrl}/SHA256SUMS`, fetchImpl, MAX_CHECKSUM_BYTES);
    const releaseIndexHash = checksumForAsset(sumsBytes.toString('utf8'), assetName);
    if (releaseIndexHash !== receipt.sha256) {
      throw new Error(
        `SHA256SUMS drift for ${assetName}: anchored ${receipt.sha256}, index claims ${releaseIndexHash}`,
      );
    }
    const archiveBytes = await download(`${baseUrl}/${assetName}`, fetchImpl, MAX_ARCHIVE_BYTES);
    const actual = createHash('sha256').update(archiveBytes).digest('hex');
    if (actual !== receipt.sha256) {
      throw new Error(
        `archive digest mismatch for ${assetName}: anchored ${receipt.sha256}, got ${actual}`,
      );
    }

    const archivePath = join(workDir, assetName);
    const extractDir = join(workDir, 'engine');
    writeFileSync(archivePath, archiveBytes);
    mkdirSync(extractDir);
    execFileSyncImpl('tar', ['-xzf', archivePath, '-C', extractDir, 'nika'], { stdio: 'pipe' });

    const binaryPath = join(extractDir, 'nika');
    chmodSync(binaryPath, 0o755);
    const versionOutput = execFileSyncImpl(binaryPath, ['--version'], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    assertVersionReceipt(String(versionOutput), version, receipt.commit);

    return {
      assetName,
      binaryPath,
      cleanup: () => rmSync(workDir, { recursive: true, force: true }),
      commit: receipt.commit,
      sha256: actual,
      tag,
      version,
    };
  } catch (error) {
    rmSync(workDir, { recursive: true, force: true });
    throw error;
  }
}
