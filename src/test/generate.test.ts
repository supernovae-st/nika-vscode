// generate.test.ts — the intent → workflow machinery, seam-tested.
//
// intentRank: BM25 routing with the alias bridge. generatePipeline: the
// research-validated loop budget — best-of-N with dedup, oracle scoring,
// early-stop, ≤2 repair rounds, best-so-far. The llm/check seams are
// faked here; the REAL oracle is pinned in contract.test.ts.

import { describe, expect, it } from 'vitest';
import { expandQuery, rankBm25, tokenize } from '../core/intentRank';
import {
  buildRepairPrompt,
  compareOutcomes,
  extractYaml,
  generateWorkflow,
  normalizeForDedup,
  variantPrompt,
  type GenCheckOutcome,
} from '../core/generatePipeline';

describe('intentRank · tokenize/expand', () => {
  it('tokenizes code-ish text, dropping single chars', () => {
    expect(tokenize('Fetch the URL, then summarize-it_2x!')).toEqual(
      ['fetch', 'the', 'url', 'then', 'summarize', 'it_2x'],
    );
  });

  it('bridges everyday words to Nika vocabulary', () => {
    const expanded = expandQuery(['scrape', 'website']);
    expect(expanded).toContain('fetch');
    expect(expanded).toContain('extract');
    expect(expanded).toContain('scrape'); // originals stay
  });
});

describe('intentRank · BM25', () => {
  const docs = [
    { id: 'template:chain', text: 'chain\nsequential pipeline one task then the next infer prompt' },
    { id: 'template:fanout', text: 'fanout\nfan out parallel for_each items infer summarize join' },
    { id: 'template:gate-and-act', text: 'gate-and-act\nhuman gate approve when exec command' },
  ];

  it('routes a parallel intent to the fanout template', () => {
    const ranked = rankBm25('summarize every item in parallel', docs);
    expect(ranked[0].id).toBe('template:fanout');
    expect(ranked[0].score).toBeGreaterThan(0);
  });

  it('routes via the alias bridge (scrape → fetch is absent, chain wins on pipeline)', () => {
    const ranked = rankBm25('a sequential pipeline of prompts', docs);
    expect(ranked[0].id).toBe('template:chain');
  });

  it('is deterministic on ties (lexical id order)', () => {
    const tied = [
      { id: 'b', text: 'nothing matches' },
      { id: 'a', text: 'nothing matches' },
    ];
    const ranked = rankBm25('zzz', tied);
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b']);
    expect(ranked[0].score).toBe(0);
  });

  it('empty corpus → empty ranking', () => {
    expect(rankBm25('anything', [])).toEqual([]);
  });
});

describe('generatePipeline · extractYaml', () => {
  it('takes the fenced yaml block', () => {
    const text = 'Reasoning…\n```yaml\nnika: v1\nworkflow:\n  id: x\n```\n';
    expect(extractYaml(text)).toBe('nika: v1\nworkflow:\n  id: x');
  });

  it('the LAST envelope-bearing block wins (reasoning may quote snippets)', () => {
    const text = [
      'First a sketch:',
      '```yaml',
      'nika: v1',
      'workflow:',
      '  id: draft',
      '```',
      'Final version:',
      '```yaml',
      'nika: v1',
      'workflow:',
      '  id: final',
      '```',
    ].join('\n');
    expect(extractYaml(text)).toContain('workflow:\n  id: final');
  });

  it('accepts raw text already opening with the envelope', () => {
    expect(extractYaml('nika: v1\nworkflow:\n  id: raw\n')).toBe('nika: v1\nworkflow:\n  id: raw');
  });

  it('prose without yaml → undefined', () => {
    expect(extractYaml('I cannot help with that.')).toBeUndefined();
  });
});

describe('generatePipeline · dedup + ordering', () => {
  it('normalization erases comments and blank lines, not structure', () => {
    const a = 'nika: v1\n\n# comment\nworkflow:\n  id: x  # trailing\n';
    const b = 'nika: v1\nworkflow:\n  id: x\n';
    expect(normalizeForDedup(a)).toBe(normalizeForDedup(b));
  });

  const outcome = (over: Partial<GenCheckOutcome>): GenCheckOutcome => ({
    exit: 0, findings: 0, hints: 0, codes: [], parsed: true, ...over,
  });

  it('orders: parse fail ≫ findings ≫ hints', () => {
    expect(compareOutcomes(outcome({}), outcome({ findings: 1 }))).toBeLessThan(0);
    expect(compareOutcomes(outcome({ parsed: false }), outcome({ findings: 9 }))).toBeGreaterThan(0);
    expect(compareOutcomes(outcome({ hints: 1 }), outcome({ hints: 3 }))).toBeLessThan(0);
  });

  it('variant prompts differ per candidate index', () => {
    const base = 'BASE';
    const variants = [0, 1, 2, 3].map((i) => variantPrompt(base, i));
    expect(new Set(variants).size).toBeGreaterThan(1);
    expect(variants[0]).toBe(base);
  });

  it('repair prompt embeds the draft, the report and the exemplar', () => {
    const p = buildRepairPrompt('nika: v1\n', outcome({ findings: 2, reportJson: '{"x":1}' }), 'EXEMPLAR');
    expect(p).toContain('nika: v1');
    expect(p).toContain('{"x":1}');
    expect(p).toContain('EXEMPLAR');
    expect(p).toContain('add "X" to permits.<path>');
  });
});

