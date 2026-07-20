// elkWorkerEnv.ts — evaluated BEFORE elkjs (import order matters).
//
// Inside a real DedicatedWorkerGlobalScope, elkjs 0.9.3's internal
// elk-worker.min.js branches on `typeof document`: worker-flavored, it
// installs ITS OWN self.onmessage (elkjs's private protocol — clobbering
// ours) and exports NO Worker class, so `new ELK()` throws "_Worker is
// not a constructor" (proven live 2026-07-20 · the ladder caught it and
// fell to sync). One audited fake flips the module onto its PAGE branch
// — the fake in-thread worker the main thread has always run. Safe by
// audit: the engine's ONLY document reference IS that typeof check
// (grep over elk-worker.min.js + elk.bundled.js: one hit each, both the
// environment branch; the GWT code never touches document members).
const g = globalThis as { document?: unknown };
if (typeof g.document === 'undefined') { g.document = {}; }

export {};
