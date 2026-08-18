import { describe, expect, it } from 'vitest';
import {
  buildPreflight,
  collectPreflightFacts,
  parseCatalogProviders,
  renderPreflight,
} from '../core/preflight';
import type { CheckReport } from '../core/cliContract';

const YAML = `# release notes · the preflight fixture (nine-key envelope · nika 0.109)
nika: release-notes
model: anthropic/claude-sonnet-4-6
inputs:
  region: { type: string, required: false, default: "eu-west-1" }
  github_org:
    type: string
    required: true
secrets:
  gh_token:
    source: env
    key: GITHUB_TOKEN
  vault_pass:
    source: vault
    key: prod/db
permits:
  net:
    http:
      - api.github.com
  exec: []
tasks:
  fetch:
    invoke:
      tool: "nika:fetch"
      args:
        url: "https://api.github.com/orgs/\${{ inputs.github_org }}"
  digest:
    with:
      page: "\${{ tasks.fetch.output }}"
    infer:
      prompt: "Summarize \${{ with.page }} for \${{ inputs.region }} org \${{ inputs.github_org }}"
  local_pass:
    after: { fetch: success }
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
  it('reads secrets sources, declared inputs (required in flow AND block form), permits, and resolved models', () => {
    const f = collectPreflightFacts(YAML);
    expect(f.secrets).toEqual([
      { name: 'gh_token', source: 'env', key: 'GITHUB_TOKEN' },
      { name: 'vault_pass', source: 'vault', key: 'prod/db' },
    ]);
    // A deployment-supplied value is an inputs: entry with required: false
    // + default: (where `config:` went); only an explicit `required: true`
    // makes an input mandatory (the engine's own rule).
    expect(f.inputsDeclared).toEqual(['region', 'github_org']);
    expect(f.inputsRequired).toEqual(['github_org']);
    expect(f.permitsDeclared).toBe(true);
    expect(f.permitCategories).toEqual(['net', 'exec']);
    // digest inherits the workflow default; local_pass overrides; fetch (invoke) has none.
    expect(f.models.get('anthropic/claude-sonnet-4-6')).toEqual(['digest']);
    expect(f.models.get('ollama/qwen3.5')).toEqual(['local_pass']);
  });

  it('never throws on a half-typed file', () => {
    expect(() => collectPreflightFacts('nika: half-typed\nsecrets:\n  half')).not.toThrow();
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
    expect(m.waves).toEqual([['fetch'], ['digest', 'local_pass']]);
    expect(m.modelRows.find((r) => r.model === 'ollama/qwen3.5')?.status).toBe('local');
    expect(m.blockers).toEqual([]);
    // The inputs story: a required input is a flight FACT (the run door
    // asks for it), never a blocker; the defaulted one is optional.
    expect(m.inputRows).toEqual([
      { name: 'region', status: 'optional' },
      { name: 'github_org', status: 'required' },
    ]);
    const md = renderPreflight(m);
    expect(md).toContain('**READY**');
    expect(md).toContain('$0.04 – $0.12');
    expect(md).toContain('run together');
    expect(md).toContain('## Secrets & inputs');
    expect(md).toContain('input `github_org` · required · the caller supplies it at launch');
    expect(md).toContain('input `region` · optional');
    expect(md).not.toContain('config:');
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
    // 2 blockers: the env-source secret + the model key. A required input
    // is NEVER a blocker, whatever the process env holds (no ambient read).
    expect(m.blockers.length).toBe(2);
    expect(m.inputRows).toEqual([
      { name: 'region', status: 'optional' },
      { name: 'github_org', status: 'required' },
    ]);
    expect(m.secretRows[0].status).toBe('missing');
    expect(m.secretRows[1].status).toBe('declared'); // vault: never fake-verified
    const md = renderPreflight(m);
    expect(md).toContain('**BLOCKED · 2 missing requirements:**');
    expect(md).toContain('GITHUB_TOKEN');
    expect(md).toContain('not statically verifiable');
  });

  it('an input the OS happens to hold is still just an input — no ambient probe, no fake present', () => {
    // No value authority has an ambient fallback (spec 01): the flight
    // plan never probes the process env for an input, so `envPresent`
    // saying yes changes nothing about the inputs rows — an undeclared
    // read is NIKA-VAR-001 at check, and check owns that finding.
    const m = buildPreflight({
      workflowName: 'release-notes',
      facts: collectPreflightFacts(YAML),
      report: report({}),
      graph,
      catalog: parseCatalogProviders(CATALOG),
      envPresent: () => true,
    });
    expect(m.inputRows).toEqual([
      { name: 'region', status: 'optional' },
      { name: 'github_org', status: 'required' },
    ]);
    expect(m.blockers).toEqual([]);
    expect(renderPreflight(m)).not.toMatch(/config/);
  });

  it('unbounded cost stays a loud floor', () => {
    const m = buildPreflight({
      workflowName: 'x',
      facts: collectPreflightFacts('nika: unbounded\ntasks: []\n'),
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
    const facts = collectPreflightFacts('nika: mock-only\nmodel: mock/echo\ntasks:\n  a:\n    infer:\n      prompt: hi\n');
    const m = buildPreflight({ workflowName: 'x', facts, envPresent: () => false });
    expect(m.modelRows[0].status).toBe('local');
    expect(m.blockers).toEqual([]);
  });
});

describe('preflightChipModel', () => {
  const base = (over: Record<string, unknown>) => ({
    workflowName: 'x', clean: true, findings: 0, waves: [],
    secretRows: [], inputRows: [], modelRows: [],
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
      inputs_read: ['github_org', 'region'],
      inputs_required: ['github_org'],
    }, YAML);
    expect(facts.models.get('anthropic/claude-sonnet-4-6')).toEqual(['digest']);
    expect(facts.secrets[0]).toEqual({ name: 'gh_token', source: 'env', key: 'GITHUB_TOKEN' });
    // vault keys are lookup paths, never env names — the adapter drops them.
    expect(facts.secrets[1].key).toBeUndefined();
    // The engine's word on what the caller must supply wins; the declared
    // set still comes from the YAML (the wire carries reads, not decls).
    expect(facts.inputsRequired).toEqual(['github_org']);
    expect(facts.inputsDeclared).toEqual(['region', 'github_org']);
    // permits still come from the YAML (client-read).
    expect(facts.permitsDeclared).toBe(true);
    expect(facts.permitCategories).toEqual(['net', 'exec']);
  });
});
