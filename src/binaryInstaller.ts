// binaryInstaller.ts — Binary download, verification, and extraction
//
// Handles discovering, downloading, and validating the Nika binary from GitHub releases.
// Pure functions with no module-level state — all dependencies passed as parameters.

import { window, ProgressLocation, ExtensionContext, type CancellationToken } from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IncomingMessage } from 'http';
import { pipeline } from 'node:stream/promises';
import { extractBinaryFromTarGz, extractBinaryFromZip } from './core/archive';
import { engineSupportError, probeBinaryVersion, versionReceiptError } from './core/binaryVersion';
import { findCommandOnPath } from './core/pathLookup';

const GITHUB_RELEASES_API = 'https://api.github.com/repos/supernovae-st/nika/releases/latest';
const GITHUB_LATEST_HTML = 'https://github.com/supernovae-st/nika/releases/latest';
const GITHUB_DOWNLOAD_BASE = 'https://github.com/supernovae-st/nika/releases/download';
export const GITHUB_INSTALL_URL = 'https://github.com/supernovae-st/nika#installation';
export const GITHUB_RELEASES_URL = 'https://github.com/supernovae-st/nika/releases/latest';

/**
 * The release version, WITHOUT the API when possible: the html
 * releases/latest endpoint 302-redirects to .../tag/vX.Y.Z and carries
 * no rate quota — the unauthenticated API (60 req/h/IP) turned the
 * download button into a silent no-op on busy days (operator live,
 * 2026-07-12). The API stays as the fallback.
 */
async function resolveLatestVersion(): Promise<string> {
  try {
    const res = await new Promise<IncomingMessage>((resolve, reject) => {
      https.get(GITHUB_LATEST_HTML, { headers: { 'User-Agent': 'vscode-nika-extension' } }, resolve)
        .on('error', reject);
    });
    res.resume();
    const loc = res.headers.location ?? '';
    const m = /\/tag\/v?([0-9][\w.-]*)$/.exec(loc);
    if (m) { return m[1]; }
  } catch { /* fall through to the API */ }
  const apiRes = await httpGet(GITHUB_RELEASES_API);
  if (apiRes.statusCode !== 200) {
    apiRes.resume();
    throw new Error(`GitHub API returned HTTP ${apiRes.statusCode}`);
  }
  const release = JSON.parse(await readBody(apiRes)) as { tag_name: string };
  return release.tag_name.replace(/^v/, '');
}

/** Maps process.platform + process.arch to a GitHub release artifact prefix. */
export function getArtifactName(): string | null {
  const { platform, arch } = process;
  if (platform === 'darwin' && arch === 'arm64') {
    return 'nika-macos-arm64';
  }
  if (platform === 'darwin' && arch === 'x64') {
    return 'nika-macos-x64';
  }
  if (platform === 'linux' && arch === 'x64') {
    return 'nika-linux-x64';
  }
  if (platform === 'linux' && arch === 'arm64') {
    return 'nika-linux-arm64';
  }
  // Windows: the engine ships no Windows release artifacts today
  // (0.92.0 assets = linux/macos × x64/arm64 only) — a phantom name here
  // would send the download path into a guaranteed asset-lookup miss.
  // Null routes Windows users straight to the install guide instead.
  return null;
}

/** Follows HTTP redirects (GitHub redirects asset downloads). */
async function httpGet(url: string, signal?: AbortSignal): Promise<IncomingMessage> {
  for (let redirectsLeft = 5; ; redirectsLeft--) {
    signal?.throwIfAborted();
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'vscode-nika-extension' }, signal }, (res) => {
        // A response may fail after headers but before its body consumer
        // attaches. Keep that error handled; pipeline/readBody also observe it.
        res.on('error', reject);
        resolve(res);
      }).on('error', reject);
    });
    const redirect = [301, 302, 307, 308].includes(response.statusCode ?? 0);
    if (!redirect || !response.headers.location) { return response; }
    response.destroy();
    if (redirectsLeft === 0) { throw new Error('too many release download redirects'); }
    if (!response.headers.location.startsWith('https://')) {
      throw new Error(`refusing non-https redirect: ${response.headers.location}`);
    }
    url = response.headers.location;
  }
}

