import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { foldTrace } from '../core/traceFold';
import { TraceStream } from '../core/traceStream';

const line = (kind: string, value = 'a'): string => JSON.stringify({
  kind, timestamp: 12, fields: [{ key: 'task', value }],
});

describe('one incremental trace projection with bounded capture', () => {
  it.each([0, -1, 1.5, NaN, Infinity, 16 * 1024 * 1024 + 1])('refuses invalid observation budgets: %s', (limit) => {
    expect(() => new TraceStream(limit)).toThrow(RangeError);
  });
  it.each(['sig-run-a.ndjson', 'recovered-run.ndjson', 'resume-mixed.ndjson'])(
    'matches the complete canonical fold for one-byte chunks: %s', (fixture) => {
      const text = readFileSync(new URL(`./fixtures/${fixture}`, import.meta.url), 'utf8');
      const stream = new TraceStream();
      const decoder = new StringDecoder('utf8');
      for (const byte of Buffer.from(text)) { stream.push(decoder.write(Buffer.from([byte]))); }
      stream.push(decoder.end());
      stream.finish();
      expect(stream.snapshot()).toEqual(foldTrace(text));
      expect(stream.text()).toBe(text);
    },
  );

  it('never projects a valid-looking partial line before its boundary', () => {
    const stream = new TraceStream();
    stream.push(line('workflow_completed'));
    expect(stream.snapshot()?.workflowStatus).toBe('unknown');
    stream.push('\n');
    expect(stream.snapshot()?.workflowStatus).toBe('completed');
  });

  it('publishes detached snapshots, including nested agent facts and timeline', () => {
    const stream = new TraceStream();
    stream.push(line('task_started') + '\n');
    stream.push(JSON.stringify({ kind: 'agent_compose_checked', fields: [
      { key: 'task', value: 'a' }, { key: 'valid', value: true },
    ] }) + '\n');
    const before = stream.snapshot();
    stream.push(line('task_completed') + '\n');
    expect(before?.tasks.get('a')?.status).toBe('running');
    const compose = before?.tasks.get('a')?.agent?.compose;
    if (compose) { compose.valid = 99; }
    before?.timeline.splice(0);
    expect(stream.snapshot()?.tasks.get('a')?.agent?.compose?.valid).toBe(1);
    expect(stream.snapshot()?.timeline).toHaveLength(2);
  });

  it('finishes an unterminated final record once and refuses post-close input', () => {
    const text = `${line('task_started')}\n${line('task_completed')}\n${line('workflow_completed')}`;
    const stream = new TraceStream();
    stream.push(text);
    stream.finish();
    stream.finish();
    expect(stream.push(line('workflow_failed'))).toBe(false);
    expect(stream.snapshot()).toEqual(foldTrace(text));
  });

  it('counts UTF-8 bytes, admits the exact limit, then discards an incomplete capture', () => {
    const text = line('task_started', '蝶');
    const stream = new TraceStream(Buffer.byteLength(text));
    expect(stream.push(text)).toBe(true);
    expect(stream.limited).toBe(false);
    expect(stream.push('\n')).toBe(false);
    expect(stream.limited).toBe(true);
    expect(stream.retainedBytes).toBe(0);
    expect(stream.snapshot()).toBeUndefined();
    expect(stream.text()).toBeUndefined();
    expect(stream.push(line('workflow_completed'))).toBe(false);
  });

  it('rejects a single oversized chunk before parsing or retaining its prefix', () => {
    const stream = new TraceStream(64);
    expect(stream.push('x'.repeat(65))).toBe(false);
    stream.finish();
    expect(stream.retainedBytes).toBe(0);
    expect(stream.snapshot()).toBeUndefined();
  });

  it('does not parse old events again when snapshots are painted', () => {
    const stream = new TraceStream();
    const parser = vi.spyOn(JSON, 'parse');
    try {
      stream.push(line('task_started') + '\n');
      const afterEvent = parser.mock.calls.length;
      for (let i = 0; i < 20; i += 1) { stream.snapshot(); }
      const afterPaints = parser.mock.calls.length;
      expect(afterEvent).toBe(1);
      expect(afterPaints).toBe(afterEvent);
    } finally { parser.mockRestore(); }
  });
});
