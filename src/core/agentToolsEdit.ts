// agentToolsEdit.ts — « choose its tools » (pure): the agent's
// default-deny register as a picker, not a memory exam. Ownership
// discipline (the outputsEdit law): the picker owns only plain
// `nika:<bare>` refs the CATALOG can regenerate; MCP refs, glob
// patterns (`nika:fs_*` — the spec's whitelist semantics) and unknown
// names are the author's sentences — preserved verbatim, their
// diagnostics the ENGINE's to give. An empty list is a meaningful
// choice (least privilege), written as `tools: []`, never removed.

import { verbBlockEnd } from './verbBlocks';

export interface ToolsLine {
  /** Line index of `tools:`. */
  line: number;
  /** Indent (spaces) of the key. */
  indent: number;
  /** Last line of a block-list value (inclusive) — flow forms end here too. */
  end: number;
  /** The refs, in file order. */
  refs: string[];
}

const LIST_ITEM = /^\s*-\s*(?:"([^"]*)"|'([^']*)'|([^#\s][^#]*?))\s*(?:#.*)?$/;

/** Find the agent block's own `tools:` (child depth) and read its refs.
 * Flow and block forms both parse; a missing key — or a moved anchor
 * (the line no longer opens an `agent:` block) — returns undefined. */
export function findAgentTools(
  lines: readonly string[],
  agentLine: number,
  agentIndent: number,
): ToolsLine | undefined {
  const anchor = new RegExp(`^ {${agentIndent}}agent:\\s*(#.*)?$`);
  if (agentLine >= lines.length || !anchor.test(lines[agentLine])) { return undefined; }
  const end = verbBlockEnd(lines, agentLine, agentIndent);
  const keyRe = new RegExp(`^ {${agentIndent + 2}}tools\\s*:\\s*(.*)$`);
  for (let i = agentLine + 1; i < end; i++) {
    const m = lines[i].match(keyRe);
    if (!m) { continue; }
    const rest = m[1].replace(/#.*$/, '').trim();
    if (rest.startsWith('[')) {
      const inner = rest.replace(/^\[/, '').replace(/\]\s*$/, '');
      const refs = inner
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter((s) => s.length > 0);
      return { line: i, indent: agentIndent + 2, end: i, refs };
    }
    if (rest.length === 0) {
      const refs: string[] = [];
      let last = i;
      for (let j = i + 1; j < end; j++) {
        if (lines[j].trim() === '') { continue; }
        const ind = (lines[j].match(/^ */) as RegExpMatchArray)[0].length;
        if (ind <= agentIndent + 2) { break; }
        const item = lines[j].match(LIST_ITEM);
        if (item) {
          const v = (item[1] ?? item[2] ?? item[3] ?? '').trim();
          if (v) { refs.push(v); }
          last = j;
        }
      }
      return { line: i, indent: agentIndent + 2, end: last, refs };
    }
    return undefined; // exotic form — refuse a blind write
  }
  return undefined;
}

/** A ref the picker OWNS: `nika:<bare>` present in the catalog —
 * no glob, no MCP, no stranger. */
export function ownedRef(ref: string, catalogBares: ReadonlySet<string>): boolean {
  const bare = ref.match(/^nika:([a-z][a-z0-9_]*)$/)?.[1];
  return bare !== undefined && catalogBares.has(bare);
}

/**
 * The rewrite: kept refs = author sentences (non-owned) + owned refs
 * still picked, in file order; newly picked catalog refs append. Always
 * writes the flow form (the starter's shape). Undefined when the
 * anchor moved — refuse a blind write.
 */
export function toolsRewrite(
  text: string,
  agentLine: number,
  agentIndent: number,
  pickedBares: readonly string[],
  catalogBares: ReadonlySet<string>,
): string | undefined {
  const lines = text.split('\n');
  const at = findAgentTools(lines, agentLine, agentIndent);
  if (!at) { return undefined; }
  const picked = new Set(pickedBares.map((b) => `nika:${b}`));
  const kept = at.refs.filter((r) => !ownedRef(r, catalogBares) || picked.has(r));
  const seen = new Set(kept);
  const added = [...picked].filter((r) => !seen.has(r));
  const refs = [...kept, ...added];
  const value = refs.length > 0 ? `[${refs.map((r) => `"${r}"`).join(', ')}]` : '[]';
  lines.splice(at.line, at.end - at.line + 1, `${' '.repeat(at.indent)}tools: ${value}`);
  return lines.join('\n');
}
