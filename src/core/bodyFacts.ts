// bodyFacts.ts — the task's SUBSTANCE, extracted for the canvas cards.
//
// The engine's graph projection carries structure (verb · model · gates ·
// cost); the card body shows what the task actually SAYS — the prompt,
// the command, the tool args. Those live only in the YAML, so this is a
// pure text read over parseRichWorkflow spans (same degraded-honest
// contract as the rest of the client parser: `nika check` wins).

import { parseRichWorkflow } from '../workflowParser';

export interface BodyFacts {
  /** Agent register size — `tools: [a, b]` count (default-deny: an
   *  absent register means NO tools; 0 entries stays undefined so the
   *  card paints nothing false). */
  toolsCount?: number;
  /** infer/agent prompt — up to 3 display lines, whitespace-collapsed. */
  prompt?: string;
  /** exec command — first line. */
  command?: string;
  /** invoke args — `k: v` pairs, up to 3, one line. */
  args?: string;
  /** `retry.max_attempts` — the declared retry budget. */
  retryMax?: number;
  /** `timeout` Go-duration string, unquoted (`30s` · `1h30m`). */
  timeout?: string;
  /** `on_error` action — recover · skip · fail_workflow (exactly one). */
  onError?: string;
  /** Named `output:` bindings the task produces (≤4 names). */
  outputNames?: string[];
  /** `on_finally:` cleanup steps — list members (spec 03 §on_finally:
   *  ALWAYS runs on a started task · sequential · best-effort). */
  finallyCount?: number;
  /** infer `thinking:` — the scratch budget (budget_tokens), or -1
   *  when enabled without an explicit budget (spec 02 §fields). */
  thinkingBudget?: number;
  /** infer `vision:` — image inputs riding the prompt (list count). */
  visionCount?: number;
  /** `for_each:` — the fan-out's collection, as written (spec 03 ·
   *  `${{ ref }}` unquoted is the spec's own form). First line only. */
  forEachSource?: string;
  /** `max_parallel:` — the fan-out's concurrency cap (spec 03). */
  maxParallel?: number;
  /** `fail_fast:` — false = per-item error handling (the « process N ·
   *  report which failed » idiom); absent = engine default (true). */
  failFast?: boolean;
}

/** The on_error action keys (schema $defs/onError — exactly one). */
const ON_ERROR_ACTIONS = new Set(['recover', 'skip', 'fail_workflow']);

const MAX_LINES = 3;
const MAX_CHARS = 220;

/** Value of `key:` at line `i` — inline scalar or `|`/`>` block scalar. */
function scalarAt(lines: string[], i: number, indent: number): string | undefined {
  const m = lines[i].match(/^(\s*)([A-Za-z_]+):\s*(.*)$/);
  if (!m) { return undefined; }
  const rest = m[3].trim();

  // Block scalar — gather the following deeper-indented lines.
  if (/^[|>][+-]?\s*(#.*)?$/.test(rest)) {
    const block: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim().length === 0) {
        if (block.length > 0) { block.push(''); }
        continue;
      }
      const ind = line.match(/^( *)/)![1].length;
      if (ind <= indent) { break; }
      block.push(line.trim());
      if (block.length > MAX_LINES) { break; }
    }
    return block.join('\n').trim() || undefined;
  }

  if (rest.length === 0) { return undefined; }
  // Inline scalar — strip one layer of quotes.
  const unquoted = rest.match(/^"((?:[^"\\]|\\.)*)"/)?.[1]
    ?? rest.match(/^'([^']*)'/)?.[1]
    ?? rest.replace(/\s+#.*$/, '');
  return unquoted.replace(/\\n/g, '\n').trim() || undefined;
}

/** Clamp to the card budget: ≤3 lines · ≤220 chars · ellipsis when cut. */
function clamp(value: string): string {
  const lines = value.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  let out = lines.slice(0, MAX_LINES).join('\n');
  let cut = lines.length > MAX_LINES;
  if (out.length > MAX_CHARS) {
    out = out.slice(0, MAX_CHARS - 1);
    cut = true;
  }
  return cut ? `${out}…` : out;
}

