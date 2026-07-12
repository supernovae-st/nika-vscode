// armorEdit.ts — « make it resilient » (pure): the spec's three error
// walls as insertable shapes. retry: absorbs TRANSIENT failures only
// (05-errors — rate limits · network · the engine's transient flag);
// on_error: catches what retries couldn't (recover with a fallback ·
// skip and keep the error readable); timeout: bounds the wait. The
// recover reference is NOT an execution edge (the spec's carve-out)
// but acyclicity still binds (NIKA-DAG-004) — candidates come from
// upstreamCandidates, so the picker cannot write the deadlock.

import { findTaskKey, taskBlockInsert, taskKeyRewrite, type TaskRange } from './flowEdit';

export type ArmorKind = 'retry' | 'recover' | 'skip' | 'timeout';

export interface ArmorShape {
  kind: ArmorKind;
  /** The task-level key the shape writes. */
  key: 'retry' | 'on_error' | 'timeout';
  /** Picker row. */
  label: string;
  /** Picker detail — teaches the why (spec 05-errors). */
  hint: string;
}

/** The register — one row per wall, offered only where the key is absent. */
export const ARMOR_SHAPES: readonly ArmorShape[] = [
  {
    kind: 'retry',
    key: 'retry',
    label: 'retry transient failures',
    hint: 'rate limits · network — retries fire on transient errors only; exponential backoff + jitter are the defaults',
  },
  {
    kind: 'recover',
    key: 'on_error',
    label: 'recover with a fallback',
    hint: 'when it still fails, substitute a value — downstream sees success, shape-stable',
  },
  {
    kind: 'skip',
    key: 'on_error',
    label: 'skip on error',
    hint: 'let the DAG continue — status: skipped, the original error stays readable at tasks.<id>.error',
  },
  {
    kind: 'timeout',
    key: 'timeout',
    label: 'bound its time',
    hint: 'a Go duration (30s · 5m) — the task fails NIKA-TIMEOUT instead of hanging the run',
  },
];

/** Armor keys already worn by the task — those rows leave the picker. */
export function wornArmor(lines: readonly string[], task: TaskRange): Set<'retry' | 'on_error' | 'timeout'> {
  const worn = new Set<'retry' | 'on_error' | 'timeout'>();
  for (const key of ['retry', 'on_error', 'timeout'] as const) {
    if (findTaskKey(lines, task, key)) { worn.add(key); }
  }
  return worn;
}

/** The spec-exact bodies. `max_attempts` is the one required retry
 * field; backoff_strategy/jitter defaults (exponential · true) stay
 * implicit — the comment carries them so the file stays lean. */
export function armorWrite(
  text: string,
  task: TaskRange,
  kind: ArmorKind,
  recoverRef?: string,
): string | undefined {
  switch (kind) {
    case 'retry':
      return taskBlockInsert(text, task, 'retry',
        'retry:\n'
        + '  max_attempts: 3      # total tries · transient errors only\n'
        + '  backoff_ms: 1000     # exponential + jitter by default\n');
    case 'recover':
      return taskBlockInsert(text, task, 'on_error',
        'on_error:\n'
        + `  recover: ${recoverRef ?? '""   # SLOT: a literal — or ${{ tasks.<id>.output }}'}\n`);
    case 'skip':
      return taskBlockInsert(text, task, 'on_error',
        'on_error:\n'
        + '  skip: true   # downstream sees skipped · the error stays readable\n');
    case 'timeout':
      return taskKeyRewrite(text, task, 'timeout', '"60s"   # SLOT: Go duration — 30s · 5m · 1h');
  }
}
