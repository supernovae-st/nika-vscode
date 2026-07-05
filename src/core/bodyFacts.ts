// bodyFacts.ts — the task's SUBSTANCE, extracted for the canvas cards.
//
// The engine's graph projection carries structure (verb · model · gates ·
// cost); the card body shows what the task actually SAYS — the prompt,
// the command, the tool args. Those live only in the YAML, so this is a
// pure text read over parseRichWorkflow spans (same degraded-honest
// contract as the rest of the client parser: `nika check` wins).

import { parseRichWorkflow } from '../workflowParser';

export interface BodyFacts {
  /** infer/agent prompt — up to 3 display lines, whitespace-collapsed. */
  prompt?: string;
  /** exec command — first line. */
  command?: string;
  /** invoke args — `k: v` pairs, up to 3, one line. */
  args?: string;
}

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

    for (let i = task.line; i <= task.endLine && i < lines.length; i++) {
      const line = lines[i];
      const key = line.match(/^(\s*)([A-Za-z_]+):/);
      const indent = key ? key[1].length : -1;

      // Args block members (one level under `args:`).
      if (argsIndent >= 0) {
        if (line.trim().length > 0 && indent > argsIndent && argPairs.length < 3) {
          const kv = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
          if (kv) {
            const v = kv[2].trim().replace(/^["']|["']$/g, '');
            argPairs.push(`${kv[1]}: ${v.length > 34 ? `${v.slice(0, 33)}…` : v}`);
          }
          continue;
        }
        if (line.trim().length > 0 && indent >= 0 && indent <= argsIndent) {
          argsIndent = -1; // block closed
        }
      }

      if (!key) { continue; }
      const name = key[2];
      if (name === 'prompt' && fact.prompt === undefined) {
        const v = scalarAt(lines, i, indent);
        if (v) { fact.prompt = clamp(v); }
      } else if (name === 'command' && fact.command === undefined) {
        const v = scalarAt(lines, i, indent);
        if (v) { fact.command = clamp(v).split('\n')[0]; }
      } else if (name === 'args') {
        argsIndent = indent;
      }
    }

    if (argPairs.length > 0) { fact.args = argPairs.join(' · '); }
    if (fact.prompt || fact.command || fact.args) { facts.set(task.id, fact); }
  }
  return facts;
}
