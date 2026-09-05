# Publishing · Marketplace + OpenVSX runbook

> Researched & source-verified 2026-06-12 (official docs current to
> 2026-06-10). One artifact, two registries: VS Marketplace (VS Code) and
> OpenVSX (Cursor · Windsurf · VSCodium). Status boxes reflect THIS repo.

## Per-release readiness gate (run before ANY tag)

The tag is the operator's call. Before it, walk this once · it's the
confidence gate between "the pyramid is green" and "a stranger's first
5 minutes won't embarrass us."

```
1. AUTOMATED   npm ci            → the lockfile IS in sync (the exact CI
                                   gate — v0.93.0 died here in 16s: a
                                   feature-branch merge moved a transitive
                                   esbuild without regenerating the lock)
               npm test         → the belt suite whole (vitest · spec
                                   parity · tokens parity · voice gate ·
                                   glyph registry · release coherence ·
                                   walkthrough media · eslint)
               npm run test:integration → real VS Code hosts: the
                                   integration suite + the first-contact
                                   e2e against ENGINE_PIN's public,
                                   checksum-verified release archive
                                   (launch A: zero gestures to
                                   green; the never-twice guards are
                                   unit-pinned — the harness's storage
                                   is memory-backed, cross-launch state
                                   is not observable there)
               npx vsce package  → packages clean, size sane (~2 MB ·
                                   the canvas bundle is the mass) and
                                   NO `.nika/` inside (local run traces
                                   never ship · the ignore is the belt)
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

### Stable or pre-release (choose before you tag)

The version tracks the engine announce line. VS Marketplace's OFFICIAL
pre-release convention uses an odd minor for pre-release builds. Engine
lockstep remains the source version law, so choose the registry lane explicitly:

- **Stable release**: publish without `--pre-release`.
- **Pre-release channel**: use `vsce publish --pre-release` and keep that lane
  consistent for the minor line.

Source convergence is not publication. Advancing `package.json`, both pins,
generated projections, and the changelog makes a release candidate; only the
operator-owned tag ceremony can make the registries claim that version.

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
      · registration of the active extension also waits for actual workspace
      trust. Before trust: syntax/snippets only, no engine process or files.
      `firstContactRestricted` uses a native launcher without the standard
      test helper's `--disable-workspace-trust`. Normal first-contact and
      smoke suites are trusted-host tests, not evidence for Restricted Mode.
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
      · the media pipeline embeds `media/dag-execution.gif` in the hero

## Version strategy

The extension source tracks the released engine's exact semver line. Advance
the manifest and lockfile with `npm version <engine-version>
--no-git-tag-version`, set `ENGINE_PIN` to that immutable engine tag, set
`SPEC_PIN` to the exact commit recorded by that engine tag, then run the spec
projectors. Add the changelog entry and complete every automated and manual
readiness gate before an operator creates the matching tag.

When the source candidate exists before its public engine tag, `ENGINE_PIN`
uses the exact 40-character engine commit and carries a strict
`# CANDIDATE_VERSION: <semver>` marker. Never write a tag that does not exist.
Once the engine tag is public and resolves to that commit, replace the marker
and SHA with the immutable tag before the extension tag ceremony.

`vsce publish minor|patch` auto-bumps and tags, so it is not the admitted
lockstep path. The tag is created manually only after source, engine pin, spec
pin, generated surfaces, package artifact, and feel pass agree.

`npm run release-coherence` is the local ratchet: it refuses a manifest,
lockfile, `ENGINE_PIN`, `SPEC_PIN`, or changelog that no longer describes one
coherent source release. Registry versions stay an explicit post-tag check;
they are external state, not source truth.

## Platform-specific VSIX (when the engine binary bundles)

`vsce publish --target win32-x64 win32-arm64 linux-x64 linux-arm64
linux-armhf alpine-x64 alpine-arm64 darwin-x64 darwin-arm64` · targetless
VSIX = fallback. **Package on Linux/macOS only · Windows-built VSIXes drop
the POSIX executable bit and the bundled binary won't run.** Canonical CI:
microsoft/vscode-platform-specific-sample.

## CI (activates when this dir becomes the standalone repo)

`.github/workflows/release.yml` is committed here, inert inside the
monorepo, live on split: tag-gated → refuse either missing registry secret →
audit → typecheck · tests · parity → real VS Code integration against the
checksum-verified `ENGINE_PIN` artifact → package → publish the SAME VSIX to
OpenVSX then VSM via HaaLeo/publish-vscode-extension. Both secrets are
mandatory for a green ceremony: `VSCE_PAT` · `OVSX_PAT`. Duplicate versions
fail loudly; the ceremony never treats « already exists » as proof that the
registry's bytes equal the VSIX built by this run.

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
