// lensAnchors.ts — one placement law for the editor's lens rows.
//
// Each row sits on the line it serves (operator layout 2026-07-12):
// the GitHub door above `nika:` (the envelope names the language, the
// lens names where it lives) · the action row above `workflow:` ·
// Explain above `description:` · the status row above `tasks:`.
// Anchors fall back up that chain, so a partial file never loses a
// door — and none ever paints over the license/header comments.

/** Envelope keys live at the top; a scan that walked a 100k-line file
 * on every keystroke would be the real bug. */
const SCAN_CAP = 400;

export interface LensAnchors {
  /** `nika:` line (else 0) — the project door (GitHub). */
  env: number;
  /** `workflow:` line (else env) — Check · DAG · Run. */
  actions: number;
  /** `description:` line (else actions) — Explain. */
  explain: number;
  /** `tasks:` line (else actions) — verdict · ceiling · CTAs. */
  status: number;
  /** Whether a real `tasks:` block anchored `status` — the add-a-task
   * door only opens where the skeleton has a home to land in. */
  hasTasks: boolean;
}

/** First match wins per key; top-level keys only, so a task-level
 * `description:` (indented) or a commented decoy never anchors. */
export function findLensAnchors(lines: readonly string[]): LensAnchors {
  let env = -1;
  let workflow = -1;
  let description = -1;
  let tasks = -1;
  const cap = Math.min(lines.length, SCAN_CAP);
  for (let i = 0; i < cap; i++) {
    const text = lines[i];
    if (env < 0 && /^nika:\s/.test(text)) { env = i; }
    // W1: `workflow:` is an object head (bare key) — and its
    // `description:` lives one level under it, never at top level.
    if (workflow < 0 && /^workflow:\s*(#.*)?$/.test(text)) { workflow = i; }
    if (workflow < 0 && /^workflow:\s/.test(text)) { workflow = i; }
    if (description < 0
      && ((workflow >= 0 && /^ {2}description:\s/.test(text)) || /^description:\s/.test(text))) {
      description = i;
    }
    if (tasks < 0 && /^tasks:\s*$/.test(text)) { tasks = i; break; }
  }
  if (env < 0) { env = 0; }
  const actions = workflow >= 0 ? workflow : env;
  return {
    env,
    actions,
    explain: description >= 0 ? description : actions,
    status: tasks >= 0 ? tasks : actions,
    hasTasks: tasks >= 0,
  };
}

/**
 * First top-level `permits:` line — the tighten-the-boundary door.
 * Deliberately UNCAPPED: the block `check --infer-permits` inserts
 * lands at the END of the file, past any envelope cap; one extra
 * regex per line is what modelLens already pays on every provide.
 */
export function findPermitsLine(lines: readonly string[]): number | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (/^permits:\s*(#.*)?$/.test(lines[i])) { return i; }
  }
  return undefined;
}
