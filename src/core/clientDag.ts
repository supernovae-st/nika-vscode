// clientDag.ts — pure client-side DAG projection (no engine subprocess,
// no vscode import · the core layer stays vitest-testable).
//
// Shared by dagForDocument's no-engine fallback AND the keystroke
// liveDag (where spawning `nika graph` per keystroke is out of the
// question). The engine projection stays the truth at save/run; this
// is the fast sketch between saves.

import { parseRichWorkflow } from '../workflowParser';
import type { DagGraph } from './cliContract';
import { annotateDataFlow } from './dataflow';

export function clientDagFor(text: string, uriString: string, fallbackName: string): DagGraph {
  const wf = parseRichWorkflow(text);
  const base: DagGraph = {
    workflowName: wf.name ?? fallbackName,
    workflowUri: uriString,
    nodes: wf.tasks.map((t) => ({
      id: t.id,
      label: t.id,
      verb: t.verb,
      status: 'pending' as const,
      model: t.model ?? wf.defaultModel,
      tool: t.tool,
      dependsOn: t.dependsOn,
    })),
    edges: wf.tasks.flatMap((t) =>
      t.dependsOn.map((dep) => ({
        id: `${dep}->${t.id}`,
        source: dep,
        target: t.id,
        isDataEdge: false,
      })),
    ),
  };
  const flow = annotateDataFlow(text, base.nodes, base.edges);
  base.nodes = flow.nodes;
  base.edges = [...flow.edges, ...flow.ghosts];
  return base;
}
