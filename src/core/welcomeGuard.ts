// welcomeGuard.ts — the welcome-canvas open gate (pure · capability).
//
// `welcome:open` arrives from the DAG webview carrying a `uri` string.
// The webview is untrusted (a malicious workflow rendered in the canvas
// could turn XSS into a postMessage), so `uri` is attacker-controllable:
// a bare `openTextDocument(Uri.parse(uri))` would read ANY local file
// (`file:///etc/passwd`) into an editor — an arbitrary local file read.
//
// The gate is a CAPABILITY, not a path filter: the webview may open only
// a workflow the extension itself surfaced this run — the `welcome:data`
// recents, which are the source of truth. The `.nika.yaml` extension
// check is a structural belt: every surfaced recent is a workflow file,
// so a lookalike (`foo.nika.yaml.evil`) never qualifies even if the
// allowlist ever drifted.

/**
 * True iff `uri` is a workflow the extension surfaced to the webview
 * this run. `surfaced` is the exact set of `uri` strings from the last
 * `welcome:data` push (each `Uri.toString()` of a `**‍/*.nika.yaml`
 * file). The comparison is on the RAW string the webview echoed back,
 * before any `Uri.parse` normalization.
 */
export function welcomeOpenAllowed(uri: string, surfaced: ReadonlySet<string>): boolean {
  // Capability: only a URI the extension put in front of the webview.
  if (!surfaced.has(uri)) { return false; }
  // Belt: exact `.nika.yaml` extension (rejects `foo.nika.yaml.evil`).
  return uri.endsWith('.nika.yaml');
}
