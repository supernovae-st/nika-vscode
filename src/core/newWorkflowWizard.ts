// newWorkflowWizard.ts — the multi-step New Workflow flow, derived pure
// (annexe A #14 · the quickinput-sample pattern).
//
// Three steps: (1) name · (2) starter — the four verbs' starters, the
// engine's embedded templates, the blank page · (3) model — mock/echo
// leads (deterministic · zero keys), locals before cloud per the
// NIKA_PROVIDERS_ORDER presentation lock. Engine templates skip step 3
// (`nika new --from` writes the file, its models live inside), so the
// wizard's total honestly reads 2 there.
//
// Everything decidable is decided HERE (rows · scaffold text · step
// count) so the law is provable without VS Code; the host owns only
// the QuickInput plumbing.

import { NIKA_VERB_STARTERS, type NikaVerb, type VerbStarter } from './verbStarters.generated';
import { NIKA_PROVIDERS_ORDER } from '../design-tokens.generated';

export const WIZARD_VERBS: readonly NikaVerb[] = ['infer', 'exec', 'invoke', 'agent'];

/** The one-line gloss per verb (the canvas palette speaks the same). */
export const VERB_GLOSS: Record<NikaVerb, string> = {
  infer: 'LLM call',
  exec: 'subprocess',
  invoke: 'builtin / MCP tool',
  agent: 'agent loop',
};

export type StarterPick =
  | { kind: 'starter'; verb: NikaVerb; starter: VerbStarter }
  | { kind: 'template'; slug: string }
  | { kind: 'blank' };

export interface StarterRow {
  label: string;
  description?: string;
  detail?: string;
  /** Separator row when true (label = the section). */
  separator?: boolean;
  pick?: StarterPick;
}

/**
 * Step-2 rows: the four verbs (canonical order) each carry their spec
 * starters, then the engine's embedded templates, then the blank
 * starter — always last, always present (the zero-dependency floor).
 */
export function starterRows(templates: readonly string[]): StarterRow[] {
  const rows: StarterRow[] = [];
  for (const verb of WIZARD_VERBS) {
    rows.push({ label: `${verb} — ${VERB_GLOSS[verb]}`, separator: true });
    for (const starter of NIKA_VERB_STARTERS[verb]) {
      rows.push({
        label: starter.label,
        description: verb,
        detail: starter.hint,
        pick: { kind: 'starter', verb, starter },
      });
    }
  }
  if (templates.length > 0) {
    rows.push({ label: 'engine templates', separator: true });
    for (const slug of templates) {
      rows.push({
        label: slug,
        description: 'embedded engine template',
        detail: 'nika new --from — the engine writes the whole file',
        pick: { kind: 'template', slug },
      });
    }
  }
  rows.push({ label: 'blank', separator: true });
  rows.push({
    label: 'blank starter',
    description: 'minimal envelope',
    detail: 'one infer task + a commented break_me curriculum',
    pick: { kind: 'blank' },
  });
  return rows;
}

/** How many steps THIS pick's path truly has (templates skip the model
 *  step — the engine writes their file whole). */
export function totalStepsFor(pick: StarterPick): number {
  return pick.kind === 'template' ? 2 : 3;
}

export interface ModelRow {
  label: string;
  description?: string;
  detail?: string;
  separator?: boolean;
  /** The `provider/model` value this row confirms. */
  value?: string;
  /** The free-typing door. */
  custom?: boolean;
}

/** Provider presentation rank — locals lead per the operator lock. */
function providerRank(p: string): number {
  const i = NIKA_PROVIDERS_ORDER.indexOf(p);
  return i === -1 ? NIKA_PROVIDERS_ORDER.length : i;
}

/**
 * Step-3 rows: mock/echo first (the scaffold default — deterministic,
 * offline, zero keys), then the catalog's exact rows grouped by
 * provider in NIKA_PROVIDERS_ORDER rank (locals lead), then the
 * free-typing door. Without a catalog (older binary), the list is
 * mock/echo + custom — never an invented model id.
 */
export function modelRows(
  catalog: Record<string, Array<{ model: string; desc?: string }>> | undefined,
  /** The model the picked starter already carries, when it does. */
  starterModel?: string,
): ModelRow[] {
  const rows: ModelRow[] = [];
  rows.push({ label: 'offline', separator: true });
  rows.push({
    label: 'mock/echo',
    description: starterModel === undefined || starterModel === 'mock/echo' ? 'the default' : undefined,
    detail: 'deterministic · zero keys · zero network — swap any time',
    value: 'mock/echo',
  });
  if (starterModel !== undefined && starterModel !== 'mock/echo') {
    rows.push({ label: 'starter', separator: true });
    rows.push({
      label: starterModel,
      description: 'current — what the starter carries',
      detail: 'keep the starter body untouched',
      value: starterModel,
    });
  }
  if (catalog !== undefined) {
    const providers = Object.keys(catalog)
      .sort((a, b) => providerRank(a) - providerRank(b) || a.localeCompare(b));
    for (const provider of providers) {
      const models = catalog[provider];
      if (!models || models.length === 0) { continue; }
      rows.push({ label: provider, separator: true });
      for (const m of models) {
        rows.push({
          label: `${provider}/${m.model}`,
          ...(m.desc !== undefined ? { detail: m.desc } : {}),
          value: `${provider}/${m.model}`,
        });
      }
    }
  }
  rows.push({ label: '', separator: true });
  rows.push({
    label: '✎ custom…',
    description: 'type any provider/model',
    detail: 'resolved by the engine at run time',
    custom: true,
  });
  return rows;
}

/** The starter's own `model:` line, when its body pins one. */
export function starterModelOf(pick: StarterPick): string | undefined {
  if (pick.kind !== 'starter') { return undefined; }
  const m = pick.starter.body.match(/^\s*model:\s*(\S+)/m);
  return m?.[1];
}

/** Re-indent a starter's verb block under a task (two-space house style). */
function indentBody(body: string, indent: string): string {
  return body
    .trimEnd()
    .split('\n')
    .map((line) => (line.length > 0 ? `${indent}${line}` : line))
    .join('\n');
}

const BREAK_ME_BLOCK = `
  # curriculum: uncomment this task and run again — it fails ON
  # PURPOSE (offline, zero keys). The red teaches: the card carries
  # the code, clicking it explains, ⑂ forks from the failure.
  # break_me:
  #   with:
  #     got: \${{ tasks.start.output }}
  #   invoke:
  #     tool: nika:assert
  #     args:
  #       condition: \${{ with.got == "impossible" }}
  #       message: "the scripted failure — read the red, then click the code"
`;

/**
 * The scaffold for blank/starter picks — schema header, envelope, the
 * chosen model as the workflow default, ONE task (the starter's body or
 * the blank infer), and the commented break_me curriculum.
 */
export function scaffoldContent(name: string, pick: StarterPick, model: string): string {
  const modelComment = model === 'mock/echo'
    ? '  # deterministic · zero keys · swap for provider/model when ready'
    : '';
  const task = pick.kind === 'starter'
    ? `  start:\n${indentBody(pick.starter.body, '    ')}`
    : '  start:\n    infer:\n      prompt: ""';
  return `# yaml-language-server: $schema=https://nika.sh/spec/v1/workflow.schema.json\nnika: v1\nworkflow:\n  id: ${name}\n\nmodel: ${model}${modelComment}\n\ntasks:\n${task}\n${BREAK_ME_BLOCK}`;
}
