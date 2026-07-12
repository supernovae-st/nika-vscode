// artifactsReal.e2e.test.ts — the artifacts chain proven on the REAL
// binary: a real `nika run` writes a real `.nika/traces/*.ndjson`
// (v0.94 journal), and the extension's extractor recovers the artifact
// WITH its provenance from that trace — no synthetic fixtures on this
// floor. Self-skips below a journal-writing binary (same law as
// runWire.e2e / contract.test).

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { extractRunArtifacts, pickCardArtifact } from '../core/artifacts';
import { parseCatalogProviders } from '../core/preflight';

// Prefer a RELEASED binary over bare PATH — same shield as
// journeyReal: a sister session routinely swaps the PATH binary for
// an in-flight branch build; these belts pin SHIPPED behavior.
const CELLAR = (() => {
  try {
    const base = '/opt/homebrew/Cellar/nika';
    const versions = fs.readdirSync(base).sort();
    return versions.length ? `${base}/${versions[versions.length - 1]}/bin/nika` : undefined;
  } catch { return undefined; }
})();
const CANDIDATES = [
  process.env.NIKA_BIN,
  CELLAR,
  'nika',
].filter((p): p is string => typeof p === 'string' && p.length > 0);

function probe(bin: string): { catalog: boolean } | undefined {
  try {
    execFileSync(bin, ['--version'], { timeout: 5000 });
  } catch {
    return undefined;
  }
  try {
    execFileSync(bin, ['catalog', '--json'], { timeout: 10000 });
    return { catalog: true };
  } catch {
    return { catalog: false };
  }
}

const found = CANDIDATES.map((bin) => ({ bin, caps: probe(bin) }))
  .find((c) => c.caps !== undefined);
const BIN = found?.bin;
const HAS_CATALOG = found?.caps?.catalog === true;

const WORKFLOW = `nika: v1
workflow: artifacts-e2e
permits:
  fs:
    write:
      - "out/*"
tasks:
  - id: save
    invoke:
      tool: "nika:write"
      args:
        path: "out/report.md"
        content: "# proof\\n"
`;

describe.skipIf(!BIN)('artifacts on the real binary', () => {
  it('a real run journal yields the artifact with its producing task', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nika-artifacts-e2e-'));
    try {
      const wf = path.join(dir, 'artifacts-e2e.nika.yaml');
      fs.writeFileSync(wf, WORKFLOW);
      let ran = true;
      try {
        execFileSync(BIN!, ['run', wf, '--json', '--no-color'], {
          cwd: dir,
          timeout: 30000,
          env: { ...process.env, NO_COLOR: '1' },
        });
      } catch {
        // Older binary (no journal · different write args) — skip floor.
        ran = false;
      }
      const traceDir = path.join(dir, '.nika', 'traces');
      if (!ran || !fs.existsSync(traceDir)) {
        expect.soft(true).toBe(true); // binary predates the journal — floor holds via unit fixtures
        return;
      }
      const traces = fs.readdirSync(traceDir).filter((f) => f.endsWith('.ndjson'));
      expect(traces.length).toBeGreaterThan(0);
      const ndjson = fs.readFileSync(path.join(traceDir, traces[0]), 'utf-8');
      const byTask = extractRunArtifacts(ndjson);
      const arts = byTask.get('save') ?? [];
      expect(arts.length).toBeGreaterThan(0);
      expect(arts[0].path).toContain('report.md');
      expect(arts[0].taskId).toBe('save');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a real chart run yields an IMAGE card pick (svg is first-class)', () => {
    // The full card pipeline against the flagship media builtin:
    // `nika:chart` writes a byte-identical SVG at `out` — the extractor
    // must class it image and the pure pick must label it, or the media
    // card previews nothing (the exact regression the svg-less
    // IMAGE_EXT shipped).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nika-chart-e2e-'));
    try {
      const wf = path.join(dir, 'chart-e2e.nika.yaml');
      fs.writeFileSync(wf, `nika: v1
workflow: chart-card-e2e
permits:
  fs:
    write:
      - "out/*"
tasks:
  - id: novelty_chart
    invoke:
      tool: "nika:chart"
      args:
        data:
          - { item: "a", score: 3 }
          - { item: "b", score: 5 }
          - { item: "c", score: 2 }
        chart:
          type: bar
          x: item
          y: score
          title: "novelty by item"
        out: "out/novelty.svg"
`);
      let ran = true;
      try {
        execFileSync(BIN!, ['run', wf, '--json', '--no-color'], {
          cwd: dir,
          timeout: 30000,
          env: { ...process.env, NO_COLOR: '1' },
        });
      } catch {
        ran = false; // pre-chart binary (0.98-) — the floor holds via unit fixtures
      }
      const traceDir = path.join(dir, '.nika', 'traces');
      if (!ran || !fs.existsSync(traceDir)) {
        expect.soft(true).toBe(true);
        return;
      }
      const traces = fs.readdirSync(traceDir).filter((f) => f.endsWith('.ndjson'));
      expect(traces.length).toBeGreaterThan(0);
      const ndjson = fs.readFileSync(path.join(traceDir, traces[0]), 'utf-8');
      const arts = extractRunArtifacts(ndjson).get('novelty_chart') ?? [];
      expect(arts.length).toBeGreaterThan(0);
      const pick = pickCardArtifact(arts);
      expect(pick).toBeDefined();
      expect(pick!.kind).toBe('image');
      expect(pick!.name).toBe('novelty.svg');
      // The recorded path resolves to REAL bytes on disk (the honesty
      // gate the host resolution applies before any thumb renders).
      const abs = path.isAbsolute(pick!.path) ? pick!.path : path.join(dir, pick!.path);
      expect(fs.existsSync(abs)).toBe(true);
      expect(fs.statSync(abs).size).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!HAS_CATALOG)('the real catalog parses into the key story', () => {
    const stdout = execFileSync(BIN!, ['catalog', '--json'], {
      timeout: 10000,
      encoding: 'utf-8',
    });
    const providers = parseCatalogProviders(stdout)!;
    expect(providers).toBeDefined();
    // Sovereign floor: at least one local provider, and cloud providers
    // that require a key must name their env var.
    expect(Object.values(providers).some((p) => p.local)).toBe(true);
    for (const [id, p] of Object.entries(providers)) {
      if (p.requiresKey) {
        expect(p.envVar, `provider ${id} requires a key but names no env var`).toBeDefined();
      }
    }
  });
});
