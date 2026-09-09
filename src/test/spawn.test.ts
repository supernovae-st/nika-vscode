// spawn.ts is the ONE process seam — vscode-free, so it gets tested against
// REAL children (node itself plays the binary). The stdin leg is the engine
// #190 wire: a dirty buffer pipes into `nika check - --json` without ever
// touching the disk.
import { describe, expect, it, vi } from 'vitest';

import { runCliOnText, spawnCli, type TextRunner } from '../core/spawn';

const NODE = process.execPath;

describe('spawnCli (real children)', () => {
  it('captures stdout and exit 0 without stdin — the existing contract holds', async () => {
    const res = await spawnCli(NODE, ['-e', 'process.stdout.write("ok")'], 5000);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('ok');
  });

  it('surfaces a nonzero exit code as-is (check exit 2 = findings, not an error)', async () => {
    const res = await spawnCli(NODE, ['-e', 'process.stderr.write("finding"); process.exit(2)'], 5000);
    expect(res.code).toBe(2);
    expect(res.stderr).toBe('finding');
  });

  it('pipes stdin to the child and closes the stream — the dash wire', async () => {
    const echo = 'let d="";process.stdin.on("data",(c)=>d+=c).on("end",()=>process.stdout.write(d.toUpperCase()))';
    const res = await spawnCli(NODE, ['-e', echo], 5000, 'name: demo\n');
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('NAME: DEMO\n');
  });

  it('survives a child that exits without reading stdin (EPIPE guarded)', async () => {
    const res = await spawnCli(NODE, ['-e', 'process.exit(3)'], 5000, 'x'.repeat(1 << 20));
    expect(res.code).toBe(3);
  });
});

// Dirty buffers always use stdin on supported engines.

function fakeRunner(code = 0): TextRunner & {
  calls: Array<{ args: string[]; timeoutMs?: number; stdin?: string }>;
} {
  const calls: Array<{ args: string[]; timeoutMs?: number; stdin?: string }> = [];
  return {
    calls,
    runCli: vi.fn((args: string[], timeoutMs?: number, stdin?: string) => {
      calls.push({ args, timeoutMs, stdin });
      return Promise.resolve({ code, stdout: '', stderr: code ? 'original refusal' : '' });
    }),
  };
}

describe('runCliOnText', () => {
  it('pipes over the dash when the binary reads stdin — zero disk', async () => {
    const runner = fakeRunner();
    await runCliOnText(runner, (f) => ['check', f, '--json'], 'nika: t\n', 20000);
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0].args).toEqual(['check', '-', '--json']);
    expect(runner.calls[0].stdin).toBe('nika: t\n');
    expect(runner.calls[0].timeoutMs).toBe(20000);
  });

  it('a refused stdin operation never retries with a disk copy', async () => {
    const runner = fakeRunner(2);
    const result = await runCliOnText(runner, (f) => ['check', f, '--json'], 'private buffer', 20000);
    expect(result).toEqual({ code: 2, stdout: '', stderr: 'original refusal' });
    expect(runner.calls).toEqual([{ args: ['check', '-', '--json'], timeoutMs: 20000, stdin: 'private buffer' }]);
  });

  it('concurrent dirty buffers remain separate pipes', async () => {
    const runner = fakeRunner();
    await Promise.all([
      runCliOnText(runner, (f) => ['check', f, '--json'], 'a', 20000),
      runCliOnText(runner, (f) => ['check', f, '--json'], 'b', 20000),
    ]);
    expect(runner.calls.map((call) => call.stdin)).toEqual(['a', 'b']);
    expect(runner.calls.every((call) => call.args[1] === '-')).toBe(true);
  });
});
