import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { foldTrace } from '../core/traceFold';
import { normalizeWorkflowKey, TraceStore } from '../core/traceStore';

// Real nika 0.92.0 flight-recorder captures (mock/echo · offline · the
// fanout-template demo, source in fixtures/demo.nika.yaml): the store
// carries EXACTLY what the engine writes — no invented event shapes.
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const fixtureFold = (name: string): ReturnType<typeof foldTrace> =>
  foldTrace(fs.readFileSync(path.join(FIXTURES, name), 'utf-8'));

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
  it('set/get round-trips a real green fold with a publish timestamp', () => {
    const store = new TraceStore();
    const before = Date.now();
    store.set(P('ws', 'demo.nika.yaml'), fixtureFold('fixture-run-a.ndjson'));
    const rec = store.get(P('ws', 'demo.nika.yaml'));
    expect(rec?.fold.workflowStatus).toBe('completed');
    expect(rec?.fold.tasks.size).toBe(4);
    expect(rec?.fold.tasks.get('discover')?.status).toBe('success');
    expect(rec?.at.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('get is undefined for a workflow that never ran', () => {
    expect(new TraceStore().get(P('ws', 'never.nika.yaml'))).toBeUndefined();
  });

  it('reads back through a cosmetically different path (normalized key)', () => {
    const store = new TraceStore();
    store.set(P('ws', '.', 'demo.nika.yaml'), fixtureFold('fixture-run-b.ndjson'));
    expect(store.get(P('ws', 'demo.nika.yaml'))).toBeDefined();
  });

  it('latest write wins: a failed run replaces the green one, `at` refreshes', () => {
    const store = new TraceStore();
    store.set(P('ws', 'demo.nika.yaml'), fixtureFold('fixture-run-a.ndjson'));
    const first = store.get(P('ws', 'demo.nika.yaml'));
    store.set(P('ws', 'demo.nika.yaml'), fixtureFold('fixture-run-failed.ndjson'));
    const second = store.get(P('ws', 'demo.nika.yaml'));
    expect(second?.fold.workflowStatus).toBe('failed');
    expect(second?.fold.tasks.get('survivors')?.status).toBe('failed');
    expect(second?.at.getTime()).toBeGreaterThanOrEqual(first?.at.getTime() ?? Infinity);
  });

  it('onDidUpdate fires with the normalized key; dispose unsubscribes', () => {
    const store = new TraceStore();
    const seen: string[] = [];
    const sub = store.onDidUpdate((key) => seen.push(key));
    store.set(P('ws', '.', 'demo.nika.yaml'), fixtureFold('fixture-run-a.ndjson'));
    expect(seen).toEqual([P('ws', 'demo.nika.yaml')]);
    sub.dispose();
    store.set(P('ws', 'demo.nika.yaml'), fixtureFold('fixture-run-b.ndjson'));
    expect(seen).toHaveLength(1);
  });

  it('a listener disposing itself mid-fire never skips its siblings', () => {
    const store = new TraceStore();
    const seen: string[] = [];
    const first = store.onDidUpdate(() => { seen.push('first'); first.dispose(); });
    store.onDidUpdate(() => seen.push('second'));
    store.set(P('ws', 'demo.nika.yaml'), fixtureFold('fixture-run-a.ndjson'));
    expect(seen).toEqual(['first', 'second']);
  });
});
