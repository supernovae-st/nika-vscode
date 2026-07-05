// explainWorkflow.ts — deterministic workflow narration (pure · no vscode).
//
// `Nika: Explain Workflow` renders THIS markdown: what the workflow does,
// wave by wave, what it costs, what it touches — composed strictly from
// the engine's own projections (`graph --format json` + `check --json`).
// Zero invention, zero LLM, works offline: every sentence is traceable to
// an engine fact. An agent-enriched version can layer ON TOP of this
// (never replace it) — the deterministic read is the floor of truth.

import type { CheckReport, DagGraph, DagNode } from './cliContract';

/** Kahn layering — presentation math on the ENGINE's graph (the same
 *  family the canvas draws); used only when no check report carries the
 *  engine's own `waves`. */
function kahnWaves(graph: DagGraph): string[][] {
  const indeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const n of graph.nodes) { indeg.set(n.id, 0); }
  for (const e of graph.edges) {
    if (!indeg.has(e.source) || !indeg.has(e.target)) { continue; }
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
  }
  const waves: string[][] = [];
  let frontier = graph.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const seen = new Set<string>();
  while (frontier.length > 0) {
    waves.push(frontier);
    const next: string[] = [];
    for (const id of frontier) {
      seen.add(id);
      for (const t of out.get(id) ?? []) {
        indeg.set(t, (indeg.get(t) ?? 1) - 1);
        if ((indeg.get(t) ?? 0) === 0 && !seen.has(t)) { next.push(t); }
      }
    }
    frontier = next;
  }
  return waves;
}

function usd(n: number): string {
  return `$${n.toFixed(n < 0.1 ? 4 : 2)}`;
}

/** One line per task: `**id** — verb · model/tool · gated when · fan-out`. */
function taskLine(node: DagNode): string {
  const facts: string[] = [node.verb];
  if (node.model) { facts.push(node.model); }
  if (node.tool) { facts.push(node.tool); }
  if (node.fanOutKind) {
    facts.push(`fan-out ${node.fanOutKind}${node.fanOutCount != null ? ` ×${node.fanOutCount}` : ''}`);
  }
  const gate = node.when ? ` — runs only when \`${node.when}\`` : '';
  return `**${node.id}** (${facts.join(' · ')})${gate}`;
}

/**
 * The deterministic explanation, as markdown. `report` deepens the read
 * (engine waves · cost ceiling · secret flow · DAG analysis) when a check
 * has landed; without it the story stays graph-only and says so.
 */