/** Per-task body facts (prompt · command · args) keyed by task id. */
export function collectBodyFacts(text: string): Map<string, BodyFacts> {
  const wf = parseRichWorkflow(text);
  const lines = text.split('\n');
  const facts = new Map<string, BodyFacts>();

  for (const task of wf.tasks) {
    const fact: BodyFacts = {};
    const argPairs: string[] = [];
    let argsIndent = -1;
    // Policy blocks (`retry:` · `on_error:` · `output:`) — tracked open
    // block indents; -1 = closed. Their facts read only ONE level down.
    let retryIndent = -1;
    let onErrorIndent = -1;
    let outputIndent = -1;

    // Task-LEVEL keys sit at the minimum key indent of the BODY — the
    // declaring key line is excluded (W1 map form: `name:` matches the
    // key regex, and counting it would pull the level up to 2).
    // `timeout:`/`retry:`/`on_error:`/`output:` are read at that level
    // only, so a `with:` alias named `timeout` can never impersonate one.
    let taskIndent = Number.MAX_SAFE_INTEGER;
    for (let i = task.line + 1; i <= task.endLine && i < lines.length; i++) {
      const key = lines[i].match(/^(\s*)([A-Za-z_]+):/);
      if (key) { taskIndent = Math.min(taskIndent, key[1].length); }
    }

    for (let i = task.line + 1; i <= task.endLine && i < lines.length; i++) {
      const line = lines[i];
      const key = line.match(/^(\s*)([A-Za-z_]+):/);
      const indent = key ? key[1].length : -1;

      // Close any open policy block once indentation returns to its level.
      if (key) {
        if (retryIndent >= 0 && indent <= retryIndent) { retryIndent = -1; }
        if (onErrorIndent >= 0 && indent <= onErrorIndent) { onErrorIndent = -1; }
        if (outputIndent >= 0 && indent <= outputIndent) { outputIndent = -1; }
      }

      // Args block members (one level under `args:`).
      if (argsIndent >= 0) {
        if (line.trim().length > 0 && indent > argsIndent && argPairs.length < 3) {
          const kv = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
          if (kv) {
            const v = kv[2].trim().replace(/^["']|["']$/g, '');
            if (v.length === 0) {
              // A block member: a LIST of single-key op maps serializes
              // its op names (`ops: dither → duotone` — the recipe is
              // the soul); a nested MAP spends no pair (its scalars
              // flatten in below, as they always did).
              const chain: string[] = [];
              let itemsAt = -1;
              let overflow = false;
              for (let j = i + 1; j <= task.endLine && j < lines.length; j++) {
                const item = lines[j];
                if (item.trim().length === 0) { continue; }
                const itemIndent = item.match(/^( *)/)![1].length;
                if (itemIndent <= indent) { break; }
                const op = item.match(/^\s*-\s+([A-Za-z_][A-Za-z0-9_]*)\s*:?\s*(?:\{.*)?$/);
                if (!op) {
                  // A non-map member at the list's level: this is not a
                  // single-key-map chain — keep no half-truth.
                  if (item.trim().startsWith('-') && (itemsAt === -1 || itemIndent === itemsAt)) {
                    chain.length = 0;
                    break;
                  }
                  continue;
                }
                if (itemsAt === -1) { itemsAt = itemIndent; }
                if (itemIndent !== itemsAt) { continue; }
                if (chain.length < 3) { chain.push(op[1]); }
                else { overflow = true; break; }
              }
              if (chain.length > 0) {
                argPairs.push(`${kv[1]}: ${chain.join(' → ')}${overflow ? ' …' : ''}`);
              }
            } else {
              argPairs.push(`${kv[1]}: ${v.length > 34 ? `${v.slice(0, 33)}…` : v}`);
            }
          }
          continue;
        }
        if (line.trim().length > 0 && indent >= 0 && indent <= argsIndent) {
          argsIndent = -1; // block closed
        }
      }

      if (!key) { continue; }
      const name = key[2];

      // The agent register (spec: default-deny whitelist) — the flow
      // form `tools: ["nika:fetch", …]` is what the doors write; a
      // block-sequence register counts its `- ` members below.
      if (name === 'tools' && fact.toolsCount === undefined) {
        const inline = line.slice(line.indexOf(':') + 1).trim();
        if (inline.startsWith('[')) {
          const inner = inline.replace(/^\[/, '').replace(/\].*$/, '').trim();
          const n = inner.length === 0 ? 0 : inner.split(',').length;
          if (n > 0) { fact.toolsCount = n; }
        } else if (inline.length === 0) {
          let n = 0;
          for (let j = i + 1; j <= task.endLine && j < lines.length; j++) {
            const t = lines[j];
            if (t.trim().startsWith('- ')) { n += 1; continue; }
            if (t.trim().length === 0) { continue; }
            const kj = t.match(/^(\s*)[A-Za-z_]+:/);
            if (kj && kj[1].length <= indent) { break; }
            if (!t.trim().startsWith('-')) { break; }
          }
          if (n > 0) { fact.toolsCount = n; }
        }
        continue;
      }

      // Inside an open policy block — one level down carries the fact.
      if (retryIndent >= 0 && indent > retryIndent) {
        if (name === 'max_attempts' && fact.retryMax === undefined) {
          const n = Number(line.slice(line.indexOf(':') + 1).trim());
          if (Number.isInteger(n) && n >= 1) { fact.retryMax = n; }
        }
        continue;
      }
      if (onErrorIndent >= 0 && indent > onErrorIndent) {
        if (fact.onError === undefined && ON_ERROR_ACTIONS.has(name)) {
          fact.onError = name;
        }
        continue;
      }
      if (outputIndent >= 0 && indent > outputIndent) {
        const outs = fact.outputNames ?? (fact.outputNames = []);
        if (outs.length < 4 && !outs.includes(name)) { outs.push(name); }
        continue;
      }

      if (name === 'prompt' && fact.prompt === undefined) {
        const v = scalarAt(lines, i, indent);
        if (v) { fact.prompt = clamp(v); }
      } else if (name === 'command' && fact.command === undefined) {
        const v = scalarAt(lines, i, indent);
        if (v) { fact.command = clamp(v).split('\n')[0]; }
      } else if (name === 'args') {
        argsIndent = indent;
      } else if (indent === taskIndent && name === 'timeout' && fact.timeout === undefined) {
        const v = scalarAt(lines, i, indent);
        if (v && /^[0-9]/.test(v)) { fact.timeout = v.split('\n')[0]; }
      } else if (indent === taskIndent && name === 'retry') {
        // Flow form `retry: { max_attempts: 3 }` or a block to scan.
        const inline = line.match(/max_attempts:\s*(\d+)/);
        if (inline) { fact.retryMax = Number(inline[1]); }
        else { retryIndent = indent; }
      } else if (indent === taskIndent && name === 'on_error') {
        const inline = line.slice(line.indexOf(':') + 1)
          .match(/\b(recover|skip|fail_workflow)\b/);
        if (inline) { fact.onError = inline[1]; }
        else { onErrorIndent = indent; }
      } else if (indent === taskIndent && name === 'output') {
        outputIndent = indent;
      } else if (indent === taskIndent && name === 'for_each' && fact.forEachSource === undefined) {
        // Task-level only — a `with:` alias named for_each can never
        // impersonate the construct (same discipline as timeout).
        const v = scalarAt(lines, i, indent);
        if (v) { fact.forEachSource = clamp(v).split('\n')[0]; }
      } else if (indent === taskIndent && name === 'max_parallel' && fact.maxParallel === undefined) {
        const n = Number(line.slice(line.indexOf(':') + 1).trim());
        if (Number.isInteger(n) && n >= 1) { fact.maxParallel = n; }
      } else if (indent === taskIndent && name === 'fail_fast' && fact.failFast === undefined) {
        const v = line.slice(line.indexOf(':') + 1).trim();
        if (v.startsWith('true')) { fact.failFast = true; }
        else if (v.startsWith('false')) { fact.failFast = false; }
      } else if (name === 'thinking' && fact.thinkingBudget === undefined && indent > taskIndent) {
        // Verb-body block (spec 02): enabled + budget_tokens one level
        // down. Best-effort client read — `nika check` owns conformance.
        let enabled = false;
        let budget: number | undefined;
        for (let j = i + 1; j <= task.endLine && j < lines.length; j++) {
          const kj = lines[j].match(/^(\s*)([A-Za-z_]+):\s*(.*)$/);
          if (!kj) { if (lines[j].trim().length > 0) { break; } continue; }
          if (kj[1].length <= indent) { break; }
          if (kj[2] === 'enabled') { enabled = kj[3].trim().startsWith('true'); }
          if (kj[2] === 'budget_tokens') {
            const n = Number(kj[3].trim());
            if (Number.isInteger(n) && n > 0) { budget = n; }
          }
        }
        if (enabled || budget !== undefined) { fact.thinkingBudget = budget ?? -1; }
      } else if (name === 'vision' && fact.visionCount === undefined && indent > taskIndent) {
        let n = 0;
        for (let j = i + 1; j <= task.endLine && j < lines.length; j++) {
          const t2 = lines[j];
          if (t2.trim().length === 0) { continue; }
          const kj = t2.match(/^(\s*)\S/);
          if (kj && kj[1].length <= indent) { break; }
          if (t2.trim().startsWith('- ')) { n += 1; }
        }
        if (n > 0) { fact.visionCount = n; }
      } else if (indent === taskIndent && name === 'on_finally' && fact.finallyCount === undefined) {
        // Cleanup steps = the list members one level down. Only `- `
        // entries count (each is a mini-task); a non-list body is a
        // conformance problem `nika check` owns — we count nothing.
        let n = 0;
        for (let j = i + 1; j <= task.endLine && j < lines.length; j++) {
          const t = lines[j];
          if (t.trim().length === 0) { continue; }
          const kj = t.match(/^(\s*)\S/);
          if (kj && kj[1].length <= indent) { break; }
          if (t.trim().startsWith('- ')) { n += 1; }
        }
        if (n > 0) { fact.finallyCount = n; }
      }
    }

    if (argPairs.length > 0) { fact.args = argPairs.join(' · '); }
    // Any declared fact earns the entry — a scalar-verb task
    // (`exec: echo hi`) with only an `on_finally:` block must not
    // vanish because it carries no prompt/command/args substance.
    if (fact.prompt || fact.command || fact.args
        || fact.retryMax !== undefined || fact.timeout !== undefined
        || fact.onError !== undefined || fact.toolsCount !== undefined
        || fact.outputNames !== undefined || fact.finallyCount !== undefined
        || fact.thinkingBudget !== undefined || fact.visionCount !== undefined
        || fact.maxParallel !== undefined || fact.failFast !== undefined
        || fact.forEachSource !== undefined) {
      facts.set(task.id, fact);
    }
  }
  return facts;
}
