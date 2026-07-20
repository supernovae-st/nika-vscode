// elkClient.ts — the layout transport (worker off the main thread · pure
// fallback ladder · latest-wins).
//
// The ladder, one rung down on every structural failure, NEVER losing a
// graph:
//   1 worker — new Worker(workerUrl) (CSP: worker-src ${cspSource})
//   2 blob   — fetch(workerUrl) → Blob URL worker (connect-src already
//              allows our own assets; worker-src blob: covers the URL)
//   3 sync   — the main-thread elk.layout — byte-identical results, the
//              exact pre-worker behavior (file:// judges land here: the
//              Worker ctor throws on file URLs and fetch refuses them)
// The reached rung is memorized for the session; a worker error mid-
// request re-dispatches the SAME request on the next rung down.
//
// Protocol {id, hash, elkGraph} → {id, hash, laid|error} over structured
// clone. Latest-wins by counter: a superseded request resolves `null`
// (its render pass abandons quietly — a newer render owns the canvas);
// a response whose id is not the in-flight id is dropped.
//
// Pool: 1 active + 1 spare, pre-warmed at the first layout that carries
// nodes (a Worker boot parses the ~1.4MB ELK bundle — the spare makes
// cancellation free). Cancel: a new request while the active worker has
// been chewing > chewCancelMs terminates it and promotes the spare.
//
// Everything injectable (makeWorker · fetchText · makeBlobUrl · now) —
// the unit belt drives a FakeWorker, no browser needed.

import type { ElkNode } from 'elkjs';

