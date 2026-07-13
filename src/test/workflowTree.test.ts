import { describe, it, expect } from 'vitest';
import { parseWorkflowTasks } from '../workflowParser';

describe('parseWorkflowTasks', () => {
  it('returns empty for empty content', () => {
    expect(parseWorkflowTasks('')).toEqual([]);
  });

  it('returns empty for non-workflow YAML', () => {
    expect(parseWorkflowTasks('key: value\nother: stuff')).toEqual([]);
  });

  it('extracts single task with infer verb', () => {
    const yaml = `tasks:
  hello:
    infer: "Say hello"`;
    const tasks = parseWorkflowTasks(yaml);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('hello');
    expect(tasks[0].verb).toBe('infer');
    expect(tasks[0].line).toBe(1);
  });

  it('extracts multiple tasks with different verbs', () => {
    const yaml = `tasks:
  step1:
    infer: "Generate"
  step2:
    exec: "echo done"
  step3:
    invoke: "https://example.com"`;
    const tasks = parseWorkflowTasks(yaml);
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({ id: 'step1', verb: 'infer' });
    expect(tasks[1]).toMatchObject({ id: 'step2', verb: 'exec' });
    expect(tasks[2]).toMatchObject({ id: 'step3', verb: 'invoke' });
  });

  it('handles invoke verb', () => {
    const yaml = `tasks:
  run_tool:
    invoke: "nika:log"`;
    const tasks = parseWorkflowTasks(yaml);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].verb).toBe('invoke');
  });

  it('handles agent verb', () => {
    const yaml = `tasks:
  research:
    agent:
      prompt: "Find info"
      max_turns: 5`;
    const tasks = parseWorkflowTasks(yaml);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].verb).toBe('agent');
  });

  it('marks task as unknown when no verb found', () => {
    const yaml = `tasks:
  orphan:
  next:
    infer: "test"`;
    const tasks = parseWorkflowTasks(yaml);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ id: 'orphan', verb: 'unknown' });
    expect(tasks[1]).toMatchObject({ id: 'next', verb: 'infer' });
  });

  it('handles last task without verb', () => {
    const yaml = `tasks:
  lonely:`;
    const tasks = parseWorkflowTasks(yaml);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: 'lonely', verb: 'unknown' });
  });

  it('preserves correct line numbers', () => {
    const yaml = `schema: "nika/workflow@0.12"
workflow:
  id: test
tasks:
  first:
    infer: "a"
  second:
    exec: "b"`;
    const tasks = parseWorkflowTasks(yaml);
    expect(tasks[0].line).toBe(4); // line index of "first:"
    expect(tasks[1].line).toBe(6); // line index of "second:"
  });

  it('a kebab key is not a task id (snake_case grammar)', () => {
    // W1: the key IS the identity and the client-side grammar mirrors
    // the engine's ([a-z][a-z0-9_]*) — a kebab key never becomes a task.
    const yaml = `tasks:
  my-task:
    infer: "test"`;
    expect(parseWorkflowTasks(yaml)).toHaveLength(0);
  });

  it('ignores non-task YAML with similar patterns', () => {
    const yaml = `schema: "nika/workflow@0.12"
description: "A workflow that infers things"
provider: anthropic`;
    const tasks = parseWorkflowTasks(yaml);
    expect(tasks).toHaveLength(0);
  });

  it('handles verb on line with colon and space', () => {
    const yaml = `tasks:
  step:
    infer:
      prompt: "hello"`;
    const tasks = parseWorkflowTasks(yaml);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].verb).toBe('infer');
  });
});
