import { describe, expect, it } from 'vitest';
import { insertDefaultModel, needsDefaultModel } from '../core/modelEdit';

describe('modelEdit (the missing-brain door)', () => {
  it('fires only when an infer/agent has no model anywhere', () => {
    expect(needsDefaultModel({
      tasks: [{ id: 'a', verb: 'infer' }, { id: 'b', verb: 'exec' }],
    })).toEqual({ needy: ['a'] });
    expect(needsDefaultModel({
      defaultModel: 'mock/echo',
      tasks: [{ id: 'a', verb: 'infer' }],
    })).toBeUndefined();
    expect(needsDefaultModel({
      tasks: [{ id: 'a', verb: 'infer', model: 'ollama/qwen3' }],
    })).toBeUndefined();
    expect(needsDefaultModel({
      tasks: [{ id: 'b', verb: 'exec' }, { id: 'c', verb: 'invoke' }],
    })).toBeUndefined();
  });

  it('a per-task model on ONE of two inferring tasks still needs the door', () => {
    expect(needsDefaultModel({
      tasks: [
        { id: 'a', verb: 'infer', model: 'ollama/qwen3' },
        { id: 'b', verb: 'agent' },
      ],
    })).toEqual({ needy: ['b'] });
  });

  it('inserts after the workflow object — the envelope\'s canonical slot', () => {
    const next = insertDefaultModel('nika: v1\nworkflow:\n  id: w\n  description: "d"\ntasks:\n', 'ollama/qwen3.5:4b')!;
    expect(next.split('\n')[4]).toBe('model: ollama/qwen3.5:4b');
  });

  it('falls back up the envelope chain (workflow · nika)', () => {
    expect(insertDefaultModel('nika: v1\nworkflow:\n  id: w\ntasks:\n', 'mock/echo')!.split('\n')[3])
      .toBe('model: mock/echo');
    expect(insertDefaultModel('nika: v1\ntasks:\n', 'mock/echo')!.split('\n')[1])
      .toBe('model: mock/echo');
  });

  it('refuses when a top-level model exists — the lens path owns it', () => {
    expect(insertDefaultModel('nika: v1\nmodel: mock/echo\n', 'ollama/x')).toBeUndefined();
  });

  it('refuses a headless fragment — nothing to anchor the envelope', () => {
    expect(insertDefaultModel('tasks:\n  a:\n', 'mock/echo')).toBeUndefined();
  });

  it('a task-level model: (indented) never blocks the envelope insert', () => {
    const wf = 'nika: v1\nworkflow:\n  id: w\ntasks:\n  a:\n    model: ollama/x\n    infer:\n      prompt: "p"\n';
    expect(insertDefaultModel(wf, 'mock/echo')).toBeDefined();
  });
});
