// runReport.ts — the run report document (pure · no vscode).
//
// « Provable after it runs »: one markdown document per recorded run,
// composed ONLY of what the trace proves — statuses, durations, spend,
// retries, cache hits, artifacts with provenance. No narrative claim
// without its event; gaps say so (« no cost data », never $0 invented).
// The document is local, diff-able, shareable by file — never a service.

import type { RunModel } from './traceFold';
import { humanizeDuration } from './traceFold';
import type { RunArtifact } from './artifacts';
import { STATUS_CHAR } from './glyphRegistry';
import { humanBytes } from './artifacts';
import { renderLadder, type Attempt } from './attempts';
import type { ChainVerdict } from './chainVerify';

export interface RunReportInputs {
  traceName: string;
  model: RunModel;
  artifacts: Map<string, RunArtifact[]>;
  /** Resolve a recorded (possibly relative) path to an absolute file
   *  that EXISTS — image artifacts it resolves render inline in the
   *  report preview (the gallery). Unresolvable stays a plain line. */
  resolvePath?: (p: string) => string | undefined;
  /** Per-task attempt ladders — failures grow their per-attempt story. */
  ladders?: Map<string, Attempt[]>;
  /** The tamper-evidence walk (engine 0.96+) — the proof-carrying
   *  report carries its proof. */
  chain?: ChainVerdict;
}

const usd = (n: number): string =>
  `$${n.toFixed(n < 0.1 ? 4 : 2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}`;

// The one status vocabulary (glyphRegistry) — the report can never
// drift into a dialect of its own.
const STATUS_ICON: Record<string, string> = STATUS_CHAR;

