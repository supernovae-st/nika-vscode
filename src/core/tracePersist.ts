// tracePersist.ts — the `--resume` substrate on disk (pure · no vscode).
//
// ONE filename convention shared by the writer, the reader and the Runs
// view: `.nika/traces/<slug>-<stamp>.ndjson` next to the workflow, stamp
// = ISO seconds with `:`/`.` dashed — stamps sort lexically, so "newest"
// is a plain sort. The tail match is EXACT: workflow `a` must never pick
// up — or, worse, PRUNE — sibling `a-b`'s traces (the prefix trap).
//
// Forward-compat (engine spec §3.3 · the 0.93 run journal): the engine
// itself writes `.nika/traces/<ISO>Z-<4hex>.ndjson` (cwd-relative · NO
// workflow slug — membership needs the runsView overlap gate, not a
// name). Neither matcher here can touch those files, so the two writers
// coexist safely. Resuming from an older extension trace stays CORRECT
// either way: the engine recomputes def_hash/input_hash per task and
// runs live on any mismatch — a stale trace only caches less, never lies.
// When the 0.93 journal is the installed reality, the planned handoff is
// to adopt the engine's file as the canonical substrate (and stop teeing
// our own copy) — tracked in the workflow-intelligence master plan.

import * as fs from 'fs';
import * as path from 'path';

/** What follows `<slug>-` in a persisted trace filename. */
const TRACE_TAIL = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.ndjson$/;

function traceSlugFor(fsPath: string): string {
  return path.basename(fsPath).replace(/\.nika\.yaml$/, '').replace(/\.ya?ml$/, '');
}

function traceDirFor(fsPath: string): string {
  return path.join(path.dirname(fsPath), '.nika', 'traces');
}

/** THIS workflow's persisted traces in `dir`, oldest → newest. */
function traceFilesFor(dir: string, slug: string): string[] {
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith(`${slug}-`) && TRACE_TAIL.test(f.slice(slug.length + 1)))
    .sort();
}

/** Newest persisted trace for a workflow (what `--resume` rides).
 *  Undefined when the workflow never ran (or the dir is unreadable). */
export function latestTraceFor(fsPath: string): string | undefined {
  try {
    const dir = traceDirFor(fsPath);
    const mine = traceFilesFor(dir, traceSlugFor(fsPath));
    const last = mine[mine.length - 1];
    return last === undefined ? undefined : path.join(dir, last);
  } catch {
    return undefined;
  }
}

/**
 * Persist a finished run's raw NDJSON stream: `.nika/traces/*.ndjson` is
 * BOTH the Runs-view discovery glob AND the `--resume <trace>` substrate
 * (ADR-099). Failures are worth keeping — a resume after a crash skips
 * the part that succeeded. Keeps the newest `keep` per workflow (a trace
 * is a working file, not an archive — the engine's journal is the
 * durable record). Never throws: persistence is garnish — a read-only
 * workspace must not break the run verdict.
 */
export function persistTrace(fsPath: string, ndjson: string, keep = 10): void {
  try {
    const dir = traceDirFor(fsPath);
    fs.mkdirSync(dir, { recursive: true });
    const slug = traceSlugFor(fsPath);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.writeFileSync(path.join(dir, `${slug}-${stamp}.ndjson`), ndjson, 'utf-8');
    const mine = traceFilesFor(dir, slug);
    for (const old of mine.slice(0, Math.max(0, mine.length - keep))) {
      fs.unlinkSync(path.join(dir, old));
    }
  } catch {
    // Garnish law.
  }
}
