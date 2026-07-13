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

/** Insert `model: <ref>` after the workflow OBJECT (W1: id + optional
 * description live inside it), falling back to `nika:` — the envelope's
 * canonical order. Refuses when a top-level model already exists or no
 * envelope line anchors. */
export function insertDefaultModel(text: string, ref: string): string | undefined {
  const lines = text.split('\n');
  if (lines.some((l) => /^model:\s/.test(l))) { return undefined; }
  const wfAt = lines.findIndex((l) => /^workflow:\s*(#.*)?$/.test(l) || /^workflow:\s/.test(l));
  if (wfAt !== -1) {
    // skip the object body (indented lines) — the slot is right after it
    let at = wfAt;
    while (at + 1 < lines.length && /^ {2}\S/.test(lines[at + 1])) { at += 1; }
    lines.splice(at + 1, 0, `model: ${ref}`);
    return lines.join('\n');
  }
  const nikaAt = lines.findIndex((l) => /^nika:\s/.test(l));
  if (nikaAt !== -1) {
    lines.splice(nikaAt + 1, 0, `model: ${ref}`);
    return lines.join('\n');
  }
  return undefined;
}
