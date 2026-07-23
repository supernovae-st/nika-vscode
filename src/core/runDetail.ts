// runDetail.ts — the run's detail page (pure · no vscode).
//
// The stack law (DESIGN.md §7e): a run row's Enter pushes its DETAIL —
// one calm page per recorded run, at a glance: verdict · per-task
// breakdown · artifacts · the paused question when the run waits on a
// human. Read from the journal alone, like every run surface. The
// PROVABLE export stays `runReport` (integrity narrative · ladders ·
// the image gallery · per-task spend); this page is the quick read,
// and it teaches the deeper doors BY NAME — `command:` links are dead
// in the preview (annexe R R13), so nothing here pretends to be one.

import type { RunModel } from './traceFold';
import { humanizeDuration } from './traceFold';
import type { RunArtifact } from './artifacts';
import { humanBytes } from './artifacts';
import type { ChainVerdict } from './chainVerify';
import { STATUS_CHAR } from './glyphRegistry';
import { relativeDay } from './runsModel';

export interface RunDetailInputs {
  /** Trace basename without `.ndjson` — the run's journal identity. */
  traceName: string;
  /** The journal's absolute path — the provenance line. */
  fsPath: string;
  /** The journal's mtime — the run's date (age + stamp). */
  mtimeMs: number;
  /** Injected clock (the runsModel law: midnight is provable). */
  nowMs: number;
  model: RunModel;
  artifacts: Map<string, RunArtifact[]>;
  /** Resolve a recorded (possibly relative) path to a file that EXISTS —
   *  resolved artifacts become `file:` links (the report's idiom).
   *  Unresolvable stays a code span: the gap says so. */
  resolvePath?: (p: string) => string | undefined;
  /** The tamper-evidence walk — a broken chain outranks the verdict. */
  chain?: ChainVerdict;
}

const usd = (n: number): string =>
  `$${n.toFixed(n < 0.1 ? 4 : 2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}`;

/** Local calendar stamp, `YYYY-MM-DD HH:mm` — deterministic given TZ. */
function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The workflow verdict's glyph — summarizeRun's own mapping. */
function verdictGlyph(model: RunModel): string {
  return model.workflowStatus === 'completed' ? STATUS_CHAR.success
    : model.workflowStatus === 'failed' ? STATUS_CHAR.failed
    : model.workflowStatus === 'cancelled' ? STATUS_CHAR.cancelled
    : model.workflowStatus === 'paused' ? STATUS_CHAR.paused
    : STATUS_CHAR.running;
}

/** The attestation line per chain verdict — undefined stays silent
 *  (no journal read · nothing honest to claim). */
function shieldLine(chain: ChainVerdict | undefined): string | undefined {
  if (chain === undefined) { return undefined; }
  switch (chain.kind) {
    case 'intact':
      return `✓ **chain intact** · ${chain.events} event${chain.events === 1 ? '' : 's'} sealed · head \`${chain.head.slice(0, 12)}…\` — matches \`nika trace verify\``;
    case 'torn':
      return `✓ **chain verified to the torn tail** · ${chain.events} event${chain.events === 1 ? '' : 's'} sealed (a crash mid-write is not tampering) — \`nika trace verify\` agrees`;
    case 'broken':
      return `⚠ **chain BROKEN at line ${chain.line}** — this journal fails \`nika trace verify\`; every claim on this page is unverified`;
    case 'unchained':
      return '○ pre-chain journal (engine < 0.96) — no tamper evidence was recorded for this run';
    case 'empty':
    case 'unreadable':
      return undefined;
  }
}

