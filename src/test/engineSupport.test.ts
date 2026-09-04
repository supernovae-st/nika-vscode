import { describe, expect, it } from 'vitest';
import { engineSupportError, parseBinaryVersion } from '../core/binaryVersion';

describe('engine support floor', () => {
  it.each(['0.116.2', '0.118.0', '0.117.99'])('refuses %s with the required update', (version) => {
    expect(engineSupportError(version)).toContain('0.118.1');
    expect(engineSupportError(version)).toContain(version);
  });
  it.each(['0.118.1', '0.118.1+build.7', '0.118.2', '0.119.0', '1.0.0'])('admits %s', (version) => {
    expect(engineSupportError(version)).toBeNull();
  });
  it.each([null, '', '0.118', '00.118.1', '0.118.01', '0.118.1garbage', '0.118.1-', '0.118.1+', '0.118.1-rc.01'])('refuses malformed %s', (version) => {
    expect(engineSupportError(version)).toMatch(/0\.118\.1/);
    expect(engineSupportError(version)).not.toBeNull();
  });
  it.each(['0.118.1-rc.1', '0.118.2-beta.1', '1.0.0-dev+local'])('does not treat prerelease %s as stable support', (version) => {
    expect(engineSupportError(version)).toMatch(/prerelease/);
  });
  it('reads the current banner and preserves the whole receipt identity', () => {
    expect(parseBinaryVersion('nika 0.118.1 (71397bf28)\n')).toBe('0.118.1');
    expect(parseBinaryVersion('nika 0.118.1-rc.1+build.7\n')).toBe('0.118.1-rc.1+build.7');
  });
  it.each(['something 0.118.1', 'nika 0.118.1junk', 'nika 0.118.1.4', 'nika 0.118.1 garbage', 'nika-cli 0.118.1',
    'unrelated banner\nnika 0.118.1', 'nika 0.118.1\nunrelated banner',
    'nika 0.118.1\nnika 0.116.2'])('does not extract a supported substring from %s', (banner) => {
    expect(parseBinaryVersion(banner)).toBeNull();
  });
});
