import * as fs from 'fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTraceFile, TraceReadError } from '../core/traceFile';
import { TRACE_MAX_BYTES } from '../core/traceLimits';

vi.mock('fs', async (original) => {
  const actual = await original<typeof import('fs')>();
  return { ...actual, statSync: vi.fn(actual.statSync), fstatSync: vi.fn(actual.fstatSync),
    readSync: vi.fn(actual.readSync), openSync: vi.fn(actual.openSync), closeSync: vi.fn(actual.closeSync) };
});

let dir: string;
let file: string;
beforeEach(() => {
  vi.clearAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nika-trace-read-'));
  file = path.join(dir, 'run.ndjson');
  fs.writeFileSync(file, '');
});
afterEach(() => { fs.rmSync(dir, { recursive: true }); });

function advertised(stat: fs.Stats, size: number, regular = true): fs.Stats {
  return { ...stat, size, isFile: () => regular } as fs.Stats;
}

describe('bounded recorded journal reads', () => {
  it.each([0, -1, 1.5, NaN, Infinity, TRACE_MAX_BYTES + 1])('rejects invalid budgets before I/O: %s', (limit) => {
    expect(() => readTraceFile(file, limit)).toThrow(RangeError);
    expect(fs.statSync).not.toHaveBeenCalled();
    expect(fs.openSync).not.toHaveBeenCalled();
  });
  it('accepts an empty file and closes the descriptor', () => {
    expect(readTraceFile(file)).toBe('');
    expect(fs.closeSync).toHaveBeenCalledTimes(1);
  });
  it('counts encoded bytes, accepts the exact budget, and rejects one byte over it', () => {
    const text = '蝶\n';
    fs.writeFileSync(file, text);
    expect(readTraceFile(file, 4)).toBe(text);
    vi.clearAllMocks();
    expect(() => readTraceFile(file, 3)).toThrow(TraceReadError);
    expect(fs.readSync).not.toHaveBeenCalled();
    expect(fs.openSync).not.toHaveBeenCalled();
  });
  it('rejects a sparse oversized journal before payload allocation or opening', () => {
    fs.truncateSync(file, TRACE_MAX_BYTES + 1);
    const allocate = vi.spyOn(Buffer, 'allocUnsafe');
    try {
      expect(() => readTraceFile(file)).toThrow(/16 MiB/);
      expect(allocate).not.toHaveBeenCalled();
      expect(fs.openSync).not.toHaveBeenCalled();
      expect(fs.readSync).not.toHaveBeenCalled();
    } finally { allocate.mockRestore(); }
  });
  it.each(['oversized', 'non-regular'])('rechecks the opened descriptor after a path race: %s', (kind) => {
    const stat = fs.statSync(file);
    vi.mocked(fs.fstatSync).mockReturnValueOnce(advertised(stat, kind === 'oversized' ? TRACE_MAX_BYTES + 1 : 0, kind !== 'non-regular'));
    const allocate = vi.spyOn(Buffer, 'allocUnsafe');
    try {
      expect(() => readTraceFile(file)).toThrow(TraceReadError);
      expect(allocate).not.toHaveBeenCalled();
      expect(fs.readSync).not.toHaveBeenCalled();
      expect(fs.closeSync).toHaveBeenCalledTimes(1);
    } finally { allocate.mockRestore(); }
  });
  it('refuses a non-regular path before open', () => {
    expect(() => readTraceFile(dir)).toThrow(/not a regular file/);
    expect(fs.openSync).not.toHaveBeenCalled();
  });
  it('counts appends after both size checks and never returns their valid-looking prefix', () => {
    fs.writeFileSync(file, '{"kind":"workflow_completed"}\n' + 'x'.repeat(100));
    const stat = fs.statSync(file);
    vi.mocked(fs.statSync).mockReturnValueOnce(advertised(stat, 0));
    vi.mocked(fs.fstatSync).mockReturnValueOnce(advertised(stat, 0));
    expect(() => readTraceFile(file, 40)).toThrow(TraceReadError);
    expect(fs.readSync).toHaveBeenCalledTimes(2);
    expect(fs.closeSync).toHaveBeenCalledTimes(1);
  });
  it('grows geometrically for an admitted append, preserving UTF-8 across buffer boundaries', () => {
    const text = '蝶'.repeat(50_000);
    fs.writeFileSync(file, text);
    const stat = fs.statSync(file);
    vi.mocked(fs.statSync).mockReturnValueOnce(advertised(stat, 0));
    vi.mocked(fs.fstatSync).mockReturnValueOnce(advertised(stat, 0));
    const allocate = vi.spyOn(Buffer, 'allocUnsafe');
    try {
      expect(readTraceFile(file, 150_000)).toBe(text);
      expect(allocate.mock.calls.map(([size]) => size)).toEqual([65536, 1, 131072, 1, 150000, 1]);
      expect(fs.closeSync).toHaveBeenCalledTimes(1);
    } finally { allocate.mockRestore(); }
  });
  it('closes the descriptor after a read failure, without returning a prefix', () => {
    vi.mocked(fs.readSync).mockImplementationOnce(() => { throw new Error('disk unavailable'); });
    expect(() => readTraceFile(file)).toThrow('disk unavailable');
    expect(fs.closeSync).toHaveBeenCalledTimes(1);
  });
  it('closes the descriptor when its admission stat fails', () => {
    vi.mocked(fs.fstatSync).mockImplementationOnce(() => { throw new Error('descriptor unavailable'); });
    expect(() => readTraceFile(file)).toThrow('descriptor unavailable');
    expect(fs.readSync).not.toHaveBeenCalled();
    expect(fs.closeSync).toHaveBeenCalledTimes(1);
  });
  it('handles one-byte short reads without dropping a multibyte character', async () => {
    const native = await vi.importActual<typeof import('fs')>('fs');
    const text = '蝶\n'.repeat(50);
    fs.writeFileSync(file, text);
    vi.mocked(fs.readSync).mockImplementation(((fd: number, buffer: NodeJS.ArrayBufferView,
      offset: number, length: number, position: number | null) =>
      native.readSync(fd, buffer, offset, Math.min(length, 1), position)) as typeof fs.readSync);
    try {
      expect(readTraceFile(file, Buffer.byteLength(text))).toBe(text);
      expect(fs.readSync).toHaveBeenCalledTimes(Buffer.byteLength(text) + 1);
      expect(fs.closeSync).toHaveBeenCalledTimes(1);
    } finally { vi.mocked(fs.readSync).mockImplementation(native.readSync); }
  });
});
