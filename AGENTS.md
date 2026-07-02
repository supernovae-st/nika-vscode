# AGENTS.md — nika-vscode (the editor extension)

Vendor-neutral agent entry per the AGENTS.md convention (agents.md).

## What this repo is

The **`nika-lang` extension** for VS Code-platform editors (VS Code ·
Cursor · Windsurf · VSCodium) — language support for `.nika.yaml`:
check-as-you-type diagnostics (via `nika check --json`), permits quick-fix,
cost inlays, DAG panel, trace replay. Ships to the VS Code Marketplace AND
OpenVSX (publisher `supernovae`). TypeScript + esbuild; the brain is the
`nika` binary (LSP client in `src/lspClient.ts`, service seam in
`src/nikaService.ts`).

## Load-bearing facts (verify in-repo · never from memory)

- The extension version lives in `package.json` — a `.vsix` in the repo root
  is a build artifact, not the source of truth.
- The engine binary provides the semantics (`nika lsp` · `nika check`) —
  this repo paints them. A diagnostic bug is usually an ENGINE issue;
  reproduce with `nika check <file>` before patching the extension.
- Publishing runbook: `PUBLISHING.md` (two registries · PAT scopes · the
  401-wrong-org trap). Never publish a version without the matching engine
  release.
- The language contract (4 verbs · `${{ }}` CEL · error codes) is the spec
  repo (`supernovae-st/nika-spec`) — never restate it here, link it.

## Editing rules

1. `npm run compile && npm run lint && npm test` before any commit
   (compile = typecheck + esbuild; test = vitest + the spec-parity script).
2. Grammar/snippet changes must round-trip against real spec examples
   (`nika examples list`) — `npm run parity` checks exactly this.
3. Commit style: `type(scope): lowercase description` · trailer
   `Co-Authored-By: Nika 🦋 <nika@supernovae.studio>` (never Claude).
