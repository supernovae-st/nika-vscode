import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as https from 'https';

const state = vi.hoisted(() => ({ cancelled: false }));
vi.mock('vscode', () => ({
  ProgressLocation: { Notification: 1 },
  window: { withProgress: (_options: unknown, action: (progress: unknown, token: unknown) => unknown) => action(
    { report: vi.fn() },
    { get isCancellationRequested() { return state.cancelled; }, onCancellationRequested: () => ({ dispose: vi.fn() }) },
  ) },
}));
vi.mock('https', () => ({ get: vi.fn() }));
vi.mock('../core/archive', () => ({ extractBinaryFromTarGz: vi.fn(), extractBinaryFromZip: vi.fn() }));
vi.mock('../core/binaryVersion', async (original) => ({
  ...await original<typeof import('../core/binaryVersion')>(), probeBinaryVersion: vi.fn(),
}));
import { downloadNikaBinary, getArtifactName, DownloadCancelled } from '../binaryInstaller';
import { extractBinaryFromTarGz } from '../core/archive';
import { MINIMUM_ENGINE_VERSION, probeBinaryVersion } from '../core/binaryVersion';

let storage: string;
let installed: string;
let checksum: string;
let checksumStatus: number;
const archive = 'synthetic archive: the extractor is explicitly mocked';

beforeEach(() => {
  storage = mkdtempSync(join(tmpdir(), 'nika-install-settlement-'));
  installed = join(storage, 'nika');
  writeFileSync(installed, 'previous admitted binary');
  state.cancelled = false;
  checksumStatus = 200;
  const name = `${getArtifactName()}-${MINIMUM_ENGINE_VERSION}.tar.gz`;
  checksum = `${createHash('sha256').update(archive).digest('hex')}  ${name}\n`;
  vi.mocked(probeBinaryVersion).mockResolvedValue(MINIMUM_ENGINE_VERSION);
  vi.mocked(extractBinaryFromTarGz).mockImplementation(async (_archive, destination) => {
    writeFileSync(destination, 'verified candidate bytes');
  });
  vi.mocked(https.get).mockImplementation((url: unknown, _options: unknown, callback: unknown) => {
    const target = String(url);
    const latest = target.endsWith('/releases/latest');
    const sums = target.endsWith('/SHA256SUMS');
    const response = Object.assign(Readable.from([Buffer.from(latest ? '' : sums ? checksum : archive)]), {
      statusCode: latest ? 302 : sums ? checksumStatus : 200,
      headers: latest ? { location: `https://github.com/supernovae-st/nika/releases/tag/v${MINIMUM_ENGINE_VERSION}` } : {},
    });
    const request = new EventEmitter();
    queueMicrotask(() => (callback as (response: unknown) => void)(response));
    return request as ReturnType<typeof https.get>;
  });
});

afterEach(() => {
  vi.resetAllMocks();
  rmSync(storage, { recursive: true, force: true });
});

function oldBinaryAndNoPartials(): void {
  expect(readFileSync(installed, 'utf8')).toBe('previous admitted binary');
  expect(readdirSync(storage)).toEqual(['nika']);
}

describe.skipIf(process.platform === 'win32')('install settlement after verification', () => {
  it('probes staged bytes before replacing the installed binary and removes staging', async () => {
    vi.mocked(probeBinaryVersion).mockImplementation(async (candidate) => {
      expect(candidate).not.toBe(installed);
      expect(readFileSync(installed, 'utf8')).toBe('previous admitted binary');
      expect(readFileSync(candidate, 'utf8')).toBe('verified candidate bytes');
      return MINIMUM_ENGINE_VERSION;
    });
    await expect(downloadNikaBinary(storage)).resolves.toBe(installed);
    expect(readFileSync(installed, 'utf8')).toBe('verified candidate bytes');
    expect(readdirSync(storage)).toEqual(['nika']);
  });

  it('preserves installed bytes and cleans staging when checksum retrieval fails', async () => {
    checksumStatus = 503;
    await expect(downloadNikaBinary(storage)).rejects.toThrow('SHA256SUMS unavailable');
    oldBinaryAndNoPartials();
  });

  it('preserves installed bytes after a partial extraction failure', async () => {
    vi.mocked(extractBinaryFromTarGz).mockImplementation(async (_archive, candidate) => {
      writeFileSync(candidate, 'partial unverified binary');
      throw new Error('extraction failed');
    });
    await expect(downloadNikaBinary(storage)).rejects.toThrow('extraction failed');
    oldBinaryAndNoPartials();
  });

  it('preserves installed bytes when the candidate reports a different version', async () => {
    vi.mocked(probeBinaryVersion).mockResolvedValue('0.118.0');
    await expect(downloadNikaBinary(storage)).rejects.toThrow('version mismatch');
    oldBinaryAndNoPartials();
  });

  it('cancellation during verification cannot replace the installed binary', async () => {
    vi.mocked(probeBinaryVersion).mockImplementation(async () => {
      state.cancelled = true;
      return MINIMUM_ENGINE_VERSION;
    });
    await expect(downloadNikaBinary(storage)).rejects.toBeInstanceOf(DownloadCancelled);
    oldBinaryAndNoPartials();
  });
});
