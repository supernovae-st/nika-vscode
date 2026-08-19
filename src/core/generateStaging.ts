// generateStaging.ts — pure helpers for the staged-review of a generated
// workflow (Wave H). The generated candidate is opened as an UNTITLED
// doc (non-destructive — the applied-but-not-committed state, VS Code's
// own review grammar), then Save commits it to disk, Refine re-runs the
// SAME oracle-checked pipeline with an added instruction, Discard drops
// it. These two functions are the only logic worth pinning; the rest is
// vscode-API glue.

/**
 * A filename suggestion derived from the intent — kebab-case, ≤40 chars,
 * engine-id-safe (the newWorkflow validator is `^[a-z0-9-]+$`). Empty or
 * punctuation-only intents fall back to `generated`.
 */
export function slugifyIntent(intent: string): string {
  const slug = intent
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'generated';
}

/**
 * Compose the refinement turn: the ORIGINAL intent stays the anchor
 * (the model keeps the whole goal in view — a bare refinement drifts),
 * with the new instruction appended as an explicit delta.
 */
export function refinedIntent(baseIntent: string, refinement: string): string {
  const base = baseIntent.trim();
  const delta = refinement.trim();
  if (delta.length === 0) { return base; }
  return `${base}\n\nRefinement (apply to the workflow above): ${delta}`;
}

/**
 * The template the generation prompt falls back to when the corpus has
 * no closer skeleton — the smallest nine-key workflow (nika 0.109 ·
 * `nika: <id>` is the identity · no `workflow:` block · no `v1`).
 * Own-corpus law: it must check clean on the pinned engine
 * (contract.test proves it) — a template the oracle refuses teaches a
 * refusal to every generated draft.
 */
export const GENERATE_FALLBACK_TEMPLATE
  = 'nika: generated\n\nmodel: mock/echo  # deterministic · zero keys · swap for provider/model when ready\n\ntasks:\n  start:\n    infer:\n      prompt: ""\n';
