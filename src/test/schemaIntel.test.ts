import { describe, it, expect } from 'vitest';
import { buildSchemaIntel, fieldInScope, parseCanonErrorCodes, parseCanonItems } from '../core/schemaIntel';
import { yamlContextAt } from '../core/yamlContext';
import { countTaskRefs, findTaskRefs, isValidTaskId, renameTask } from '../core/renameRefs';

// Trimmed mirror of the REAL embedded schema shape (contract.test.ts pins
// the full thing against the live binary).
const SCHEMA = {
  properties: {
    nika: { description: 'The envelope · always v1.' },
    workflow: { description: 'Workflow id.' },
    model: { description: 'Default model · `<provider>/<name>`.' },
    tasks: { description: 'The DAG.' },
    permits: { description: 'The declared capability boundary.' },
  },
  $defs: {
    task: {
      properties: {
        id: { description: 'Task id (snake_case).' },
        after: {},
        when: { description: 'Conditional execution gate · CEL.' },
        timeout: { description: 'Go-duration string.' },
        infer: {}, exec: {}, invoke: {}, agent: {},
      },
    },
    infer: {
      properties: {
        prompt: {},
        temperature: { description: '0-2 · number or `${{ }}`.' },
        schema: { description: 'JSON Schema · structured output contract.' },
      },
    },
    exec: {
      properties: {
        command: {},
        capture: { enum: ['stdout', 'stderr', 'combined', 'structured'] },
      },
    },
    invoke: {
      properties: {
        tool: { oneOf: [{ enum: ['nika:fetch', 'nika:read', 'nika:jq', 'nika:done'] }, { type: 'string' }] },
        args: {},
      },
    },
    agent: { properties: { prompt: {}, tools: {}, max_turns: {} } },
    retry: { properties: { max_attempts: {}, backoff_strategy: { enum: ['fixed', 'linear', 'exponential'] } } },
  },
};

const CANON = `
# header
providers:
  count: 14
  reference: stdlib/providers-v0.1.md
  items:
    cloud:
      - anthropic
      - openai
    local:
      - ollama
    test:
      - mock

extract_modes:
  count: 9
  items:
    - markdown
    - article
    - jq

verbs:
  count: 4
`;

describe('schemaIntel', () => {
  const intel = buildSchemaIntel(SCHEMA, CANON)!;

  it('projects top-level · task · verb fields with docs', () => {
    expect(intel.topLevel.map((f) => f.name)).toContain('permits');
    expect(fieldInScope(intel, 'task', 'when')?.doc).toContain('CEL');
    expect(fieldInScope(intel, 'infer', 'temperature')?.doc).toContain('0-2');
  });

  it('extracts closed enums (capture) and the builtin tool set', () => {
    expect(fieldInScope(intel, 'exec', 'capture')?.values).toEqual(
      ['stdout', 'stderr', 'combined', 'structured'],
    );
    expect(intel.builtinTools).toContain('nika:fetch');
    expect(intel.builtinTools).toContain('nika:done');
  });

  it('parses grouped canon lists (providers cloud/local/test · modes flat)', () => {
    expect(intel.providers.cloud).toEqual(['anthropic', 'openai']);
    expect(intel.providers.local).toEqual(['ollama']);
    expect(intel.providers.all).toContain('mock');
    expect(intel.extractModes).toEqual(['markdown', 'article', 'jq']);
  });

  it('stops a canon list at the next top-level key', () => {
    const groups = parseCanonItems(CANON, 'extract_modes');
    expect(groups._).not.toContain('4'); // verbs section not absorbed
  });

  it('returns undefined on a non-schema payload', () => {
    expect(buildSchemaIntel({ foo: 1 }, '')).toBeUndefined();
    expect(buildSchemaIntel(null, '')).toBeUndefined();
  });
});

// ─── canon error_codes (the explain fallback's source) ──────────────────────

const CANON_ERRORS = `
error_codes:
  count: 3
  reference: spec/05-errors.md
  items:
    - { code: NIKA-DAG-003, category: validation_error, transient: "false", failure: "a tasks.X reference with no declared edge" }
    - { code: NIKA-VAR-002, category: variable_error, transient: "false", failure: "binding cardinality — a jq binding emitted zero, or multiple, values" }
    - { code: NIKA-INFER-001, category: provider_error, transient: "engine-assessed", failure: "provider call failed (HTTP error · provider refusal)" }

verbs:
  count: 4
`;

describe('parseCanonErrorCodes', () => {
  it('parses flow-style rows including commas inside the failure text', () => {
    const rows = parseCanonErrorCodes(CANON_ERRORS);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      code: 'NIKA-DAG-003',
      category: 'validation_error',
      transient: 'false',
      failure: 'a tasks.X reference with no declared edge',
    });
    expect(rows[1].failure).toContain('zero, or multiple');
    expect(rows[2].transient).toBe('engine-assessed');
  });

  it('stops at the next top-level key and tolerates absence', () => {
    const rows = parseCanonErrorCodes(CANON_ERRORS);
    expect(rows.some((r) => r.code.includes('4'))).toBe(false);
    expect(parseCanonErrorCodes('providers:\n  items:\n    - x\n')).toEqual([]);
  });

  it('rides buildSchemaIntel into the intel surface', () => {
    const intel = buildSchemaIntel(SCHEMA, CANON + CANON_ERRORS)!;
    expect(intel.errorCodes.map((r) => r.code)).toContain('NIKA-DAG-003');
  });
});

// ─── yamlContext ─────────────────────────────────────────────────────────────

