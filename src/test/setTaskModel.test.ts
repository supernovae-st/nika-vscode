import { describe, expect, it } from 'vitest';
import { setTaskModel } from '../core/structuralFixes';

const WF = `nika: v1
workflow:
  id: probe
model: mock/echo
tasks:
  has_model:
    model: mistral/mistral-small
    infer:
      prompt: "a"
  no_model:
    infer:
      prompt: "b"
    after: { has_model: succeeded }
`;

describe('setTaskModel (the canvas model-chip edit)', () => {
  it('replaces an existing task-level model in place', () => {
    const out = setTaskModel(WF, 'has_model', 'ollama/llama3.2');
    expect(out).toContain('model: ollama/llama3.2');
    expect(out).not.toContain('mistral/mistral-small');
    // The envelope model is untouched.
    expect(out).toContain('model: mock/echo');
  });

  it('inserts model right under the id line when absent', () => {
    const out = setTaskModel(WF, 'no_model', 'ollama/qwen3.5');
    expect(out).toBeDefined();
    const lines = out!.split('\n');
    const idLine = lines.findIndex((l) => l.includes('no_model:'));
    expect(lines[idLine + 1].trim()).toBe('model: ollama/qwen3.5');
    // Field indent = item indent + 2 (sibling of infer:).
    expect(lines[idLine + 1].match(/^ */)![0].length)
      .toBe(lines[idLine].search(/\S/) + 2);
  });

  it('refuses unknown tasks and malformed model ids', () => {
    expect(setTaskModel(WF, 'ghost', 'ollama/llama3.2')).toBeUndefined();
    expect(setTaskModel(WF, 'has_model', 'no-slash')).toBeUndefined();
    expect(setTaskModel(WF, 'has_model', 'UPPER/model')).toBeUndefined();
    expect(setTaskModel(WF, 'has_model', 'a/b c')).toBeUndefined();
  });

  it('is idempotent for the same value', () => {
    const once = setTaskModel(WF, 'has_model', 'ollama/llama3.2')!;
    const twice = setTaskModel(once, 'has_model', 'ollama/llama3.2')!;
    expect(twice).toBe(once);
  });
});
