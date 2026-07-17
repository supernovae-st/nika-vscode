// islandsReal.e2e.test.ts — the shared knowledge register is BELT-CHECKED.
//
// The gate/collection doors keep curated shapes as their offline
// fallback; the server serves islands at the empty when:/for_each:
// value. Two dialects of ONE register — this belt proves the client
// never invents vocabulary the engine does not speak: every LOCAL name
// the client's shapes read (vars.* · with.*) must appear among the
// server's island completions. Extra server items are the engine
// evolving — logged, never red (the client follows through this belt
// going red the day a client name goes missing).
//
// Gen-1 floored (the doc must PARSE server-side for islands to see
// declarations) — skips with reason on gen-0 binaries.

import { describe, it, expect } from 'vitest';
import { gen1Floor, lspSession } from './lspHarness';
import { gateShapes } from '../core/flowEdit';

const FLOOR = gen1Floor();

const DOC = [
  'nika: v1',
  'workflow:',
  '  id: islands-probe',
  'model: mock/echo',
  'vars:',
  '  publish: true',
  'tasks:',
  '  gather:',
  '    infer:',
  '      prompt: "hi"',
  '  brief:',
  '    with:',
  '      text: ${{ tasks.gather.output }}',
  '    when: ',
  '    infer:',
  '      prompt: "go"',
  '',
].join('\n');

// The empty when: value position (line index of `    when: `, after the space).
const WHEN_LINE = DOC.split('\n').findIndex((l) => /^\s*when: $/.test(l));

interface CompletionItemWire { label?: unknown; insertText?: unknown }

function itemTexts(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw
    : (raw as { items?: unknown[] } | undefined)?.items ?? [];
  return (items as CompletionItemWire[]).map((i) =>
    `${typeof i.label === 'string' ? i.label : ''} ${typeof i.insertText === 'string' ? i.insertText : ''}`);
}

describe.skipIf(FLOOR.off)('door shapes × server islands (one register, two dialects)', () => {
  it('every LOCAL name the client shapes read appears in the server islands', async () => {
    const session = lspSession(FLOOR.bin!);
    try {
      await session.request('initialize', { processId: null, rootUri: null, capabilities: {} });
      session.notify('initialized', {});
      const uri = 'file:///probe/islands.nika.yaml';
      session.notify('textDocument/didOpen', {
        textDocument: { uri, languageId: 'nika', version: 1, text: DOC },
      });
      const raw = await session.request('textDocument/completion', {
        textDocument: { uri },
        position: { line: WHEN_LINE, character: DOC.split('\n')[WHEN_LINE].length },
      });
      const server = itemTexts(raw);
      expect(server.length).toBeGreaterThan(0);

      // The client's KNOWLEDGE candidates for this doc: local reads only
      // (when-kind shapes) — vars.publish · with.text. Gesture shapes
      // (after: · the hoist) are editor-side forever, not belt-checked.
      const knowledge = gateShapes(['publish'], ['text'], [])
        .filter((s) => s.action.kind === 'when')
        .map((s) => (s.action as { expr: string }).expr);
      const names = [...new Set(knowledge.flatMap((e) => e.match(/(?:vars|with)\.\w+/g) ?? []))];
      expect(names.sort()).toEqual(['vars.publish', 'with.text']);

      const joined = server.join('\n');
      for (const name of names) {
        expect(joined, `server islands must speak ${name} (client register would be inventing it otherwise)`).toContain(name);
      }
    } finally {
      session.close();
    }
  }, 20000);
});
