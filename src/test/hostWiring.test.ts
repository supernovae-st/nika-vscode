import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { wireHostOnce, type HostWiringRequest } from '../core/hostWiring';

const request: HostWiringRequest = {
  target: 'cursor', directory: '/project', mcp: true, wire: true,
  binaryPath: '/download/nika', nikaOnPath: true,
};

function effects(code = 0, stderr = '', stdout = '') {
  return {
    runCli: vi.fn(async () => ({ code, stdout, stderr })),
    machineAbsolute: vi.fn(async (_target: 'cursor' | 'windsurf', _binary: string) => ({ state: 'wired' as const })),
  };
}

describe('one host wiring attempt', () => {
  it.each(['cursor', 'vscode', 'windsurf'] as const)('preserves %s refusal with zero alternate writes', async (target) => {
    const refusal = 'NIKA: refusing to overwrite malformed config\n';
    const io = effects(2, refusal);
    expect(await wireHostOnce({ ...request, target }, io)).toEqual({ kind: 'failed', detail: refusal });
    expect(io.runCli).toHaveBeenCalledExactlyOnceWith(['wire', target, '--dir', '/project'], 30000);
    expect(io.machineAbsolute).not.toHaveBeenCalled();
  });

  it('keeps a stdout-only refusal and does not retry a thrown transport failure', async () => {
    const io = effects(1, '', 'original refusal');
    expect(await wireHostOnce(request, io)).toEqual({ kind: 'failed', detail: 'original refusal' });
    io.runCli.mockRejectedValueOnce(new Error('transport failed'));
    await expect(wireHostOnce(request, io)).rejects.toThrow('transport failed');
    expect(io.machineAbsolute).not.toHaveBeenCalled();
  });

  it('successful canonical wiring never runs a second writer', async () => {
    const io = effects();
    expect(await wireHostOnce(request, io)).toEqual({ kind: 'wired', via: 'engine' });
    expect(io.runCli).toHaveBeenCalledTimes(1);
    expect(io.machineAbsolute).not.toHaveBeenCalled();
  });

  it.each([{ wire: false }, { mcp: false }, { directory: undefined }])('missing capability/context writes nothing: %j', async (missing) => {
    const io = effects();
    expect((await wireHostOnce({ ...request, ...missing }, io)).kind).toBe('unsupported');
    expect(io.runCli).not.toHaveBeenCalled();
    expect(io.machineAbsolute).not.toHaveBeenCalled();
  });

  it.each([true, false])('selects the download-only Cursor operation before any engine attempt (wire=%s)', async (wire) => {
    const io = effects(2, 'must never execute');
    expect(await wireHostOnce({ ...request, wire, nikaOnPath: false }, io))
      .toEqual({ kind: 'wired', via: 'host-absolute' });
    expect(io.runCli).not.toHaveBeenCalled();
    expect(io.machineAbsolute).toHaveBeenCalledExactlyOnceWith('cursor', '/download/nika');
  });

  it.each(['refused-malformed', 'skipped'] as const)('a refused download-only operation never reports wired or retries: %s', async (state) => {
    const io = { ...effects(), machineAbsolute: vi.fn(async () => ({ state, file: '/home/.cursor/mcp.json' })) };
    expect((await wireHostOnce({ ...request, nikaOnPath: false }, io)).kind).toBe('failed');
    expect(io.runCli).not.toHaveBeenCalled();
    expect(io.machineAbsolute).toHaveBeenCalledTimes(1);
  });

  it('preserves Windsurf machine-scoped downloaded-binary setup without a second writer', async () => {
    const io = effects();
    expect(await wireHostOnce({ ...request, target: 'windsurf', nikaOnPath: false }, io))
      .toEqual({ kind: 'wired', via: 'host-absolute' });
    expect(io.machineAbsolute).toHaveBeenCalledExactlyOnceWith('windsurf', '/download/nika');
    expect(io.runCli).not.toHaveBeenCalled();
  });

  it('a relative binary name is never written as the download-only absolute path', async () => {
    const io = effects();
    expect((await wireHostOnce({ ...request, wire: false, nikaOnPath: false, binaryPath: 'nika' }, io)).kind)
      .toBe('unsupported');
    expect(io.machineAbsolute).not.toHaveBeenCalled();
  });

  it('the extension routes setup and project setup through the shared operation', () => {
    const source = readFileSync(new URL('../extension.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('configureMcpForHost');
    expect(source).not.toContain('ensureCursorMcpConfig');
    expect(source.match(/await wireHostOnce\(/g)).toHaveLength(1);
    for (const command of ['nika.setupMcp', 'nika.initProject']) {
      const start = source.indexOf(`commands.registerCommand('${command}'`);
      const end = source.indexOf('\n  );', start);
      expect(source.slice(start, end)).toContain('await equipHost(true)');
    }
  });
});
