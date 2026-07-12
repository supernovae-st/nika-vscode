// Go-to-definition, pure (the features/ provider owns the vscode
// wiring). The three navigable reference classes the spec defines:
//   depends_on: [NAME]        → the `- id: NAME` declaration
//   ${{ tasks.NAME... }}      → the `- id: NAME` declaration
//   ${{ vars.KEY... }}        → the KEY under the top-level vars: block
export interface DefTarget { line: number; start: number; end: number }

/** The `- id: NAME` declaration line, or undefined. */
export function findTaskDeclaration(text: string, name: string): DefTarget | undefined {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*-\s*id:\s*["']?)([\w-]+)/);
    if (m && m[2] === name) {
      return { line: i, start: m[1].length, end: m[1].length + m[2].length };
    }
  }
  return undefined;
}

/** The KEY under the top-level `vars:` block, or undefined. */
export function findVarDeclaration(text: string, key: string): DefTarget | undefined {
  const lines = text.split('\n');
  let inVars = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^vars:\s*$/.test(line)) { inVars = true; continue; }
    if (inVars) {
      if (/^\S/.test(line)) { break; } // the block ended
      const m = line.match(/^(\s+)([\w-]+)(:)/);
      if (m && m[2] === key) {
        return { line: i, start: m[1].length, end: m[1].length + m[2].length };
      }
    }
  }
  return undefined;
}

/**
 * Resolve the reference under (line, character) to its declaration.
 * Returns undefined off any navigable reference — including on the
 * declaration itself (jumping to yourself is noise).
 */
export function resolveDefinition(
  text: string,
  line: number,
  character: number,
): DefTarget | undefined {
  const lineText = text.split('\n')[line] ?? '';

  // depends_on: [a, b] — a name whose span covers the cursor.
  const dep = lineText.match(/^\s+depends_on:\s*\[([^\]]*)\]/);
  if (dep) {
    const open = lineText.indexOf('[') + 1;
    for (const m of dep[1].matchAll(/[\w-]+/g)) {
      const s = open + (m.index ?? 0);
      if (character >= s && character <= s + m[0].length) {
        return findTaskDeclaration(text, m[0]);
      }
    }
    return undefined;
  }

  // ${{ tasks.NAME… }} / ${{ vars.KEY… }} islands on this line.
  for (const m of lineText.matchAll(/\$\{\{\s*(tasks|vars)\.([\w-]+)/g)) {
    const rootStart = (m.index ?? 0) + m[0].indexOf(m[1]);
    const nameStart = rootStart + m[1].length + 1;
    if (character >= nameStart && character <= nameStart + m[2].length) {
      return m[1] === 'tasks'
        ? findTaskDeclaration(text, m[2])
        : findVarDeclaration(text, m[2]);
    }
  }
  return undefined;
}
