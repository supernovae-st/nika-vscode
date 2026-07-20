// webviewPathGuard.ts — the generic webview→host path gate (pure · capability).
//
// Generalizes the welcomeGuard pattern (#206) to EVERY canvas message that
// names a path/uri the host will act on (open · reveal · create). The webview
// is untrusted (a malicious workflow rendered in the canvas could turn XSS
// into a postMessage), so every echoed path is attacker-controllable.
//
// The gate is a CAPABILITY, not a path filter — the webview may name only
// what the extension itself surfaced this run. Four invariants, all surfaces:
//   (a) the RAW echoed string is checked BEFORE any Uri.parse / Uri.file
//       (zero parse-vs-raw divergence · zero TOCTOU);
//   (b) the webview has NO channel into an allowlist — recording happens
//       exclusively on the extension's own pushes;
//   (c) fails-closed — an empty set (nothing surfaced) allows nothing;
//   (d) a structural suffix belt where the surface implies a file class
//       (`.nika.yaml` for workflow refs · none for artifacts, whose set
//       membership is the whole story).

/** One surfaced-path capability set (recents · subs · trail · artifacts —
 *  one instance per category, never shared across surfaces). */
export class SurfacedPaths {
  private surfaced = new Set<string>();

  constructor(private readonly requiredSuffix?: string) {}

  /** Replace the capability — a full push supersedes the last one. */
  replace(paths: Iterable<string>): void {
    this.surfaced = new Set(paths);
  }

  /** Add to the capability — an incremental push (artifact deltas). */
  record(paths: Iterable<string>): void {
    for (const p of paths) { this.surfaced.add(p); }
  }

  /** Drop everything surfaced — a cleared canvas surfaces nothing. */
  clear(): void {
    this.surfaced.clear();
  }

  /** True iff `raw` — the EXACT string the webview echoed, before any
   *  parse — is a member, wearing the suffix belt when one applies.
   *  A non-string (a malformed message) fails closed like everything. */
  allows(raw: unknown): boolean {
    if (typeof raw !== 'string') { return false; }
    if (!this.surfaced.has(raw)) { return false; }
    return this.requiredSuffix === undefined || raw.endsWith(this.requiredSuffix);
  }
}

/** The create-on-miss belt for `dag:openSub` — the ONLY webview-reachable
 *  WRITE. Set membership is already gated at dispatch; this bounds the
 *  RESOLVED target: inside the workspace, exact workflow extension.
 *  `Uri.joinPath` normalizes `..` segments, so a surfaced-but-traversing
 *  ref resolves outside the workspace and dies here — the extension never
 *  offers (nor performs) the create. */
export function subCreateAllowed(target: { path: string; inWorkspace: boolean }): boolean {
  return target.inWorkspace && target.path.endsWith('.nika.yaml');
}
