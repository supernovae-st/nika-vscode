// binaryInstaller.ts — Binary download, verification, and extraction
//
// Handles discovering, downloading, and validating the Nika binary from GitHub releases.
// Pure functions with no module-level state — all dependencies passed as parameters.

import { window, ProgressLocation, ExtensionContext, type CancellationToken } from 'vscode';
import { execFile } from 'child_process';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IncomingMessage } from 'http';
import { extractBinaryFromTarGz, extractBinaryFromZip } from './core/archive';

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
function httpGet(url: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = (targetUrl: string, redirectsLeft: number): void => {
      https.get(targetUrl, { headers: { 'User-Agent': 'vscode-nika-extension' } }, (res) => {
        if (
          (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308)
          && res.headers.location
          && redirectsLeft > 0
        ) {
          res.resume();
          // https.get throws SYNCHRONOUSLY on a non-https URL — an
          // http:// redirect would crash the extension host (and would
          // be a protocol downgrade for a binary download anyway).
          if (!res.headers.location.startsWith('https://')) {
            reject(new Error(`refusing non-https redirect: ${res.headers.location}`));
            return;
          }
          request(res.headers.location, redirectsLeft - 1);
          return;
        }
        resolve(res);
      }).on('error', reject);
    };
    request(url, 5);
  });
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

/** Downloads a URL to a file path, streaming directly to disk.
 *  `token` (optional) aborts the in-flight transfer — the stream is
 *  destroyed and the partial file removed (never a half binary). */
function downloadToFile(url: string, destPath: string, token?: CancellationToken): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const cleanup = (err: Error): void => {
      file.destroy();
      fs.unlink(destPath, () => undefined);
      reject(err);
    };
    if (token) {
      const sub = token.onCancellationRequested(() => {
        sub.dispose();
        cleanup(new DownloadCancelled());
      });
    }

    const request = (targetUrl: string, redirectsLeft: number): void => {
      if (token?.isCancellationRequested) { return; } // cleanup already fired
      https.get(targetUrl, { headers: { 'User-Agent': 'vscode-nika-extension' } }, (res) => {
        if (
          (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308)
          && res.headers.location
          && redirectsLeft > 0
        ) {
          res.resume();
          if (!res.headers.location.startsWith('https://')) {
            cleanup(new Error(`refusing non-https redirect: ${res.headers.location}`));
            return;
          }
          request(res.headers.location, redirectsLeft - 1);
          return;
        }
        if (res.statusCode !== 200) {
          // Drain the response — an unconsumed body keeps the socket
          // pinned until the server gives up.
          res.resume();
          cleanup(new Error(`HTTP ${res.statusCode} downloading binary`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', cleanup);
      }).on('error', cleanup);
    };
    request(url, 5);
  });
}

/**
 * Downloads the latest nika binary from GitHub releases.
 * Returns the path to the downloaded binary, or null on failure.
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
      try {
        progress.report({ message: 'Resolving the latest release...' });
        const version = await resolveLatestVersion();
        if (token.isCancellationRequested) { throw new DownloadCancelled(); }
        const archiveExt = isWindows ? '.zip' : '.tar.gz';
        const archiveName = `${artifactName}-${version}${archiveExt}`;
        const assetUrl = `${GITHUB_DOWNLOAD_BASE}/v${version}/${archiveName}`;

        progress.report({ message: `Downloading ${archiveName}...` });

        // Ensure storage directory exists
        fs.mkdirSync(storagePath, { recursive: true });

        const archiveDest = path.join(storagePath, archiveName);
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
          throw new Error(`SHA256SUMS unavailable (HTTP ${sumsRes.statusCode}) — refusing an unverified binary`);
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
          fs.unlinkSync(archiveDest);
          throw new Error(
            `SHA256 mismatch for ${archiveName}: expected ${expectedHash}, got ${actualHash}`,
          );
        }

        progress.report({ message: 'Extracting binary...' });

        if (isWindows) {
          await extractBinaryFromZip(archiveDest, binaryDest);
        } else {
          await extractBinaryFromTarGz(archiveDest, binaryDest);
          fs.chmodSync(binaryDest, 0o755);
        }

        // Clean up archive
        fs.unlink(archiveDest, () => undefined);

        progress.report({ message: 'Done.' });
        return binaryDest;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void message; // handled by caller
        throw err;
      }
    },
  );
}

/** Checks if the binary at the given path is functional. */
export function isBinaryWorking(binaryPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(binaryPath, ['--version'], { timeout: 5000 }, (error) => {
      resolve(!error);
    });
  });
}

/** Check for bundled binary in platform-specific VSIX (rust-analyzer pattern). */
export function findBundledBinary(context: ExtensionContext): string | null {
  const binaryName = process.platform === 'win32' ? 'nika.exe' : 'nika';
  const bundled = path.join(context.extensionPath, 'server', binaryName);
  return fs.existsSync(bundled) ? bundled : null;
}
