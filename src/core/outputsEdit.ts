// outputsEdit.ts — « choose what it publishes » (pure): the workflow's
// return value as a picker, not a syntax exam. The picker OWNS only the
// plain rows it can regenerate (`name: "${{ tasks.<id>.output }}"` where
// name IS the task id, no comment); every other entry — typed outputs,
// jq paths, commented lines — is an author's sentence and survives the
// rewrite verbatim. The bare-`${{ tasks.X }}` trap (engine hint
// `envelope-output`) never gets written: rows always publish `.output`.

interface Block {
  /** Line index of the top-level `outputs:` key. */
  line: number;
  /** Last line index belonging to the block (inclusive). */
  end: number;
}

function indentOf(line: string): number {
  const m = line.match(/^( *)\S/);
  return m ? m[1].length : -1;
}

/** Top-level block-form `outputs:` — flow-form (`outputs: {…}`) returns
 * undefined so callers refuse the blind rewrite. */
export function findOutputsBlock(lines: readonly string[]): Block | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (!/^outputs:\s*(#.*)?$/.test(lines[i])) { continue; }
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      const ind = indentOf(lines[j]);
      if (ind === -1) { end = j; continue; }
      if (ind > 0) { end = j; continue; }
      break;
    }
    while (end > i && lines[end].trim() === '') { end -= 1; }
    return { line: i, end };
  }
  return undefined;
}

/** A row the picker owns: `<taskId>: "${{ tasks.<taskId>.output }}"`,
 * uncommented, name and id identical. */
const OWNED_ROW = /^ {2}([A-Za-z0-9_]+):\s*["']?\$\{\{\s*tasks\.([A-Za-z0-9_]+)\.output\s*\}\}["']?\s*$/;

export interface OutputsView {
  /** Task ids currently published by owned rows (pre-checks the picker). */
  published: string[];
  /** Every other line of the block, verbatim (custom rows · comments). */
  customLines: string[];
}

/** Read the block into the picker's model. */
export function parseOutputs(lines: readonly string[], block: Block): OutputsView {
  const published: string[] = [];
  const customLines: string[] = [];
  for (let i = block.line + 1; i <= block.end; i++) {
    const m = lines[i].match(OWNED_ROW);
    if (m && m[1] === m[2]) { published.push(m[1]); continue; }
    customLines.push(lines[i]);
  }
  return { published, customLines };
}

/**
 * The rewrite: custom lines survive verbatim (original order), owned
 * rows become exactly the picked ids (caller passes them in file/DAG
 * order). No block → append at EOF (the permits pattern). Flow-form
 * `outputs:` → undefined, refuse the blind write. An empty result
 * (nothing picked · nothing custom) removes the block entirely.
 */
export function outputsRewrite(text: string, pickedIds: readonly string[]): string | undefined {
  const lines = text.split('\n');
  if (lines.some((l) => /^outputs:\s*[^#\s]/.test(l))) { return undefined; }
  const block = findOutputsBlock(lines);
  const custom = block ? parseOutputs(lines, block).customLines : [];
  const rows = pickedIds.map((id) => `  ${id}: "\${{ tasks.${id}.output }}"`);
  const body = [...custom, ...rows];
  const blockLines = body.length > 0 ? ['outputs:', ...body] : [];

  if (block) {
    const removeExtra = blockLines.length === 0
      && block.end + 1 < lines.length && lines[block.end + 1].trim() === '' ? 1 : 0;
    lines.splice(block.line, block.end - block.line + 1 + removeExtra, ...blockLines);
    return lines.join('\n');
  }
  if (blockLines.length === 0) { return text; }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') { lines.pop(); }
  return [...lines, '', ...blockLines, ''].join('\n');
}
