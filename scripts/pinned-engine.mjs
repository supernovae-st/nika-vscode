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

export function assertVersionReceipt(output, expectedVersion) {
  const reported = /^nika\s+(\d+\.\d+\.\d+)(?:\s|$)/m.exec(output)?.[1];
  if (reported !== expectedVersion) {
    throw new Error(
      `ENGINE_PIN version mismatch: expected ${expectedVersion}, binary reported ${String(reported)}`,
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
  const baseUrl = `${RELEASES}/${tag}`;
  const workDir = mkdtempSync(join(tempRoot, 'nika-vscode-engine-'));

  try {
    const [sumsBytes, archiveBytes] = await Promise.all([
      download(`${baseUrl}/SHA256SUMS`, fetchImpl),
      download(`${baseUrl}/${assetName}`, fetchImpl),
    ]);
    const expected = checksumForAsset(sumsBytes.toString('utf8'), assetName);
    const actual = createHash('sha256').update(archiveBytes).digest('hex');
    if (actual !== expected) {
      throw new Error(`SHA256 mismatch for ${assetName}: expected ${expected}, got ${actual}`);
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
    assertVersionReceipt(String(versionOutput), version);

    return {
      assetName,
      binaryPath,
      cleanup: () => rmSync(workDir, { recursive: true, force: true }),
      sha256: actual,
      tag,
      version,
    };
  } catch (error) {
    rmSync(workDir, { recursive: true, force: true });
    throw error;
  }
}
