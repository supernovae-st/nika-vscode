// goldenDrift.ts — parse `nika test`'s drift report into an honest
// expected/actual pair (pure · provable).
//
// The engine's failure grammar, pinned live against 0.104.0:
//   ✖ outputs drifted from the golden · <file>.golden.json
//     ~ outputs.<path> · golden <json> → run <json>
//     + outputs.<path> · not in the golden (<json>)
//     - outputs.<path> · missing (golden has <json>)
//
// expected = the golden file as-is; actual = the golden with each drift
// line applied. Reconstruction only — every value comes from the
// engine's own report; ANY line that refuses to parse voids the pair
// (the caller falls back to the verbatim message, never an invention).

export interface DriftLine {
  op: '~' | '+' | '-';
  /** Key path INSIDE the golden object (the `outputs.` root stripped). */
  path: string[];
  golden?: unknown;
  run?: unknown;
}

function parsePath(token: string): string[] | undefined {
  if (token === 'outputs') { return []; }
  if (!token.startsWith('outputs.')) { return undefined; }
  const tail = token.slice('outputs.'.length);
  if (tail.length === 0) { return undefined; }
  return tail.split('.');
}

function tryJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * Every drift line of a failing `nika test`, or undefined when the
 * output carries none that parse (older engine · foreign wording).
 */
export function parseGoldenDrift(stdout: string): DriftLine[] | undefined {
  const out: DriftLine[] = [];
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    const m = /^([~+-]) (\S+) · (.*)$/.exec(line);
    if (!m) { continue; }
    const path = parsePath(m[2]);
    if (path === undefined) { return undefined; }
    const rest = m[3];
    if (m[1] === '~') {
      if (!rest.startsWith('golden ')) { return undefined; }
      const body = rest.slice('golden '.length);
      // The separator could legally appear INSIDE a golden string —
      // scan candidate split points until BOTH sides parse as JSON.
      let parsed: DriftLine | undefined;
      let at = body.indexOf(' → run ');
      while (at !== -1) {
        const left = tryJson(body.slice(0, at));
        const right = tryJson(body.slice(at + ' → run '.length));
        if (left.ok && right.ok) {
          parsed = { op: '~', path, golden: left.value, run: right.value };
          break;
        }
        at = body.indexOf(' → run ', at + 1);
      }
      if (!parsed) { return undefined; }
      out.push(parsed);
    } else if (m[1] === '+') {
      const vm = /^not in the golden \((.*)\)$/.exec(rest);
      if (!vm) { return undefined; }
      const v = tryJson(vm[1]);
      if (!v.ok) { return undefined; }
      out.push({ op: '+', path, run: v.value });
    } else {
      const vm = /^missing \(golden has (.*)\)$/.exec(rest);
      if (!vm) { return undefined; }
      const v = tryJson(vm[1]);
      if (!v.ok) { return undefined; }
      out.push({ op: '-', path, golden: v.value });
    }
  }
  return out.length > 0 ? out : undefined;
}

function setPath(root: Record<string, unknown>, path: string[], value: unknown): void {
  let node = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const next = node[key];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[path[path.length - 1]] = value;
}

function deletePath(root: Record<string, unknown>, path: string[]): void {
  let node: Record<string, unknown> | undefined = root;
  for (let i = 0; i < path.length - 1 && node !== undefined; i++) {
    const next: unknown = node[path[i]];
    node = typeof next === 'object' && next !== null && !Array.isArray(next)
      ? (next as Record<string, unknown>)
      : undefined;
  }
  if (node !== undefined) { delete node[path[path.length - 1]]; }
}

/**
 * The run's outputs, reconstructed: golden + every drift applied.
 * Undefined when the golden is not an object (nothing to patch onto).
 */
export function reconstructActual(golden: unknown, drift: DriftLine[]): unknown {
  if (typeof golden !== 'object' || golden === null || Array.isArray(golden)) {
    // Whole-object drift on a scalar golden: the run side IS the value.
    const whole = drift.find((d) => d.path.length === 0);
    return whole !== undefined ? whole.run : undefined;
  }
  const actual = JSON.parse(JSON.stringify(golden)) as Record<string, unknown>;
  for (const d of drift) {
    if (d.path.length === 0) { continue; }
    if (d.op === '-') { deletePath(actual, d.path); }
    else { setPath(actual, d.path, d.run); }
  }
  return actual;
}

/** Zero-based line of the top-level `outputs:` block — the exact YAML
 *  the golden contract binds (the failure peek's anchor). */
export function outputsBlockLine(yamlText: string): number | undefined {
  const lines = yamlText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^outputs:\s*(#.*)?$/.test(lines[i])) { return i; }
  }
  return undefined;
}

/**
 * Which workflow does a recorded trace belong to? The house membership
 * gate: ≥60% of the trace's task ids exist in the workflow — highest
 * overlap wins, first candidate breaks ties.
 */
export function matchTraceToWorkflow(
  traceTaskIds: readonly string[],
  candidates: ReadonlyArray<{ fsPath: string; taskIds: readonly string[] }>,
): string | undefined {
  if (traceTaskIds.length === 0) { return undefined; }
  let best: { fsPath: string; ratio: number } | undefined;
  for (const c of candidates) {
    const ids = new Set(c.taskIds);
    const overlap = traceTaskIds.filter((id) => ids.has(id)).length / traceTaskIds.length;
    if (overlap >= 0.6 && (best === undefined || overlap > best.ratio)) {
      best = { fsPath: c.fsPath, ratio: overlap };
    }
  }
  return best?.fsPath;
}
