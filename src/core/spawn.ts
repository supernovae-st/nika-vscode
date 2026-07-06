// spawn.ts — the ONE process seam (vscode-free · tested on real children).
//
// `stdin` turns the spawn into a pipe target: the dirty buffer flows
// straight into `nika check - --json` (engine #190) without touching the
// disk. Callers on pre-dash binaries never pass `stdin` — they stay on
// the tmp-file fallback in nikaService.

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EXIT } from './cliContract';

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function spawnCli(
  bin: string,
  args: string[],
  timeoutMs: number,
  stdin?: string,
): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      bin,
      args,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1' } },
      (error, stdout, stderr) => {
        let code = 0;
        if (error) {
          const ec = (error as NodeJS.ErrnoException & { code?: unknown }).code;
          code = typeof ec === 'number' ? ec : EXIT.ENV;
        }
        resolve({ code, stdout: stdout ?? '', stderr: stderr ?? '' });
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
  readonly caps: { readonly stdinDash: boolean };
  runCli(args: string[], timeoutMs?: number, stdin?: string): Promise<CliResult>;
}

let textSeq = 0;

/**
 * Run a CLI verb against TEXT — stdin dash (engine #190) when the binary
 * reads it, unique tmp copy as the pre-dash fallback. `args` receives the
 * file token to place wherever the verb expects it. The ONE tmp dance:
 * pid + seq means two concurrent calls never share a path (one would
 * unlink it mid-read).
 */
export async function runCliOnText(
  runner: TextRunner,
  args: (file: string) => string[],
  text: string,
  timeoutMs = 30000,
  tag = 'text',
): Promise<CliResult> {
  if (runner.caps.stdinDash) {
    return runner.runCli(args('-'), timeoutMs, text);
  }
  textSeq += 1;
  const tmp = path.join(os.tmpdir(), `nika-ext-${tag}-${process.pid}-${textSeq}.nika.yaml`);
  fs.writeFileSync(tmp, text, 'utf-8');
  try {
    return await runner.runCli(args(tmp), timeoutMs);
  } finally {
    fs.unlink(tmp, () => undefined);
  }
}
