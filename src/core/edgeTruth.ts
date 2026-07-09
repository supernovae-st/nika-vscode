// edgeTruth.ts — when does a wire carry TRUTH? (pure · no vscode, no DOM)
//
// The canvas honesty law: an edge animates only while something REAL
// happens on it. Two pure predicates encode that law so the webview and
// the tests share ONE definition:
//
//  · isFlowing   — data crosses the wire NOW (source settled → target
//                  computing). The ONLY state that earns live particles.
//  · afterglowVerdict — did this wire FIRE during the run that just
//                  closed? Executed targets hold heat briefly (Unreal's
//                  recently-executed read); cached/skipped stay cold —
//                  ADR-099 rehydration executes nothing, so it glows
//                  nothing.

/** Mirror of the webview/panel TaskStatus union (no cross-import — the
 *  webview bundle mirrors types by convention, dagPanel.ts owns the seam). */
export type EdgeTaskStatus =
  | 'pending' | 'running' | 'retrying' | 'success' | 'failed' | 'skipped' | 'cancelled';

/**
 * Data travels this wire NOW: the source has settled with an output and
 * the target is computing on it. A cached source counts — its RECORDED
 * output feeds the live target (resume semantics); an unsettled or
 * failed source feeds nothing.
 */
export function isFlowing(source?: EdgeTaskStatus, target?: EdgeTaskStatus): boolean {
  return source === 'success' && (target === 'running' || target === 'retrying');
}

/** Post-run heat for one wire. */
export type AfterglowVerdict = 'hot-success' | 'hot-fail' | 'cold';

/**
 * The run just closed — does this wire hold heat?
 *
 *  · hot-success — the wire delivered and its target EXECUTED to success.
 *  · hot-fail    — the wire delivered into an execution that failed
 *                  (the burn mark: you see where the run died).
 *  · cold        — nothing executed across it: pending/skipped/cancelled
 *                  targets, cached targets (settled from the recording,
 *                  not re-executed), or a source that never produced.
 */
export function afterglowVerdict(
  source: { status?: EdgeTaskStatus } | undefined,
  target: { status?: EdgeTaskStatus; cached?: boolean } | undefined,
): AfterglowVerdict {
  if (!source || !target) { return 'cold'; }
  if (source.status !== 'success') { return 'cold'; }
  if (target.cached === true) { return 'cold'; }
  if (target.status === 'success') { return 'hot-success'; }
  if (target.status === 'failed') { return 'hot-fail'; }
  return 'cold';
}
