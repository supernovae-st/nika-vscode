# Publishing · Marketplace + OpenVSX runbook

> Researched & source-verified 2026-06-12 (official docs current to
> 2026-06-10). One artifact, two registries: VS Marketplace (VS Code) and
> OpenVSX (Cursor · Windsurf · VSCodium). Status boxes reflect THIS repo.

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
- [ ] Demo GIF in README (page-load friendly · the listing sells with it)

## Version strategy

`0.81.x` tracks the engine announce line. Note: the OFFICIAL pre-release
convention is odd-minor = pre-release (`--pre-release` flag · no semver
`-beta` tags supported). 81 is odd · if we ever ship Marketplace
pre-releases, jump the channel split to engine-parity-compatible numbers
or accept the flag without the convention. `vsce publish minor|patch`
auto-bumps + tags.

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
   `nika/02-engineering/devex/nika-vscode` → new public repo
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
