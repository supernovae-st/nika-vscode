import { describe, expect, it } from 'vitest';
import { findCommandOnPath } from '../core/pathLookup';

describe('findCommandOnPath', () => {
  const fsOf = (paths: string[]) => (c: string) => paths.includes(c);

  it('finds the command in any PATH dir (posix)', () => {
    expect(findCommandOnPath('nika', '/usr/bin:/opt/homebrew/bin', 'darwin', fsOf(['/opt/homebrew/bin/nika']))).toBe('/opt/homebrew/bin/nika');
  });

  it('misses when no dir carries it', () => {
    expect(findCommandOnPath('nika', '/usr/bin:/usr/local/bin', 'darwin', fsOf([]))).toBeUndefined();
  });

  it('empty or missing PATH is a miss, never a throw', () => {
    expect(findCommandOnPath('nika', undefined, 'darwin', fsOf(['/x/nika']))).toBeUndefined();
    expect(findCommandOnPath('nika', '', 'darwin', fsOf(['/x/nika']))).toBeUndefined();
  });

  it('windows: semicolon separator + executable extensions', () => {
    expect(findCommandOnPath('nika', 'C:\\bin;D:\\tools', 'win32', fsOf(['D:\\tools\\nika.exe']))).toBe('D:\\tools\\nika.exe');
  });
});
