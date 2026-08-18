// expr.ts — `${{ ... }}` template-expression intelligence (pure · no vscode).
//
// The LSP v0.1 ships structure-level features; expression-level intel is
// deferred to v0.8X (D-2026-06-10-N6). This module closes the gap CLIENT-
// side: scan interpolation islands, resolve the reference under the cursor,
// and classify the completion context so the editor can offer members
// without the server.
//
// Grammar (spec 04 §the 6 namespaces): ${{ <root>.<path> }} with roots
//   inputs · config · const · secrets   the four VALUE AUTHORITIES
//   with · tasks                        the two RUNTIME namespaces
// Everything else inside the island is out of scope here (CEL lives in
// `when:` · jq lives in `output:`).
//
// `vars` and `env` are recognised but DEAD (NIKA-VALUES-001/002 · the
// E-split · R3a). They are scanned so the editor can still read a
// pre-flip file and classify it; they are never offered in completion.

export interface TemplateIsland {
  /** Offset of the `$` in `${{`. */
  start: number;
  /** Offset just past the closing `}}` (or end of text when unclosed). */
  end: number;
  /** Inner expression text (between `${{` and `}}`). */
  inner: string;
  /** Offset of the first inner character. */
  innerStart: number;
  /** True when the island never closes (still being typed). */
  unclosed: boolean;
}

/** The three value authorities — the closed family a value is declared
 *  under (LAW-SURFACE-0201 · one authority, one spelling, no alias). A
 *  deployment knob is an `inputs:` entry with a `default:` (the nine-key
 *  envelope · `config:` left with it, 0.109). */
export const AUTHORITIES = ['inputs', 'const', 'secrets'] as const;
export type Authority = (typeof AUTHORITIES)[number];

/** The 5 live namespaces: the three authorities + the two runtime ones. */
const ROOTS = ['tasks', 'with', ...AUTHORITIES] as const;
export type RefRoot = (typeof ROOTS)[number];

/** The pre-flip spellings (`vars`/`env` · and `config` since the nine-key
 *  envelope). Scanned so a legacy file still resolves and can be TAUGHT;
 *  never completed, never authored. */
export const DEAD_ROOTS = ['vars', 'env', 'config'] as const;
export type DeadRoot = (typeof DEAD_ROOTS)[number];

export type AnyRoot = RefRoot | DeadRoot;

/** True when `root` is one the engine still accepts. */
export function isLiveRoot(root: AnyRoot): root is RefRoot {
  return (ROOTS as readonly string[]).includes(root);
}

export interface TemplateRef {
  root: AnyRoot;
  /** Path segments after the root (e.g. ["extract", "output"]). */
  path: string[];
  /** Offset of the root token. */
  start: number;
  /** Offset just past the last path character. */
  end: number;
}

/** Scan every `${{ ... }}` island, tolerating an unclosed trailing one. */
export function scanIslands(text: string): TemplateIsland[] {
  const islands: TemplateIsland[] = [];
  let i = 0;
  for (;;) {
    const start = text.indexOf('${{', i);
    if (start === -1) { break; }
    const close = text.indexOf('}}', start + 3);
    if (close === -1) {
      islands.push({
        start,
        end: text.length,
        inner: text.slice(start + 3),
        innerStart: start + 3,
        unclosed: true,
      });
      break;
    }
    islands.push({
      start,
      end: close + 2,
      inner: text.slice(start + 3, close),
      innerStart: start + 3,
      unclosed: false,
    });
    i = close + 2;
  }
  return islands;
}

const REF_RE = new RegExp(
  `\\b(${[...ROOTS, ...DEAD_ROOTS].join('|')})((?:\\.[A-Za-z0-9_-]+)*)`,
  'g',
);

/** Extract every root-anchored reference inside the islands — live roots
 *  AND the two dead ones (a pre-flip file must still resolve). */
export function scanRefs(text: string): TemplateRef[] {
  const refs: TemplateRef[] = [];
  for (const island of scanIslands(text)) {
    for (const m of island.inner.matchAll(REF_RE)) {
      const root = m[1] as AnyRoot;
      const path = m[2] ? m[2].slice(1).split('.') : [];
      const index = m.index ?? 0;
      refs.push({
        root,
        path,
        start: island.innerStart + index,
        end: island.innerStart + index + m[0].length,
      });
    }
  }
  return refs;
}

/** The reference covering `offset`, if any. */
export function refAt(text: string, offset: number): TemplateRef | undefined {
  return scanRefs(text).find((r) => offset >= r.start && offset <= r.end);
}

export type CompletionContext =
  | { kind: 'root'; partial: string }
  | { kind: 'member'; root: AnyRoot; path: string[]; partial: string }
  | undefined;

/**
 * Classify what should be completed at `offset`.
 *  - inside an island, typing a bare word        → root completion
 *  - right after `tasks.` / `with.x.` etc.       → member completion
 *  - outside any island                          → undefined
 */
export function completionContextAt(text: string, offset: number): CompletionContext {
  const island = scanIslands(text).find(
    (i) => offset >= i.innerStart && offset <= (i.unclosed ? i.end : i.end - 2),
  );
  if (!island) { return undefined; }

  const before = text.slice(island.innerStart, offset);
  // Token = trailing run of word chars and dots.
  const m = before.match(/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_.-]*)?)$/);
  if (!m) { return { kind: 'root', partial: '' }; }

  const token = m[1];
  const dot = token.indexOf('.');
  if (dot === -1) {
    return { kind: 'root', partial: token };
  }
  const rootWord = token.slice(0, dot);
  // Dead roots classify too — the editor answers `vars.` with the
  // migration teaching rather than an empty, silent list.
  const known: readonly string[] = [...ROOTS, ...DEAD_ROOTS];
  if (!known.includes(rootWord)) {
    return { kind: 'root', partial: '' };
  }
  const rest = token.slice(dot + 1);
  const segments = rest.split('.');
  const partial = segments.pop() ?? '';
  return { kind: 'member', root: rootWord as AnyRoot, path: segments, partial };
}
