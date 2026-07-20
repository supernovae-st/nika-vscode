// elkWorker.ts — ELK off the main thread (the dedicated layout worker).
//
// Bundled by esbuild as a CLASSIC iife script (out/webview/elkWorker.js ·
// same elkjs → elk.bundled.js alias as the webview bundle) so a plain
// `new Worker(uri)` boots it — no module-worker, no CSP nonce (a Worker
// script rides `worker-src`, never `script-src`).
//
// Protocol (structured clone · elkClient.ts owns the ladder/latest-wins):
//   in  {id, hash, elkGraph}
//   out {id, hash, laid} — or {id, hash, error} on an ELK failure.

// FIRST — the environment shim (see its header): without it, elkjs's
// worker-scope branch clobbers our onmessage and breaks new ELK().
import './elkWorkerEnv';
import ELK, { type ElkNode } from 'elkjs';

interface WorkerRequest { id: number; hash: string; elkGraph: ElkNode }

const elk = new ELK();

// The file typechecks under the webview's dom lib — narrow `self` to the
// two members a dedicated worker scope actually offers this script.
const scope = self as unknown as {
  onmessage: ((ev: { data: WorkerRequest }) => void) | null;
  postMessage(msg: unknown): void;
};

scope.onmessage = (ev) => {
  const { id, hash, elkGraph } = ev.data;
  // elkMs = the engine's own clock, measured WHERE the work runs — the
  // main thread's wait includes its own concurrent painting (the SWR
  // frame) and must not be read as ELK time.
  const t0 = performance.now();
  void elk.layout(elkGraph).then(
    (laid) => { scope.postMessage({ id, hash, laid, elkMs: performance.now() - t0 }); },
    (err: unknown) => {
      scope.postMessage({ id, hash, error: err instanceof Error ? err.message : String(err) });
    },
  );
};