export function explainWorkflow(graph: DagGraph, report?: CheckReport): string {
  const nodes = graph.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const lines: string[] = [];

  lines.push(`# ${graph.workflowName} — what this workflow does`);
  lines.push('');
  lines.push(
    `**${nodes.length} task${nodes.length === 1 ? '' : 's'} · ${graph.edges.length} ` +
    `dependenc${graph.edges.length === 1 ? 'y' : 'ies'}** — a deterministic read derived from ` +
    'the engine\'s `graph` + `check` projections. Nothing here is invented or inferred by an LLM.',
  );
  lines.push('');

  // ── The story, wave by wave ────────────────────────────────────────────
  // Engine waves when a report carries them (the REAL plan); Kahn layering
  // of the engine's graph otherwise (presentation only).
  const engineWaves = report?.waves && report.waves.length > 0
    ? report.waves.map((w) => w.map((i) => nodes[i]?.id).filter((id): id is string => id !== undefined))
    : undefined;
  const waves = engineWaves ?? kahnWaves(graph);
  lines.push(`## The story, wave by wave${engineWaves ? '' : ' (derived from the graph — run a check for the engine\'s own plan)'}`);
  lines.push('');
  waves.forEach((wave, i) => {
    const items = wave.map((id) => byId.get(id)).filter((n): n is DagNode => n !== undefined);
    if (items.length === 0) { return; }
    const parallel = items.length > 1 ? ` — ${items.length} tasks run in parallel` : '';
    lines.push(`${i + 1}. ${items.map(taskLine).join(' · ')}${parallel}`);
  });
  const unreachable = nodes.filter((n) => !waves.some((w) => w.includes(n.id)));
  if (unreachable.length > 0) {
    lines.push('');
    lines.push(`⚠ ${unreachable.length} task${unreachable.length === 1 ? '' : 's'} never reached a wave (cycle or dangling dependency): ${unreachable.map((n) => `\`${n.id}\``).join(', ')}.`);
  }
  lines.push('');

  // ── Cost before a token is spent ───────────────────────────────────────
  lines.push('## Cost before a token is spent');
  lines.push('');
  if (report) {
    const cost = report.cost;
    if (cost.has_unbounded === true) {
      lines.push(`⚠ **The ceiling is a FLOOR** — ≥1 priced task has no token limit${cost.bounded_total_usd !== undefined ? ` (bounded part: ${usd(cost.bounded_total_usd)})` : ''}.`);
    } else if (cost.bounded_total_usd !== undefined) {
      lines.push(`Bounded ceiling: **${usd(cost.bounded_total_usd)}**${cost.min_path_total_usd !== undefined ? ` (cheapest path ${usd(cost.min_path_total_usd)})` : ''}.`);
    } else {
      lines.push('No priced task — this workflow spends no provider tokens as written.');
    }
    const priced = report.cost.tasks
      .filter((t) => typeof t.usd === 'number')
      .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))
      .slice(0, 3);
    for (const t of priced) {
      lines.push(`- \`${t.task}\` up to ${usd(t.usd ?? 0)}${t.model ? ` (${t.model})` : ''}`);
    }
  } else {
    lines.push('_No check report yet — run `Nika: Validate Current Workflow` for the cost ceiling._');
  }
  lines.push('');

  // ── What it touches ────────────────────────────────────────────────────
  lines.push('## What it touches');
  lines.push('');
  const models = [...new Set(nodes.map((n) => n.model).filter((m): m is string => !!m))];
  const tools = [...new Set(nodes.map((n) => n.tool).filter((t): t is string => !!t))];
  if (models.length > 0) { lines.push(`- Models: ${models.map((m) => `\`${m}\``).join(' · ')}`); }
  if (tools.length > 0) { lines.push(`- Tools: ${tools.map((t) => `\`${t}\``).join(' · ')}`); }
  if (report) {
    if (report.capability_escapes.length > 0) {
      lines.push(`- ⚠ Capability escapes: ${report.capability_escapes.length} (permits boundary does not cover everything the tasks do)`);
    }
    const secrets = report.secret_leaks.length + report.secret_egresses.length;
    lines.push(secrets > 0
      ? `- ⚠ Secret flow: ${report.secret_leaks.length} leak${report.secret_leaks.length === 1 ? '' : 's'} · ${report.secret_egresses.length} egress${report.secret_egresses.length === 1 ? '' : 'es'} found by the IFC pass`
      : '- Secret flow: clean (no leak or egress found by the IFC pass)');
  }
  if (models.length === 0 && tools.length === 0 && !report) {
    lines.push('- Nothing declared beyond the graph (no models · no tools).');
  }
  lines.push('');

  // ── Structural risks ───────────────────────────────────────────────────
  const risks: string[] = [];
  if (report && report.conformance.length > 0) {
    risks.push(`${report.conformance.length} conformance finding${report.conformance.length === 1 ? '' : 's'} (open the check report for the NIKA-XXX detail)`);
  }
  const ghosts = graph.edges.filter((e) => e.ghost === true);
  if (ghosts.length > 0) {
    risks.push(`${ghosts.length} ghost edge${ghosts.length === 1 ? '' : 's'} — a data reference without its \`depends_on\` (${ghosts.map((g) => `\`${g.source}→${g.target}\``).join(', ')})`);
  }
  const analysis = report?.analysis;
  if (analysis) {
    if (analysis.pinch_points.length > 0) {
      risks.push(`pinch point${analysis.pinch_points.length === 1 ? '' : 's'}: ${analysis.pinch_points.map((p) => `\`${p}\``).join(', ')} — nothing else can run while these run`);
    }
    const top = [...analysis.blast_radius].sort((a, b) => b.blocks - a.blocks)[0];
    if (top && top.blocks > 0) {
      risks.push(`\`${top.task}\` failing blocks ${top.blocks} downstream task${top.blocks === 1 ? '' : 's'} (the widest blast radius)`);
    }
  }
  if (risks.length > 0) {
    lines.push('## Structural risks');
    lines.push('');
    for (const r of risks) { lines.push(`- ${r}`); }
    lines.push('');
  }

  lines.push('---');
  lines.push('_Go deeper: `Nika: Show Workflow DAG` (the living map) · `Nika: Open Check Report` (every finding) · `Nika: Run Current Workflow` (watch it live)._');
  lines.push('');
  return lines.join('\n');
}
