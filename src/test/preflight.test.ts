import { describe, expect, it } from 'vitest';
import {
  buildPreflight,
  collectPreflightFacts,
  parseCatalogProviders,
  renderPreflight,
} from '../core/preflight';
import type { CheckReport } from '../core/cliContract';

const YAML = `nika: v1
workflow: release-notes
model: anthropic/claude-sonnet-4-6
secrets:
  gh_token:
    source: env
    key: GITHUB_TOKEN
  vault_pass:
    source: vault
env:
  REGION: eu-west-1
permits:
  net:
    - api.github.com
  exec: false
tasks:
  - id: fetch
    invoke:
      tool: "nika:fetch"
  - id: digest
    depends_on: [fetch]
    infer:
      prompt: "Summarize \${{ tasks.fetch.output }}"
  - id: local_pass
    depends_on: [fetch]
    infer:
      model: ollama/qwen3.5
      prompt: "rank"
`;

const CATALOG = JSON.stringify({
  catalog_version: 1,
  providers: [
    { id: 'anthropic', env_var: 'ANTHROPIC_API_KEY', requires_key: true, local: false, models: [] },
    { id: 'ollama', requires_key: false, local: true, models: [] },
  ],
});

const report = (over: Partial<CheckReport>): CheckReport => ({
  report_version: 1,
  clean: true,
  conformance: [],
  waves: [],
  cost: { tasks: [] },
  secret_leaks: [],
  secret_egresses: [],
  capability_escapes: [],
  schema_findings: [],
  unknown_tools: [],
  unknown_args: [],
  missing_args: [],
  gate_findings: [],
  schema_lints: [],
  hints: [],
  ...over,
});

describe('collectPreflightFacts', () => {
  it('reads secrets sources, env keys, permits, and resolved models', () => {
    const f = collectPreflightFacts(YAML);
    expect(f.secrets).toEqual([
      { name: 'gh_token', source: 'env', key: 'GITHUB_TOKEN' },
      { name: 'vault_pass', source: 'vault' },
    ]);
    expect(f.envKeys).toEqual(['REGION']);
    expect(f.permitsDeclared).toBe(true);
    expect(f.permitCategories).toEqual(['net', 'exec']);
    // digest inherits the workflow default; local_pass overrides; fetch (invoke) has none.
    expect(f.models.get('anthropic/claude-sonnet-4-6')).toEqual(['digest']);
    expect(f.models.get('ollama/qwen3.5')).toEqual(['local_pass']);
  });

  it('never throws on a half-typed file', () => {
    expect(() => collectPreflightFacts('nika: v1\nsecrets:\n  half')).not.toThrow();
  });
});

describe('parseCatalogProviders', () => {
  it('extracts the key story per provider', () => {
    const p = parseCatalogProviders(CATALOG)!;
    expect(p.anthropic).toEqual({ envVar: 'ANTHROPIC_API_KEY', requiresKey: true, local: false });
    expect(p.ollama.local).toBe(true);
  });

  it('returns undefined on garbage', () => {
    expect(parseCatalogProviders('nope')).toBeUndefined();
    expect(parseCatalogProviders('{"providers": 3}')).toBeUndefined();
  });
});

describe('buildPreflight + renderPreflight', () => {
  const graph = {
    nodes: [{ id: 'fetch' }, { id: 'digest' }, { id: 'local_pass' }],
    edges: [
      { source: 'fetch', target: 'digest' },
      { source: 'fetch', target: 'local_pass' },
    ],
  };

  it('happy path: keys present → READY, waves narrated, local marked sovereign', () => {
    const env = new Set(['GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'REGION']);
    const m = buildPreflight({
      workflowName: 'release-notes',
      facts: collectPreflightFacts(YAML),
      report: report({ cost: { tasks: [], bounded_total_usd: 0.12, min_path_total_usd: 0.04 } }),
      graph,
      catalog: parseCatalogProviders(CATALOG),
      envPresent: (n) => env.has(n),
    });
    expect(m.blockers).toEqual([]);
    expect(m.waves).toEqual([['fetch'], ['digest', 'local_pass']]);
    expect(m.modelRows.find((r) => r.model === 'ollama/qwen3.5')?.status).toBe('local');
    const md = renderPreflight(m);
    expect(md).toContain('**READY**');
    expect(md).toContain('$0.04 – $0.12');
    expect(md).toContain('run together');
  });

  it('missing env secret + missing model key → blockers, never a fake green', () => {
    const m = buildPreflight({
      workflowName: 'release-notes',
      facts: collectPreflightFacts(YAML),
      report: report({}),
      graph,
      catalog: parseCatalogProviders(CATALOG),
      envPresent: () => false,
    });
    expect(m.blockers.length).toBe(2);
    expect(m.secretRows[0].status).toBe('missing');
    expect(m.secretRows[1].status).toBe('declared'); // vault: never fake-verified
    const md = renderPreflight(m);
    expect(md).toContain('**BLOCKED — 2 missing requirements:**');
    expect(md).toContain('GITHUB_TOKEN');
    expect(md).toContain('not statically verifiable');
  });

  it('unbounded cost stays a loud floor', () => {
    const m = buildPreflight({
      workflowName: 'x',
      facts: collectPreflightFacts('nika: v1\ntasks: []\n'),
      report: report({
        cost: {
          tasks: [{ task: 'big', usd: 0.4, max_tokens: null }],
          min_path_total_usd: 0.4,
          has_unbounded: true,
        },
      }),
      envPresent: () => true,
    });
    expect(m.cost.unbounded).toBe(true);
    expect(renderPreflight(m)).toContain('UNBOUNDED');
    expect(m.cost.topTasks[0].label).toContain('(unbounded)');
  });

  it('degrades honestly without a report or catalog', () => {
    const m = buildPreflight({
      workflowName: 'x',
      facts: collectPreflightFacts(YAML),
      envPresent: () => true,
    });
    expect(m.cost.label).toBe('no static cost data');
    expect(m.modelRows.find((r) => r.model.startsWith('anthropic'))?.status).toBe('unknown');
    expect(renderPreflight(m)).toContain('not checked');
  });

  it('mock provider is zero-key zero-spend', () => {
    const facts = collectPreflightFacts('nika: v1\nmodel: mock/echo\ntasks:\n  - id: a\n    infer:\n      prompt: hi\n');
    const m = buildPreflight({ workflowName: 'x', facts, envPresent: () => false });
    expect(m.modelRows[0].status).toBe('local');
    expect(m.blockers).toEqual([]);
  });
});
