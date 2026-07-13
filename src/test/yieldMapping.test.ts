// yieldMapping.test.ts — the capability KEYS are the contract (#103):
// a typo'd key (`referenceProvider` for `referencesProvider` — the
// vscode register* names diverge from the LSP capability names) would
// never match the server's advertisement and the twin would stay
// double-voiced forever, silently. Source-scanned (intel.ts imports
// `vscode`, which vitest cannot load) — the same file-reading lane the
// repo's baseline tests already use.

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

/** The LSP `ServerCapabilities` keys a client may yield on (3.17). */
const SERVER_CAPABILITY_KEYS = new Set([
  'completionProvider',
  'hoverProvider',
  'signatureHelpProvider',
  'declarationProvider',
  'definitionProvider',
  'typeDefinitionProvider',
  'implementationProvider',
  'referencesProvider',
  'documentHighlightProvider',
  'documentSymbolProvider',
  'codeActionProvider',
  'codeLensProvider',
  'documentLinkProvider',
  'colorProvider',
  'documentFormattingProvider',
  'documentRangeFormattingProvider',
  'renameProvider',
  'foldingRangeProvider',
  'selectionRangeProvider',
  'linkedEditingRangeProvider',
  'callHierarchyProvider',
  'semanticTokensProvider',
  'monikerProvider',
  'typeHierarchyProvider',
  'inlineValueProvider',
  'inlayHintProvider',
  'diagnosticProvider',
  'workspaceSymbolProvider',
]);

function capsIn(rel: string): string[] {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return [...text.matchAll(/cap: '([A-Za-z]+)'/g)].map((m) => m[1]);
}

describe('yield mapping (#103 — the keys are the contract)', () => {
  const sources = [
    'src/features/intel.ts',
    'src/features/structureNav.ts',
    'src/extension.ts',
  ];

  it('every yield key is a real ServerCapabilities key — no silent typo', () => {
    for (const rel of sources) {
      for (const cap of capsIn(rel)) {
        expect(
          SERVER_CAPABILITY_KEYS.has(cap),
          `${rel}: '${cap}' is not an LSP ServerCapabilities key`,
        ).toBe(true);
      }
    }
  });

  it('the four double-voiced surfaces of the audit are keyed', () => {
    const all = sources.flatMap(capsIn);
    for (const cap of [
      'completionProvider',
      'hoverProvider',
      'definitionProvider',
      'documentSymbolProvider',
    ]) {
      expect(all, `the audit's ${cap} twin must be in the registry`).toContain(cap);
    }
    // definition is the ×3 of the audit: Template (intel) + Nika
    // (extension) both keyed on the one server capability.
    expect(all.filter((c) => c === 'definitionProvider').length).toBeGreaterThanOrEqual(2);
  });
});
