// spawn.ts is the ONE process seam — vscode-free, so it gets tested against
// REAL children (node itself plays the binary). The stdin leg is the engine
// #190 wire: a dirty buffer pipes into `nika check - --json` without ever
// touching the disk.
import { existsSync, readFileSync } from 'node:fs';
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

// ─── runCliOnText — the ONE text-input routing (dash vs tmp fallback) ───────

function fakeRunner(stdinDash: boolean): TextRunner & {
  calls: Array<{ args: string[]; timeoutMs?: number; stdin?: string; tmpContent?: string }>;
} {
  const calls: Array<{ args: string[]; timeoutMs?: number; stdin?: string; tmpContent?: string }> = [];
  return {
    calls,
    caps: { stdinDash },
    runCli: vi.fn((args: string[], timeoutMs?: number, stdin?: string) => {
      // Snapshot the tmp file WHILE the child would be reading it — the
      // unlink in the finally must not race the assertion.
      const file = args[1];
      const tmpContent = file !== '-' && existsSync(file) ? readFileSync(file, 'utf-8') : undefined;
      calls.push({ args, timeoutMs, stdin, tmpContent });
      return Promise.resolve({ code: 0, stdout: '', stderr: '' });
    }),
  };
}

describe('runCliOnText', () => {
  it('pipes over the dash when the binary reads stdin — zero disk', async () => {
    const runner = fakeRunner(true);
    await runCliOnText(runner, (f) => ['check', f, '--json'], 'nika: v1\n', 20000, 'base');
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0].args).toEqual(['check', '-', '--json']);
    expect(runner.calls[0].stdin).toBe('nika: v1\n');
    expect(runner.calls[0].timeoutMs).toBe(20000);
  });

  it('falls back to a real tmp file on a pre-dash binary, then cleans up', async () => {
    const runner = fakeRunner(false);
    await runCliOnText(runner, (f) => ['check', f, '--json'], 'nika: v1\n', 20000, 'base');
    const call = runner.calls[0];
    expect(call.args[1]).toMatch(/nika-ext-base-.*\.nika\.yaml$/);
    expect(call.stdin).toBeUndefined();
    expect(call.tmpContent).toBe('nika: v1\n');
    // The unlink callback fires on the event loop — give it one macrotask.
    await new Promise((r) => setTimeout(r, 20));
    expect(existsSync(call.args[1])).toBe(false);
  });

  it('never shares a tmp path across concurrent calls', async () => {
    const runner = fakeRunner(false);
    await Promise.all([
      runCliOnText(runner, (f) => ['check', f, '--json'], 'a', 20000, 'doc'),
      runCliOnText(runner, (f) => ['check', f, '--json'], 'b', 20000, 'doc'),
    ]);
    expect(runner.calls[0].args[1]).not.toBe(runner.calls[1].args[1]);
  });
});
