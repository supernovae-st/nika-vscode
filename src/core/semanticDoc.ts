// semanticDoc.ts — the `nika/semanticDocument` oracle contract (pure parse).
//
// The engine's LSP answers a bare TextDocumentIdentifier with the
// analyzed workflow as ONE payload: the canonical graph projection
// VERBATIM (the same graph_format-2 document `inspect --format json`
// prints — three-protocol parity), plus a presentation wrapper the CLI
// cannot carry: per-task declaration ranges. Adopting it removes a
// process spawn per projection and hands the canvas exact node→source
// jumps without re-scanning YAML.
//
// Discovery is capability-first, never blind probing: the server names
// the oracle and its IN-PAYLOAD format under
// `capabilities.experimental.nika.semanticDocument.graphFormat`. The
// client adopts format 2 only — a format-1 advertisement keeps the
// CLI/client lanes, the same law `isGraphDoc` applies to CLI output.

import { GraphDoc, isGraphDoc } from './cliContract';

/** The vendor-prefixed request method — typed once, never retyped. */
export const SEMANTIC_DOCUMENT_METHOD = 'nika/semanticDocument';

/** The one payload format this client speaks (mirrors `isGraphDoc`). */
export const SEMANTIC_DOCUMENT_FORMAT = 2;

/** An LSP Range as the wire carries it (zero-based line/character). */
export interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

/** Task id → the declaring token's range. */
export type TaskSpans = Record<string, LspRange>;

export interface SemanticDocumentPayload {
  /** The canonical projection — absent when the server could not
   *  project (see `reason`) or spoke a format this client refuses. */
  graph: GraphDoc | undefined;
  /** Why `graph` is absent: the server's word (`parse` · `findings`)
   *  or the client's own refusal (`format`). */
  reason?: string;
  spans: TaskSpans;
}

/** Read the advertised oracle format from initialize capabilities. */
export function semanticDocumentFormat(caps: unknown): number | undefined {
  if (typeof caps !== 'object' || caps === null) { return undefined; }
  const experimental = (caps as { experimental?: unknown }).experimental;
  if (typeof experimental !== 'object' || experimental === null) { return undefined; }
  const nika = (experimental as { nika?: unknown }).nika;
  if (typeof nika !== 'object' || nika === null) { return undefined; }
  const doc = (nika as { semanticDocument?: unknown }).semanticDocument;
  if (typeof doc !== 'object' || doc === null) { return undefined; }
  const format = (doc as { graphFormat?: unknown }).graphFormat;
  return typeof format === 'number' ? format : undefined;
}

function isLspPosition(value: unknown): value is LspRange['start'] {
  return (
    typeof value === 'object' && value !== null &&
    typeof (value as { line?: unknown }).line === 'number' &&
    typeof (value as { character?: unknown }).character === 'number'
  );
}

function isLspRange(value: unknown): value is LspRange {
  return (
    typeof value === 'object' && value !== null &&
    isLspPosition((value as { start?: unknown }).start) &&
    isLspPosition((value as { end?: unknown }).end)
  );
}

/**
 * Validate a `nika/semanticDocument` response. Malformed payloads are
 * refused whole; a graph in a format this client does not speak is
 * dropped (reason `format`) while the spans — format-independent
 * presentation — survive. Individual malformed span rows are dropped.
 */
export function parseSemanticDocument(value: unknown): SemanticDocumentPayload | undefined {
  if (typeof value !== 'object' || value === null) { return undefined; }
  const bag = value as { graph?: unknown; reason?: unknown; spans?: unknown };

  if (bag.spans !== undefined && (typeof bag.spans !== 'object' || bag.spans === null)) {
    return undefined;
  }
  const spans: TaskSpans = {};
  if (bag.spans) {
    for (const [task, range] of Object.entries(bag.spans as Record<string, unknown>)) {
      if (isLspRange(range)) { spans[task] = range; }
    }
  }

  if (bag.graph === null || bag.graph === undefined) {
    return {
      graph: undefined,
      reason: typeof bag.reason === 'string' ? bag.reason : undefined,
      spans,
    };
  }
  if (isGraphDoc(bag.graph)) {
    return { graph: bag.graph, spans };
  }
  // The server projected something this client refuses (a format-1
  // engine, a future format) — same posture as isGraphDoc on CLI output.
  return { graph: undefined, reason: 'format', spans };
}
