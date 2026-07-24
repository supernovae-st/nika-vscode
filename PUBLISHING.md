# Publishing · Marketplace + OpenVSX runbook

> Researched & source-verified 2026-06-12 (official docs current to
> 2026-06-10). One artifact, two registries: VS Marketplace (VS Code) and
> OpenVSX (Cursor · Windsurf · VSCodium). Status boxes reflect THIS repo.

## Per-release readiness gate (run before ANY tag)

The tag is the operator's call. Before it, walk this once — it's the
confidence gate between "the pyramid is green" and "a stranger's first
5 minutes won't embarrass us."

```
1. AUTOMATED   npm ci            → the lockfile IS in sync (the exact CI
                                   gate — v0.93.0 died here in 16s: a
                                   feature-branch merge moved a transitive
                                   esbuild without regenerating the lock)
               npm test         → the belt suite whole (vitest · spec
                                   parity · tokens parity · voice gate ·
                                   glyph registry · walkthrough media ·
                                   eslint)
               npm run test:integration → real VS Code hosts: the
                                   integration suite + the first-contact
                                   e2e (launch A: zero gestures to
                                   green; the never-twice guards are
                                   unit-pinned — the harness's storage
                                   is memory-backed, cross-launch state
                                   is not observable there)
               npx vsce package  → packages clean, size sane (<1 MB)
2. CROSS-REVIEW a diff review of the release delta (adversarial · the
               integration/compose bugs a single-feature test can't see)
               — every verified finding fixed, not just filed
3. MANUAL F5   the 20-min feel pass below (what automation can't judge)
4. DOCS        CHANGELOG has the version's entry · README hero current ·
               the demo GIF still reflects the UI
5. VERSION     see the odd-minor trap below before choosing stable vs
               --pre-release
```

### Manual F5 script · 20 min · the feel the smoke test can't judge

`code .` in this repo → F5 (Run Extension). In the dev host:

```
□ EMPTY STATE   open the DAG panel with no file → the card pitches
                (title · 2 buttons · 3-gesture crib · walkthrough link);
                ＋ New workflow scaffolds; the link opens the walkthrough
□ FIRST RUN     open a *.nika.yaml → Show DAG → cards render content-first
                in the nika skin; ▶ mock lights the DAG wave-by-wave with
                ZERO keys; aurora sweeps once on a clean close
□ THEME         nika.dag.theme: editor → follows your theme; high
                contrast still legible; toggle back to nika
□ AUDIT READ    a bounded workflow shows a green cost chip on the pill;
                drop a max_tokens → it flips amber `≥ $X`; introduce a
                NIKA-VAR-021 (a ${{ tasks.x }} in a verb body — hoist it
                into with:) → the ⚠N card chip appears → click → the
                report opens
□ EDIT LOOP     change a prompt → the △ stale badge + the pill △N; the
                model chip edits (provider picker → one undoable edit);
                drag a port onto empty canvas → the verb cmdk at the
                cursor → pick → a pre-wired task lands in the YAML
□ REPLAY        run for real (or mock) → open the run in the Runs view →
                the scrubber; Space plays, drag scrubs, the DAG state
                tracks the handle; scrubbing back never spams the feed
□ KEYBOARD      Tab cycles cards · ↑↓ walk dependency/dependent · Enter
                opens the YAML · / filters · Esc clears
□ A11Y          a screen-reader pass on the panel; forced-colors mode
□ CLOSE         close the window mid-LSP-start (no unhandled-rejection
                popup — safeStopClient covers it)
```

If every box holds in BOTH skins, the feel is real. Tag when ready.

### The odd-minor trap (choose before you tag)

The version tracks the engine announce line. VS Marketplace's OFFICIAL
pre-release convention is **odd-minor = pre-release**. `0.93.0` has an
odd minor (93), so:
- **Stable release** (recommended for the first public ship): publish
  WITHOUT `--pre-release`. The odd minor is then cosmetic — the engine-
  parity number wins; ignore the convention.
- **Pre-release channel**: `vsce publish --pre-release` embraces the
  odd-minor. Don't mix — a stable at an odd minor then a `--pre-release`
  at the same minor confuses the channel. Pick one lane and stay in it.

## Blockers · accounts (do these FIRST · lead time)

- [ ] **[VSM]** Publisher `supernovae` at marketplace.visualstudio.com/manage.
      Name + displayName are globally unique and burned forever on removal.
- [ ] **[VSM]** Azure DevOps PAT: org = **All accessible organizations**,
      scope **Marketplace › Manage** (the classic 401 is a wrong-org token).
      ⚠️ Global PATs retire **Dec 1 2026** → plan Entra ID
      (`vsce publish --azure-credential`, vsce ≥ 2.26.1) from day one.
- [ ] **[OVSX]** Eclipse account (GitHub username field filled) → log in to
      open-vsx.org via GitHub → link account → **sign the Open VSX Publisher
      Agreement** (not the ECA). Publishing blocked until signed.
- [ ] **[OVSX]** Token at open-vsx.org/user-settings/tokens (`OVSX_PAT`) ·
      then `npx ovsx create-namespace supernovae -p $OVSX_PAT`.
