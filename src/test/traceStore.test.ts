import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { foldTrace } from '../core/traceFold';
import { normalizeWorkflowKey, TraceStore } from '../core/traceStore';

/** A real fold (not a hand-built stub) — the store carries RunModel verbatim. */
function fold(taskId = 'a'): ReturnType<typeof foldTrace> {
  return foldTrace([
    JSON.stringify({ timestamp: { unix_ms: 0 }, kind: 'task_started', fields: [{ key: 'task', value: taskId }] }),
    JSON.stringify({ timestamp: { unix_ms: 100 }, kind: 'task_completed', fields: [{ key: 'task', value: taskId }] }),
  ].join('\n'));
}

const P = (...segs: string[]): string => path.join(path.sep, ...segs);

describe('normalizeWorkflowKey', () => {
  it('collapses cosmetic path differences to one key', () => {
    const canonical = P('ws', 'flow.nika.yaml');
    expect(normalizeWorkflowKey(P('ws', '.', 'flow.nika.yaml'))).toBe(canonical);
    expect(normalizeWorkflowKey(`${P('ws')}${path.sep}${path.sep}flow.nika.yaml`)).toBe(canonical);
  });

  it('strips a trailing separator but never the root', () => {
    expect(normalizeWorkflowKey(P('ws', 'dir') + path.sep)).toBe(P('ws', 'dir'));
    expect(normalizeWorkflowKey(path.sep)).toBe(path.sep);
  });
});

describe('TraceStore', () => {
  it('set/get round-trips the fold with a publish timestamp', () => {
    const store = new TraceStore();
    const before = Date.now();
    store.set(P('ws', 'flow.nika.yaml'), fold());
    const rec = store.get(P('ws', 'flow.nika.yaml'));
    expect(rec?.fold.tasks.get('a')?.status).toBe('success');
    expect(rec?.at.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('get is undefined for a workflow that never ran', () => {
    expect(new TraceStore().get(P('ws', 'never.nika.yaml'))).toBeUndefined();
  });

  it('reads back through a cosmetically different path (normalized key)', () => {
    const store = new TraceStore();
    store.set(P('ws', '.', 'flow.nika.yaml'), fold());
    expect(store.get(P('ws', 'flow.nika.yaml'))).toBeDefined();
  });

  it('latest write wins and refreshes `at`', () => {
    const store = new TraceStore();
    store.set(P('ws', 'flow.nika.yaml'), fold('a'));
    const first = store.get(P('ws', 'flow.nika.yaml'));
    store.set(P('ws', 'flow.nika.yaml'), fold('b'));
    const second = store.get(P('ws', 'flow.nika.yaml'));
    expect(second?.fold.tasks.has('b')).toBe(true);
    expect(second?.fold.tasks.has('a')).toBe(false);
    expect(second?.at.getTime()).toBeGreaterThanOrEqual(first?.at.getTime() ?? Infinity);
  });

  it('onDidUpdate fires with the normalized key; dispose unsubscribes', () => {
    const store = new TraceStore();
    const seen: string[] = [];
    const sub = store.onDidUpdate((key) => seen.push(key));
    store.set(P('ws', '.', 'flow.nika.yaml'), fold());
    expect(seen).toEqual([P('ws', 'flow.nika.yaml')]);
    sub.dispose();
    store.set(P('ws', 'flow.nika.yaml'), fold());
    expect(seen).toHaveLength(1);
  });

  it('a listener disposing itself mid-fire never skips its siblings', () => {
    const store = new TraceStore();
    const seen: string[] = [];
    const first = store.onDidUpdate(() => { seen.push('first'); first.dispose(); });
    store.onDidUpdate(() => seen.push('second'));
    store.set(P('ws', 'flow.nika.yaml'), fold());
    expect(seen).toEqual(['first', 'second']);
  });
});
