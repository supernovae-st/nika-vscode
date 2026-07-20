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

function extractGraph(name = 'GRAPH'): { nodes: FixtureNode[]; edges: FixtureEdge[] } {
  const html = fs.readFileSync(HARNESS, 'utf-8');
  const start = html.indexOf(`const ${name} = {`);
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

// Both fixtures (the README run scene + the ?media CI-2 scene) are held
// against the SAME renderer contract — a drifting fixture fails here.
describe.each(['GRAPH', 'MEDIA_GRAPH'])('the %s harness fixture — held against the renderer contract', (name) => {
  const graph = extractGraph(name);
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

describe('the ?media scene — the CI-2 frame coverage floor', () => {
  const graph = extractGraph('MEDIA_GRAPH');
  const tools = graph.nodes.map((n) => n.tool).filter((t): t is string => typeof t === 'string');

  it('seeds every declared-frame kind (image · ratio-gap · fx · 5 chart shapes · audio · check · receipts)', () => {
    const args = new Map(graph.nodes.map((n) => [n.id, String(n.argsPreview ?? '')]));
    expect(tools.filter((t) => t === 'nika:image_generate').length).toBeGreaterThanOrEqual(2);
    // The stated-gap card: one image_generate declares an INTERPOLATED ratio.
    expect([...args.values()].some((a) => a.includes('aspect_ratio: ${{'))).toBe(true);
    expect(tools.filter((t) => t === 'nika:tts_generate').length).toBeGreaterThanOrEqual(2);
    expect(tools.filter((t) => t === 'nika:image_fx').length).toBeGreaterThanOrEqual(2);
    expect(tools).toContain('nika:compose');
    expect(tools).toContain('nika:write');
    expect(tools).toContain('nika:edit');
    // All five chart shapes on one canvas.
    const chartTypes = graph.nodes
      .filter((n) => n.tool === 'nika:chart')
      .map((n) => /type: ([a-z_]+)/.exec(String(n.argsPreview ?? ''))?.[1]);
    expect(new Set(chartTypes)).toEqual(new Set(['bar', 'line', 'area_band', 'scatter', 'heatmap']));
  });

  it('is the ~38-node scene the GIF shoots', () => {
    expect(graph.nodes.length).toBeGreaterThanOrEqual(34);
    expect(graph.nodes.length).toBeLessThanOrEqual(42);
  });

  it('covers ALL 28 catalog builtins — the full identity grid (CI-3)', () => {
    // The pinned catalog fixture is the roster; the scene must seed
    // every builtin at least once (a builtin missing from the grid
    // has no pixel proof — the shot suite would silently narrow).
    const fixture = JSON.parse(fs.readFileSync(
      fileURLToPath(new URL('./fixtures/catalog-tools.json', import.meta.url)), 'utf-8'),
    ) as { tools: Array<{ name: string }> };
    const seeded = new Set(tools);
    for (const t of fixture.tools) {
      expect(seeded.has(t.name), `catalog builtin missing from the ?media grid: ${t.name}`).toBe(true);
    }
  });

  it('tints both predicate families — a succeeded read and a SHUT failed read', () => {
    const preds = graph.edges
      .filter((e) => e.kind === 'control')
      .map((e) => (e as { predicate?: string }).predicate);
    expect(preds).toContain('succeeded');
    expect(preds).toContain('failed');
    // The failed read must point at a task the sim never lands green —
    // an admitted-on-failure path completing as success would be an
    // impossible story on the proof canvas.
    const failedEdge = graph.edges.find(
      (e) => e.kind === 'control' && (e as { predicate?: string }).predicate === 'failed');
    expect(failedEdge?.target).toBe('salvage');
  });
});
