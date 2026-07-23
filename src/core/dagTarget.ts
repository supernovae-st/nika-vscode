// dagTarget.ts — where a bare « Show DAG » lands (pure).
//
// The probe ladder for an argument-less invocation (status bar · palette
// · walkthrough · a tree or the webview holding focus):
//
//   1 active   the focused editor is a workflow — it speaks first
//   2 held     the canvas already shows a workflow — re-invoking the
//              door brings that graph back, NEVER the welcome ghost
//              (the class this kills: the webview owns focus, so
//              activeTextEditor is undefined and the old door fell
//              through to the welcome pitch over a live graph)
//   3 visible  exactly one visible editor is a workflow — focus sits
//              in a tree, the file is still on screen
//   4 workspace exactly one workflow exists in the workspace — the
//              intent is unambiguous even when the webview replaced
//              the file's tab in its editor group
//   5 welcome  anything else is honestly the welcome home
//
// Pure decision — the shell supplies the probes and opens the winner.

export interface DagTargetProbe {
  /** The focused editor is a `*.nika.yaml` document. */
  activeIsWorkflow: boolean;
  /** The uri the canvas currently shows, when it holds one. */
  panelHeld?: string;
  /** Uris of visible editors whose document is a workflow. */
  visibleWorkflows: string[];
  /** Workspace workflow uris from a capped find (2 = « many »). */
  workspaceWorkflows: string[];
}

export type DagTarget =
  | { kind: 'active' }
  | { kind: 'held'; uri: string }
  | { kind: 'visible'; uri: string }
  | { kind: 'workspace'; uri: string }
  | { kind: 'welcome' };

export function pickDagTarget(p: DagTargetProbe): DagTarget {
  if (p.activeIsWorkflow) { return { kind: 'active' }; }
  if (p.panelHeld) { return { kind: 'held', uri: p.panelHeld }; }
  if (p.visibleWorkflows.length === 1) { return { kind: 'visible', uri: p.visibleWorkflows[0] }; }
  if (p.workspaceWorkflows.length === 1) { return { kind: 'workspace', uri: p.workspaceWorkflows[0] }; }
  return { kind: 'welcome' };
}
