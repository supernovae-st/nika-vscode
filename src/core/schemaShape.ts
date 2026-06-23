// schemaShape.ts — dataflow shape propagation (pure · no vscode).
//
// When a task declares `schema:` (the structured-output contract) its
// output SHAPE is a static fact — so `${{ tasks.x.output.<field> }}`
// completions and hovers can be TYPED instead of blind. This is the
// gradual-typing move applied to a pipeline DSL: contracts at the node
// boundary propagate along the data edges, no inference engine needed.
// The engine validates these paths at check-time (schema_findings);
// this module makes the same knowledge INTERACTIVE at keystroke-time.

import { parseRichWorkflow } from '../workflowParser';

export interface ShapeNode {
  /** JSON-schema-ish type when declared (`object` · `array` · `string` …). */
  type?: string;
  /** Child properties for objects. */
  properties?: Map<string, ShapeNode>;
  /** Element shape for arrays. */
  items?: ShapeNode;
  required?: Set<string>;
}

/**
 * Parse the `schema:` block of one task span into a shape tree. Hand-
 * rolled indentation walk over the SAME text the user is typing —
 * tolerant of half-written blocks (never throws, returns what it can).
 */
export function parseSchemaBlock(lines: string[], start: number, end: number): ShapeNode | undefined {
  let schemaLine = -1;
  for (let i = start; i <= end && i < lines.length; i++) {
    if (/^\s+schema:\s*(#.*)?$/.test(lines[i])) { schemaLine = i; break; }
  }
  if (schemaLine === -1) { return undefined; }
  const baseIndent = lines[schemaLine].search(/\S/);

  const parseNode = (from: number, to: number, indent: number): { node: ShapeNode; consumed: number } => {
    const node: ShapeNode = {};
    let i = from;
    while (i <= to && i < lines.length) {
      const line = lines[i];
      if (line.trim() === '' || line.trim().startsWith('#')) { i++; continue; }
      const lineIndent = line.search(/\S/);
      if (lineIndent < indent) { break; }
      if (lineIndent > indent) { i++; continue; } // deeper content handled by recursion

      const kv = line.match(/^\s*([A-Za-z0-9_-]+):\s*(.*?)\s*(#.*)?$/);
      if (!kv) { i++; continue; }
      const [, key, rawValue] = kv;
      const value = rawValue.replace(/^["']|["']$/g, '');

      switch (key) {
        case 'type':
          node.type = value;
          break;
        case 'required': {
          const inline = value.match(/^\[(.*)\]$/);
          if (inline) {
            node.required = new Set(inline[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean));
          }
          break;
        }
        case 'properties': {
          node.properties = new Map();
          // Children are property NAMES at indent+2; each value nests deeper.
          let j = i + 1;
          while (j <= to && j < lines.length) {
            const child = lines[j];
            if (child.trim() === '') { j++; continue; }
            const childIndent = child.search(/\S/);
            if (childIndent <= indent) { break; }
            if (childIndent === indent + 2) {
              const name = child.match(/^\s*([A-Za-z0-9_-]+):\s*(.*?)\s*(#.*)?$/);
              if (name) {
                const inline = name[2];
                if (inline && inline.startsWith('{')) {
                  // flow form: { type: string }
                  const t = inline.match(/type:\s*([a-z]+)/)?.[1];
                  node.properties.set(name[1], t ? { type: t } : {});
                  j++;
                  continue;
                }
                const sub = parseNode(j + 1, to, childIndent + 2);
                node.properties.set(name[1], sub.node);
                j = sub.consumed;
                continue;
              }
            }
            j++;
          }
          i = j - 1;
          break;
        }
        case 'items': {
          if (value.startsWith('{')) {
            const t = value.match(/type:\s*([a-z]+)/)?.[1];
            node.items = t ? { type: t } : {};
          } else if (value === '') {
            const sub = parseNode(i + 1, to, indent + 2);
            node.items = sub.node;
            i = sub.consumed - 1;
          }
          break;
        }
        default:
          break;
      }
      i++;
    }
    return { node, consumed: i };
  };

  // The schema root starts right under `schema:` at baseIndent+2.
  return parseNode(schemaLine + 1, end, baseIndent + 2).node;
}

/** task id → declared output shape, for every task carrying `schema:`. */
export function collectShapes(text: string): Map<string, ShapeNode> {
  const wf = parseRichWorkflow(text);
  const lines = text.split('\n');
  const shapes = new Map<string, ShapeNode>();
  for (const task of wf.tasks) {
    const shape = parseSchemaBlock(lines, task.line, task.endLine);
    if (shape) { shapes.set(task.id, shape); }
  }
  return shapes;
}

/** Walk a dotted path into a shape (`output.items` → the items' shape). */
export function shapeAt(root: ShapeNode, path: string[]): ShapeNode | undefined {
  let cur: ShapeNode | undefined = root;
  for (const seg of path) {
    if (!cur) { return undefined; }
    if (cur.properties?.has(seg)) {
      cur = cur.properties.get(seg);
      continue;
    }
    // Numeric index or wildcard into arrays.
    if (cur.items && /^\d+$/.test(seg)) {
      cur = cur.items;
      continue;
    }
    return undefined;
  }
  return cur;
}

/** Completion entries at a path: field names with their types. */
export function fieldsAt(root: ShapeNode, path: string[]): Array<{ name: string; type?: string; required: boolean }> {
  const node = shapeAt(root, path);
  if (!node?.properties) { return []; }
  return [...node.properties.entries()].map(([name, child]) => ({
    name,
    type: child.type,
    required: node.required?.has(name) ?? false,
  }));
}

/** One-line shape rendering for hovers: `{ title: string, tags: string[] }`. */
export function renderShape(node: ShapeNode, depth = 0): string {
  if (depth > 3) { return '…'; }
  if (node.properties && node.properties.size > 0) {
    const inner = [...node.properties.entries()]
      .map(([k, v]) => `${k}${node.required?.has(k) ? '' : '?'}: ${renderShape(v, depth + 1)}`)
      .join(', ');
    return `{ ${inner} }`;
  }
  if (node.items) { return `${renderShape(node.items, depth + 1)}[]`; }
  return node.type ?? 'any';
}
