# Integration tests · the real extension host (F5 QA)

The vitest suite proves the pure core (parsers · folds · rollups) and a
Playwright harness proves the webview pixels. This suite proves the layer
neither can: **the extension running inside a real VS Code**.

```bash
npm run test:integration
```

It downloads a pinned VS Code build (once, cached in `.vscode-test/`),
launches it with the extension loaded, and runs the Mocha suite inside
the extension host. Before either host starts, the launcher downloads the
exact public release archive named by `ENGINE_PIN`, checks its named
`SHA256SUMS` entry, and proves `nika --version` matches the pin. Caller
`NIKA_BIN`, Homebrew and PATH are deliberately ignored, so a developer's
stale or in-flight engine cannot counterfeit release evidence.

`runTests.ts` opens a throwaway workspace that points
the binary at a bogus path (LSP off) so the smoke test targets what it
means to — activation, not the language server.

## Source-only terminal transport

The `native-terminal` PR job independently runs `terminalArgs` twice on
Linux: a folder host must preserve literal argv, working directory, TTY
input and retained output; an empty window must refuse without submitting
a task. It uses the same production adapter and bounded process-group
runner, requires each host to exit, and needs no public engine archive.
It does not replace the release-installed first-contact gate above.

On the audited macOS host, the terminal assertions passed but automatic
host teardown timed out. A separate bare-extension control reproduced
that timeout with Nika absent. That observation does not certify native
teardown or establish the underlying host defect; the boundary stays open
until a complete clean-host run exits successfully.

## Smoke-host assertions

The default suite also checks (`suite/activation.test.ts`):

- the extension **activates without throwing**
- its **command surface is registered** (`nika.showDag` · `checkWorkflow`
  · `newWorkflow` · `doctor`)
- a `.nika.yaml` **binds to the `nika` language**
- **the DAG webview panel opens** — the CSP + `asWebviewUri` load path
  that only a real host exercises (a malformed CSP or bad asset URI
  throws here, never in the Playwright harness)

## Known-good notes (learned launching it)

- **user-data-dir must be short**: VS Code opens a Unix domain socket
  under it, capped at 103 chars; the deep repo path overflows it, so
  `runTests.ts` uses a short `/tmp` dir.
- **LSP off in the smoke host**: with `nika lsp` on PATH the client
  starts async; tearing the host down mid-handshake makes the
  `vscode-languageclient` reject its own pending initialize (library-
  internal noise). The bogus `server.path` avoids racing it. The real
  close-while-starting path is handled in production by
  `safeStopClient` (`src/lspClient.ts`).

## Manual F5 pass (operator · what the smoke test can't judge — feel)

1. `code .` in the extension repo → F5 (Run Extension).
2. In the dev host, open a `*.nika.yaml`.
3. **DAG**: `Nika: Open the Canvas (workflow DAG)` → cards render in the nika skin,
   run pill + omnibar at the bottom; toggle `nika.dag.theme` → editor.
4. **Run**: ▶ mock → the DAG lights wave by wave, aurora sweep on close.
5. **Scrub**: click a run in the Runs view → the scrubber; play + drag.
6. **Edit**: change a prompt → the `△ stale` badge + the run-pill `△N`.
7. **Check**: introduce a NIKA-VAR-021 (a `${{ tasks.x }}` in a verb
   body — the boundary refuses it) → the `⚠N` card chip → click → the
   report.
8. High contrast + a screen reader pass on the panel.
