# Integration tests · the real extension host (F5 QA)

The vitest suite proves the pure core (parsers · folds · rollups) and a
Playwright harness proves the webview pixels. This suite proves the layer
neither can: **the extension running inside a real VS Code**.

```bash
npm run test:integration
```

It downloads a pinned VS Code build (once, cached in `.vscode-test/`),
launches it with the extension loaded, and runs the Mocha suite inside
the extension host. `runTests.ts` opens a throwaway workspace that points
the binary at a bogus path (LSP off) so the smoke test targets what it
means to — activation, not the language server.

What it asserts (`suite/activation.test.ts`):

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
3. **DAG**: `Nika: Show Workflow DAG` → cards render in the nika skin,
   run pill + omnibar at the bottom; toggle `nika.dag.theme` → editor.
4. **Run**: ▶ mock → the DAG lights wave by wave, aurora sweep on close.
5. **Scrub**: click a run in the Runs view → the scrubber; play + drag.
6. **Edit**: change a prompt → the `△ stale` badge + the run-pill `△N`.
7. **Check**: introduce a NIKA-DAG-003 (a `${{ tasks.x }}` without
   `depends_on`) → the `⚠N` card chip → click → the report.
8. High contrast + a screen reader pass on the panel.
