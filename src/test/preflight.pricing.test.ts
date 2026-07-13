import { describe, expect, it } from 'vitest';

import { buildPreflight, collectPreflightFacts, renderPreflight } from '../core/preflight';
import type { CheckReport } from '../core/cliContract';

const YAML = 'nika: v1\nworkflow:\n  id: rates\nmodel: anthropic/claude-sonnet-5\ntasks:\n  think:\n    infer:\n      prompt: hi\n';

function reportWith(pricing: CheckReport['pricing']): CheckReport {
  return {
    report_version: 1,
    conformance: [], waves: [[0]], cost: { tasks: [] } as unknown as CheckReport['cost'],
    secret_leaks: [], secret_egresses: [], capability_escapes: [], schema_findings: [],
    unknown_tools: [], unknown_args: [], missing_args: [], gate_findings: [],
    schema_lints: [], hints: [],
    pricing,
  } as CheckReport;
}

describe('preflight pricing rates', () => {
  it('appends engine rates to the model row detail', () => {
    const m = buildPreflight({
      workflowName: 'rates',
      facts: collectPreflightFacts(YAML),
      report: reportWith({ models: [
        { model: 'anthropic/claude-sonnet-5', input_per_million: 2, output_per_million: 10 },
      ]}),
      envPresent: () => true,
    });
    const row = m.modelRows.find((r) => r.model === 'anthropic/claude-sonnet-5');
    expect(row?.detail).toContain('$2/$10 per 1M');
  });

  it('an UNKNOWN price renders nothing — never $0', () => {
    const m = buildPreflight({
      workflowName: 'rates',
      facts: collectPreflightFacts(YAML),
      report: reportWith({ models: [
        { model: 'anthropic/claude-sonnet-5', input_per_million: null, output_per_million: null },
      ]}),
      envPresent: () => true,
    });
    const row = m.modelRows.find((r) => r.model === 'anthropic/claude-sonnet-5');
    expect(row?.detail).not.toContain('$');
    expect(row?.detail).not.toContain('0');
  });
});

describe('preflight pricing snapshot provenance', () => {
  const models = [
    { model: 'anthropic/claude-sonnet-5', input_per_million: 2, output_per_million: 10 },
  ];

  it('renders the snapshot line when the engine sends one', () => {
    const recent = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    const m = buildPreflight({
      workflowName: 'rates',
      facts: collectPreflightFacts(YAML),
      report: reportWith({ models, snapshot: {
        source: 'https://models.dev/api.json',
        as_of: recent,
        source_sha256_16: 'd31a39603aa5419d',
        rules: 606,
        providers: 42,
      }}),
      envPresent: () => true,
    });
    expect(m.pricingSnapshot).toBe(`list rates (public catalog) · snapshot ${recent} · 606 models`);
    expect(renderPreflight(m)).toContain(`- Prices: list rates (public catalog) · snapshot ${recent} · 606 models`);
  });

  it('hints when the snapshot is stale (>120 days)', () => {
    const m = buildPreflight({
      workflowName: 'rates',
      facts: collectPreflightFacts(YAML),
      report: reportWith({ models, snapshot: { as_of: '2025-01-01', rules: 500 } }),
      envPresent: () => true,
    });
    expect(m.pricingSnapshot).toContain('⚠');
    expect(m.pricingSnapshot).toContain('days old — upgrade nika to refresh prices');
  });

  it('an engine that omits the snapshot renders NOTHING — never invented', () => {
    const m = buildPreflight({
      workflowName: 'rates',
      facts: collectPreflightFacts(YAML),
      report: reportWith({ models }),
      envPresent: () => true,
    });
    expect(m.pricingSnapshot).toBeUndefined();
    expect(renderPreflight(m)).not.toContain('- Prices:');
  });

  it('a snapshot without as_of renders nothing (malformed = absent)', () => {
    const m = buildPreflight({
      workflowName: 'rates',
      facts: collectPreflightFacts(YAML),
      report: reportWith({ models, snapshot: { rules: 606 } }),
      envPresent: () => true,
    });
    expect(m.pricingSnapshot).toBeUndefined();
  });
});
