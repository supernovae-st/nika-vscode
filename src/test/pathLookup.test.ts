import { describe, expect, it } from 'vitest';
import { commandOnPath } from '../core/pathLookup';

describe('commandOnPath', () => {
  const fsOf = (paths: string[]) => (c: string) => paths.includes(c);

  it('finds the command in any PATH dir (posix)', () => {
    expect(commandOnPath('nika', '/usr/bin:/opt/homebrew/bin', 'darwin', fsOf(['/opt/homebrew/bin/nika']))).toBe(true);
  });

  it('misses when no dir carries it', () => {
    expect(commandOnPath('nika', '/usr/bin:/usr/local/bin', 'darwin', fsOf([]))).toBe(false);
  });

  it('empty or missing PATH is a miss, never a throw', () => {
    expect(commandOnPath('nika', undefined, 'darwin', fsOf(['/x/nika']))).toBe(false);
    expect(commandOnPath('nika', '', 'darwin', fsOf(['/x/nika']))).toBe(false);
  });

  it('windows: semicolon separator + executable extensions', () => {
    expect(commandOnPath('nika', 'C:\\bin;D:\\tools', 'win32', fsOf(['D:\\tools\\nika.exe']))).toBe(true);
  });
});
