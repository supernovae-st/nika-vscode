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
import {
  SEMANTIC_DOCUMENT_FORMAT,
  SEMANTIC_DOCUMENT_METHOD,
  parseSemanticDocument,
  semanticDocumentFormat,
} from '../core/semanticDoc';
import { REAL_BIN as BIN, lspSession } from './lspHarness';

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