- [ ] **[OVSX]** Claim namespace OWNERSHIP (public issue at
      EclipseFdn/open-vsx.org, issue template) · kills the « unverified ⚠️ »
      shield. No waiting period; do at launch. CI tokens = contributors.
- [ ] **[VSM]** Verified-publisher badge = month-6 project, not launch:
      publisher ≥ 6 months on VSM **and** domain registration ≥ 6 months ·
      apex domain TXT record · manual review. Display-name change revokes it.

## Manifest gates · state of THIS repo

- [x] `name`/`version`/`publisher`/`engines.vscode` present (no `*`)
- [x] License: `AGPL-3.0-or-later` field + LICENSE file · **OpenVSX
      hard-fails CI publishes without one** (VSM: optional)
- [x] Icon PNG 256×256 (SVG icons are rejected; 128 min, 256 = Retina)
- [x] `repository` set → vsce rewrites relative README links; feeds the
      Resources sidebar (with `bugs` + `homepage`)
- [x] `@types/vscode` (1.75) ≤ `engines.vscode` (1.75) · vsce validates
- [x] Bundled `main` (esbuild · 0 runtime deps · no node_modules in VSIX) ·
      `vscode:prepublish` runs clean+typecheck+build
- [x] `capabilities.untrustedWorkspaces: limited` with
      `restrictedConfigurations: [nika.server.path, nika.server.extraArgs]`
      — a malicious workspace must NOT choose which binary we spawn
- [x] `capabilities.virtualWorkspaces: limited` (undeclared default is
      `true`, wrong for a binary-backed extension)
- [x] activationEvents: `onLanguage:` implicit since 1.74 · only
      `workspaceContains` kept (powers the tree pre-open)
- [x] Categories from the documented list (+ Visualization) · keywords ≤ 30
      (hard cap · publish fails above)
- [x] README/CHANGELOG: https-only images · no SVG (badges from approved
      hosts only · vsmarketplacebadges.dev, shields.io…) · CHANGELOG.md
      renders as the Changelog tab
- [x] Binary auto-download policy compliance: HTTPS + SHA-256 verified +
      documented in README + **first-run modal consent** (globalState).
      Registries sandbox-scan runtime behavior; rust-analyzer precedent =
      prefer platform-specific VSIX (below) once the engine ships `run`
- [x] No telemetry → nothing to declare (there is NO manifest telemetry
      field); README states it
- [x] Demo GIF in README (page-load friendly · the listing sells with it)
      — the media pipeline embeds `media/dag-execution.gif` in the hero

## Version strategy

`0.93.x` tracks the engine announce line (was `0.81.x` pre-2026-07).
See "The odd-minor trap" in the readiness gate above before choosing
stable vs `--pre-release` — 93 is odd, so the convention reads it as a
pre-release unless you publish stable and treat the minor as cosmetic.
`vsce publish minor|patch` auto-bumps + tags; we bump by hand
(`npm version`) to stay in engine-parity lockstep, so tag manually.

## Platform-specific VSIX (when the engine binary bundles)

`vsce publish --target win32-x64 win32-arm64 linux-x64 linux-arm64
linux-armhf alpine-x64 alpine-arm64 darwin-x64 darwin-arm64` · targetless
VSIX = fallback. **Package on Linux/macOS only · Windows-built VSIXes drop
the POSIX executable bit and the bundled binary won't run.** Canonical CI:
microsoft/vscode-platform-specific-sample.

## CI (activates when this dir becomes the standalone repo)

`.github/workflows/release.yml` is committed here, inert inside the
monorepo, live on split: tag-gated → gate (typecheck · tests · parity ·
package) → publish the SAME VSIX to OpenVSX then VSM via
HaaLeo/publish-vscode-extension@v2. Preflight `vsce verify-pat` /
`ovsx verify-pat`. Secrets: `VSCE_PAT` · `OVSX_PAT`.

## Repo split (monorepo → supernovae-st/nika-vscode)

1. `git subtree split` (or filter-repo) on
   `nika/02-engineering/repos/vscode` → new public repo
2. The monorepo keeps it as a submodule under `02-engineering/repos/`
   (naming + privacy rules per `submodule-discipline.md`)
3. PUBLIC repo carries strictly code/tests/docs · no monorepo references

## Lifecycle traps (learned from others' scars)

- Deleting a published VERSION burns that version number forever
- Prefer **unpublish** over remove (remove destroys install stats and
  reserves the name permanently)
- OpenVSX publish-time scans: secret detection · hash blocklist ·
  typosquat similarity · keep tokens scoped, rotate (2025 leak arc)
- VSM signs all extensions at publish; clients verify · zero action

## Sources

Official: code.visualstudio.com/api (publishing-extension ·
extension-manifest · workspace-trust · virtual-workspaces · webview ·
web-extensions · telemetry · activation-events · bundling · CI) ·
github.com/eclipse-openvsx wiki (Publishing · Namespace-Access) ·
microsoft/vscode-vsce · HaaLeo/publish-vscode-extension ·
developer.microsoft.com security-and-trust blog (2025 scanning pipeline).