/** Reads the full body of an HTTP response as a string. */
function readBody(res: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    res.on('error', reject);
  });
}

/** The typed cancel — the caller tells a user's Stop from a failure. */
export class DownloadCancelled extends Error {
  constructor() { super('download cancelled'); }
}

/** Transfer one new archive. Await stream closure and failed-transfer cleanup;
 * never truncate or remove a destination owned by another transfer. The
 * deadline covers this transfer's headers, redirects and body, not installation. */
export async function downloadToFile(url: string, destPath: string, token?: CancellationToken): Promise<void> {
  if (token?.isCancellationRequested) { throw new DownloadCancelled(); }
  const controller = new AbortController();
  const sub = token?.onCancellationRequested(() => controller.abort(new DownloadCancelled()));
  const deadline = setTimeout(() => controller.abort(new Error('engine archive download timed out')), 180_000);
  let response: IncomingMessage | undefined;
  let ownsFile = false;
  try {
    controller.signal.throwIfAborted();
    response = await httpGet(url, controller.signal);
    if (response.statusCode !== 200) {
      throw new Error(`HTTP ${response.statusCode} downloading binary`);
    }
    controller.signal.throwIfAborted();
    const file = fs.createWriteStream(destPath, { flags: 'wx' });
    file.once('open', () => { ownsFile = true; });
    // pipeline installs both error handlers immediately, destroys peers on
    // failure, and settles after closure; pipe + a late file handler did not.
    await pipeline(response, file, { signal: controller.signal });
  } catch (error) {
    response?.destroy();
    if (ownsFile) { await fs.promises.unlink(destPath); }
    throw controller.signal.aborted ? controller.signal.reason : error;
  } finally {
    clearTimeout(deadline);
    sub?.dispose();
  }
}

/**
 * Downloads the latest nika binary from GitHub releases.
 * Returns the installed path, or null on an unsupported platform. Errors
 * reject without replacing an existing binary with unverified bytes.
 */
