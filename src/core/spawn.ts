// spawn.ts — the ONE process seam (vscode-free · tested on real children).
//
// `stdin` turns the spawn into a pipe target: the dirty buffer flows
// straight into `nika check - --json` (engine #190) without touching the
// disk. All supported engines accept this input transport.

import { execFile } from 'child_process';
import { EXIT } from './cliContract';

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
  /** The spawn-layer errno when the process never really ran (ENOENT ·
   *  EACCES · a timeout kill) — the caller's story must name it instead
   *  of painting an empty tab. Absent on a real exit code. */
  err?: string;
}

export function spawnCli(
  bin: string,
  args: string[],
  timeoutMs: number,
  stdin?: string,
  cwd?: string,
): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      bin,
      args,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, cwd, env: { ...process.env, NO_COLOR: '1' } },
      (error, stdout, stderr) => {
        let code = 0;
        let err: string | undefined;
        if (error) {
          const e = error as NodeJS.ErrnoException & { code?: unknown; killed?: boolean };
          code = typeof e.code === 'number' ? e.code : EXIT.ENV;
          if (typeof e.code === 'string') { err = e.code; }
          else if (e.killed) { err = 'timeout'; }
        }
        resolve({ code, stdout: stdout ?? '', stderr: stderr ?? '', ...(err ? { err } : {}) });
      },
    );
    if (stdin !== undefined && child.stdin) {
      // A child that exits without draining the pipe (bad args · crash)
      // raises EPIPE on the stream — swallow it; the exit code carries
      // the real story to the caller.
      child.stdin.on('error', () => undefined);
      child.stdin.end(stdin);
    }
  });
}

/** The slice of NikaService the text leg needs (keeps consumers testable). */
export interface TextRunner {
  runCli(args: string[], timeoutMs?: number, stdin?: string): Promise<CliResult>;
}

/**
 * Run a CLI verb against text over stdin. A refusal is final; no copy of
 * an unsaved buffer is written to disk. `args` receives the stdin token.
 */
export async function runCliOnText(
  runner: TextRunner,
  args: (file: string) => string[],
  text: string,
  timeoutMs = 30000,
): Promise<CliResult> {
  return runner.runCli(args('-'), timeoutMs, text);
}
