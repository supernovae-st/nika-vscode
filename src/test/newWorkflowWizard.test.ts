// newWorkflowWizard.test.ts — the multi-step wizard's pure laws
// (annexe A #14 · V1.2).
//
// Under test: step-2 rows carry the four verbs in canonical order with
// their spec starters + engine templates + the blank floor; step-3
// rows lead with mock/echo and rank locals before cloud (the
// NIKA_PROVIDERS_ORDER presentation lock); templates honestly skip the
// model step; the scaffold reproduces the house shape (envelope ·
// model line · break_me curriculum).

import { describe, it, expect } from 'vitest';
import {
  modelRows,
  scaffoldContent,
  starterModelOf,
  starterRows,
  totalStepsFor,
  WIZARD_VERBS,
} from '../core/newWorkflowWizard';
import { NIKA_VERB_STARTERS } from '../core/verbStarters.generated';

describe('starterRows — step 2', () => {
  it('the four verbs appear as separators, canonical order, each with its starters', () => {
    const rows = starterRows([]);
    const seps = rows.filter((r) => r.separator).map((r) => r.label);
    expect(seps[0]).toContain('infer');
    expect(seps[1]).toContain('exec');
    expect(seps[2]).toContain('invoke');
    expect(seps[3]).toContain('agent');
    for (const verb of WIZARD_VERBS) {
      const count = rows.filter((r) => r.pick?.kind === 'starter' && r.pick.verb === verb).length;
      expect(count).toBe(NIKA_VERB_STARTERS[verb].length);
    }
  });

  it('engine templates ride their own section; blank is always last', () => {
    const rows = starterRows(['review-pr', 'daily-digest']);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain('review-pr');
    expect(labels).toContain('daily-digest');
    const last = rows[rows.length - 1];
    expect(last.pick?.kind).toBe('blank');
    // No templates → no template section, blank still closes the list.
    const bare = starterRows([]);
    expect(bare.some((r) => r.separator && r.label === 'engine templates')).toBe(false);
    expect(bare[bare.length - 1].pick?.kind).toBe('blank');
  });

  it('every selectable row carries a placeholder-teaching detail', () => {
    for (const row of starterRows(['t'])) {
      if (row.pick) { expect(row.detail ?? '').not.toHaveLength(0); }
    }
  });
});

describe('totalStepsFor — honest step count', () => {
  it('templates are a 2-step path (the engine writes their file whole)', () => {
    expect(totalStepsFor({ kind: 'template', slug: 'x' })).toBe(2);
    expect(totalStepsFor({ kind: 'blank' })).toBe(3);
    expect(totalStepsFor({ kind: 'starter', verb: 'infer', starter: NIKA_VERB_STARTERS.infer[0] })).toBe(3);
  });
});

describe('modelRows — step 3', () => {
  it('mock/echo leads as the default; the custom door closes the list', () => {
    const rows = modelRows(undefined);
    const selectable = rows.filter((r) => !r.separator);
    expect(selectable[0].value).toBe('mock/echo');
    expect(selectable[0].description).toContain('default');
    expect(selectable[selectable.length - 1].custom).toBe(true);
    // No catalog → no invented model ids.
    expect(selectable.filter((r) => r.value !== undefined && r.value !== 'mock/echo')).toHaveLength(0);
  });

  it('locals rank before cloud per the presentation lock (ollama before anthropic/openai)', () => {
    const rows = modelRows({
      anthropic: [{ model: 'claude-x' }],
      ollama: [{ model: 'llama3.2' }],
      openai: [{ model: 'gpt-x' }],
      vllm: [{ model: 'qwen' }],
    });
    const seps = rows.filter((r) => r.separator && r.label.length > 0).map((r) => r.label);
    const at = (p: string): number => seps.indexOf(p);
    expect(at('ollama')).toBeGreaterThan(-1);
    expect(at('ollama')).toBeLessThan(at('anthropic'));
    expect(at('vllm')).toBeLessThan(at('anthropic'));
    expect(at('vllm')).toBeLessThan(at('openai'));
  });

  it('a starter-pinned model appears as the current row', () => {
    const rows = modelRows(undefined, 'ollama/qwen3.5:4b');
    const current = rows.find((r) => r.value === 'ollama/qwen3.5:4b');
    expect(current?.description).toContain('current');
  });
});

describe('scaffoldContent — the written page', () => {
  it('blank + mock/echo reproduces the house shape (envelope · comment · break_me)', () => {
    const text = scaffoldContent('my-flow', { kind: 'blank' }, 'mock/echo');
    expect(text).toContain('nika: v1');
    expect(text).toContain('workflow:\n  id: my-flow');
    expect(text).toContain('model: mock/echo  # deterministic · zero keys');
    expect(text).toContain('prompt: ""');
    expect(text).toContain('# break_me:');
    expect(text).toContain('${{ tasks.start.output }}');
  });

  it('a verb starter lands re-indented under the start task, its model honored', () => {
    const starter = NIKA_VERB_STARTERS.exec[0];
    const text = scaffoldContent('runner', { kind: 'starter', verb: 'exec', starter }, 'mock/echo');
    expect(text).toContain('  start:\n    exec:');
    expect(text).toContain('model: mock/echo');
  });

  it('a non-default model line drops the swap comment (it already swapped)', () => {
    const text = scaffoldContent('x', { kind: 'blank' }, 'ollama/llama3.2');
    expect(text).toContain('model: ollama/llama3.2\n');
    expect(text).not.toContain('ollama/llama3.2  # deterministic');
  });
});

describe('starterModelOf — the starter body model probe', () => {
  it('reads the model line when the starter pins one, silent otherwise', () => {
    const tuned = NIKA_VERB_STARTERS.infer.find((s) => s.id === 'infer-tuned');
    expect(tuned).toBeDefined();
    if (tuned) {
      expect(starterModelOf({ kind: 'starter', verb: 'infer', starter: tuned }))
        .toBe('ollama/qwen3.5:4b');
    }
    expect(starterModelOf({ kind: 'blank' })).toBeUndefined();
    const bare = NIKA_VERB_STARTERS.infer[0];
    expect(starterModelOf({ kind: 'starter', verb: 'infer', starter: bare })).toBeUndefined();
  });
});
