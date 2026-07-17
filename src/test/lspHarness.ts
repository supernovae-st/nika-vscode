// lspHarness.ts — shared REAL-binary test plumbing (test-only).
//
// One home for: the binary resolution ladder every *Real.e2e suite
// uses (NIKA_BIN → newest Cellar → PATH), the GENERATION CANARY, and
// a minimal JSON-RPC stdio client for `nika lsp`.
//
// The canary is the floor-honesty law (D-V8): extension main speaks
// the refonte grammar (`workflow:` object · `tasks:` map) — a shipped
// gen-0 binary rejects it at parse (NIKA-PARSE-019). A suite asserting
// gen-1 semantics against a gen-0 binary is not red, it is OFF-FLOOR:
// it must skip WITH ITS REASON, and run for real against a binary that
// speaks the grammar (locally: NIKA_BIN=<refonte build>).
// Spawn discipline: execFileSync/spawn argv-only — never a shell.

import { execFileSync, spawn } from 'child_process';
import * as fs from 'fs';

export const REAL_BIN: string | undefined = [
  process.env.NIKA_BIN,
  (() => {
    try {
      const base = '/opt/homebrew/Cellar/nika';
      const versions = fs.readdirSync(base).sort();
      return versions.length ? `${base}/${versions[versions.length - 1]}/bin/nika` : undefined;
    } catch { return undefined; }
  })(),
  'nika',
]
  .filter((p): p is string => typeof p === 'string' && p.length > 0)
  .find((bin) => {
    try {
      execFileSync(bin, ['--version'], { timeout: 5000 });
      return true;
    } catch { return false; }
  });

/** The smallest gen-1 document — map-form workflow, tasks map. */
const CANARY_DOC = [
  'nika: v1',
  'workflow:',
  '  id: canary',
  'model: mock/echo',
  'tasks:',
  '  probe:',
  '    infer:',
  '      prompt: "hi"',
  '',
].join('\n');

const canaryCache = new Map<string, boolean>();

/** Does this binary PARSE the refonte grammar? (`check -` on the
 *  canary; findings are fine — a parse_fatal envelope refusal is not.) */
export function speaksGen1(bin: string): boolean {
  const hit = canaryCache.get(bin);
  if (hit !== undefined) { return hit; }
  let ok = false;
  try {
    const out = execFileSync(bin, ['check', '-', '--json', '--color', 'never'], {
      input: CANARY_DOC,
      timeout: 20000,
      encoding: 'utf8',
    });
    ok = !JSON.parse(out).parse_fatal;
  } catch (error) {
    // Non-zero exit still prints the report — read it before giving up.
    const stdout = (error as { stdout?: unknown }).stdout;
    if (typeof stdout === 'string' && stdout.length > 0) {
      try { ok = !JSON.parse(stdout).parse_fatal; } catch { ok = false; }
    }
  }
  canaryCache.set(bin, ok);
  return ok;
}

/** The one skip condition for gen-1 suites — carries its own reason. */
export function gen1Floor(): { bin: string | undefined; off: boolean; reason: string } {
  if (!REAL_BIN) {
    return { bin: undefined, off: true, reason: 'no nika binary on this machine' };
  }
  if (!speaksGen1(REAL_BIN)) {
    return {
      bin: REAL_BIN,
      off: true,
      reason: `${REAL_BIN} is a pre-refonte engine (gen-0 grammar) — set NIKA_BIN to a refonte build`,
    };
  }
  return { bin: REAL_BIN, off: false, reason: '' };
}

/** Minimal JSON-RPC stdio client — framing per the LSP base protocol. */
export function lspSession(bin: string): {
  request: (method: string, params: unknown) => Promise<unknown>;
  notify: (method: string, params: unknown) => void;
  close: () => void;
} {
  const child = spawn(bin, ['lsp'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const pending = new Map<number, (value: unknown) => void>();
  let nextId = 1;
  let buffer = Buffer.alloc(0);

  child.stdout.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) { return; }
      const header = buffer.subarray(0, headerEnd).toString('utf8');
      const match = /Content-Length: (\d+)/i.exec(header);
      if (!match) { buffer = buffer.subarray(headerEnd + 4); continue; }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + length) { return; }
      const body = buffer.subarray(bodyStart, bodyStart + length).toString('utf8');
      buffer = buffer.subarray(bodyStart + length);
      try {
        const message = JSON.parse(body) as { id?: number; result?: unknown };
        if (typeof message.id === 'number') {
          pending.get(message.id)?.(message.result);
          pending.delete(message.id);
        }
      } catch { /* notifications and parse noise are not ours to judge */ }
    }
  });

  const send = (payload: object): void => {
    const body = JSON.stringify(payload);
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  };

  return {
    request: (method, params) => new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`LSP request timed out: ${method}`));
      }, 10000);
      pending.set(id, (value) => { clearTimeout(timer); resolve(value); });
      send({ jsonrpc: '2.0', id, method, params });
    }),
    notify: (method, params) => send({ jsonrpc: '2.0', method, params }),
    close: () => { child.kill(); },
  };
}