export function renderRunDetail(i: RunDetailInputs): string {
  const { model } = i;
  const tasks = [...model.tasks.values()];
  const out: string[] = [];

  out.push(`# Run detail — ${model.workflowName ?? i.traceName}`);
  out.push('');

  // ── The verdict line — the row's accessories, writ large ──
  const ok = tasks.filter((t) => t.status === 'success').length;
  const bad = tasks.filter((t) => t.status === 'failed').length;
  const skipped = tasks.filter((t) => t.status === 'skipped').length;
  const cached = tasks.filter((t) => t.cached === true).length;
  const recovered = tasks.filter((t) => t.recoveredFrom !== undefined).length;
  const retries = tasks.reduce((a, t) => a + t.retries, 0);
  const running = model.workflowStatus === 'running';
  const wallMs = model.startMs !== undefined && model.endMs !== undefined && model.endMs > model.startMs
    ? model.endMs - model.startMs
    : undefined;
  const elapsedMs = running && model.startMs !== undefined && i.nowMs > model.startMs
    ? i.nowMs - model.startMs
    : undefined;
  out.push([
    `${verdictGlyph(model)} **${model.workflowStatus}**`,
    `${ok} succeeded`,
    bad > 0 ? `${bad} failed` : undefined,
    skipped > 0 ? `${skipped} skipped` : undefined,
    cached > 0 ? `${cached} from cache` : undefined,
    recovered > 0 ? `${recovered} recovered` : undefined,
    retries > 0 ? `${retries} retr${retries === 1 ? 'y' : 'ies'}` : undefined,
    wallMs !== undefined ? humanizeDuration(wallMs)
      : elapsedMs !== undefined ? `${humanizeDuration(elapsedMs)} elapsed` : undefined,
    // The cost, when the trace carries it — a mock/local run just says nothing.
    model.totalUsd !== undefined ? usd(model.totalUsd)
      : running && model.liveUsd !== undefined ? `~${usd(model.liveUsd)} so far` : undefined,
    `${relativeDay(i.mtimeMs, i.nowMs)} (${stamp(i.mtimeMs)})`,
  ].filter(Boolean).join(' · '));
  out.push('');

  // ── The shield — the tamper-evidence verdict, positive OR negative ──
  // The attestation is a first-class fact, not a silence: intact and
  // torn SAY so (with the head to compare against the run's own print),
  // broken outranks everything, unchained states the era honestly.
  // `command:` links are dead in the preview (annexe R R13), so the
  // one-gesture re-verify stays the K-panel door the footer teaches —
  // the CLI twin rides inline as the self-verifiable claim.
  const shield = shieldLine(i.chain);
  if (shield !== undefined) {
    out.push(shield);
    out.push('');
  }

  // ── The needs-you fact — a paused run leads with its question ──
  if (model.paused !== undefined) {
    const q = model.paused;
    out.push([
      `${STATUS_CHAR.paused} **waiting on you** — \`${q.task}\``,
      q.message !== undefined ? `asks: ${q.message}` : undefined,
      q.choices !== undefined && q.choices.length > 0 ? `(${q.choices.join(' · ')})` : undefined,
    ].filter(Boolean).join(' '));
    out.push('');
  }

  // ── Trust facts — stated, never papered over ──
  if (model.unknownLines > 0) {
    out.push(`⚠ ${model.unknownLines} unparsed line${model.unknownLines === 1 ? '' : 's'} (foreign dialect?) — this page reads what it can prove`);
    out.push('');
  }

  // ── The per-task breakdown ──
  out.push('## Tasks');
  out.push('');
  out.push('| task | status | duration | note |');
  out.push('|---|---|---|---|');
  for (const t of tasks) {
    const glyph = t.cached === true ? STATUS_CHAR.cached : STATUS_CHAR[t.status] ?? '·';
    const word = t.cached === true ? 'cache-hit' : t.status;
    const notes: string[] = [];
    if (t.recoveredFrom !== undefined) {
      notes.push(t.recoveredFrom ? `recovered from ${t.recoveredFrom}` : 'recovered');
    }
    if (t.retries > 0) { notes.push(`↻${t.retries}`); }
    if (t.whyWhen !== undefined) { notes.push(`gate false: ${t.whyWhen.replace(/\|/g, '·')}`); }
    if (t.blockedBy !== undefined) { notes.push(`blocked by \`${t.blockedBy}\``); }
    // The preview is the failure story on a failed task and the verb·tool
    // descriptor (`infer · mock/echo`) otherwise — BOTH belong in the
    // note column: a healthy run's table used to waste the column while
    // the terminal named every task's mechanism.
    if (t.preview) { notes.push(t.preview.replace(/\|/g, '·')); }
    out.push(`| \`${t.id}\` | ${glyph} ${word} | ${t.durationMs !== undefined ? humanizeDuration(t.durationMs) : '—'} | ${notes.join(' · ')} |`);
  }
  out.push('');

  // ── Artifacts — names and doors, never the gallery (the report's) ──
  const all = [...i.artifacts.entries()]
    .flatMap(([taskId, list]) => list.map((a) => ({ taskId, a })));
  if (all.length > 0) {
    out.push(`## Artifacts — ${all.length}`);
    out.push('');
    for (const { taskId, a } of all) {
      const facts = [
        a.kind,
        a.bytes !== undefined ? humanBytes(a.bytes) : undefined,
        `by \`${taskId}\``,
      ].filter(Boolean).join(' · ');
      const abs = i.resolvePath?.(a.path);
      out.push(abs !== undefined
        ? `- [\`${a.path}\`](<file://${abs}>) — ${facts}`
        : `- \`${a.path}\` — ${facts} (not found on disk)`);
    }
    out.push('');
  }

  // ── The journal line + the deeper doors, taught by name ──
  out.push('---');
  out.push('');
  out.push(`journal: \`${i.fsPath}\``);
  out.push('');
  out.push('_Deeper — the tree action panel on the run row (`⌘K ⌘.`): replay on the canvas (`⌘K ⌘P`) · diff two runs · debug (time travel) · verify the chain · reproduce · the provable Run Report · OpenTelemetry export._');
  return out.join('\n');
}

/** The honest page for a journal that would not read — same vocabulary
 *  as the Runs view's unreadable row and the report's toast (one voice). */
export function renderUnreadableDetail(fsPath: string, reason: string): string {
  return [
    '# Run detail',
    '',
    `⚠ This journal would not read — ${reason}.`,
    '',
    `journal: \`${fsPath}\``,
    '',
    '_Reveal it from the Runs view\'s Unreadable section._',
  ].join('\n');
}
