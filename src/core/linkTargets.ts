// The doc-link matchers, pure (vitest-reachable — the provider in
// features/ owns the vscode wiring). Page-level targets only.
export const VERB_LINE_RE = /^\s+(infer|exec|invoke|agent):/;
export const TOOL_RE = /"(nika:[a-z_]+)"/g;
export const PERMITS_LINE_RE = /^permits:/;

export const VERBS_URL = 'https://docs.nika.sh/concepts/verbs';
export const TOOLS_URL = 'https://nika.sh/tools';
export const PERMITS_URL = 'https://docs.nika.sh/concepts/security';
