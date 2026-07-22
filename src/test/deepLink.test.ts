// deepLink.test.ts — the vscode:// front-door gate (maker≠checker).
// Claim under test: an attacker who can make a user click a link gains
// NO execution, no file outside the workspace, no surprise surface. The
// allowlist is five literals; `file` is canonical-relative-workflow or
// the whole link dies; run/check carry the confirm law as data.

import { describe, expect, it } from 'vitest';
import { needsConfirm, parseDeepLink } from '../core/deepLink';

describe('parseDeepLink · the action allowlist', () => {
  it('accepts exactly the five actions', () => {
    expect(parseDeepLink('/run', 'file=deploy.nika.yaml')).toEqual({ action: 'run', file: 'deploy.nika.yaml' });
    expect(parseDeepLink('/check', 'file=deploy.nika.yaml')).toEqual({ action: 'check', file: 'deploy.nika.yaml' });
    expect(parseDeepLink('/dag', 'file=deploy.nika.yaml')).toEqual({ action: 'dag', file: 'deploy.nika.yaml' });
    expect(parseDeepLink('/search', 'q=deploy')).toEqual({ action: 'search', query: 'deploy' });
    expect(parseDeepLink('/demo', '')).toEqual({ action: 'demo' });
  });

  it('rejects everything off the list — unknown, cased, decorated, empty', () => {
    for (const path of [
      '/runs', '/RUN', '/Run', '/run/', '//run', '/run/x', '/', '', 'run',
      '/open', '/exec', '/settings', '/..', '/%72un',
    ]) {
      expect(parseDeepLink(path, 'file=deploy.nika.yaml')).toBeUndefined();
    }
  });

  it('swallows non-string garbage whole (never throws)', () => {
    expect(parseDeepLink(undefined, '')).toBeUndefined();
    expect(parseDeepLink(null as unknown as string, '')).toBeUndefined();
    expect(parseDeepLink(42 as unknown as string, 'file=a.nika.yaml')).toBeUndefined();
    expect(parseDeepLink('/run', undefined)).toBeUndefined();
    expect(parseDeepLink('/run', { file: 'a.nika.yaml' } as unknown as string)).toBeUndefined();
  });
});

