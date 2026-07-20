// welcomeGuard.test.ts — the welcome-canvas open gate (maker≠checker).
// Claim under test: a compromised webview riding `welcome:open` gains NO
// arbitrary local file read. The gate is a capability — open only what
// the extension surfaced — with an exact `.nika.yaml` structural belt.

import { describe, expect, it } from 'vitest';
import { welcomeOpenAllowed } from '../core/welcomeGuard';

describe('welcomeOpenAllowed', () => {
  const surfaced = new Set([
    'file:///work/repo/build.nika.yaml',
    'file:///work/repo/deploy.nika.yaml',
  ]);

  it('accepts a workflow the extension surfaced this run', () => {
    expect(welcomeOpenAllowed('file:///work/repo/build.nika.yaml', surfaced)).toBe(true);
    expect(welcomeOpenAllowed('file:///work/repo/deploy.nika.yaml', surfaced)).toBe(true);
  });

  it('rejects an arbitrary local file — the arbitrary-read attack', () => {
    expect(welcomeOpenAllowed('file:///etc/passwd', surfaced)).toBe(false);
    // the bare-path form a lenient Uri.parse would still open
    expect(welcomeOpenAllowed('/etc/passwd', surfaced)).toBe(false);
  });

  it('rejects a .nika.yaml.evil lookalike even if it drifts into the allowlist (exact extension)', () => {
    const drifted = new Set(['file:///work/repo/evil.nika.yaml.evil']);
    expect(welcomeOpenAllowed('file:///work/repo/evil.nika.yaml.evil', drifted)).toBe(false);
  });

  it('rejects a real workflow OUTSIDE the surfaced set (capability, not a path filter)', () => {
    expect(welcomeOpenAllowed('file:///elsewhere/real.nika.yaml', surfaced)).toBe(false);
  });

  it('an empty allowlist opens nothing (no recents shown → nothing to open)', () => {
    expect(welcomeOpenAllowed('file:///work/repo/build.nika.yaml', new Set())).toBe(false);
  });
});
