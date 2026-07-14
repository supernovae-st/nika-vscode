// generatePipeline.ts — intent → checked workflow (pure orchestration).
//
// The research-validated loop (docs/ALGORITHMS.md §generation):
//   · N parallel candidates, structurally deduped before scoring
//     (AlphaCode arXiv:2203.07814 — never pay the oracle twice for the
//     same draft)
//   · the ORACLE picks — `nika check` is a deterministic verifier, the
//     best case in the test-time-scaling literature (Monkeys 2407.21787:
//     best-of-N gains exist ONLY with automatic verification; S*
//     2502.14382: execution selection beats majority voting)
//   · early-stop on the first all-green candidate (2408.03314)
//   · at most TWO repair rounds with the fresh report (plateau:
//     2306.09896 · 2510.13575), each round re-grounded with an exemplar
//     retrieved for the FAILING codes (RepoCoder 2303.12570)
//   · best-so-far wins — a repair that regresses never ships
//
// Everything testable lives here behind seams; the vscode glue stays thin.

export interface GenCheckOutcome {
  exit: number;
  /** Hard findings (conformance + the failure classes). */
  findings: number;
  /** Soft signals (hints) — tie-break among all-green candidates. */
  hints: number;
  /** The machine-readable report (JSON text) — fed to repair rounds. */
  reportJson?: string;
  /** NIKA-XXX codes present — drives repair-round re-retrieval. */
  codes: string[];
  /** false = the oracle's output did not parse (hard parse fail). */
  parsed: boolean;
}

export interface GenSeams {
  llm: (prompt: string) => Promise<string>;
  check: (yaml: string) => Promise<GenCheckOutcome>;
  /** RepoCoder re-retrieval: an exemplar matched to the failing codes. */
  reground?: (failingCodes: string[]) => Promise<string | undefined>;
  onProgress?: (line: string) => void;
}

export interface GenOptions {
  /** Parallel first-shot candidates (default 3 — the steep coverage zone). */
  candidates?: number;
  /** Repair rounds ceiling (default 2 — the literature's plateau). */
  repairRounds?: number;
}

export interface GenResult {
  yaml: string;
  clean: boolean;
  findings: number;
  roundsUsed: number;
  candidatesTried: number;
}

/**
 * Pull the workflow out of a chat answer: the LAST fenced yaml/yml block
 * (reasoning may quote partial snippets — the final emission wins), else
 * the raw text when it already opens with the envelope.
 */
export function extractYaml(text: string): string | undefined {
  const fences = [...text.matchAll(/```(?:ya?ml)?\s*\n([\s\S]*?)```/g)];
  for (let i = fences.length - 1; i >= 0; i--) {
    const body = fences[i][1].trim();
    if (/^nika:\s/m.test(body)) { return body; }
  }
  if (fences.length > 0) { return fences[fences.length - 1][1].trim(); }
  const raw = text.trim();
  return /^nika:\s/m.test(raw) ? raw : undefined;
}