export function renderRunReport(inputs: RunReportInputs): string {
  const { model, artifacts } = inputs;
  const tasks = [...model.tasks.values()];
  const out: string[] = [];

  out.push(`# Run report — ${inputs.traceName}`);
  out.push('');
  out.push('> Every line below is read from the recorded trace — statuses, timings and spend are the events themselves, never a summary\'s opinion. Gaps are stated, not filled.');
  out.push('');

  // ── Verdict ──
  const ok = tasks.filter((t) => t.status === 'success').length;
  const bad = tasks.filter((t) => t.status === 'failed').length;
  const skipped = tasks.filter((t) => t.status === 'skipped').length;
  const cached = tasks.filter((t) => t.cached === true).length;
  const recovered = tasks.filter((t) => t.recoveredFrom !== undefined).length;
  const retries = tasks.reduce((a, t) => a + t.retries, 0);
  const starts = tasks.map((t) => t.startMs).filter((n): n is number => n !== undefined);
  const ends = tasks.map((t) => t.endMs).filter((n): n is number => n !== undefined);
  const wallMs = starts.length > 0 && ends.length > 0 ? Math.max(...ends) - Math.min(...starts) : undefined;
  const spend = tasks.reduce((a, t) => a + (t.usd ?? 0), 0);
  const priced = tasks.some((t) => t.usd !== undefined);

  out.push('## Verdict');
  out.push('');
  out.push(`- Workflow: **${model.workflowStatus ?? 'unknown'}** — ${ok} succeeded · ${bad} failed · ${skipped} skipped${cached > 0 ? ` · ${cached} from cache` : ''}${recovered > 0 ? ` · ${recovered} recovered` : ''}${retries > 0 ? ` · ${retries} retr${retries === 1 ? 'y' : 'ies'}` : ''}`);
  out.push(`- Wall clock: ${wallMs !== undefined ? humanizeDuration(wallMs) : 'not recoverable from this trace'}`);
  out.push(`- Spend: ${priced ? usd(spend) : 'no cost data (mock/local — nothing was priced)'}`);
  if (inputs.chain) {
    const c = inputs.chain;
    if (c.kind === 'intact') {
      out.push(`- Integrity: chain **intact** — head \`${c.head}\` (tamper-evident; compare against the head the run printed)`);
    } else if (c.kind === 'torn') {
      out.push(`- Integrity: chain intact through the last complete line — head \`${c.head}\` (final line torn: a crash mid-write, not tampering)`);
    } else if (c.kind === 'broken') {
      out.push(`- ⚠ Integrity: **chain BROKEN at line ${c.line}** — this journal fails \`nika trace verify\`; every claim in this report is unverified`);
    }
  }
  if (model.unknownLines > 0) {
    out.push(`- ⚠ ${model.unknownLines} unparsed line${model.unknownLines === 1 ? '' : 's'} (foreign dialect?) — this report reads what it can prove`);
  }
  out.push('');

  // ── Per-task table ──
  out.push('## Tasks');
  out.push('');
  out.push('| task | status | duration | spend | notes |');
  out.push('|---|---|---|---|---|');
  for (const t of tasks) {
    const notes: string[] = [];
    if (t.cached) {
      // The reuse claim carries its proof when the trace recorded the
      // ADR-099 identity pair (the self-verify grammar).
      notes.push(t.defHash !== undefined && t.inputHash !== undefined
        ? `cache hit (def ${t.defHash.slice(0, 8)}… · inputs ${t.inputHash.slice(0, 8)}…)`
        : 'cache hit');
    }
    // A repaired success names what it absorbed (D-2026-07-08-N4).
    if (t.recoveredFrom !== undefined) {
      notes.push(t.recoveredFrom ? `recovered from ${t.recoveredFrom}` : 'recovered');
    }
    if (t.retries > 0) { notes.push(`↻${t.retries}`); }
    if (t.whyWhen !== undefined) { notes.push(`gate false: ${t.whyWhen.replace(/\|/g, '·')}`); }
    if (t.blockedBy !== undefined) { notes.push(`blocked by \`${t.blockedBy}\``); }
    if (t.status === 'failed' && t.preview) { notes.push(t.preview.replace(/\|/g, '·')); }
    // The agent loop's inner life (the five agent_* kinds) — the same
    // narration every other surface speaks, compact for the table.
    if (t.agent !== undefined) {
      const a = t.agent;
      const bits: string[] = [];
      if (a.turns !== undefined) {
        bits.push(`${a.turns} turn${a.turns === 1 ? '' : 's'}${a.offered !== undefined && a.universe !== undefined ? ` (saw ${a.offered}/${a.universe} tools)` : ''}`);
      }
      if (a.nudges !== undefined && a.nudges > 0) { bits.push(`nudged ${a.nudges}×`); }
      if (a.stalled !== undefined) { bits.push('stalled — the loop stopped itself'); }
      if (a.compose !== undefined) { bits.push(`compose ${a.compose.valid}/${a.compose.checked}`); }
      if (bits.length > 0) { notes.push(bits.join(' · ')); }
    }
    out.push(`| \`${t.id}\` | ${STATUS_ICON[t.status] ?? '·'} ${t.status} | ${t.durationMs !== undefined ? humanizeDuration(t.durationMs) : '—'} | ${t.usd !== undefined ? usd(t.usd) : '—'} | ${notes.join(' · ')} |`);
  }
  out.push('');

  // ── Artifacts ──
  const allArts = [...artifacts.entries()];
  if (allArts.length > 0) {
    out.push('## Artifacts');
    out.push('');
    for (const [taskId, list] of allArts) {
      for (const a of list) {
        const facts = [
          a.kind,
          a.bytes !== undefined ? humanBytes(a.bytes) : undefined,
          a.durationMs !== undefined ? `${(a.durationMs / 1000).toFixed(1)}s` : undefined,
          a.model ? `${a.provider ? `${a.provider}/` : ''}${a.model}` : undefined,
        ].filter(Boolean).join(' · ');
        const abs = inputs.resolvePath?.(a.path);
        // A resolved artifact is a `file:` LINK (the preview honors those;
        // `command:` links it does not — annexe R R13). Angle-bracket
        // destination, the gallery's proven idiom — paths with spaces
        // stay one URL. Unresolved stays a code span: the gap says so.
        out.push(abs !== undefined
          ? `- [\`${a.path}\`](<file://${abs}>) — ${facts} · produced by \`${taskId}\``
          : `- \`${a.path}\` — ${facts} · produced by \`${taskId}\``);
        if (a.kind === 'image' && abs !== undefined) {
          out.push('');
          out.push(`  ![${a.label ?? 'image'} — ${taskId}](<file://${abs}>)`);
          out.push('');
        }
      }
    }
    out.push('');
  }

  // ── Failures detail ──
  const failures = tasks.filter((t) => t.status === 'failed');
  if (failures.length > 0) {
    out.push('## Failures');
    out.push('');
    for (const t of failures) {
      out.push(`- \`${t.id}\` — ${t.preview ?? 'no detail recorded'}${t.retries > 0 ? ` (after ${t.retries + 1} attempts)` : ''}`);
      const ladder = inputs.ladders?.get(t.id);
      if (ladder && ladder.length > 1) {
        for (const line of renderLadder(ladder)) {
          out.push(`  - ${line}`);
        }
      }
    }
    out.push('');
    out.push('_Re-run from a failure with `Nika: Fork From Task` — upstream rehydrates from this trace._');
    out.push('');
  }

  return out.join('\n');
}