describe('parseDeepLink · the file pins (run/check/dag)', () => {
  it('run/check REQUIRE a file — a bare execution link dies', () => {
    expect(parseDeepLink('/run', '')).toBeUndefined();
    expect(parseDeepLink('/check', '')).toBeUndefined();
    expect(parseDeepLink('/run', 'q=deploy')).toBeUndefined();
  });

  it('rejects traversal — dot-dot in any position', () => {
    for (const file of [
      '../secrets.nika.yaml',
      'a/../../b.nika.yaml',
      'a/../b.nika.yaml',
      '..',
      'workflows/../../../etc/passwd.nika.yaml',
    ]) {
      expect(parseDeepLink('/run', `file=${encodeURIComponent(file)}`)).toBeUndefined();
      expect(parseDeepLink('/dag', `file=${encodeURIComponent(file)}`)).toBeUndefined();
    }
  });

  it('rejects absolute paths — posix, windows drive, home, UNC-ish', () => {
    for (const file of [
      '/etc/passwd.nika.yaml',
      '/work/deploy.nika.yaml',
      'C:/evil.nika.yaml',
      'c:evil.nika.yaml',
      '~/deploy.nika.yaml',
      '\\\\host\\share\\x.nika.yaml',
      'a\\..\\b.nika.yaml',
    ]) {
      expect(parseDeepLink('/run', `file=${encodeURIComponent(file)}`)).toBeUndefined();
    }
  });

  it('rejects leftover percent-escapes — the double-encoding lane', () => {
    // Raw %2e%2e in the QUERY decodes once (URLSearchParams) into literal
    // dots → caught by the segment pin; %252e decodes into `%2e` → caught
    // by the leftover-% pin. Both die, whichever layer decoded first.
    expect(parseDeepLink('/run', 'file=%2e%2e/x.nika.yaml')).toBeUndefined();
    expect(parseDeepLink('/run', 'file=%252e%252e/x.nika.yaml')).toBeUndefined();
    expect(parseDeepLink('/run', 'file=a%255c..%255cx.nika.yaml')).toBeUndefined();
    expect(parseDeepLink('/run', 'file=a%2500.nika.yaml')).toBeUndefined();
  });

  it('rejects glob and expansion metacharacters — findFiles takes literals only', () => {
    for (const file of [
      '**/deploy.nika.yaml', 'a*.nika.yaml', 'a?.nika.yaml',
      'a[b].nika.yaml', 'a{b,c}.nika.yaml',
    ]) {
      expect(parseDeepLink('/run', `file=${encodeURIComponent(file)}`)).toBeUndefined();
    }
  });

  it('rejects non-workflow targets — the .nika.yaml structural belt', () => {
    for (const file of [
      'notes.txt', 'deploy.yaml', 'deploy.nika.yaml.evil', 'deploy.nika.yamlx', '.env',
    ]) {
      expect(parseDeepLink('/run', `file=${encodeURIComponent(file)}`)).toBeUndefined();
    }
  });

  it('rejects non-canonical segments — dot, empty, trailing slash', () => {
    for (const file of [
      './deploy.nika.yaml', 'a//b.nika.yaml', 'a/./b.nika.yaml', 'deploy.nika.yaml/',
    ]) {
      expect(parseDeepLink('/run', `file=${encodeURIComponent(file)}`)).toBeUndefined();
    }
  });

  it('rejects control characters and oversized paths', () => {
    expect(parseDeepLink('/run', 'file=a%0a.nika.yaml')).toBeUndefined();
    expect(parseDeepLink('/run', `file=${'a/'.repeat(300)}x.nika.yaml`)).toBeUndefined();
  });

  it('rejects bidi overrides and zero-widths — the modal-spoof lane (refuter)', () => {
    // An RLO in a resolvable path would make the confirm modal display a
    // different name than the one that runs — the click would not be an
    // informed one. The whole invisible class dies at the gate.
    const invisibles = [
      '\u202e', // RLO — right-to-left override
      '\u202a', // LRE — left-to-right embedding
      '\u2066', // LRI — left-to-right isolate
      '\u200b', // ZWSP — zero-width space
      '\u200f', // RLM — right-to-left mark
      '\ufeff', // BOM / ZWNBSP
    ];
    for (const ch of invisibles) {
      expect(parseDeepLink('/run', `file=${encodeURIComponent(`a${ch}b.nika.yaml`)}`)).toBeUndefined();
    }
    expect(parseDeepLink('/search', 'q=a%E2%80%AEb')).toBeUndefined();
  });

  it('accepts honest nested relative workflows', () => {
    expect(parseDeepLink('/run', 'file=workflows/deploy.nika.yaml'))
      .toEqual({ action: 'run', file: 'workflows/deploy.nika.yaml' });
    expect(parseDeepLink('/check', 'file=a/b/c/build.nika.yaml'))
      .toEqual({ action: 'check', file: 'a/b/c/build.nika.yaml' });
  });

  it('a repeated file key poisons the whole link — no first-wins games', () => {
    expect(parseDeepLink('/run', 'file=good.nika.yaml&file=../evil.nika.yaml')).toBeUndefined();
    expect(parseDeepLink('/dag', 'file=a.nika.yaml&file=b.nika.yaml')).toBeUndefined();
  });

  it('semicolon is NOT a pair separator — one mangled value, dead link (refuter pin)', () => {
    // URLSearchParams splits on `&` only, so a `;`-joined duplicate is
    // ONE value carrying a literal semicolon — and query-grammar chars
    // (`;` `&` `=`) in a decoded path are rejected outright. Pins the
    // lane shut so a future parser swap that splits on `;` (reopening
    // duplicate-key smuggling) goes red, not silent.
    expect(parseDeepLink('/run', 'file=a.nika.yaml;file=../evil.nika.yaml')).toBeUndefined();
    expect(parseDeepLink('/run', 'file=a%26b.nika.yaml')).toBeUndefined();
    expect(parseDeepLink('/run', 'file=a%3Db.nika.yaml')).toBeUndefined();
  });

  it('a present-but-invalid file kills dag too — never silently dropped', () => {
    // Dropping the param would open the welcome canvas where the sender
    // named a file — a different surface than the link claimed.
    expect(parseDeepLink('/dag', 'file=../evil.nika.yaml')).toBeUndefined();
    expect(parseDeepLink('/dag', 'file=notes.txt')).toBeUndefined();
  });

  it('bare /dag opens fileless (the welcome canvas is the target)', () => {
    expect(parseDeepLink('/dag', '')).toEqual({ action: 'dag' });
  });
});

describe('parseDeepLink · the search seed', () => {
  it('q is free text — spaces, unicode, plus-decoding', () => {
    expect(parseDeepLink('/search', 'q=hello+world')).toEqual({ action: 'search', query: 'hello world' });
    expect(parseDeepLink('/search', 'q=d%C3%A9ploiement')).toEqual({ action: 'search', query: 'déploiement' });
  });

  it('bare /search opens the gate at rest', () => {
    expect(parseDeepLink('/search', '')).toEqual({ action: 'search' });
  });

  it('rejects control characters, repeats, and oversized seeds', () => {
    expect(parseDeepLink('/search', 'q=a%00b')).toBeUndefined();
    expect(parseDeepLink('/search', 'q=a&q=b')).toBeUndefined();
    expect(parseDeepLink('/search', `q=${'a'.repeat(300)}`)).toBeUndefined();
  });
});

describe('parseDeepLink · unread params are noise, not surface', () => {
  it('unknown keys ride along ignored — never read, never acted on', () => {
    expect(parseDeepLink('/demo', 'file=../evil.nika.yaml&windowId=3'))
      .toEqual({ action: 'demo' });
    expect(parseDeepLink('/run', 'file=deploy.nika.yaml&utm_source=chat'))
      .toEqual({ action: 'run', file: 'deploy.nika.yaml' });
  });
});

describe('needsConfirm · the consent law as data', () => {
  it('run and check demand a human gesture', () => {
    expect(needsConfirm({ action: 'run', file: 'a.nika.yaml' })).toBe(true);
    expect(needsConfirm({ action: 'check', file: 'a.nika.yaml' })).toBe(true);
  });

  it('dag, search and demo open without one (read-only surfaces)', () => {
    expect(needsConfirm({ action: 'dag' })).toBe(false);
    expect(needsConfirm({ action: 'search' })).toBe(false);
    expect(needsConfirm({ action: 'demo' })).toBe(false);
  });
});
