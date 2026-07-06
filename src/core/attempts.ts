// attempts.ts — the retry ladder (pure · no vscode).
//
// « Why did this fail? » deserves attempts, not a count: each
// `task_retrying` event is one FAILED attempt (with the engine's
// detail — the NIKA-code story), the terminal event is the last word.
// The ladder teaches retry semantics passively: what was tried, what
// each attempt said, how the story ended.

export interface Attempt {
  /** 1-based attempt number. */
  n: number;
  /** `retried` for every task_retrying · the terminal status for the last. */
  outcome: 'retried' | 'failed' | 'success' | 'cancelled';
  /** The engine's detail line (`NIKA-XXX · message`) when recorded. */
  detail?: string;
  /** Wall-clock ms since the first event of the trace (when derivable). */
  atMs?: number;
}

/**
 * Per-task attempt ladders from the raw trace. Tasks with a single
 * clean attempt yield NOTHING — the ladder exists only where there is
 * a story to tell (≥1 retry, or a failure with detail).
 */
export function attemptLadders(ndjson: string): Map<string, Attempt[]> {
  const ladders = new Map<string, Attempt[]>();
  let epochNs: number | undefined;

  const push = (task: string, a: Omit<Attempt, 'n'>): void => {
    const list = ladders.get(task) ?? [];
    list.push({ n: list.length + 1, ...a });
    ladders.set(task, list);
  };

  for (const raw of ndjson.split('\n')) {
    const line = raw.trim();
    if (line.length === 0) { continue; }
    let ev: unknown;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof ev !== 'object' || ev === null) { continue; }
    const e = ev as Record<string, unknown>;
    const ts = typeof e.timestamp === 'number' ? e.timestamp : undefined;
    if (epochNs === undefined && ts !== undefined) { epochNs = ts; }
    const kind = e.kind;
    if (kind !== 'task_retrying' && kind !== 'task_failed' && kind !== 'task_cancelled') { continue; }
    if (!Array.isArray(e.fields)) { continue; }
    let task: string | undefined;
    let detail: string | undefined;
    for (const f of e.fields as unknown[]) {
      if (typeof f !== 'object' || f === null) { continue; }
      const kv = f as Record<string, unknown>;
      if (kv.key === 'task' && typeof kv.value === 'string') { task = kv.value; }
      if (kv.key === 'detail' && typeof kv.value === 'string') { detail = kv.value; }
    }
    if (!task) { continue; }
    const atMs = ts !== undefined && epochNs !== undefined
      ? Math.max(0, Math.round((ts - epochNs) / 1e6))
      : undefined;
    push(task, {
      outcome: kind === 'task_retrying' ? 'retried' : kind === 'task_failed' ? 'failed' : 'cancelled',
      detail: detail?.split('\n')[0],
      atMs,
    });
  }

  // A lone terminal failure with no detail carries no story — drop it
  // (the status badge already says « failed »); keep single failures
  // WITH detail (the why) and every multi-attempt ladder.
  for (const [task, list] of [...ladders]) {
    if (list.length === 1 && list[0].outcome !== 'retried' && !list[0].detail) {
      ladders.delete(task);
    }
  }
  return ladders;
}

/** One markdown line per attempt — tooltip/report-ready. */
export function renderLadder(attempts: Attempt[]): string[] {
  return attempts.map((a) => {
    const clock = a.atMs !== undefined ? ` · ${(a.atMs / 1000).toFixed(1)}s` : '';
    const icon = a.outcome === 'retried' ? '↻' : a.outcome === 'failed' ? '✗' : '⊘';
    return `${icon} attempt ${a.n}${clock}${a.detail ? ` — ${a.detail}` : ''}${a.outcome === 'retried' ? ' (retried)' : ''}`;
  });
}
