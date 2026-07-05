// binaryInstaller.ts — Binary download, verification, and extraction
//
// Handles discovering, downloading, and validating the Nika binary from GitHub releases.
// Pure functions with no module-level state — all dependencies passed as parameters.

import { window, ProgressLocation, ExtensionContext } from 'vscode';
import { execFile } from 'child_process';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IncomingMessage } from 'http';
import { extractBinaryFromTarGz, extractBinaryFromZip } from './core/archive';

const GITHUB_RELEASES_API = 'https://api.github.com/repos/supernovae-st/nika/releases/latest';
export const GITHUB_INSTALL_URL = 'https://github.com/supernovae-st/nika#installation';

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

/** Downloads a URL to a file path, streaming directly to disk. */
function downloadToFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const cleanup = (err: Error): void => {
      file.destroy();
      fs.unlink(destPath, () => undefined);
      reject(err);
    };

    const request = (targetUrl: string, redirectsLeft: number): void => {
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
      title: 'Nika: Downloading language server...',
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: 'Fetching release info from GitHub...' });

        // Fetch latest release metadata
        const apiRes = await httpGet(GITHUB_RELEASES_API);
        if (apiRes.statusCode !== 200) {
          throw new Error(`GitHub API returned HTTP ${apiRes.statusCode}`);
        }
        const body = await readBody(apiRes);
        const release = JSON.parse(body) as {
          tag_name: string;
          assets: Array<{ name: string; browser_download_url: string }>;
        };

        const version = release.tag_name.replace(/^v/, '');
        const archiveExt = isWindows ? '.zip' : '.tar.gz';
        const archiveName = `${artifactName}-${version}${archiveExt}`;
        const asset = release.assets.find((a) => a.name === archiveName);

        if (!asset) {
          throw new Error(`No asset named '${archiveName}' in release ${release.tag_name}`);
        }

        progress.report({ message: `Downloading ${archiveName}...` });

        // Ensure storage directory exists
        fs.mkdirSync(storagePath, { recursive: true });

        const archiveDest = path.join(storagePath, archiveName);
        await downloadToFile(asset.browser_download_url, archiveDest);

        // SHA256 checksum verification
        progress.report({ message: 'Verifying checksum...' });
        const checksumName = `${archiveName}.sha256`;
        const checksumAsset = release.assets.find((a) => a.name === checksumName);
        if (checksumAsset) {
          const checksumRes = await httpGet(checksumAsset.browser_download_url);
          if (checksumRes.statusCode === 200) {
            const checksumBody = await readBody(checksumRes);
            // Format: "<hash>  <filename>"
            const expectedHash = checksumBody.trim().split(/\s+/)[0].toLowerCase();

            const fileBuffer = fs.readFileSync(archiveDest);
            const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

            if (actualHash !== expectedHash) {
              fs.unlinkSync(archiveDest);
              throw new Error(
                `SHA256 mismatch for ${archiveName}: expected ${expectedHash}, got ${actualHash}`
              );
            }
          } else {
            console.warn(`Nika: checksum file returned HTTP ${checksumRes.statusCode}, skipping verification`);
            checksumRes.resume();
          }
        } else {
          console.warn('Nika: no .sha256 checksum file in release, skipping verification');
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
