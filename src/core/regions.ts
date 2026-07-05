// regions.ts — author-declared task groupings (n8n "logic grouping").
//
// A `# nika:region <name>` comment line opens a region; every task
// declared after it (until the next marker or EOF) belongs to it. The
// engine ignores comments, so this is a ZERO-cost annotation on the YAML
// — the canvas draws a labeled background box behind the members. Pure:
// the webview renders from this, the tests pin membership.

import { parseRichWorkflow } from '../workflowParser';

export interface Region {
  name: string;
  taskIds: string[];
}

const MARKER = /^\s*#\s*nika:region\s+(.+?)\s*$/;

/**
 * Region groupings in author order. A task's region is the LAST marker
 * whose line precedes the task's `- id:` line; tasks before any marker
 * belong to none. Empty regions (no task follows) are dropped.
 */
export function parseRegions(text: string): Region[] {
  const lines = text.split('\n');
  const markers: Array<{ line: number; name: string }> = [];
  lines.forEach((line, i) => {
    const m = line.match(MARKER);
    if (m) { markers.push({ line: i, name: m[1] }); }
  });
  if (markers.length === 0) { return []; }
  markers.sort((a, b) => a.line - b.line);

  const regions: Region[] = markers.map((m) => ({ name: m.name, taskIds: [] }));
  for (const task of parseRichWorkflow(text).tasks) {
    let idx = -1;
    for (let k = 0; k < markers.length; k++) {
      if (markers[k].line < task.line) { idx = k; } else { break; }
    }
    if (idx >= 0) { regions[idx].taskIds.push(task.id); }
  }
  return regions.filter((r) => r.taskIds.length > 0);
}