export interface WorkerLike {
  postMessage(msg: unknown): void;
  terminate(): void;
  onmessage: ((ev: { data: WorkerResponse }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface WorkerRequest { id: number; hash: string; elkGraph: ElkNode }
export interface WorkerResponse { id: number; hash: string; laid?: ElkNode; error?: string; elkMs?: number }

/** A settled layout: the laid graph + the engine's OWN clock (measured
 *  where the work ran — the caller's wait includes its own concurrent
 *  painting and must never be read as ELK time). */
export interface LaidResult { laid: ElkNode; elkMs: number }

export type ElkRung = 'worker' | 'blob' | 'sync';

export interface ElkClientOpts {
  /** asWebviewUri of out/webview/elkWorker.js — null goes straight to sync. */
  workerUrl: string | null;
  /** The main-thread rung — the exact pre-worker layout call. */
  syncLayout(graph: ElkNode): Promise<ElkNode>;
  /** ?noworker — judges compare rungs; the ladder starts (and stays) at sync. */
  forceSync?: boolean;
  makeWorker?(url: string): WorkerLike;
  fetchText?(url: string): Promise<string>;
  makeBlobUrl?(code: string): string;
  now?(): number;
  /** A new request terminates an active worker chewing longer than this. */
  chewCancelMs?: number;
}

export interface ElkClient {
  /** Resolves the laid graph — or `null` when a newer request superseded
   *  this one (the caller abandons its render pass quietly). Rejects only
   *  on a REAL layout error (all rungs exhausted or ELK itself failed). */
  layout(hash: string, elkGraph: ElkNode): Promise<LaidResult | null>;
  rung(): ElkRung;
  dispose(): void;
}

interface Inflight {
  id: number;
  hash: string;
  elkGraph: ElkNode;
  startedAt: number;
  resolve(result: LaidResult | null): void;
  reject(err: Error): void;
}

export function createElkClient(opts: ElkClientOpts): ElkClient {
  const now = opts.now ?? (() => performance.now());
  const chewCancelMs = opts.chewCancelMs ?? 150;
  const makeWorker = opts.makeWorker ?? ((url: string): WorkerLike => new Worker(url) as unknown as WorkerLike);
  const fetchText = opts.fetchText ?? (async (url: string): Promise<string> => {
    const res = await fetch(url);
    if (!res.ok) { throw new Error(`fetch ${res.status}`); }
    return res.text();
  });
  const makeBlobUrl = opts.makeBlobUrl
    ?? ((code: string): string => URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));

  let rung: ElkRung = opts.forceSync === true || opts.workerUrl === null ? 'sync' : 'worker';
  let active: WorkerLike | undefined;
  let spare: WorkerLike | undefined;
  let blobUrl: string | undefined;
  let inflight: Inflight | undefined;
  let counter = 0;
  let disposed = false;

  const wire = (w: WorkerLike): WorkerLike => {
    w.onmessage = (ev) => { onResponse(ev.data); };
    w.onerror = () => { descend(); };
    return w;
  };

  /** Spawn one worker on the current rung — throws (or rejects) when the
   *  rung is structurally unavailable; the caller descends. */
  const spawn = async (): Promise<WorkerLike> => {
    if (rung === 'worker') {
      return wire(makeWorker(opts.workerUrl as string));
    }
    // blob rung
    if (blobUrl === undefined) {
      blobUrl = makeBlobUrl(await fetchText(opts.workerUrl as string));
    }
    return wire(makeWorker(blobUrl));
  };

  /** Top up the pool to active + spare (spare boot is fire-and-forget). */
  const ensurePool = async (): Promise<void> => {
    if (active === undefined) { active = await spawn(); }
    if (spare === undefined) {
      void spawn().then(
        (w) => {
          if (disposed || spare !== undefined) { w.terminate(); return; }
          spare = w;
        },
        () => { /* the active worker's own failure drives the descent */ },
      );
    }
  };

  const teardownPool = (): void => {
    active?.terminate();
    spare?.terminate();
    active = undefined;
    spare = undefined;
  };

  /** One rung down — the in-flight request re-dispatches, never lost. */
  const descend = (): void => {
    if (disposed) { return; }
    teardownPool();
    if (rung === 'worker') { rung = 'blob'; }
    else if (rung === 'blob') { rung = 'sync'; }
    if (inflight !== undefined) { dispatch(inflight); }
  };

  const onResponse = (msg: WorkerResponse): void => {
    if (inflight === undefined || msg.id !== inflight.id) { return; } // stale — dropped
    const req = inflight;
    inflight = undefined;
    if (msg.error !== undefined || msg.laid === undefined) {
      req.reject(new Error(msg.error ?? 'worker returned no layout'));
      return;
    }
    req.resolve({ laid: msg.laid, elkMs: msg.elkMs ?? 0 });
  };

  const dispatch = (req: Inflight): void => {
    req.startedAt = now();
    if (rung === 'sync') {
      const t0 = now();
      void opts.syncLayout(req.elkGraph).then(
        (laid) => {
          if (inflight?.id !== req.id) { return; } // superseded mid-chew
          inflight = undefined;
          req.resolve({ laid, elkMs: now() - t0 });
        },
        (err: unknown) => {
          if (inflight?.id !== req.id) { return; }
          inflight = undefined;
          req.reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
      return;
    }
    void ensurePool().then(
      () => {
        if (inflight?.id !== req.id) { return; } // superseded while booting
        (active as WorkerLike).postMessage({ id: req.id, hash: req.hash, elkGraph: req.elkGraph } satisfies WorkerRequest);
      },
      () => { descend(); },
    );
  };

  return {
    layout(hash: string, elkGraph: ElkNode): Promise<LaidResult | null> {
      const id = ++counter;
      return new Promise<LaidResult | null>((resolve, reject) => {
        if (inflight !== undefined) {
          const stale = inflight;
          inflight = undefined;
          // Latest wins — the superseded render abandons quietly.
          stale.resolve(null);
          // A worker deep in a big chew won't yield for the new request —
          // terminate it and promote the pre-warmed spare.
          if (rung !== 'sync' && active !== undefined && now() - stale.startedAt > chewCancelMs) {
            active.terminate();
            active = spare;
            spare = undefined;
          }
        }
        // A node-less graph lays out in microseconds — route it straight
        // to sync so an empty canvas never spins a worker boot.
        const req: Inflight = { id, hash, elkGraph, startedAt: now(), resolve, reject };
        inflight = req;
        if (rung !== 'sync' && (elkGraph.children ?? []).length === 0) {
          const t0 = now();
          void opts.syncLayout(elkGraph).then(
            (laid) => {
              if (inflight?.id !== req.id) { return; }
              inflight = undefined;
              resolve({ laid, elkMs: now() - t0 });
            },
            (err: unknown) => {
              if (inflight?.id !== req.id) { return; }
              inflight = undefined;
              reject(err instanceof Error ? err : new Error(String(err)));
            },
          );
          return;
        }
        try {
          dispatch(req);
        } catch {
          // A synchronous ctor throw (file:// SecurityError) — descend.
          descend();
        }
      });
    },
    rung(): ElkRung { return rung; },
    dispose(): void {
      disposed = true;
      teardownPool();
      if (inflight !== undefined) {
        inflight.resolve(null);
        inflight = undefined;
      }
    },
  };
}
