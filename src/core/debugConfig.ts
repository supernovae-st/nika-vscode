// debugConfig.ts — pure helpers for the replay-debug launch surface.
//
// The journal records the workflow NAME (not its path), so replaying a
// run under the debugger needs a name-to-file match across the
// workspace's .nika.yaml files. Pure functions; the feature layer feeds
// them file contents and wires the pick UI.

/** The `workflow:` name of a nika YAML — a light line-scan, no parser. */
export function workflowNameOf(yamlText: string): string | undefined {
  // W1: `workflow:` is an object — the name is its `id:` field. Quoted
  // value first: a `#` INSIDE quotes is part of the name, not a comment —
  // the single mixed regex truncated `"deploy #7"` to `deploy`, so a
  // quoted-hash workflow could never exact-match its own journal (the
  // 0.97.2 review's extractor-divergence finding).
  let inWorkflow = false;
  for (const line of yamlText.split('\n')) {
    if (/^\S/.test(line)) { inWorkflow = /^workflow:\s*(#.*)?$/.test(line); }
    if (!inWorkflow) { continue; }
    const q = /^ {2}id:\s*"([^"]*)"\s*(#.*)?$/.exec(line) ?? /^ {2}id:\s*'([^']*)'\s*(#.*)?$/.exec(line);
    if (q) { return q[1].trim() || undefined; }
    const bare = /^ {2}id:\s*([^#\n]+?)\s*(#.*)?$/.exec(line);
    if (bare) { return bare[1].trim() || undefined; }
  }
  return undefined;
}

/**
 * Match candidate workflow files against a recorded run's workflow name.
 * Returns matches in document order, so the caller can auto-pick a
 * single match and only QuickPick on ambiguity.
 */
export function matchWorkflowFiles(
  files: ReadonlyArray<{ path: string; text: string }>,
  workflowName: string,
): string[] {
  const hits: string[] = [];
  for (const f of files) {
    if (workflowNameOf(f.text) === workflowName) { hits.push(f.path); }
  }
  return hits;
}

/** The launch configuration a replay session needs — one shape, typed. */
export interface ReplayLaunchConfig {
  type: 'nika';
  request: 'launch';
  name: string;
  workflow: string;
  replay: string;
}

export function replayConfig(workflowPath: string, tracePath: string): ReplayLaunchConfig {
  return {
    type: 'nika',
    request: 'launch',
    name: `Replay ${basename(tracePath)}`,
    workflow: workflowPath,
    replay: tracePath,
  };
}

/**
 * Merge a user launch config with the RESOLVED workflow/replay paths.
 * The user's config wins on cosmetics (name, extra fields) but the
 * resolved paths win over empty/missing ones — the generated snippet
 * ships `replay: ""` and a naive spread would smuggle that empty string
 * back OVER the trace we just found (the first-F5 killer).
 */
export function mergeLaunchConfig(
  config: Record<string, unknown>,
  workflowPath: string,
  tracePath: string,
): Record<string, unknown> {
  const base = replayConfig(workflowPath, tracePath);
  const name =
    typeof config.name === 'string' && config.name.length > 0 ? config.name : base.name;
  return {
    ...config,
    type: base.type,
    request: base.request,
    name,
    workflow: workflowPath,
    replay: tracePath,
  };
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}
