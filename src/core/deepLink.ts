// deepLink.ts — the vscode:// deep-link gate (pure · fails-closed).
//
// `vscode://supernovae.nika-lang/<action>?<query>` arrives from OUTSIDE
// the editor (a shared doc · a chat message · a README badge), so every
// byte is attacker-controllable — the same trust class as the webview
// (#206/#207), one step wider: anything that can render a link can knock
// on this door. The gate applies the welcomeGuard discipline to external
// input, four pins:
//
//   (a) a STRICT action allowlist — five literals, case-sensitive, exact
//       (`/run` yes · `/run/` no) · anything else is undefined, never a
//       throw, never a guess;
//   (b) `file` is a canonical workspace-RELATIVE workflow path — no
//       absolute, no drive letter, no `.`/`..` segment, no backslash, no
//       leftover percent-escape (a double-encoded `%252e` still carries
//       `%` after the platform's one decode and dies here), no glob or
//       expansion metacharacter (the host feeds it to findFiles as a
//       literal), exact `.nika.yaml` suffix (the structural belt);
//   (c) fails-closed on ambiguity — a repeated key is a lie and kills
//       the link; a present-but-invalid param kills the WHOLE link too
//       (silently dropping it would open something the link never named);
//   (d) the parser only VALIDATES — resolution (does the file exist in
//       THIS workspace?) and consent (run/check confirm) stay host-side.

/** One validated deep link — the only shapes the front door lets through. */
export type DeepLink =
  | { readonly action: 'run'; readonly file: string }
  | { readonly action: 'check'; readonly file: string }
  | { readonly action: 'dag'; readonly file?: string }
  | { readonly action: 'search'; readonly query?: string }
  | { readonly action: 'demo' };

/** Paths a link may name — the whole surface, nothing else ever parses. */
const ACTIONS: ReadonlySet<string> = new Set(['run', 'check', 'dag', 'search', 'demo']);

/** Sanity caps — a link is a pointer, not a payload. */
const MAX_FILE_LENGTH = 512;
const MAX_QUERY_LENGTH = 256;

/** Glob/expansion metacharacters — the resolved path rides a findFiles
 *  glob host-side, so only literal paths may pass. */
const GLOB_OR_EXPANSION = /[*?[\]{}]/;

/** Characters that can lie to a parser or a human — C0 controls + DEL,
 *  zero-widths (U+200B-200F), the bidi embed/override set (U+202A-202E),
 *  the bidi isolates (U+2066-2069), and BOM. An RLO in a resolvable path
 *  would make the confirm modal DISPLAY a different name than the one
 *  that runs (the informed-click gap the refuter pass surfaced) — none
 *  of these has a legitimate place in a relative path or a search seed,
 *  so the whole class is rejected wholesale. Real RTL text needs no
 *  invisible controls; the script itself carries direction. */
function hasForbiddenChar(raw: string): boolean {
  for (const ch of raw) {
    const c = ch.codePointAt(0) ?? 0;
    if (c <= 0x1f || c === 0x7f) { return true; }
    if (c >= 0x200b && c <= 0x200f) { return true; }
    if (c >= 0x202a && c <= 0x202e) { return true; }
    if (c >= 0x2066 && c <= 0x2069) { return true; }
    if (c === 0xfeff) { return true; }
  }
  return false;
}

/** True iff `raw` is a canonical relative workflow path safe to hand the
 *  host resolver. Every rejection is a closed door, not an error. */
function safeWorkflowPath(raw: string): boolean {
  if (raw.length === 0 || raw.length > MAX_FILE_LENGTH) { return false; }
  if (hasForbiddenChar(raw)) { return false; }
  // Leftover escape material — the platform already percent-decoded once;
  // anything still encoded is a smuggling attempt (%2e%2e · %252e · %00).
  if (raw.includes('%')) { return false; }
  // Separator discipline: forward slashes only — a backslash is either a
  // Windows absolute fragment or an escape trick, both closed.
  if (raw.includes('\\')) { return false; }
  if (raw.startsWith('/')) { return false; }
  if (/^[a-zA-Z]:/.test(raw)) { return false; }
  if (raw.startsWith('~')) { return false; }
  if (GLOB_OR_EXPANSION.test(raw)) { return false; }
  // Query-grammar characters in a DECODED path value are separator
  // confusion — the alternate-separator smuggling lane (`;`-joined
  // pairs · encoded `&`/`=` re-emerging). No honest workflow path
  // carries them; the whole class closes here (refuter pin).
  if (/[;&=]/.test(raw)) { return false; }
  // Canonical segments — no `.`, no `..`, no empty (`a//b` · trailing /).
  if (raw.split('/').some((s) => s === '' || s === '.' || s === '..')) { return false; }
  // Structural belt: every openable target is a workflow file — rejects
  // `foo.nika.yaml.evil` lookalikes and arbitrary-file probing outright.
  return raw.endsWith('.nika.yaml');
}

/** True iff `raw` may seed the search box — free text, bounded, printable. */
function safeSearchSeed(raw: string): boolean {
  return raw.length <= MAX_QUERY_LENGTH && !hasForbiddenChar(raw);
}

/** Reads `key` once from `params`. Absent → undefined; repeated → null
 *  (poisoned — the caller must kill the whole link). */
function readOnce(params: URLSearchParams, key: string): string | undefined | null {
  const all = params.getAll(key);
  if (all.length === 0) { return undefined; }
  if (all.length > 1) { return null; }
  return all[0];
}

/**
 * Parses the path + query of an incoming `vscode://` uri into a validated
 * DeepLink, or undefined for anything unknown or unsafe. Never throws —
 * the front door swallows garbage whole. Unknown query keys are ignored
 * (never read, so never a surface); known keys must validate or the link
 * dies (c). Callers pass `uri.path` and `uri.query` straight through.
 */
export function parseDeepLink(path: unknown, query: unknown): DeepLink | undefined {
  if (typeof path !== 'string' || typeof query !== 'string') { return undefined; }
  if (!path.startsWith('/')) { return undefined; }
  const action = path.slice(1);
  if (!ACTIONS.has(action)) { return undefined; }
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(query);
  } catch {
    return undefined;
  }
  switch (action) {
    case 'run':
    case 'check': {
      // Execution targets: the file is REQUIRED — an external link never
      // gets to mean « whatever happens to be focused ».
      const file = readOnce(params, 'file');
      if (file === null || file === undefined || !safeWorkflowPath(file)) { return undefined; }
      return { action, file };
    }
    case 'dag': {
      // View target: optional — a bare /dag opens the welcome canvas.
      const file = readOnce(params, 'file');
      if (file === null) { return undefined; }
      if (file === undefined) { return { action: 'dag' }; }
      if (!safeWorkflowPath(file)) { return undefined; }
      return { action: 'dag', file };
    }
    case 'search': {
      const q = readOnce(params, 'q');
      if (q === null) { return undefined; }
      if (q === undefined) { return { action: 'search' }; }
      if (!safeSearchSeed(q)) { return undefined; }
      return { action: 'search', query: q };
    }
    case 'demo':
      // No params read — nothing attacker-controlled flows into the demo
      // (its write path and content are host-chosen constants).
      return { action: 'demo' };
    default:
      return undefined;
  }
}

/** The consent law as data: run/check EXECUTE the engine on the named
 *  file, so an external link must be confirmed by a human gesture before
 *  either fires (the WALL at the front door). dag/search/demo only open
 *  surfaces — read-only from the link's point of view. */
export function needsConfirm(link: DeepLink): boolean {
  return link.action === 'run' || link.action === 'check';
}
