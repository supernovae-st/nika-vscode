// schemaIntel.ts — LSP-grade vocabulary DERIVED from the binary (pure).
//
// The engine is self-contained: `nika schema` ships the JSON Schema with
// field descriptions and closed enums; `nika spec --canon` ships the
// canon (providers · extract modes). This module projects BOTH into the
// completion/hover vocabulary — the extension hardcodes NOTHING, so a
// new builtin, provider or field lights up on the next binary, zero
// extension release. (Projection-by-default, applied to language intel.)

export interface FieldDoc {
  name: string;
  doc: string;
  /** Closed value set, when the schema declares one. */
  values?: string[];
}

export interface SchemaIntel {
  /** Top-level workflow keys (nika · workflow · model · tasks · …). */
  topLevel: FieldDoc[];
  /** Task-item keys (with · after · when · retry · the 4 verbs · …). */
  taskFields: FieldDoc[];
  /** Per-verb body keys (infer.prompt · exec.command · …). */
  verbFields: Record<string, FieldDoc[]>;
  /** The closed builtin tool set (`nika:*`). */
  builtinTools: string[];
  /** Provider ids from the canon, grouped + flattened. */
  providers: { cloud: string[]; local: string[]; test: string[]; all: string[] };
  /** nika:fetch `mode:` values from the canon. */
  extractModes: string[];
  /**
   * The spec's concrete error codes (NIKA-DAG-003 …) from the canon's
   * error_codes table — the codes `nika check` EMITS but the numeric
   * `nika explain` registry doesn't know (exit 2). The explain surface
   * falls back to these rows.
   */
  errorCodes: SpecErrorCode[];
}

export interface SpecErrorCode {
  code: string;
  category: string;
  transient: string;
  failure: string;
}

/**
 * Parse the canon's `error_codes:` flow-style rows:
 *   - { code: NIKA-DAG-001, category: validation_error, transient: "false", failure: "…" }
 * The failure text is the LAST field and quoted — commas inside it are safe.
 */
export function parseCanonErrorCodes(canonText: string): SpecErrorCode[] {
  const lines = canonText.split('\n');
  const start = lines.findIndex((l) => l.startsWith('error_codes:'));
  if (start === -1) { return []; }
  const ROW = /^-\s*\{\s*code:\s*([A-Z0-9-]+)\s*,\s*category:\s*([a-z_]+)\s*,\s*transient:\s*"([^"]*)"\s*,\s*failure:\s*"((?:[^"\\]|\\.)*)"\s*\}/;
  const out: SpecErrorCode[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line) && line.trim() !== '') { break; } // next top-level key
    const m = line.trim().match(ROW);
    if (m) {
      out.push({ code: m[1], category: m[2], transient: m[3], failure: m[4].replace(/\\"/g, '"') });
    }
  }
  return out;
}

const VERBS = ['infer', 'exec', 'invoke', 'agent'] as const;

interface JsonSchemaNode {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  oneOf?: JsonSchemaNode[];
  properties?: Record<string, JsonSchemaNode>;
  [key: string]: unknown;
}

function stringEnum(node: JsonSchemaNode | undefined): string[] | undefined {
  if (!node) { return undefined; }
  const direct = node.enum;
  if (Array.isArray(direct) && direct.every((v) => typeof v === 'string')) {
    return direct as string[];
  }
  for (const alt of node.oneOf ?? []) {
    const nested = stringEnum(alt);
    if (nested) { return nested; }
  }
  return undefined;
}

function fieldDocs(props: Record<string, JsonSchemaNode> | undefined): FieldDoc[] {
  if (!props) { return []; }
  return Object.entries(props).map(([name, node]) => {
    const field: FieldDoc = { name, doc: node.description ?? '' };
    const values = stringEnum(node);
    if (values) { field.values = values; }
    return field;
  });
}

/**
 * Parse one canon list (`providers:` · `extract_modes:`): the `items:`
 * block, flat or grouped one level (cloud:/local:/test:).
 */
export function parseCanonItems(canonText: string, key: string): Record<string, string[]> {
  const lines = canonText.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (start === -1) { return {}; }

  const groups: Record<string, string[]> = {};
  let currentGroup = '_';
  let inItems = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line) && line.trim() !== '') { break; } // next top-level key
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) { continue; }
    if (/^items:\s*$/.test(trimmed)) { inItems = true; currentGroup = '_'; continue; }
    if (!inItems) { continue; }
    const group = trimmed.match(/^([a-z_]+):\s*$/);
    if (group) { currentGroup = group[1]; continue; }
    const item = trimmed.match(/^-\s*([A-Za-z0-9_:.-]+)/);
    if (item) {
      (groups[currentGroup] ??= []).push(item[1]);
    }
  }
  return groups;
}

/** Build the full intel from the binary's two embedded sources. */
export function buildSchemaIntel(schemaJson: unknown, canonText: string): SchemaIntel | undefined {
  if (typeof schemaJson !== 'object' || schemaJson === null) { return undefined; }
  const schema = schemaJson as JsonSchemaNode & { $defs?: Record<string, JsonSchemaNode> };
  const defs = schema.$defs ?? {};
  if (!schema.properties || !defs.task) { return undefined; }

  const verbFields: Record<string, FieldDoc[]> = {};
  for (const verb of VERBS) {
    verbFields[verb] = fieldDocs(defs[verb]?.properties);
  }

  const tools = stringEnum(defs.invoke?.properties?.tool) ?? [];

  const providerGroups = parseCanonItems(canonText, 'providers');
  const cloud = providerGroups.cloud ?? [];
  const local = providerGroups.local ?? [];
  const test = providerGroups.test ?? [];
  const flat = providerGroups._ ?? [];
  const all = [...cloud, ...local, ...test, ...flat];

  const modeGroups = parseCanonItems(canonText, 'extract_modes');
  const extractModes = [...(modeGroups._ ?? []), ...Object.entries(modeGroups)
    .filter(([g]) => g !== '_')
    .flatMap(([, items]) => items)];

  return {
    topLevel: fieldDocs(schema.properties),
    taskFields: fieldDocs(defs.task.properties),
    verbFields,
    builtinTools: tools,
    providers: { cloud, local, test, all },
    extractModes,
    errorCodes: parseCanonErrorCodes(canonText),
  };
}

/** Lookup a field doc by name within a scope (undefined = not a known field). */
export function fieldInScope(
  intel: SchemaIntel,
  scope: 'top' | 'task' | (typeof VERBS)[number],
  name: string,
): FieldDoc | undefined {
  const list = scope === 'top' ? intel.topLevel
    : scope === 'task' ? intel.taskFields
    : intel.verbFields[scope] ?? [];
  return list.find((f) => f.name === name);
}
