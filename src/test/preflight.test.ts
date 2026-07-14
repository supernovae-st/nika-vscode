import { describe, expect, it } from 'vitest';
import {
  buildPreflight,
  collectPreflightFacts,
  parseCatalogProviders,
  renderPreflight,
} from '../core/preflight';
import type { CheckReport } from '../core/cliContract';

const YAML = `nika: v1
workflow:
  id: release-notes
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
  fetch:
    invoke:
      tool: "nika:fetch"
  digest:
    after: { fetch: succeeded }
    infer:
      prompt: "Summarize \${{ tasks.fetch.output }} for \${{ env.REGION }} org \${{ env.GITHUB_ORG }}"
  local_pass:
    after: { fetch: succeeded }
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
    expect(f.envDefined).toEqual(['REGION']);
    expect(f.envRefs).toEqual(['REGION', 'GITHUB_ORG']);
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
    const env = new Set(['GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'GITHUB_ORG']);
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
    // REGION is read AND defined in the workflow env: block — covered, no
    // process-env check; GITHUB_ORG is read-only → process env verified.
    expect(m.envRows).toEqual([
      { name: 'REGION', status: 'defined' },
      { name: 'GITHUB_ORG', status: 'present' },
    ]);
    const md = renderPreflight(m);
    expect(md).toContain('**READY**');
    expect(md).toContain('$0.04 – $0.12');
    expect(md).toContain('run together');
    expect(md).toContain('defined in the workflow `env:` block');
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
    // 3 blockers: env secret + model key + the read-but-unset GITHUB_ORG.
    // REGION is workflow-defined → NEVER a blocker even with empty env.
    expect(m.blockers.length).toBe(3);
    expect(m.envRows).toEqual([
      { name: 'REGION', status: 'defined' },
      { name: 'GITHUB_ORG', status: 'missing' },
    ]);
    expect(m.secretRows[0].status).toBe('missing');
    expect(m.secretRows[1].status).toBe('declared'); // vault: never fake-verified
    const md = renderPreflight(m);
    expect(md).toContain('**BLOCKED — 3 missing requirements:**');
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
    const facts = collectPreflightFacts('nika: v1\nmodel: mock/echo\ntasks:\n  a:\n    infer:\n      prompt: hi\n');
    const m = buildPreflight({ workflowName: 'x', facts, envPresent: () => false });
    expect(m.modelRows[0].status).toBe('local');
    expect(m.blockers).toEqual([]);
  });
});

describe('preflightChipModel', () => {
  const base = (over: Record<string, unknown>) => ({
    workflowName: 'x', clean: true, findings: 0, waves: [],
    secretRows: [], envRows: [], modelRows: [],
    permits: { declared: true, categories: [], escapes: 0, leaks: 0, egresses: 0 },
    cost: { label: '', unbounded: false, topTasks: [] },
    blockers: [],
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  it('blockers headline red; flows amber; ready green', async () => {
    const { preflightChipModel } = await import('../core/preflight');
    expect(preflightChipModel(base({ blockers: ['a', 'b'] }))).toMatchObject({ cls: 'bad', text: '✗ 2 missing' });
    expect(preflightChipModel(base({ permits: { declared: true, categories: [], escapes: 1, leaks: 0, egresses: 0 } })).cls).toBe('warn');
    expect(preflightChipModel(base({}))).toMatchObject({ cls: 'ok', text: '✓ preflight' });
  });

  it('unknown-provider models demote the ✓ to a neutral dot — never a lying green check', async () => {
    const { preflightChipModel } = await import('../core/preflight');
    const chip = preflightChipModel(base({
      modelRows: [{ model: 'custom/x', tasks: ['a'], status: 'unknown', detail: '' }],
    }));
    expect(chip.text).toBe('· preflight');
    expect(chip.tip).toContain('NOT checked');
  });
});

describe('factsFromRequirements (E-REQ · the engine states the contract)', () => {
  it('engine requirements win; permits stay client-read', async () => {
    const { factsFromRequirements } = await import('../core/preflight');
    const facts = factsFromRequirements({
      models: [{ model: 'anthropic/claude-sonnet-4-6', tasks: ['digest'] }],
      secrets: [
        { name: 'gh_token', source: 'env', key: 'GITHUB_TOKEN' },
        { name: 'vault_pass', source: 'vault', key: 'prod/db' },
      ],
      env_reads: ['GITHUB_ORG', 'REGION'],
      env_defined: ['REGION'],
      vars_required: ['target_url'],
    }, YAML);
    expect(facts.models.get('anthropic/claude-sonnet-4-6')).toEqual(['digest']);
    expect(facts.secrets[0]).toEqual({ name: 'gh_token', source: 'env', key: 'GITHUB_TOKEN' });
    // vault keys are lookup paths, never env names — the adapter drops them.
    expect(facts.secrets[1].key).toBeUndefined();
    expect(facts.envRefs).toEqual(['GITHUB_ORG', 'REGION']);
    expect(facts.envDefined).toEqual(['REGION']);
    // permits still come from the YAML (client-read).
    expect(facts.permitsDeclared).toBe(true);
    expect(facts.permitCategories).toEqual(['net', 'exec']);
  });
});
