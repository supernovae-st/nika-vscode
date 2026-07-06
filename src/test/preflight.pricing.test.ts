import { describe, expect, it } from 'vitest';

import { buildPreflight, collectPreflightFacts } from '../core/preflight';
import type { CheckReport } from '../core/cliContract';

const YAML = 'nika: v1\nworkflow: rates\nmodel: anthropic/claude-sonnet-5\ntasks:\n  - id: think\n    infer:\n      prompt: hi\n';

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