describe('generatePipeline · the loop budget', () => {
  const yamlAnswer = (wf: string): string => '```yaml\nnika: v1\nworkflow: ' + wf + '\n```';

  const checkBy = (
    table: Record<string, Partial<GenCheckOutcome>>,
    calls?: string[],
  ): ((yaml: string) => Promise<GenCheckOutcome>) =>
    async (yaml: string): Promise<GenCheckOutcome> => {
      calls?.push(yaml);
      const wf = yaml.match(/workflow: (\S+)/)?.[1] ?? '?';
      return { exit: 0, findings: 0, hints: 0, codes: [], parsed: true, ...(table[wf] ?? {}) };
    };

  it('never declares clean when the binary exits non-zero — exit outranks the client count', async () => {
    // The trap: a finding family the client does not fold yet (engine adds
    // one behind report_version 1) → findings === 0 while `nika check`
    // exits 2. The gate must trust the exit code, not the client's count.
    let llmCalls = 0;
    const result = await generateWorkflow(
      'BASE',
      {
        llm: async () => { llmCalls += 1; return yamlAnswer(`c${llmCalls}`); },
        check: checkBy({ c1: { exit: 2 }, c2: { exit: 2 }, c3: { exit: 2 }, c4: { exit: 2 }, c5: { exit: 2 } }),
      },
      { candidates: 3, repairRounds: 2 },
    );
    expect(result?.clean).toBe(false);
    expect(result?.roundsUsed).toBe(2); // it kept trying — exit 2 is not done
  });

  it('early-stops on a clean candidate — zero repair rounds', async () => {
    let llmCalls = 0;
    const result = await generateWorkflow(
      'BASE',
      {
        llm: async () => { llmCalls += 1; return yamlAnswer(`c${llmCalls}`); },
        check: checkBy({}),
      },
      { candidates: 3, repairRounds: 2 },
    );
    expect(result?.clean).toBe(true);
    expect(result?.roundsUsed).toBe(0);
    expect(llmCalls).toBe(3); // first-shot candidates only
  });

  it('best-of-N picks the clean candidate among dirty ones', async () => {
    let i = 0;
    const result = await generateWorkflow(
      'BASE',
      {
        llm: async () => { i += 1; return yamlAnswer(`c${i}`); },
        check: checkBy({ c1: { findings: 3 }, c2: {}, c3: { findings: 1 } }),
      },
      { candidates: 3, repairRounds: 2 },
    );
    expect(result?.clean).toBe(true);
    expect(result?.yaml).toContain('workflow: c2');
  });

  it('structurally identical candidates hit the oracle once', async () => {
    const calls: string[] = [];
    await generateWorkflow(
      'BASE',
      {
        llm: async () => yamlAnswer('same'),
        check: checkBy({}, calls),
      },
      { candidates: 3, repairRounds: 0 },
    );
    expect(calls).toHaveLength(1);
  });

  it('repairs a dirty best until clean, counting rounds', async () => {
    let phase = 0;
    const result = await generateWorkflow(
      'BASE',
      {
        llm: async (prompt) => {
          if (prompt.includes('fails the conformance oracle')) {
            phase += 1;
            return yamlAnswer(`repaired${phase}`);
          }
          return yamlAnswer('draft');
        },
        check: checkBy({ draft: { findings: 2, codes: ['NIKA-DAG-003'] }, repaired1: {} }),
      },
      { candidates: 1, repairRounds: 2 },
    );
    expect(result?.clean).toBe(true);
    expect(result?.roundsUsed).toBe(1);
    expect(result?.yaml).toContain('repaired1');
  });

  it('stops at the budget — never deep-loops (the plateau law)', async () => {
    let repairCalls = 0;
    const result = await generateWorkflow(
      'BASE',
      {
        llm: async (prompt) => {
          if (prompt.includes('fails the conformance oracle')) {
            repairCalls += 1;
            return yamlAnswer(`r${repairCalls}`);
          }
          return yamlAnswer('draft');
        },
        check: checkBy({ draft: { findings: 5 }, r1: { findings: 4 }, r2: { findings: 3 } }),
      },
      { candidates: 1, repairRounds: 2 },
    );
    expect(repairCalls).toBe(2);
    expect(result?.clean).toBe(false);
    expect(result?.roundsUsed).toBe(2);
    expect(result?.findings).toBe(3);
  });

  it('a regressed repair never replaces the best-so-far', async () => {
    const result = await generateWorkflow(
      'BASE',
      {
        llm: async (prompt) =>
          prompt.includes('fails the conformance oracle') ? yamlAnswer('worse') : yamlAnswer('draft'),
        check: checkBy({ draft: { findings: 1 }, worse: { findings: 7 } }),
      },
      { candidates: 1, repairRounds: 1 },
    );
    expect(result?.yaml).toContain('workflow: draft');
    expect(result?.findings).toBe(1);
  });

  it('reground receives the failing codes (RepoCoder re-retrieval)', async () => {
    const seen: string[][] = [];
    await generateWorkflow(
      'BASE',
      {
        llm: async (prompt) =>
          prompt.includes('fails the conformance oracle') ? yamlAnswer('fixed') : yamlAnswer('draft'),
        check: checkBy({ draft: { findings: 1, codes: ['NIKA-VAR-001'] }, fixed: {} }),
        reground: async (codes) => { seen.push(codes); return 'EXEMPLAR'; },
      },
      { candidates: 1, repairRounds: 2 },
    );
    expect(seen).toEqual([['NIKA-VAR-001']]);
  });

  it('no YAML from any candidate → undefined', async () => {
    const result = await generateWorkflow(
      'BASE',
      { llm: async () => 'I refuse.', check: checkBy({}) },
      { candidates: 2, repairRounds: 2 },
    );
    expect(result).toBeUndefined();
  });
});