const DOC = [
  'nika: v1',          // 0
  'workflow:',         // 1
  '  id: t',           // 2
  '',                  // 3
  'tasks:',            // 4
  '  fetch:',          // 5
  '    invoke:',       // 6
  '      tool: nika:fetch', // 7
  '      args:',       // 8
  '        mode: ',    // 9
  '  sum:',            // 10
  '    ',              // 11  (typing a task key)
  '    infer:',        // 12
  '      ',            // 13  (typing a verb key)
  '',                  // 14
].join('\n');

describe('yamlContextAt', () => {
  it('classifies top-level key typing', () => {
    expect(yamlContextAt('per', 0, 3)).toMatchObject({ kind: 'top-key', partial: 'per' });
  });

  it('classifies task-key position inside a task item', () => {
    expect(yamlContextAt(DOC, 11, 4)).toMatchObject({ kind: 'task-key', partial: '' });
  });

  it('classifies verb-key position inside a verb body', () => {
    expect(yamlContextAt(DOC, 13, 6)).toMatchObject({ kind: 'verb-key', verb: 'infer' });
  });

  it('classifies value position with verb + nearby tool (fetch mode)', () => {
    const ctx = yamlContextAt(DOC, 9, '        mode: '.length);
    expect(ctx).toMatchObject({ kind: 'value', key: 'mode', verb: 'invoke', tool: 'nika:fetch' });
  });

  // W1 « the map »: the task identity is the KEY, not an `id:` VALUE —
  // there is no id-value completion position anymore (keys are authored,
  // not offered), so the old « task id value » classification died with
  // the list form.
});

// ─── renameRefs ──────────────────────────────────────────────────────────────

const RENAME_DOC = [
  'nika: v1',
  'workflow:',
  '  id: t',
  'model: mock/echo',
  '',
  'tasks:',
  '  extract:',
  '    invoke:',
  '      tool: nika:fetch',
  '      args: { url: "https://x.com" }',
  '',
  '  use:',
  '    after: { extract: succeeded, other: succeeded }',
  '    with:',
  '      page: ${{ tasks.extract.output }}',
  '    infer:',
  '      prompt: "p ${{ with.page }} tasks.extract.status"',
  '',
  '  other:',
  '    after:',
  '      extract: terminal',
  '    exec:',
  '      command: ["echo", "hi"]',
].join('\n');

describe('renameRefs', () => {
  it('finds all 4 syntactic homes', () => {
    const refs = findTaskRefs(RENAME_DOC, 'extract');
    const homes = refs.map((r) => r.home).sort();
    // inline after entry + block after entry + declaration + with island
    // + a bare un-islanded ref (WIP text — still followed).
    expect(homes).toEqual(['after', 'after', 'cel', 'declaration', 'island']);
    // Every span is exactly the id token.
    for (const r of refs) {
      expect(RENAME_DOC.slice(r.start, r.end)).toBe('extract');
    }
  });

  it('renames every home and nothing else', () => {
    const out = renameTask(RENAME_DOC, 'extract', 'fetch_page')!;
    expect(out).not.toMatch(/\bextract\b/);
    expect(out).toContain('fetch_page:');
    expect(out).toContain('after: { fetch_page: succeeded, other: succeeded }');
    expect(out).toContain('${{ tasks.fetch_page.output }}');
    expect(out).toContain('tasks.fetch_page.status');
    expect(out).toContain('fetch_page: terminal');
    // Untouched parts stay byte-identical in count.
    expect(out.split('\n')).toHaveLength(RENAME_DOC.split('\n').length);
  });

  it('does not touch prefixed/suffixed ids', () => {
    const doc = 'tasks:\n  ex:\n    with:\n      x: ${{ tasks.exam.status }}\n    exec:\n      command: ["echo"]';
    const refs = findTaskRefs(doc, 'ex');
    expect(refs.map((r) => r.home)).toEqual(['declaration']); // tasks.exam NOT matched
  });

  it('countTaskRefs agrees with the single-id walk — every id, one pass', () => {
    // The equivalence contract: the aggregate counter must report, for
    // EVERY id, exactly what findTaskRefs (minus the declaration) finds.
    const ids = new Set(['extract', 'use', 'other']);
    const counts = countTaskRefs(RENAME_DOC, ids);
    for (const id of ids) {
      const expected = findTaskRefs(RENAME_DOC, id)
        .filter((r) => r.home !== 'declaration').length;
      expect(counts.get(id) ?? 0, `count for ${id}`).toBe(expected);
    }
    // And at scale: a generated fan-in stays instant and exact.
    const big = ['tasks:']
      .concat(Array.from({ length: 800 }, (_, i) =>
        `  t${i}:\n    after: {${i > 0 ? ` t${i - 1}: succeeded ` : ''}}\n    with:\n      seed: \${{ tasks.t0.output }}\n    exec:\n      command: ["echo"]`))
      .join('\n');
    const bigIds = new Set(Array.from({ length: 800 }, (_, i) => `t${i}`));
    const started = Date.now();
    const bigCounts = countTaskRefs(big, bigIds);
    expect(Date.now() - started).toBeLessThan(500);
    expect(bigCounts.get('t0')).toBe(findTaskRefs(big, 't0').filter((r) => r.home !== 'declaration').length);
    expect(bigCounts.get('t42')).toBe(findTaskRefs(big, 't42').filter((r) => r.home !== 'declaration').length);
  });

  it('enforces the engine id grammar on rename', () => {
    expect(isValidTaskId('fetch_page')).toBe(true);
    expect(isValidTaskId('fetch-page')).toBe(false); // kebab = PARSE error engine-side
    expect(isValidTaskId('Fetch')).toBe(false);
    expect(renameTask(RENAME_DOC, 'extract', 'bad-name')).toBeUndefined();
  });
});
