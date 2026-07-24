# Security

## Reporting

Please report vulnerabilities privately via
[GitHub security advisories](https://github.com/supernovae-st/nika-vscode/security/advisories/new)
· not in public issues. You'll get an acknowledgment within 72 hours.

## What this extension runs · and what it never does

- **The webview is locked down.** The DAG canvas ships a
  `default-src 'none'` Content-Security-Policy · only nonce-tagged
  bundled scripts execute, and every asset (styles, fonts, images,
  media) resolves from the extension's own `cspSource`. No remote
  content ever loads in the panel.
- **One subprocess, ours.** The extension spawns exactly one program ·
  the `nika` binary · via `execFile`/`spawnCli` with timeouts. It never
  shells out to user-controlled command strings.
- **The installer is https-only and checksum-gated.** The optional
  binary installer downloads exclusively from
  `github.com/supernovae-st/nika` releases, refuses any non-https
  redirect, and verifies the artifact against the release `SHA256SUMS`
  before it lands. A checksum miss is a hard stop, not a warning.
- **Credentials are linted, never collected.** The literal-credential
  lint is a pure local pattern scan (zero network · zero telemetry)
  that pushes pasted secrets toward the `${{ env.VAR }}` sovereign
  form. The extension stores no secrets of its own.
- **No telemetry.** Nothing phones home. The one outbound trace path ·
  Export Run to OpenTelemetry · is an explicit user command aimed at a
  collector the user names.

## Supported

The `main` branch and the latest marketplace release are the supported
surfaces. Security fixes ship there · older `.vsix` artifacts are not
patched retroactively.
