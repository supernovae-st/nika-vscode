// workflowName.ts — the one lexical source-name owner (pure · zero I/O).
//
// Aligns with the engine nika-source naming contract (#1684): exact
// lowercase `.nika`, nonempty stem, no retired aliases, no directory
// form. Callers still own path-shape (relative vs absolute), workspace
// containment, and regular-file/symlink acquisition. Suffix is never
// authority.

export const WORKFLOW_SUFFIX = '.nika';
export const WORKFLOW_GLOB = '**/*.nika';
export const WORKFLOW_GOLDEN_GLOB = '**/*.nika.golden.json';
export const PROJECT_FILE = 'nika.yaml';
export const LEGACY_WORKFLOW_SUFFIXES = ['.nika.yaml', '.nika.yml'] as const;

/** Last path segment. Does not parse URIs or strip query/hash. */
export function workflowBasename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? '';
}

function hasControlChar(value: string): boolean {
  for (const ch of value) {
    const c = ch.codePointAt(0) ?? 0;
    if (c <= 0x1f || c === 0x7f) { return true; }
  }
  return false;
}

export function isLegacyWorkflowPath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) { return false; }
  if (path.endsWith('/') || path.endsWith('\\')) { return false; }
  const base = workflowBasename(path);
  return LEGACY_WORKFLOW_SUFFIXES.some((suffix) => base.endsWith(suffix));
}

export function isCanonicalWorkflowFilename(basename: string): boolean {
  if (typeof basename !== 'string' || basename.length === 0) { return false; }
  if (hasControlChar(basename)) { return false; }
  if (basename.includes('/') || basename.includes('\\')) { return false; }
  if (LEGACY_WORKFLOW_SUFFIXES.some((suffix) => basename.endsWith(suffix))) {
    return false;
  }
  if (!basename.endsWith(WORKFLOW_SUFFIX)) { return false; }
  return basename.length > WORKFLOW_SUFFIX.length;
}

/** True iff `path` names a canonical Nika program file (lexical only). */
export function isCanonicalWorkflowPath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) { return false; }
  if (hasControlChar(path)) { return false; }
  if (path.endsWith('/') || path.endsWith('\\')) { return false; }
  return isCanonicalWorkflowFilename(workflowBasename(path));
}

/** `support.v2.nika` → `support.v2`. Undefined when not canonical. */
export function workflowLogicalStem(path: string): string | undefined {
  if (!isCanonicalWorkflowPath(path)) { return undefined; }
  const base = workflowBasename(path);
  return base.slice(0, -WORKFLOW_SUFFIX.length);
}

/** Materialize `<stem>.nika` for save/create defaults. A canonical
 *  filename is returned unchanged; an empty stem is not a program name. */
export function withWorkflowSuffix(stem: string): string {
  const base = workflowBasename(stem);
  if (isCanonicalWorkflowFilename(base)) { return base; }
  return `${stem}${WORKFLOW_SUFFIX}`;
}
