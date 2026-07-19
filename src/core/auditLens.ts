// auditLens.ts — the moat lens's pure derive (W3L · L3).
//
// « What can this file DO before a token is spent? » The engine
// already answers per task (graph_format 2 `permits` — affirmative
// grants, engine-attributed); this module groups those grants into
// the FOUR capability domains a human audits by (run programs · touch
// files · reach the network · call tools), derives the hull groups
// the canvas paints, the egress hosts worth naming, and the honest
// cost ceiling line. Pure — provable without a webview.

export type PermitDomain = 'exec' | 'fs' | 'net' | 'tool';

export interface AuditFacts {
  /** Task ids per domain — the hull groups (insertion-ordered). */
  domains: Map<PermitDomain, string[]>;
  /** Every distinct egress host (`net.http: <host>` grants). */
  hosts: string[];
  /** Distinct programs the file may run (`exec: <bin>`). */
  programs: string[];
  /** The banner line — what this file can DO, one honest sentence. */
  banner: string;
}

/** Parse one grant into its domain (the grant grammar is engine-owned;
 *  unknown prefixes are ignored rather than guessed). */
export function domainOf(permit: string): PermitDomain | undefined {
  const key = permit.split(':')[0]?.trim();
  if (key === 'exec') { return 'exec'; }
  if (key === 'tool') { return 'tool'; }
  if (key !== undefined && (key === 'fs' || key.startsWith('fs.'))) { return 'fs'; }
  if (key !== undefined && (key === 'net' || key.startsWith('net.'))) { return 'net'; }
  return undefined;
}

function grantValue(permit: string): string | undefined {
  const i = permit.indexOf(':');
  if (i === -1) { return undefined; }
  const v = permit.slice(i + 1).trim();
  return v.length > 0 ? v : undefined;
}

export function deriveAuditFacts(
  nodes: ReadonlyArray<{ id: string; permits?: readonly string[] }>,
  cost?: { min: number; max: number; unbounded: boolean },
): AuditFacts {
  const domains = new Map<PermitDomain, string[]>();
  const hosts = new Set<string>();
  const programs = new Set<string>();
  for (const node of nodes) {
    const seen = new Set<PermitDomain>();
    for (const permit of node.permits ?? []) {
      const domain = domainOf(permit);
      if (domain === undefined || seen.has(domain)) {
        if (domain === undefined) { continue; }
      }
      if (!seen.has(domain)) {
        seen.add(domain);
        const list = domains.get(domain) ?? [];
        list.push(node.id);
        domains.set(domain, list);
      }
      const value = grantValue(permit);
      if (value === undefined) { continue; }
      if (domain === 'net' && permit.startsWith('net.http')) { hosts.add(value); }
      if (domain === 'exec') { programs.add(value); }
    }
  }

  // The banner: capabilities in audit-priority order (egress first —
  // the thing a reviewer checks before anything else), then the cost
  // ceiling, honest about UNBOUNDED.
  const parts: string[] = [];
  if (hosts.size > 0) { parts.push(`reaches ${[...hosts].join(' · ')}`); }
  if (programs.size > 0) { parts.push(`runs ${[...programs].join(' · ')}`); }
  const fsTasks = domains.get('fs')?.length ?? 0;
  if (fsTasks > 0) { parts.push(`touches files (${fsTasks} task${fsTasks === 1 ? '' : 's'})`); }
  const toolTasks = domains.get('tool')?.length ?? 0;
  if (toolTasks > 0) { parts.push(`calls ${toolTasks} tool task${toolTasks === 1 ? '' : 's'}`); }
  if (parts.length === 0) { parts.push('no declared capabilities — pure inference'); }
  if (cost !== undefined) {
    parts.push(cost.unbounded
      ? `est ≥$${cost.min.toFixed(4)} (UNBOUNDED tasks present)`
      : `est $${cost.min.toFixed(4)}–$${cost.max.toFixed(4)}`);
  }
  return {
    domains,
    hosts: [...hosts],
    programs: [...programs],
    banner: parts.join(' — '),
  };
}

/** Andrew monotone-chain convex hull over 2D points (the hull the
 *  canvas pads and paints per domain). Returns ≥3 points, or the
 *  input when fewer — the caller decides how to paint degenerates. */
export function convexHull(points: ReadonlyArray<[number, number]>): Array<[number, number]> {
  const pts = [...points].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  if (pts.length <= 2) { return pts; }
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) { lower.pop(); }
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) { upper.pop(); }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}
