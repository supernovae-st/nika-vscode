// modelEdit.ts — the missing-brain detector (pure). A workflow whose
// infer/agent tasks name no model ANYWHERE (no envelope default, no
// per-task override) runs into the provider wall at launch — a fact
// the file states statically. The door inserts the envelope default at
// the spec's canonical slot (01-envelope: after description, before
// vars). Detection and edit both live here so the lens and the picker
// share one truth.

export interface ModelNeed {
  /** Task ids that will need a brain (infer/agent). */
  needy: string[];
}

/** True when at least one infer/agent task exists and NO model is
 * declared anywhere. The caller feeds parseRichWorkflow's view. */
export function needsDefaultModel(wf: {
  defaultModel?: string;
  tasks: ReadonlyArray<{ id: string; verb: string; model?: string }>;
}): ModelNeed | undefined {
  if (wf.defaultModel) { return undefined; }
  const inferring = wf.tasks.filter((t) => t.verb === 'infer' || t.verb === 'agent');
  if (inferring.length === 0) { return undefined; }
  if (inferring.every((t) => t.model)) { return undefined; }
  return { needy: inferring.filter((t) => !t.model).map((t) => t.id) };
}

/** Insert `model: <ref>` right after the identity line (`nika: <id>` ·
 * the nine-key envelope's canonical order: nika · model · …). Refuses
 * when a top-level model already exists or no identity line anchors. */
export function insertDefaultModel(text: string, ref: string): string | undefined {
  const lines = text.split('\n');
  if (lines.some((l) => /^model:\s/.test(l))) { return undefined; }
  const nikaAt = lines.findIndex((l) => /^nika:\s/.test(l));
  if (nikaAt !== -1) {
    lines.splice(nikaAt + 1, 0, `model: ${ref}`);
    return lines.join('\n');
  }
  return undefined;
}
