import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as https from 'https';

vi.mock('vscode', () => ({
  ProgressLocation: { Notification: 1 },
  window: {
    withProgress: (_options: unknown, action: (progress: unknown, token: unknown) => unknown) =>
      action({ report: vi.fn() }, { isCancellationRequested: false }),
  },
}));
vi.mock('https', () => ({ get: vi.fn() }));
import { downloadNikaBinary, findLocalBinary } from '../binaryInstaller';

let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nika-discovery-test-'));
  vi.stubEnv('PATH', directory);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});
const executableName = process.platform === 'win32' ? 'nika.exe' : 'nika';
function file(name: string): string {
  const target = path.join(directory, name);
  fs.writeFileSync(target, 'unverified candidate', { mode: 0o755 });
  return fs.realpathSync(target);
}

describe('select one local binary without replacing unsupported candidates', () => {
  it('preserves explicit selection even if missing, with all other sources present', () => {
    file(executableName);
    const cache = file('cached');
    const bundled = file('bundled');
    expect(findLocalBinary('/explicit/missing', bundled, cache)).toBe('/explicit/missing');
  });
  it('selects the bundled binary ahead of PATH and cache without deleting it', () => {
    file(executableName);
    const bundled = file('bundled');
    expect(findLocalBinary('nika', bundled, file('cached'))).toBe(bundled);
    expect(fs.readFileSync(bundled, 'utf8')).toBe('unverified candidate');
  });
  it('selects current PATH name ahead of cache', () => {
    const selected = file(executableName);
    expect(findLocalBinary('nika', undefined, file('cached'))).toBe(selected);
  });
  it('freezes an explicitly named PATH selection to its resolved executable', () => {
    const selected = file(process.platform === 'win32' ? 'custom-nika.exe' : 'custom-nika');
    expect(findLocalBinary('custom-nika', undefined, file('cached'))).toBe(selected);
  });
  it('retains a cached candidate for admission rather than deleting or downloading over it', () => {
    const cache = file('cached');
    expect(findLocalBinary('nika', undefined, cache)).toBe(cache);
    expect(fs.readFileSync(cache, 'utf8')).toBe('unverified candidate');
  });
  it('keeps the selected absolute path when later PATH lookup would choose another file', () => {
    const first = file(executableName);
    const selected = findLocalBinary('nika', undefined, path.join(directory, 'missing'));
    const later = path.join(directory, 'later');
    fs.mkdirSync(later);
    fs.writeFileSync(path.join(later, executableName), 'other engine', { mode: 0o755 });
    vi.stubEnv('PATH', later);
    expect(selected).toBe(first);
    expect(fs.readFileSync(selected!, 'utf8')).toBe('unverified candidate');
    expect(findLocalBinary('nika', undefined, path.join(directory, 'missing'))).not.toBe(selected);
  });
  it('never discovers the retired PATH name, but preserves an explicitly selected executable', () => {
    const retired = file(process.platform === 'win32' ? 'nika-cli.exe' : 'nika-cli');
    expect(findLocalBinary('nika', undefined, path.join(directory, 'absent'))).toBeUndefined();
    expect(findLocalBinary(retired, undefined, path.join(directory, 'absent'))).toBe(retired);
  });
});

describe.skipIf(process.platform === 'win32')('download support admission', () => {
  it.each(['0.116.2', '0.118.0', '0.118.1-rc.1', 'malformed'])('refuses public release %s before artifact download or storage writes', async (version) => {
    vi.mocked(https.get).mockImplementation((_url: unknown, _options: unknown, callback: unknown) => {
      (callback as (response: unknown) => void)({ headers: { location: `https://github.com/supernovae-st/nika/releases/tag/v${version}` }, resume: vi.fn() });
      return { on: vi.fn() } as unknown as ReturnType<typeof https.get>;
    });
    // A malformed tag may require API resolution; give that response a
    // numeric-leading malformed version so refusal remains deterministic.
    if (version === 'malformed') {
      vi.mocked(https.get).mockImplementation((_url: unknown, _options: unknown, callback: unknown) => {
        (callback as (response: unknown) => void)({ headers: { location: 'https://github.com/supernovae-st/nika/releases/tag/v0.118' }, resume: vi.fn() });
        return { on: vi.fn() } as unknown as ReturnType<typeof https.get>;
      });
    }
    const storage = path.join(directory, 'storage');
    await expect(downloadNikaBinary(storage)).rejects.toThrow('0.118.1');
    expect(https.get).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(storage)).toBe(false);
    expect(fs.readdirSync(directory)).toEqual([]);
  });
});
