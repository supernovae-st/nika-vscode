// admissionSim.ts — « what if this task fails? » answered by the
// ALGEBRA (gate algebra v2 · spec 03:720-728), pure and provable.
//
// The simulation replays admission over the typed graph: seed the
// failed task, then in topological order every consumer is admitted
// iff EVERY incoming SCHEDULING edge's producer sits inside that
// edge's pass-set (composition by intersection — the spec's own
// rule); a refused consumer settles cancelled and cascades. The
// verdicts the canvas paints:
//
//   failed     the seed
//   cancelled  dead-path elimination reached it
//   lit        admitted BECAUSE OF the failure (a failure read · a
//              terminal gate) — the reason on_error exists, visible
//   ok         untouched (upstream · siblings · true survivors)
//
// Recovery/finally never schedule (parking reads) — the same
// isSchedulingKind law the renderer already lives by.

import { isSchedulingKind } from './cliContract';
import { PREDICATE_ADMITS, isAfterPredicate } from './predicates';

export type SimVerdict = 'failed' | 'cancelled' | 'lit' | 'ok';

type SimState = 'success' | 'failure' | 'cancelled';

interface SimEdge {
  source: string;
  target: string;
  kind: string;
  predicate?: string;
}

/** The pass-set per edge kind (verbatim spec 03:720-728). */
function passSet(edge: SimEdge): readonly string[] {
  switch (edge.kind) {
    case 'value': return ['success', 'skipped'];
    case 'terminal-observation': return ['success', 'failure', 'skipped', 'cancelled'];
    case 'failure-observation': return ['failure', 'skipped'];
    case 'control': {
      const pred = edge.predicate ?? 'succeeded';
      return isAfterPredicate(pred) ? PREDICATE_ADMITS[pred] : ['success'];
    }
    default: return ['success', 'skipped'];
  }
}

export function simulateFailure(
  failedId: string,
  ids: readonly string[],
  edges: readonly SimEdge[],
): Map<string, SimVerdict> {
  const scheduling = edges.filter((e) => isSchedulingKind(e.kind));
  const incoming = new Map<string, SimEdge[]>();
  for (const e of scheduling) {
    const list = incoming.get(e.target) ?? [];
    list.push(e);
    incoming.set(e.target, list);
  }

  // Topological order over the scheduling graph (Kahn) — cycles are
  // impossible in a conformant doc; a stray one just drains early.
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const e of scheduling) {
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    order.push(id);
    for (const e of scheduling) {
      if (e.source !== id) { continue; }
      const d = (indeg.get(e.target) ?? 1) - 1;
      indeg.set(e.target, d);
      if (d === 0) { queue.push(e.target); }
    }
  }

  const state = new Map<string, SimState>();
  const litByFailure = new Set<string>();
  for (const id of order) {
    if (id === failedId) {
      state.set(id, 'failure');
      continue;
    }
    const ins = incoming.get(id) ?? [];
    let admitted = true;
    let owesTheFailure = false;
    for (const e of ins) {
      const producer = state.get(e.source) ?? 'success';
      const set = passSet(e);
      const admits = set.includes(producer);
      if (!admits) { admitted = false; break; }
      // LIT means « this path exists ONLY because of the failure »:
      // the edge admitted a non-success AND would have refused a
      // success (a failure read) — a terminal gate lives in both
      // worlds and stays ok.
      if (producer !== 'success' && !set.includes('success')) { owesTheFailure = true; }
    }
    state.set(id, admitted ? 'success' : 'cancelled');
    if (admitted && owesTheFailure) { litByFailure.add(id); }
  }

  const verdicts = new Map<string, SimVerdict>();
  for (const id of ids) {
    if (id === failedId) { verdicts.set(id, 'failed'); continue; }
    const s = state.get(id) ?? 'success';
    if (s === 'cancelled') { verdicts.set(id, 'cancelled'); continue; }
    verdicts.set(id, litByFailure.has(id) ? 'lit' : 'ok');
  }
  return verdicts;
}
