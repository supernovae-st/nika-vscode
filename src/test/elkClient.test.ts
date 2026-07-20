// elkClient.test.ts — the layout transport, driven by a FakeWorker.
//
// The ladder descends structurally (ctor throw → blob → sync) and NEVER
// loses a request; latest-wins supersedes quietly (resolve null, drop
// the stale response); a long chew cancels by terminate + spare
// promotion; the pool pre-warms exactly active + spare.

import { describe, it, expect } from 'vitest';
import type { ElkNode } from 'elkjs';
import {
  createElkClient,
  type WorkerLike, type WorkerRequest, type WorkerResponse, type ElkClientOpts,
} from '../webview/elkClient';

const GRAPH: ElkNode = {
  id: 'root',
  children: [{ id: 't0', width: 248, height: 96 }],
  edges: [],
};
const EMPTY: ElkNode = { id: 'root', children: [], edges: [] };
const LAID: ElkNode = { id: 'root', children: [{ id: 't0', x: 40, y: 40, width: 248, height: 96 }] };

const tick = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });

class FakeWorker implements WorkerLike {
  onmessage: ((ev: { data: WorkerResponse }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  terminated = false;
  posted: WorkerRequest[] = [];
  constructor(public readonly url: string) {}
  postMessage(msg: unknown): void { this.posted.push(msg as WorkerRequest); }
  terminate(): void { this.terminated = true; }
  respond(index: number, laid: ElkNode): void {
    const req = this.posted[index];
    this.onmessage?.({ data: { id: req.id, hash: req.hash, laid, elkMs: 7 } });
  }
  fail(): void { this.onerror?.({}); }
}

interface Rig {
  workers: FakeWorker[];
  clock: { t: number };
  syncCalls: number;
  opts: ElkClientOpts;
}

function rig(overrides: Partial<ElkClientOpts> = {}): Rig {
  const workers: FakeWorker[] = [];
  const clock = { t: 0 };
  const r: Rig = {
    workers,
    clock,
    syncCalls: 0,
    opts: {
      workerUrl: 'https://x/elkWorker.js',
      syncLayout: (g: ElkNode) => {
        r.syncCalls++;
        return Promise.resolve({ ...LAID, id: g.id });
      },
      makeWorker: (url: string) => {
        const w = new FakeWorker(url);
        workers.push(w);
        return w;
      },
      fetchText: () => Promise.resolve('// worker code'),
      makeBlobUrl: (code: string) => `blob:${code.length}`,
      now: () => clock.t,
      ...overrides,
    },
  };
  return r;
}

describe('elkClient — pool + pre-warm', () => {
  it('warms exactly active + spare at the first node-carrying layout', async () => {
    const r = rig();
    const client = createElkClient(r.opts);
    const p = client.layout('h1', GRAPH);
    await tick();
    expect(r.workers.length).toBe(2); // active + spare, never 3
    expect(r.workers[0].posted.length).toBe(1);
    expect(r.workers[1].posted.length).toBe(0);
    r.workers[0].respond(0, LAID);
    expect((await p)?.laid).toEqual(LAID);
    expect(client.rung()).toBe('worker');
  });

  it('routes a node-less graph straight to sync (no worker boot)', async () => {
    const r = rig();
    const client = createElkClient(r.opts);
    const laid = await client.layout('h0', EMPTY);
    expect(laid).not.toBeNull();
    expect(r.workers.length).toBe(0);
    expect(r.syncCalls).toBe(1);
  });

  it('forceSync pins the sync rung (the ?noworker judge path)', async () => {
    const r = rig({ forceSync: true });
    const client = createElkClient(r.opts);
    const laid = await client.layout('h1', GRAPH);
    expect(laid).not.toBeNull();
    expect(client.rung()).toBe('sync');
    expect(r.workers.length).toBe(0);
    expect(r.syncCalls).toBe(1);
  });
});

describe('elkClient — the ladder', () => {
  it('ctor throw descends to the blob rung (fetch → blob URL worker)', async () => {
    const r = rig({
      makeWorker: (url: string) => {
        if (!url.startsWith('blob:')) { throw new Error('SecurityError'); }
        const w = new FakeWorker(url);
        r.workers.push(w);
        return w;
      },
    });
    const client = createElkClient(r.opts);
    const p = client.layout('h1', GRAPH);
    await tick();
    await tick();
    expect(client.rung()).toBe('blob');
    const blobWorkers = r.workers.filter((w) => w.url.startsWith('blob:'));
    expect(blobWorkers.length).toBeGreaterThan(0);
    const carrier = blobWorkers.find((w) => w.posted.length > 0);
    expect(carrier).toBeDefined();
    carrier?.respond(0, LAID);
    expect((await p)?.laid).toEqual(LAID); // the graph was NEVER lost
  });

  it('ctor throw + fetch refusal land on sync — byte-identical fallback', async () => {
    const r = rig({
      makeWorker: () => { throw new Error('SecurityError'); },
      fetchText: () => Promise.reject(new Error('file:// refused')),
    });
    const client = createElkClient(r.opts);
    const laid = await client.layout('h1', GRAPH);
    expect(laid).not.toBeNull();
    expect(client.rung()).toBe('sync');
    expect(r.syncCalls).toBe(1);
  });

  it('a worker error mid-request re-dispatches the SAME request one rung down', async () => {
    const r = rig({ fetchText: () => Promise.reject(new Error('no blob either')) });
    const client = createElkClient(r.opts);
    const p = client.layout('h1', GRAPH);
    await tick();
    expect(r.workers[0].posted.length).toBe(1);
    r.workers[0].fail(); // the worker dies AFTER accepting the request
    const laid = await p;
    expect(laid).not.toBeNull(); // …and the request still resolves (sync rung)
    expect(client.rung()).toBe('sync');
    expect(r.workers[0].terminated).toBe(true);
  });
});

describe('elkClient — latest-wins + cancel', () => {
  it('a superseded request resolves null; its late response is dropped', async () => {
    const r = rig();
    const client = createElkClient(r.opts);
    const pA = client.layout('hA', GRAPH);
    await tick();
    const pB = client.layout('hB', GRAPH); // ≤150ms chew — same worker queues both
    expect(await pA).toBeNull(); // superseded — quietly abandoned
    await tick();
    const w = r.workers[0];
    expect(w.posted.length).toBe(2);
    w.respond(0, LAID); // the STALE response arrives…
    w.respond(1, { ...LAID, id: 'B' });
    const b = await pB;
    expect(b?.laid.id).toBe('B'); // …and only the latest one lands
    expect(w.terminated).toBe(false); // short chew = no cancel
  });

  it('a chew past the cancel window terminates the active and promotes the spare', async () => {
    const r = rig({ chewCancelMs: 150 });
    const client = createElkClient(r.opts);
    const pA = client.layout('hA', GRAPH);
    await tick();
    expect(r.workers.length).toBe(2);
    r.clock.t = 200; // the active has been chewing 200ms
    const pB = client.layout('hB', GRAPH);
    expect(await pA).toBeNull();
    await tick();
    expect(r.workers[0].terminated).toBe(true); // the chewing active died
    expect(r.workers[1].posted.length).toBe(1); // the spare took the request
    await tick();
    expect(r.workers.length).toBe(3); // a fresh spare topped the pool back up
    expect(r.workers.filter((w) => !w.terminated).length).toBe(2); // never 3 live
    r.workers[1].respond(0, LAID);
    expect((await pB)?.laid).toEqual(LAID);
  });

  it('an ELK error inside the worker rejects the caller (a REAL failure, not a rung failure)', async () => {
    const r = rig();
    const client = createElkClient(r.opts);
    const p = client.layout('h1', GRAPH);
    await tick();
    const w = r.workers[0];
    w.onmessage?.({ data: { id: w.posted[0].id, hash: 'h1', error: 'cycle detected' } });
    await expect(p).rejects.toThrow('cycle detected');
    expect(client.rung()).toBe('worker'); // the rung is fine — the graph was not
  });

  it('dispose settles the in-flight request as superseded and tears the pool down', async () => {
    const r = rig();
    const client = createElkClient(r.opts);
    const p = client.layout('h1', GRAPH);
    await tick();
    client.dispose();
    expect(await p).toBeNull();
    expect(r.workers.every((w) => w.terminated)).toBe(true);
  });
});
