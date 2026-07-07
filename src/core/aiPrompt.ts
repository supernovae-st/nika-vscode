// aiPrompt.ts — the canonical deterministic authoring prompt (pure).
//
// One copy-paste block that turns ANY chat agent (Cursor · Copilot ·
// Claude · local) into a converging Nika author. The loop SHAPE is
// research-grounded (docs/ALGORITHMS.md · §repair loop):
//   · reason free-form FIRST, emit structured LAST — strict format
//     constraints degrade reasoning (arXiv:2408.02442)
//   · repair only WITH the checker's verdict in hand — intrinsic
//     self-correction degrades (arXiv:2310.01798)
//   · ≤2 repair rounds, then regenerate fresh — the value plateaus
//     (arXiv:2306.09896 · arXiv:2510.13575); machine-applicable fix
//     forms are what make rounds converge (arXiv:2308.05177)
// No vocabulary is inlined — the binary IS the source (spec · templates
// · explain), so this prompt never drifts.

export function buildAuthoringPrompt(workflowPath?: string): string {
  const target = workflowPath ?? '<file>.nika.yaml';
  return [
    'You are authoring a Nika workflow (`*.nika.yaml` · envelope `nika: v1`).',
    'Follow this DETERMINISTIC protocol — never free-form the structure:',
    '',
    '0. THINK FIRST, free-form: goal · tasks · data flow between them ·',
    '   what each task needs upstream. Only THEN write YAML — reasoning',
    '   under format constraints measurably degrades; separate the phases.',
    "1. ROUTE — pick the closest template: run `nika new --from '?' /dev/null`",
    '   to list the embedded skeletons, then `nika new --from <template> ' + target + '`.',
    '2. GROUND — read the embedded contract, never invent fields:',
    '   `nika spec` (language surface) · `nika schema` (JSON Schema) ·',
    '   `nika examples list` then `nika examples show <slug>` (canonical usage).',
    '3. FILL — edit ONLY the slot values (prompts, commands, models, ids).',
    '   The 4 verbs are infer · exec · invoke · agent — fetching a URL is',
    '   `invoke: { tool: "nika:fetch" }`, not a verb. Secrets go through',
    '   `${{ env.VAR }}` or `secrets:` — never literals.',
    '4. CHECK — run `nika check ' + target + ' --json` and read the report:',
    '   conformance · secret leaks/egresses · permits escapes · schema',
    '   findings · unknown tools · cost ceiling. The report is maximal:',
    '   one round-trip tells you everything.',
    '5. REPAIR — apply fixes EXACTLY as emitted (the fix grammar is an API:',
    '   `add "X" to permits.<path>`). Unknown code? `nika explain NIKA-XXXX`.',
    '   Never edit blind: every repair round MUST quote the fresh report.',
    '6. BUDGET — at most TWO repair rounds. Still red after two? The draft',
    '   is structurally wrong: regenerate from step 1 with a different',
    '   template instead of patching deeper (repair value plateaus fast).',
    '',
    'Hard rules: workflows must pass `nika check` BEFORE being proposed;',
    'cost/permits/secrets are audited statically — keep them declared and',
    'minimal; prefer `mock/echo` as model while iterating (deterministic,',
    'zero keys), then swap the real `provider/model`.',
    '',
    'Environment broken? `nika doctor --json` — branch on `summary.fail`,',
    'every finding carries its exact `fix` command.',
    '',
    'PROVE runs, never assert them (0.96+): every run writes a journal to',
    '`.nika/traces/*.ndjson` — quote it. `nika trace outputs <trace>` (per-task',
    'table) · `nika trace peek <trace> <task> --raw` (one exact output — pipe',
    'to jq) · `nika trace verify <trace>` proves the journal is untampered ·',
    '`nika trace reproduce <t1> <t2>` classifies WHY runs diverge (run twice',
    'first — NONDETERMINISTIC means same def+inputs, different output) ·',
    'a failing run replays under a time-travel debugger (`nika dap`,',
    'or F5 in VS Code) · `nika trace export <trace>` projects it to OTLP for',
    'Jaeger/Grafana/Langfuse. Cite trace evidence in your summary, not vibes.',
  ].join('\n');
}
