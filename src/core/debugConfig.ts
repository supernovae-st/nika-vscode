// debugConfig.ts — pure helpers for the replay-debug launch surface.
//
// The journal records the workflow NAME (not its path), so replaying a
// run under the debugger needs a name-to-file match across the
// workspace's .nika.yaml files. Pure functions; the feature layer feeds
// them file contents and wires the pick UI.

/** The `workflow:` name of a nika YAML — a light line-scan, no parser. */
export function workflowNameOf(yamlText: string): string | undefined {
  for (const line of yamlText.split('\n')) {
    const m = /^workflow:\s*["']?([^"'#\n]+?)["']?\s*(#.*)?$/.exec(line);
    if (m) { return m[1].trim(); }
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

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}
