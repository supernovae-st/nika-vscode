// dataflow.ts — the DATA story of the boundary (pure · no vscode).
//
// W2 « the flow »: the binding IS the edge. A `${{ tasks.X.* }}`
// reference is legal ONLY on the boundary surfaces (`with:` values ·
// `after:` keys · `on_error.recover:`); anywhere else it is
// NIKA-VAR-021 territory — never an edge, never a wire this module
// invents (the pre-W2 ghost-edge overlay died with NIKA-DAG-003). The
// scanner therefore reads the PARSED boundary (workflowParser's
// withRefs), not free text: the client fallback stays exactly as
// strict as the server.
//
// The edge ROLE follows the referenced field's shape (03-dag §with):
//   .output / named binding                    → value
//   .status/.duration_ms/.started_at/.ended_at → terminal-observation
//   .error                                     → failure-observation

import { parseRichWorkflow } from '../workflowParser';
import type { DagNode } from './cliContract';

export interface BindingIn {
  /** Local alias (`page`) — the `with:` key that imports the data. */
  alias: string;
  /** Upstream task id. */
  from: string;
  /** Referenced path under the task (`output` · `output.title` · `status`). */
  path: string;
}

export interface DataFlowInfo {
  /** task id → inbound bindings (what feeds it, under which name). */
  inputs: Map<string, BindingIn[]>;
}

/** The graph_format 2 role of one referenced field (03-dag §with table). */
export function edgeKindOfPath(path: string): 'value' | 'terminal-observation' | 'failure-observation' {
  const head = path.split('.')[0];
  if (head === 'status' || head === 'duration_ms' || head === 'started_at' || head === 'ended_at') {
    return 'terminal-observation';
  }
  if (head === 'error') { return 'failure-observation'; }
  return 'value';
}

/**
 * Every task's declared data inputs — the `with:` bindings whose values
 * reference `tasks.X.*` (one entry per distinct alias/from/path).
 */
export function collectDataFlow(text: string): DataFlowInfo {
  const wf = parseRichWorkflow(text);
  const inputs = new Map<string, BindingIn[]>();
  for (const task of wf.tasks) {
    if (task.withRefs.length === 0) { continue; }
    inputs.set(task.id, task.withRefs.map((r) => ({ alias: r.alias, from: r.from, path: r.path })));
  }
  return { inputs };
}

/**
 * Surface the declared bindings per node (`bindingsIn` — the card
 * io row). Edges are NOT touched: the engine projection already types
 * every edge (kind · predicate · binding), and the client fallback
 * builds its own typed edges in clientDag. Pure — never mutates input.
 */
export function annotateDataFlow(
  text: string,
  nodes: DagNode[],
): { nodes: DagNode[]; flow: DataFlowInfo } {
  const flow = collectDataFlow(text);
  const outNodes = nodes.map((n) => {
    const bindings = flow.inputs.get(n.id);
    return bindings ? { ...n, bindingsIn: bindings } : { ...n };
  });
  return { nodes: outNodes, flow };
}