export async function downloadNikaBinary(storagePath: string): Promise<string | null> {
  const artifactName = getArtifactName();
  if (!artifactName) {
    return null;
  }

  const isWindows = process.platform === 'win32';
  const binaryName = isWindows ? 'nika.exe' : 'nika';
  const binaryDest = path.join(storagePath, binaryName);

  return window.withProgress(
    {
      location: ProgressLocation.Notification,
      // Long + cancellable (annexe A) — step details narrate below; the
      // deep story lands in the Nika output channel on failure.
      title: 'Nika: downloading the engine…',
      cancellable: true,
    },
    async (progress, token) => {
      let stagingPath: string | undefined;
      try {
        progress.report({ message: 'Resolving the latest release...' });
        const version = await resolveLatestVersion();
        if (token.isCancellationRequested) { throw new DownloadCancelled(); }
        const supportError = engineSupportError(version);
        if (supportError) { throw new Error(`Latest public release: ${supportError}`); }
        const archiveExt = isWindows ? '.zip' : '.tar.gz';
        const archiveName = `${artifactName}-${version}${archiveExt}`;
        const assetUrl = `${GITHUB_DOWNLOAD_BASE}/v${version}/${archiveName}`;

        progress.report({ message: `Downloading ${archiveName}...` });

        // Ensure storage directory exists
        fs.mkdirSync(storagePath, { recursive: true });
        stagingPath = fs.mkdtempSync(path.join(storagePath, '.nika-install-'));
        const archiveDest = path.join(stagingPath, archiveName);
        const candidateDest = path.join(stagingPath, binaryName);
        await downloadToFile(assetUrl, archiveDest, token);
        if (token.isCancellationRequested) { throw new DownloadCancelled(); }

        // The release publishes ONE aggregate SHA256SUMS (the per-asset
        // .sha256 era is over — the old lookup silently SKIPPED
        // verification on every modern release). The named line MUST
        // exist and MUST match: an unverifiable executable download is
        // a failure, not a warning.
        progress.report({ message: 'Verifying checksum (SHA256SUMS)...' });
        const sumsRes = await httpGet(`${GITHUB_DOWNLOAD_BASE}/v${version}/SHA256SUMS`);
        if (sumsRes.statusCode !== 200) {
          sumsRes.resume();
          throw new Error(`SHA256SUMS unavailable (HTTP ${sumsRes.statusCode}): refusing an unverified binary`);
        }
        const sums = await readBody(sumsRes);
        const line = sums.split('\n').find((l) => l.trim().endsWith(archiveName));
        if (!line) {
          throw new Error(`SHA256SUMS has no entry for ${archiveName} — refusing an unverified binary`);
        }
        const expectedHash = line.trim().split(/\s+/)[0].toLowerCase();
        const actualHash = crypto.createHash('sha256')
          .update(fs.readFileSync(archiveDest)).digest('hex');
        if (actualHash !== expectedHash) {
          throw new Error(
            `SHA256 mismatch for ${archiveName}: expected ${expectedHash}, got ${actualHash}`,
          );
        }

        progress.report({ message: 'Extracting binary...' });

        if (isWindows) {
          await extractBinaryFromZip(archiveDest, candidateDest);
        } else {
          await extractBinaryFromTarGz(archiveDest, candidateDest);
          fs.chmodSync(candidateDest, 0o755);
        }

        // The receipt: SHA256SUMS proved the download, this proves the
        // install — the binary on disk must report the version we resolved.
        // Verify in owned staging. A failed receipt must not delete the
        // previously installed binary or leave unverified executable bytes.
        progress.report({ message: 'Verifying the installed binary...' });
        const receiptError = versionReceiptError(await probeBinaryVersion(candidateDest), version);
        if (receiptError) {
          throw new Error(receiptError);
        }
        if (token.isCancellationRequested) { throw new DownloadCancelled(); }
        // Same-storage rename publishes only the verified file. This is
        // installation settlement, not a cross-process version-order lock.
        fs.renameSync(candidateDest, binaryDest);
        progress.report({ message: 'Done.' });
        return binaryDest;
      } finally {
        // The exact mkdtemp directory belongs to this attempt alone.
        if (stagingPath) { await fs.promises.rm(stagingPath, { recursive: true, force: true }); }
      }
    },
  );
}

/** Select once, then let NikaService admit the selection. An unsupported
 * configured, bundled, PATH or cached engine is never replaced silently. */
export function findLocalBinary(configuredPath: string, bundled: string | undefined, cached: string): string | undefined {
  if (configuredPath !== 'nika') {
    const named = !configuredPath.includes('/') && !configuredPath.includes('\\');
    return (named ? findExecutableOnPath(configuredPath) : undefined) ?? canonicalPath(configuredPath);
  }
  if (bundled) { return canonicalPath(bundled); }
  return findExecutableOnPath('nika') ?? (fs.existsSync(cached) ? canonicalPath(cached) : undefined);
}

/** Freeze the selected path, including relative PATH entries and symlinks. */
export function findExecutableOnPath(name: string): string | undefined {
  const selected = findCommandOnPath(name, process.env.PATH, process.platform, (candidate) => {
    try { fs.accessSync(candidate, fs.constants.X_OK); return true; } catch { return false; }
  });
  return selected ? canonicalPath(selected) : undefined;
}

function canonicalPath(candidate: string): string {
  const absolute = path.resolve(candidate);
  try { return fs.realpathSync(absolute); } catch { return absolute; }
}

/** Check for bundled binary in platform-specific VSIX (rust-analyzer pattern). */
export function findBundledBinary(context: ExtensionContext): string | null {
  const binaryName = process.platform === 'win32' ? 'nika.exe' : 'nika';
  const bundled = path.join(context.extensionPath, 'server', binaryName);
  return fs.existsSync(bundled) ? bundled : null;
}
