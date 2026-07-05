// auditByTask.ts — per-task rollup of the static-check findings.
//
// `nika check` is the moat: cost ceiling · secret flows · permits escapes
// · schema parity · unknown tools — all STATIC, all auditable before a
// token is spent. The editor already paints these as diagnostics; this
// rolls the TASK-attributed ones up per task so the canvas can mark each
// card with a ⚠N badge (worst severity + count). Pure — the webview
// renders the badge, the tests pin the rollup. Findings without a task
// (secret-egress on outputs · document-level parse) are excluded here;
// they belong to the workflow, not a card.

import type { UnifiedFinding } from './cliContract';

export type AuditSeverity = 'error' | 'warning' | 'info';

export interface TaskAudit {
  count: number;
  worst: AuditSeverity;
}

const RANK: Record<AuditSeverity, number> = { error: 0, warning: 1, info: 2 };

function normSeverity(s: string): AuditSeverity {
  return s === 'error' ? 'error' : s === 'warning' ? 'warning' : 'info';
}

/**
 * Roll the task-attributed findings up per task id. A card's badge shows
 * the COUNT and the WORST severity (error < warning < info). Findings
 * with no `task` are the workflow's, not a card's — dropped.
 */
export function auditByTask(findings: readonly UnifiedFinding[]): Map<string, TaskAudit> {
  const out = new Map<string, TaskAudit>();
  for (const f of findings) {
    if (f.task === undefined) { continue; }
    const sev = normSeverity(f.severity);
    const cur = out.get(f.task);
    if (!cur) {
      out.set(f.task, { count: 1, worst: sev });
    } else {
      cur.count += 1;
      if (RANK[sev] < RANK[cur.worst]) { cur.worst = sev; }
    }
  }
  return out;
}
