// semanticDoc.test.ts — the `nika/semanticDocument` adoption contract.
//
// The server advertises the oracle in its experimental capability block
// (`nika.semanticDocument.graphFormat`) and answers a bare
// TextDocumentIdentifier with `{ graph, reason?, spans }`. The client
// adopts ONLY the format it speaks (2) — a format-1 server keeps the
// CLI/client lanes, exactly like `isGraphDoc` refuses format-1 JSON.

import { describe, it, expect } from 'vitest';
import {
  semanticDocumentFormat,
  parseSemanticDocument,
  SEMANTIC_DOCUMENT_METHOD,
} from '../core/semanticDoc';

const GRAPH2 = {
  graph_format: 2,
  workflow: 'w',
  nodes: [
    { id: 'a', verb: 'exec', when: null, fan_out: null, permits: [], cost_interval: null },
    { id: 'b', verb: 'infer', when: null, fan_out: null, permits: [], cost_interval: null },
  ],
  edges: [{ from: 'a', to: 'b', kind: 'value', binding: 'text' }],
};

const SPAN = {
  start: { line: 4, character: 2 },
  end: { line: 4, character: 3 },
};

describe('semanticDocumentFormat — capability discovery, never blind probing', () => {
  it('reads the advertised graphFormat from the experimental block', () => {
    const caps = { experimental: { nika: { semanticDocument: { graphFormat: 2 } } } };
    expect(semanticDocumentFormat(caps)).toBe(2);
  });

  it('a format-1 server is discovered as 1 — the caller refuses it', () => {
    const caps = { experimental: { nika: { semanticDocument: { graphFormat: 1 } } } };
    expect(semanticDocumentFormat(caps)).toBe(1);
  });

  it('absent / malformed advertisements read as undefined', () => {
    expect(semanticDocumentFormat(undefined)).toBeUndefined();
    expect(semanticDocumentFormat({})).toBeUndefined();
    expect(semanticDocumentFormat({ experimental: {} })).toBeUndefined();
    expect(semanticDocumentFormat({ experimental: { nika: {} } })).toBeUndefined();
    expect(
      semanticDocumentFormat({ experimental: { nika: { semanticDocument: { graphFormat: 'x' } } } }),
    ).toBeUndefined();
  });
});

describe('parseSemanticDocument — the typed payload, refused when malformed', () => {
  it('a projected document carries the verbatim graph + spans', () => {
    const parsed = parseSemanticDocument({ graph: GRAPH2, spans: { a: SPAN, b: SPAN } });
    expect(parsed).toBeDefined();
    expect(parsed?.graph?.workflow).toBe('w');
    expect(parsed?.graph?.edges[0]?.kind).toBe('value');
    expect(parsed?.reason).toBeUndefined();
    expect(parsed?.spans.a?.start.line).toBe(4);
  });

  it('an unprojected document keeps its reason — graph stays absent', () => {
    const parsed = parseSemanticDocument({ graph: null, reason: 'findings', spans: { a: SPAN } });
    expect(parsed).toBeDefined();
    expect(parsed?.graph).toBeUndefined();
    expect(parsed?.reason).toBe('findings');
    expect(parsed?.spans.a).toBeDefined();
  });

  it('a graph in a format the client does not speak is dropped, spans survive', () => {
    const parsed = parseSemanticDocument({
      graph: { ...GRAPH2, graph_format: 1, edges: [{ from: 'a', to: 'b', kind: 'depends_on' }] },
      spans: { a: SPAN },
    });
    expect(parsed).toBeDefined();
    expect(parsed?.graph).toBeUndefined();
    expect(parsed?.reason).toBe('format');
    expect(parsed?.spans.a).toBeDefined();
  });

  it('malformed payloads are refused whole — never a half-trusted bag', () => {
    expect(parseSemanticDocument(undefined)).toBeUndefined();
    expect(parseSemanticDocument(null)).toBeUndefined();
    expect(parseSemanticDocument('nope')).toBeUndefined();
    expect(parseSemanticDocument({ spans: 'not-a-map' })).toBeUndefined();
    // A span row that is not a Range is dropped, the rest survive.
    const parsed = parseSemanticDocument({ graph: null, reason: 'parse', spans: { a: SPAN, b: 42 } });
    expect(parsed?.spans.a).toBeDefined();
    expect(parsed?.spans.b).toBeUndefined();
  });

  it('names the wire method once — consumers never retype the string', () => {
    expect(SEMANTIC_DOCUMENT_METHOD).toBe('nika/semanticDocument');
  });
});
