// clientDag.ts — pure client-side DAG projection (no engine subprocess,
// no vscode import · the core layer stays vitest-testable).
//
// Shared by dagForDocument's no-engine fallback AND the keystroke
// liveDag (where spawning `nika inspect` per keystroke is out of the
// question). The engine projection stays the truth at save/run; this
// is the fast sketch between saves — same graph_format 3 edge shape
// (kind · predicate · binding), derived from the SAME two boundary
// doors the engine derives from: `with:` bindings are data edges,
// `after:` entries are control edges — except `unwind`, which is the
// `finally` attachment of a cleanup unit (the node's kind becomes
// `finally` · it never schedules) — and `on_error.recover:` refs are
// recovery edges. Nothing else connects two tasks.

import { parseRichWorkflow } from '../workflowParser';
import type { DagEdge, DagGraph } from './cliContract';
import { edgeKindOfPath } from './dataflow';

export function clientDagFor(text: string, uriString: string, fallbackName: string): DagGraph {
  const wf = parseRichWorkflow(text);
  const known = new Set(wf.tasks.map((t) => t.id));
  const edges: DagEdge[] = [];
  const seen = new Set<string>();
  const push = (e: DagEdge): void => {
    if (!known.has(e.source) || !known.has(e.target) || seen.has(e.id)) { return; }
    seen.add(e.id);
    edges.push(e);
  };

  for (const t of wf.tasks) {
    for (const [producer, predicate] of Object.entries(t.after)) {
      const kind = predicate === 'unwind' ? 'finally' : 'control';
      push({
        id: `${producer}->${t.id}:${kind}:${predicate}`,
        source: producer,
        target: t.id,
        kind,
        predicate,
      });
    }
    for (const r of t.withRefs) {
      const kind = edgeKindOfPath(r.path);
      push({
        id: `${r.from}->${t.id}:${kind}:${r.alias}`,
        source: r.from,
        target: t.id,
        kind,
        label: r.alias,
      });
    }
    for (const from of t.recoverRefs) {
      push({
        id: `${from}->${t.id}:recovery:`,
        source: from,
        target: t.id,
        kind: 'recovery',
      });
    }
  }

  return {
    workflowName: wf.name ?? fallbackName,
    workflowUri: uriString,
    nodes: wf.tasks.map((t) => ({
      id: t.id,
      label: t.id,
      verb: t.verb,
      // A task that unwinds another is a cleanup unit (spec 03 · format 3):
      // its anchors are not producers, and it never joins a wave.
      ...(Object.values(t.after).includes('unwind')
        ? { kind: 'finally', attachedTo: Object.entries(t.after).filter(([, p]) => p === 'unwind').map(([a]) => a) }
        : { kind: 'task' }),
      status: 'pending' as const,
      model: t.model ?? wf.defaultModel,
      tool: t.tool,
      producers: t.producers.filter((p) => t.after[p] !== 'unwind'),
      ...(t.withRefs.length > 0
        ? { bindingsIn: t.withRefs.map((r) => ({ alias: r.alias, from: r.from, path: r.path })) }
        : {}),
    })),
    edges,
  };
}
