// webviewPathBoundary.test.ts — the three sibling canvas doors, pinned
// (maker≠checker · the welcomeBoundary idiom). Claims under test: a
// compromised webview riding `dag:openSub` / `dag:openTrail` /
// `dag:openArtifact` gains NO arbitrary open, reveal or write. The proof
// is structural — the facts that together close each door, read off the
// source. Behavior of the gate itself is unit-tested in
// webviewPathGuard.test.ts.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const dagSrc = fs.readFileSync(path.resolve(__dirname, '..', 'dagPanel.ts'), 'utf-8');
const extSrc = fs.readFileSync(path.resolve(__dirname, '..', 'extension.ts'), 'utf-8');

/** The dispatch block of one `case '<kind>':` (up to the next case label). */
function caseBlock(src: string, kind: string): string {
  const start = src.indexOf(`case '${kind}':`);
  expect(start, `case '${kind}' exists`).toBeGreaterThan(-1);
  const rest = src.slice(start + kind.length + 8);
  const next = rest.search(/\n\s*(?:\/\/[^\n]*\n\s*)*case '/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('dag:openSub boundary (open + create-on-miss WRITE)', () => {
  it('the dispatch gates the webview path before the handler', () => {
    const block = caseBlock(dagSrc, 'dag:openSub');
    const gate = block.indexOf('this.surfacedSubs.allows(msg.path)');
    const call = block.indexOf('this.onOpenSub?.(');
    expect(gate).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(gate);
  });

  it('the resolve base is the panel’s OWN graph uri — the webview’s msg.workflowUri is never passed through (the omission gap)', () => {
    const block = caseBlock(dagSrc, 'dag:openSub');
    // The handler receives the host-authoritative base…
    expect(block).toMatch(/this\.onOpenSub\?\.\(msg\.path,\s*this\.currentGraph\?\.workflowUri\)/);
    // …and NEVER the webview-echoed base (omitting it must not steer
    // resolution to the ambient active editor).
    expect(block).not.toMatch(/this\.onOpenSub\?\.\([^)]*msg\.workflowUri/);
  });

  it('the sub allowlist is derived from the graph the extension pushed — never from the webview', () => {
    expect(dagSrc).toMatch(/this\.surfacedSubs\.replace\(\s*graph\.nodes/);
    // Both currentGraph seams record (fresh show · loadGraph replace).
    expect(dagSrc).toMatch(/this\.currentGraph = graph;\s*\n\s*this\.recordGraphSurfaces\(graph\);/);
    expect(dagSrc).toMatch(/public loadGraph\(graph: DagGraph\): void \{\s*\n\s*this\.currentGraph = graph;\s*\n\s*this\.recordGraphSurfaces\(graph\);/);
  });

  it('the create-on-miss WRITE sits behind the resolved-target belt (workspace + extension)', () => {
    const gate = extSrc.indexOf('if (!subCreateAllowed({');
    const workspaceLeg = extSrc.indexOf('inWorkspace: workspace.getWorkspaceFolder(target) !== undefined');
    const write = extSrc.indexOf('await workspace.fs.writeFile(target,');
    expect(gate).toBeGreaterThan(-1);
    expect(workspaceLeg).toBeGreaterThan(gate);
    // The one webview-reachable write comes AFTER the belt — refusal
    // returns before any `Create it` offer exists.
    expect(write).toBeGreaterThan(gate);
    expect(extSrc.slice(gate, write)).toMatch(/return;/);
  });
});

describe('dag:openTrail boundary (breadcrumb climb)', () => {
  it('the dispatch gates the webview uri before the handler', () => {
    const block = caseBlock(dagSrc, 'dag:openTrail');
    const gate = block.indexOf('this.surfacedTrail.allows(msg.uri)');
    const call = block.indexOf('this.onOpenTrail?.(msg.uri)');
    expect(gate).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(gate);
  });

  it('the trail allowlist mirrors exactly what the last push surfaced', () => {
    expect(dagSrc).toMatch(/this\.surfacedTrail\.replace\(segments\.map\(\(s\) => s\.uri\)\);\s*\n\s*this\.postMessage\(\{ kind: 'dag:trail'/);
  });
});

describe('dag:openArtifact boundary (open + revealFileInOS)', () => {
  it('the dispatch gates the raw path BEFORE any Uri.file — reveal stays capability-bound', () => {
    const block = caseBlock(dagSrc, 'dag:openArtifact');
    const gate = block.indexOf('this.surfacedArtifacts.allows(msg.path)');
    const parse = block.indexOf('vscode.Uri.file(msg.path)');
    const reveal = block.indexOf("executeCommand('revealFileInOS'");
    expect(gate).toBeGreaterThan(-1);
    expect(parse).toBeGreaterThan(gate);
    expect(reveal).toBeGreaterThan(gate);
  });

  it('the artifact allowlist is fed only by the extension’s own pushes (graph post · run-close delta)', () => {
    expect(dagSrc).toMatch(/this\.surfacedArtifacts\.record\(\s*graph\.nodes\.flatMap/);
    expect(dagSrc).toMatch(/this\.surfacedArtifacts\.record\(artifacts\.map\(\(a\) => a\.path\)\)/);
  });
});

describe('the capability sets have no webview channel', () => {
  it('no surfaced set is ever written from a webview message field', () => {
    // The poisoning shape — recording what the webview sent — is absent:
    // every record/replace call site feeds from host-side pushes only.
    expect(dagSrc).not.toMatch(/surfaced\w+\.(?:record|replace)\(\s*\[?\s*msg\./);
    expect(extSrc).not.toMatch(/surfaced\w+\.(?:record|replace)\(\s*\[?\s*msg\./);
  });

  it('a cleared canvas closes every surface (fails-closed at rest)', () => {
    expect(dagSrc).toMatch(/public clear\(\): void \{[\s\S]*?surfacedSubs\.clear\(\);[\s\S]*?surfacedTrail\.clear\(\);[\s\S]*?surfacedArtifacts\.clear\(\);/);
  });
});
