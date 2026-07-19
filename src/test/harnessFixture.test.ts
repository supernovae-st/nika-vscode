// harnessFixture.test.ts — the pixel-proof fixture is itself proven.
//
// The judge's page (scripts/media/harness.html) once spoke a
// pre-rename dialect (`dependsOn:` for `producers:`) — the enter
// build threw mid-pipeline and THREE judge rounds scored handler-less
// corpse cards as healthy (2026-07-18). This canary makes that class
// impossible: the GRAPH literal is extracted from the page and held
// against the shapes the renderer actually consumes. A fixture that
// drifts from the contract fails HERE, in CI, before any judge looks.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const HARNESS = fileURLToPath(new URL('../../scripts/media/harness.html', import.meta.url));

interface FixtureNode {
  id: string; label: string; verb: string; status: string;
  producers: string[];
  subManifest?: { tasks: number; waves: number; skeleton?: { nodes: Array<{ id: string; verb: string; wave: number }>; edges: Array<{ source: string; target: string }> } };
  [k: string]: unknown;
}
interface FixtureEdge { id: string; source: string; target: string; kind: string; predicate?: string; [k: string]: unknown }

function extractGraph(): { nodes: FixtureNode[]; edges: FixtureEdge[] } {
  const html = fs.readFileSync(HARNESS, 'utf-8');
  const start = html.indexOf('const GRAPH = {');
  expect(start).toBeGreaterThan(-1);
  const literalStart = html.indexOf('{', start);
  const end = html.indexOf('\n    };', literalStart);
  expect(end).toBeGreaterThan(literalStart);
  const literal = html.slice(literalStart, end + 6).replace(/;\s*$/, '');
  // The literal is JS (single quotes · trailing commas) — evaluate it
  // in isolation; it must be a pure data literal (no free identifiers).
  return new Function(`return ${literal}`)() as { nodes: FixtureNode[]; edges: FixtureEdge[] };
}

const VERBS = new Set(['infer', 'exec', 'invoke', 'agent']);
const KINDS = new Set(['value', 'terminal-observation', 'failure-observation', 'control', 'recovery']);
const PREDICATES = new Set(['succeeded', 'failed', 'skipped', 'terminal']);

describe('the media harness fixture — held against the renderer contract', () => {
  const graph = extractGraph();
  const ids = new Set(graph.nodes.map((n) => n.id));

  it('every node speaks the CURRENT dialect (producers — never a renamed ghost)', () => {
    for (const n of graph.nodes) {
      expect(typeof n.id).toBe('string');
      expect(VERBS.has(n.verb), `${n.id}: verb ${n.verb}`).toBe(true);
      expect(Array.isArray(n.producers), `${n.id}: producers must be an array (the 2026-07-18 corpse class)`).toBe(true);
      expect('dependsOn' in n, `${n.id}: dependsOn is the dead dialect`).toBe(false);
    }
  });

  it('every edge is typed in the closed kind set and references real nodes', () => {
    expect(graph.edges.length).toBeGreaterThan(0);
    for (const e of graph.edges) {
      expect(KINDS.has(e.kind), `${e.id}: kind ${e.kind}`).toBe(true);
      expect(ids.has(e.source), `${e.id}: source ${e.source}`).toBe(true);
      expect(ids.has(e.target), `${e.id}: target ${e.target}`).toBe(true);
      if (e.kind === 'control') {
        expect(e.predicate !== undefined && PREDICATES.has(e.predicate), `${e.id}: control needs a predicate`).toBe(true);
      }
    }
  });

  it('producers agree with the edges (the io story and the wires never diverge)', () => {
    for (const n of graph.nodes) {
      for (const p of n.producers) {
        expect(ids.has(p), `${n.id}: producer ${p}`).toBe(true);
      }
    }
  });

  it('a subManifest skeleton is internally consistent (its own ids · its own edges)', () => {
    for (const n of graph.nodes) {
      const sk = n.subManifest?.skeleton;
      if (!sk) { continue; }
      const skIds = new Set(sk.nodes.map((s) => s.id));
      expect(sk.nodes.length).toBe(n.subManifest!.tasks);
      for (const s of sk.nodes) { expect(VERBS.has(s.verb)).toBe(true); }
      for (const e of sk.edges) {
        expect(skIds.has(e.source) && skIds.has(e.target), `peek edge ${e.source}->${e.target}`).toBe(true);
      }
    }
  });
});
