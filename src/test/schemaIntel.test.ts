import { describe, it, expect } from 'vitest';
import { buildSchemaIntel, fieldInScope, parseCanonErrorCodes, parseCanonItems } from '../core/schemaIntel';
import { yamlContextAt } from '../core/yamlContext';
import { findTaskRefs, isValidTaskId, renameTask } from '../core/renameRefs';

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
        depends_on: {},
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
  'workflow: t',       // 1
  '',                  // 2
  'tasks:',            // 3
  '  - id: fetch',     // 4
  '    invoke:',       // 5
  '      tool: nika:fetch', // 6
  '      args:',       // 7
  '        mode: ',    // 8
  '  - id: sum',       // 9
  '    ',              // 10  (typing a task key)
  '    infer:',        // 11
  '      ',            // 12  (typing a verb key)
  '',                  // 13
].join('\n');

describe('yamlContextAt', () => {
  it('classifies top-level key typing', () => {
    expect(yamlContextAt('per', 0, 3)).toMatchObject({ kind: 'top-key', partial: 'per' });
  });

  it('classifies task-key position inside a task item', () => {
    expect(yamlContextAt(DOC, 10, 4)).toMatchObject({ kind: 'task-key', partial: '' });
  });

  it('classifies verb-key position inside a verb body', () => {
    expect(yamlContextAt(DOC, 12, 6)).toMatchObject({ kind: 'verb-key', verb: 'infer' });
  });

  it('classifies value position with verb + nearby tool (fetch mode)', () => {
    const ctx = yamlContextAt(DOC, 8, '        mode: '.length);
    expect(ctx).toMatchObject({ kind: 'value', key: 'mode', verb: 'invoke', tool: 'nika:fetch' });
  });

  it('classifies the task id value position', () => {
    const ctx = yamlContextAt(DOC, 4, '  - id: fe'.length);
    expect(ctx).toMatchObject({ kind: 'value', key: 'id', partial: 'fe' });
  });
});

// ─── renameRefs ──────────────────────────────────────────────────────────────

const RENAME_DOC = [
  'nika: v1',
  'workflow: t',
  'model: mock/echo',
  '',
  'tasks:',
  '  - id: extract',
  '    invoke:',
  '      tool: nika:fetch',
  '      args: { url: "https://x.com" }',
  '',
  '  - id: use',
  '    depends_on: [extract, other]',
  '    when: "tasks.extract.status == \'success\'"',
  '    with:',
  '      page: ${{ tasks.extract.output }}',
  '    infer:',
  '      prompt: "p ${{ with.page }}"',
  '',
  '  - id: other',
  '    depends_on:',
  '      - extract',
  '    exec:',
  '      command: echo hi',
].join('\n');

describe('renameRefs', () => {
  it('finds all 4 syntactic homes', () => {
    const refs = findTaskRefs(RENAME_DOC, 'extract');
    const homes = refs.map((r) => r.home).sort();
    expect(homes).toEqual(['cel', 'declaration', 'depends_on', 'depends_on', 'island']);
    // Every span is exactly the id token.
    for (const r of refs) {
      expect(RENAME_DOC.slice(r.start, r.end)).toBe('extract');
    }
  });

  it('renames every home and nothing else', () => {
    const out = renameTask(RENAME_DOC, 'extract', 'fetch_page')!;
    expect(out).not.toMatch(/\bextract\b/);
    expect(out).toContain('- id: fetch_page');
    expect(out).toContain('depends_on: [fetch_page, other]');
    expect(out).toContain('when: "tasks.fetch_page.status');
    expect(out).toContain('${{ tasks.fetch_page.output }}');
    expect(out).toContain('- fetch_page');
    // Untouched parts stay byte-identical in count.
    expect(out.split('\n')).toHaveLength(RENAME_DOC.split('\n').length);
  });

  it('does not touch prefixed/suffixed ids', () => {
    const doc = 'tasks:\n  - id: ex\n    when: "tasks.exam.status == 1"\n    exec:\n      command: echo';
    const refs = findTaskRefs(doc, 'ex');
    expect(refs.map((r) => r.home)).toEqual(['declaration']); // tasks.exam NOT matched
  });

  it('enforces the engine id grammar on rename', () => {
    expect(isValidTaskId('fetch_page')).toBe(true);
    expect(isValidTaskId('fetch-page')).toBe(false); // kebab = PARSE error engine-side
    expect(isValidTaskId('Fetch')).toBe(false);
    expect(renameTask(RENAME_DOC, 'extract', 'bad-name')).toBeUndefined();
  });
});
