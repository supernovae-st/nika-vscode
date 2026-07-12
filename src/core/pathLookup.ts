// pathLookup.ts — is a command reachable on PATH? (pure · injectable)
//
// The MCP config gap: workspace .cursor/mcp.json deliberately says
// `nika` (portable — an absolute path committed to a repo breaks every
// teammate). But a user whose ONLY binary is the extension-downloaded
// one has no `nika` on PATH — Cursor's MCP client then cannot start the
// oracle at all. The fix (extension.ts) writes the MACHINE-scoped
// ~/.cursor/mcp.json with the absolute path — and this helper is the
// gate: only when `nika` is genuinely NOT reachable (a brew install
// must never be shadowed by a downloaded binary).

export function commandOnPath(
  name: string,
  pathEnv: string | undefined,
  platform: NodeJS.Platform,
  isExecutable: (candidate: string) => boolean,
): boolean {
  if (!pathEnv) { return false; }
  const sep = platform === 'win32' ? ';' : ':';
  const exts = platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of pathEnv.split(sep)) {
    if (!dir) { continue; }
    for (const ext of exts) {
      const joined = platform === 'win32' ? `${dir}\\${name}${ext}` : `${dir}/${name}${ext}`;
      if (isExecutable(joined)) { return true; }
    }
  }
  return false;
}
