import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable, PassThrough } from 'node:stream';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as https from 'https';
import type { IncomingMessage } from 'node:http';
import type { CancellationToken } from 'vscode';

vi.mock('vscode', () => ({ window: {}, ProgressLocation: {} }));
vi.mock('https', () => ({ get: vi.fn() }));
import { downloadToFile, DownloadCancelled } from '../binaryInstaller';

let directory: string;
let destination: string;
let response: IncomingMessage;
let request: EventEmitter & { destroy: ReturnType<typeof vi.fn> };
let cancelled: boolean;
let cancelListener: (() => void) | undefined;
let dispose: ReturnType<typeof vi.fn>;
let token: CancellationToken;

function body(contents?: string): IncomingMessage {
  const stream = contents === undefined ? new PassThrough() : Readable.from([Buffer.from(contents)]);
  return Object.assign(stream, { statusCode: 200, headers: {} }) as IncomingMessage;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'nika-download-test-'));
  destination = join(directory, 'archive.tar.gz');
  response = body('complete archive');
  cancelled = false;
  cancelListener = undefined;
  dispose = vi.fn(() => { cancelListener = undefined; });
  token = {
    get isCancellationRequested() { return cancelled; },
    onCancellationRequested: (listener: () => void) => { cancelListener = listener; return { dispose }; },
  };
  request = Object.assign(new EventEmitter(), {
    destroy: vi.fn((error?: Error) => {
      if (error) request.emit('error', error);
      response.destroy();
      return request;
    }),
  });
  vi.mocked(https.get).mockImplementation((_url: unknown, options: unknown, callback: unknown) => {
    const signal = (options as { signal?: AbortSignal }).signal;
    signal?.addEventListener('abort', () => request.destroy(new Error('request aborted')), { once: true });
    queueMicrotask(() => (callback as (res: IncomingMessage) => void)(response));
    return request as unknown as ReturnType<typeof https.get>;
  });
});

afterEach(() => {
  response.destroy();
  vi.useRealTimers();
  vi.resetAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

describe('owned archive transfer', () => {
  it('writes exact bytes and disposes cancellation on success', async () => {
    await downloadToFile('https://example.test/archive', destination, token);
    expect(readFileSync(destination, 'utf8')).toBe('complete archive');
    expect(dispose).toHaveBeenCalledOnce();
    expect(cancelListener).toBeUndefined();
  });

  it('refuses an already-cancelled transfer without a file or request', async () => {
    cancelled = true;
    await expect(downloadToFile('https://example.test/archive', destination, token)).rejects.toBeInstanceOf(DownloadCancelled);
    expect(https.get).not.toHaveBeenCalled();
    expect(existsSync(destination)).toBe(false);
  });

  it('reports file-open failure through the promise', async () => {
    await expect(downloadToFile('https://example.test/archive', join(directory, 'absent', 'archive'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(response.destroyed).toBe(true);
  });

  it('never truncates or removes a pre-existing destination', async () => {
    writeFileSync(destination, 'another transfer owns this');
    await expect(downloadToFile('https://example.test/archive', destination, token)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(readFileSync(destination, 'utf8')).toBe('another transfer owns this');
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('rejects HTTP errors without leaving a partial file', async () => {
    response.statusCode = 503;
    await expect(downloadToFile('https://example.test/archive', destination, token)).rejects.toThrow('HTTP 503');
    expect(existsSync(destination)).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('rejects a response failure and awaits partial-file cleanup', async () => {
    response = body();
    const transfer = downloadToFile('https://example.test/archive', destination, token);
    const failure = expect(transfer).rejects.toThrow('broken response');
    await vi.waitFor(() => expect(existsSync(destination)).toBe(true));
    response.destroy(new Error('broken response'));
    await failure;
    expect(existsSync(destination)).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('cancels a stalled body, destroys its request and removes only its own partial', async () => {
    response = body();
    const transfer = downloadToFile('https://example.test/archive', destination, token);
    const failure = expect(transfer).rejects.toBeInstanceOf(DownloadCancelled);
    await vi.waitFor(() => expect(existsSync(destination)).toBe(true));
    cancelled = true;
    cancelListener?.();
    await failure;
    expect(request.destroy).toHaveBeenCalled();
    expect(response.destroyed).toBe(true);
    expect(existsSync(destination)).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('refuses an HTTPS downgrade without creating the destination', async () => {
    response.statusCode = 302;
    response.headers.location = 'http://example.test/archive';
    await expect(downloadToFile('https://example.test/archive', destination, token)).rejects.toThrow('non-https');
    expect(https.get).toHaveBeenCalledOnce();
    expect(existsSync(destination)).toBe(false);
  });

  it('bounds stalled headers and disposes the cancellation subscription', async () => {
    vi.useFakeTimers();
    vi.mocked(https.get).mockImplementation((_url: unknown, options: unknown) => {
      const signal = (options as { signal: AbortSignal }).signal;
      signal.addEventListener('abort', () => request.destroy(new Error('request aborted')), { once: true });
      return request as unknown as ReturnType<typeof https.get>;
    });
    const failure = expect(downloadToFile('https://example.test/archive', destination, token)).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(180_000);
    await failure;
    expect(request.destroy).toHaveBeenCalledOnce();
    expect(existsSync(destination)).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('preserves synchronous request errors as promise rejections', async () => {
    vi.mocked(https.get).mockImplementation(() => { throw new Error('malformed URL'); });
    await expect(downloadToFile('https://[invalid', destination, token)).rejects.toThrow('malformed URL');
    expect(existsSync(destination)).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
  });
});
