# AGENTS.md — nika-vscode (the editor extension)

Vendor-neutral agent entry per the AGENTS.md convention (agents.md).

## What this repo is

The **`nika-lang` extension** for VS Code-platform editors (VS Code ·
Cursor · Windsurf · VSCodium) — the whole workflow surface for
`.nika.yaml`: check-as-you-type diagnostics (via `nika check --json`),
permits quick-fix, cost inlays, the DAG canvas (live runs · trace
replay · lenses), the omnibar (`⌘K ⌘M` — commands, tasks, workflows,
recorded runs in one ranked gate), tree action panels (`⌘K ⌘.`), the
Station (engine + providers + local-model lifecycle), run detail
pages, run-with-inputs, deep links. Ships to the VS Code Marketplace
AND OpenVSX (publisher `supernovae`). TypeScript + esbuild; the brain
is the `nika` binary (LSP client in `src/lspClient.ts`, service seam
in `src/nikaService.ts`).

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

1. `npm run compile && npm test` before any commit — and gate on the
   exit code, never chain a commit after a red belt. `npm test` IS the
   belt suite: vitest + spec-parity + tokens-parity + voice-gate +
   glyph-registry + walkthrough-media + eslint.
2. House gates an agent hits blind: **voice-gate** bans the em dash
   (U+2014) in teaching surfaces INCLUDING `CHANGELOG.md` (use `·` or
   a colon) · **glyph-registry** allows declared marks only (`✓` yes ·
   U+2714 and color emoji no · declare new glyphs with a sense line).
3. The webview has a twin: `src/dagPanel.ts` (host HTML shell) and
   `scripts/media/harness.html` (browser rig) each carry their OWN
   copy of the toolbar/chrome — a toolbar change lands in BOTH or the
   rig lies. Webview↔host messages are typed unions; extend kinds with
   optional fields to keep protocol parity.
4. Grammar/snippet changes must round-trip against real spec examples
   (`nika examples list`) — `npm run parity` checks exactly this.
5. Every inline tree action needs its `⌘K ⌘.` panel row — the
   reachability belt in `src/test/treeActions.test.ts` enforces it.
6. Commit style: `type(scope): lowercase description` · trailer
   `Co-Authored-By: Nika 🦋 <nika@supernovae.studio>` (never Claude).
