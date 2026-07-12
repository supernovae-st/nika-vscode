// verbBlocks.ts — the verb line as a door (pure): find the 4 verb keys
// in a document, measure the block each one opens, and produce the
// surgical edit that swaps a block for a chosen body. The verb code
// lens builds on these; tests pin them without a vscode host.

import type { ToolArgSpec } from './cliContract';
import type { NikaVerb } from './verbStarters.generated';

export interface VerbLine {
  line: number;
  verb: NikaVerb;
  indent: number;
}

/** An indented bare `<verb>:` key opening a block. Indent is capped at
 * task-field depth (2–6 spaces) so a same-named mapping key nested under
 * `args:` never grows a lens; flow style (`invoke: { … }`) is left alone —
 * no lens, no blind rewrite. */
const VERB_LINE = /^( {2,6})(infer|exec|invoke|agent):\s*(#.*)?$/;

export function findVerbLines(lines: readonly string[]): VerbLine[] {
  const out: VerbLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(VERB_LINE);
    if (m) { out.push({ line: i, verb: m[2] as NikaVerb, indent: m[1].length }); }
  }
  return out;
}

/** Exclusive end of the block opened at `verbLine`: the first following
 * non-blank line at indent ≤ the key's. Trailing blanks stay OUTSIDE the
 * block (they separate tasks, they don't belong to the verb). */
export function verbBlockEnd(
  lines: readonly string[],
  verbLine: number,
  indent: number,
): number {
  let end = verbLine + 1;
  for (let i = verbLine + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') { continue; }
    const lineIndent = (lines[i].match(/^ */) as RegExpMatchArray)[0].length;
    if (lineIndent <= indent) { break; }
    end = i + 1;
  }
  return end;
}

export interface VerbBlockEdit {
  startLine: number;
  /** Exclusive. */
  endLine: number;
  /** Replacement text, trailing newline included. */
  newText: string;
}

/**
 * The surgical swap: replace the block at `verbLine` with `body` (an
 * unindented starter whose first line is `<verb>:`), re-indented to the
 * site. Undefined when the anchor moved or no longer carries `verb` —
 * refuse a blind write.
 */
export function verbBlockEdit(
  text: string,
  verbLine: number,
  verb: NikaVerb,
  body: string,
): VerbBlockEdit | undefined {
  const lines = text.split('\n');
  const m = verbLine < lines.length ? lines[verbLine].match(VERB_LINE) : null;
  if (!m || m[2] !== verb) { return undefined; }
  const indent = m[1];
  const newText = body
    .replace(/\n$/, '')
    .split('\n')
    .map((l) => (l.trim() === '' ? '' : indent + l))
    .join('\n');
  return {
    startLine: verbLine,
    endLine: verbBlockEnd(lines, verbLine, indent.length),
    newText: `${newText}\n`,
  };
}

/** The `invoke:` body for a catalog tool — tool line + REQUIRED args as
 * SLOT lines (optional args stay discoverable via hover · the catalog). */
export function invokeBodyFor(tool: string, args: readonly ToolArgSpec[]): string {
  const lines = ['invoke:', `  tool: "${tool}"`];
  const required = args.filter((a) => a.required);
  if (required.length > 0) {
    lines.push('  args:');
    for (const a of required) {
      const hint = a.desc ? slotHint(a.desc) : '';
      lines.push(`    ${a.name}: ${placeholderFor(a.type)}   # SLOT${hint ? `: ${hint}` : ''}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** First clause of the tool's own description, comment-budgeted. */
function slotHint(desc: string): string {
  return desc.split(/[.·]/)[0].trim().slice(0, 60);
}

function placeholderFor(type?: string): string {
  switch (type) {
    case 'number':
    case 'integer':
      return '0';
    case 'boolean':
      return 'false';
    case 'array':
      return '[]';
    case 'object':
      return '{}';
    default:
      return '""';
  }
}
