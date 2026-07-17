// semanticDocReal.e2e.test.ts — the oracle over the REAL wire.
//
// Speaks raw JSON-RPC (Content-Length framing) to `nika lsp` exactly
// like vscode-languageclient does: initialize → didOpen →
// nika/semanticDocument. Proves BOTH floors honestly:
// - a server advertising graphFormat 2 answers with the canonical
//   projection our parser adopts (graph + spans);
// - a format-1 advertisement is REFUSED at the capability gate — the
//   client never adopts what it cannot speak (the isGraphDoc law over
//   the LSP seam).
// Self-skips without a binary (CI has none; locally NIKA_BIN wins).
// Spawn discipline: execFileSync/spawn argv-only — never a shell.

import { describe, it, expect } from 'vitest';
import { execFileSync, spawn } from 'child_process';
import * as fs from 'fs';
import {
  SEMANTIC_DOCUMENT_FORMAT,
  SEMANTIC_DOCUMENT_METHOD,
  parseSemanticDocument,
  semanticDocumentFormat,
} from '../core/semanticDoc';

const CELLAR = (() => {
  try {
    const base = '/opt/homebrew/Cellar/nika';
    const versions = fs.readdirSync(base).sort();
    return versions.length ? `${base}/${versions[versions.length - 1]}/bin/nika` : undefined;
  } catch { return undefined; }
})();

const BIN = [process.env.NIKA_BIN, CELLAR, 'nika']
  .filter((p): p is string => typeof p === 'string' && p.length > 0)
  .find((bin) => {
    try {
      execFileSync(bin, ['--version'], { timeout: 5000 });
      return true;
    } catch { return false; }
  });

// The refonte grammar (workflow object · tasks map · with: binding) —
// what a format-2 server projects. On a format-1 server the capability
// gate refuses BEFORE any grammar question, so one fixture serves both.
const DOC = [
  'nika: v1',
  'workflow:',
  '  id: oracle-probe',
  'model: mock/echo',
  'tasks:',
  '  fetch:',
  '    infer:',
  '      prompt: "hello"',
  '  brief:',
  '    with:',
  '      text: ${{ tasks.fetch.output }}',
  '    infer:',
  '      prompt: "summarize"',
  '',
].join('\n');

/** Minimal JSON-RPC stdio client — framing per the LSP base protocol. */
function lspSession(bin: string): {
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

describe.skipIf(!BIN)('nika/semanticDocument × the real server', () => {
  it('the advertised format decides adoption — a format-2 answer carries graph + spans', async () => {
    const session = lspSession(BIN!);
    try {
      const init = await session.request('initialize', {
        processId: null,
        rootUri: null,
        capabilities: {},
      });
      const caps = (init as { capabilities?: unknown } | undefined)?.capabilities;
      const fmt = semanticDocumentFormat(caps);
      // Every engine since 0.102 advertises the oracle — absent means
      // a pre-oracle binary; nothing further to prove against it.
      if (fmt === undefined) { return; }
      session.notify('initialized', {});

      const uri = 'file:///probe/oracle.nika.yaml';
      session.notify('textDocument/didOpen', {
        textDocument: { uri, languageId: 'nika', version: 1, text: DOC },
      });
      const raw = await session.request(SEMANTIC_DOCUMENT_METHOD, { uri });
      const payload = parseSemanticDocument(raw);
      expect(payload).toBeDefined();

      if (fmt !== SEMANTIC_DOCUMENT_FORMAT) {
        // The honesty leg: a format we do not speak NEVER yields a
        // graph through our parser — the extension stays on the CLI
        // lane against this server.
        expect(payload?.graph).toBeUndefined();
        return;
      }
      // The adoption leg: canonical projection + spans, one payload.
      expect(payload?.graph?.graph_format).toBe(2);
      expect(payload?.graph?.workflow).toBe('oracle-probe');
      const ids = payload?.graph?.nodes.map((n) => n.id).sort();
      expect(ids).toEqual(['brief', 'fetch']);
      expect(payload?.graph?.edges.some((e) => e.kind === 'value' && e.binding === 'text')).toBe(true);
      expect(Object.keys(payload?.spans ?? {}).sort()).toEqual(['brief', 'fetch']);
      expect(payload?.spans.fetch?.start.line).toBeGreaterThan(0);
    } finally {
      session.close();
    }
  }, 20000);
});