/** Structural dedup key: comments and blank lines are not structure. */
export function normalizeForDedup(yaml: string): string {
  return yaml
    .split('\n')
    .map((l) => l.replace(/\s+#.*$/, '').trimEnd())
    .filter((l) => l.trim() !== '' && !l.trim().startsWith('#'))
    .join('\n');
}

/**
 * Candidate ordering: parse fail ≫ findings ≫ hints (lexicographic).
 * Returns negative when `a` is strictly better.
 */
export function compareOutcomes(a: GenCheckOutcome, b: GenCheckOutcome): number {
  if (a.parsed !== b.parsed) { return a.parsed ? -1 : 1; }
  if (a.findings !== b.findings) { return a.findings - b.findings; }
  return a.hints - b.hints;
}

const VARIANT_HINTS = [
  '',
  '\nVariant pressure: prefer the SIMPLEST decomposition that satisfies the intent — fewest tasks.',
  '\nVariant pressure: maximize safe parallelism — independent steps must NOT be chained; a `with:` binding only where data truly flows, an `after:` entry only where order truly matters.',
  '\nVariant pressure: be defensive — declare schema: on inference outputs and route failures (retry / on_error) where the intent implies flakiness.',
];

export function variantPrompt(basePrompt: string, index: number): string {
  return basePrompt + VARIANT_HINTS[index % VARIANT_HINTS.length];
}

export function buildRepairPrompt(yaml: string, outcome: GenCheckOutcome, exemplar?: string): string {
  return [
    'Your Nika workflow draft fails the conformance oracle. Repair it.',
    '',
    'Draft:',
    '```yaml',
    yaml,
    '```',
    '',
    `Checker report (machine-readable · ${outcome.findings} finding(s)):`,
    '```json',
    outcome.reportJson ?? '(report unavailable — the draft did not parse; rewrite it structurally)',
    '```',
    '',
    'Rules: apply machine-applicable fixes EXACTLY as emitted (the fix',
    'grammar is an API: `add "X" to permits.<path>`). Fix every finding in',
    'ONE pass. Reason briefly first, then emit the COMPLETE corrected',
    'workflow as a single fenced yaml block — nothing after it.',
    ...(exemplar ? ['', 'A canonical exemplar for the failing pattern:', '```yaml', exemplar, '```'] : []),
  ].join('\n');
}

/**
 * The full loop. Returns undefined only when no candidate produced any
 * YAML at all (the LLM seam failed structurally).
 */
export async function generateWorkflow(
  basePrompt: string,
  seams: GenSeams,
  opts: GenOptions = {},
): Promise<GenResult | undefined> {
  const candidateCount = Math.max(1, opts.candidates ?? 3);
  const repairBudget = Math.max(0, opts.repairRounds ?? 2);
  const progress = seams.onProgress ?? ((): void => undefined);

  progress(`drafting ${candidateCount} candidate(s)…`);
  const answers = await Promise.all(
    Array.from({ length: candidateCount }, (_, i) =>
      seams.llm(variantPrompt(basePrompt, i)).catch(() => ''),
    ),
  );

  // Dedup structurally identical drafts before paying the oracle.
  const drafts: string[] = [];
  const seen = new Set<string>();
  for (const answer of answers) {
    const yaml = extractYaml(answer);
    if (!yaml) { continue; }
    const key = normalizeForDedup(yaml);
    if (seen.has(key)) { continue; }
    seen.add(key);
    drafts.push(yaml);
  }
  if (drafts.length === 0) { return undefined; }

  progress(`oracle scoring ${drafts.length} distinct draft(s)…`);
  const outcomes = await Promise.all(drafts.map((d) => seams.check(d)));

  let bestIdx = 0;
  for (let i = 1; i < outcomes.length; i++) {
    if (compareOutcomes(outcomes[i], outcomes[bestIdx]) < 0) { bestIdx = i; }
  }
  let bestYaml = drafts[bestIdx];
  let bestOutcome = outcomes[bestIdx];
  const candidatesTried = drafts.length;

  let roundsUsed = 0;
  // Early-stop: a clean candidate ships without burning repair rounds.
  // Clean = parsed + zero findings + EXIT 0: the binary's verdict outranks
  // the client-side count (a finding family added behind report_version 1
  // would zero the count while `nika check` still exits 2).
  const isClean = (o: GenCheckOutcome): boolean => o.parsed && o.findings === 0 && o.exit === 0;
  while (!isClean(bestOutcome) && roundsUsed < repairBudget) {
    roundsUsed += 1;
    progress(`repair round ${roundsUsed}/${repairBudget} (${bestOutcome.findings} finding(s))…`);
    const exemplar = seams.reground
      ? await seams.reground(bestOutcome.codes).catch(() => undefined)
      : undefined;
    const answer = await seams.llm(buildRepairPrompt(bestYaml, bestOutcome, exemplar)).catch(() => '');
    const repaired = extractYaml(answer);
    if (!repaired) { continue; }
    const outcome = await seams.check(repaired);
    // Best-so-far: a regressed repair never replaces the current best.
    if (compareOutcomes(outcome, bestOutcome) < 0) {
      bestYaml = repaired;
      bestOutcome = outcome;
    }
  }

  return {
    yaml: bestYaml,
    clean: isClean(bestOutcome),
    findings: bestOutcome.findings,
    roundsUsed,
    candidatesTried,
  };
}
