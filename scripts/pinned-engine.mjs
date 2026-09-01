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

// Version-controlled release receipts are independent of GitHub's mutable
// asset store. A replaced archive cannot bless itself by replacing
// SHA256SUMS too: both its digest and the binary's build commit must still
// match this reviewed source anchor. Every ENGINE_PIN bump adds one receipt.
const RELEASE_RECEIPTS = Object.freeze({
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
  const match = /^nika\s+(\d+\.\d+\.\d+)\s+\(([0-9a-f]{9})\)$/m.exec(output);
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

async function download(url, fetchImpl) {
  const response = await fetchImpl(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
    headers: { 'user-agent': 'nika-vscode-release-proof' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} downloading ${url}`);
  }
  if (!response.url.startsWith('https://')) {
    throw new Error(`refusing non-HTTPS download response: ${response.url}`);
  }
  return Buffer.from(await response.arrayBuffer());
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
    const [sumsBytes, archiveBytes] = await Promise.all([
      download(`${baseUrl}/SHA256SUMS`, fetchImpl),
      download(`${baseUrl}/${assetName}`, fetchImpl),
    ]);
    const releaseIndexHash = checksumForAsset(sumsBytes.toString('utf8'), assetName);
    const actual = createHash('sha256').update(archiveBytes).digest('hex');
    if (releaseIndexHash !== receipt.sha256) {
      throw new Error(
        `SHA256SUMS drift for ${assetName}: anchored ${receipt.sha256}, index claims ${releaseIndexHash}`,
      );
    }
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
