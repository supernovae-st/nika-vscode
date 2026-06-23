// generate.ts — `nika.generateWorkflow`: intent → checked workflow, e2e.
//
// The editor-side rungs around core/generatePipeline.ts (pure loop):
//   rung 1 · an editor LM is available (vscode.lm — VS Code + Copilot
//            family): full best-of-N + oracle scoring + bounded repair,
//            every candidate checked through the REAL binary.
//   rung 2 · no LM API (Cursor strips it · user has no provider): the
//            GROUNDED prompt goes to the clipboard and the closest
//            template opens as the starting point — the user's own chat
//            becomes the llm seam, the protocol still converges.
//
// Grounding follows the Prompt2DAG hybrid recipe (arXiv:2509.13487 —
// template + LLM fill: 78.5% vs 29.2% direct): 1 BM25-routed template +
// ≤2 exemplars + a spec-slice from the binary's schema (grammar
// prompting, arXiv:2305.19234). Parallel intents always carry a fan-out
// exemplar (WorfBench arXiv:2410.07869: graph-shaped workflows are where
// LLMs fail hardest — and Nika data refs do NOT imply ordering).

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  collectFindings,
  countReportFindings,
  parseCheckReport,
} from '../core/cliContract';
import { generateWorkflow, type GenCheckOutcome, type GenResult } from '../core/generatePipeline';
import { rankBm25, type RankDoc } from '../core/intentRank';
import type { NikaService } from '../nikaService';

interface CorpusDoc extends RankDoc {
  kind: 'template' | 'example';
  slug: string;
  body?: string;
}

let corpusCache: { version: string; docs: CorpusDoc[] } | undefined;
let tmpSeq = 0;

/** Templates (full bodies) + examples (slug text · bodies on demand). */
async function buildCorpus(service: NikaService): Promise<CorpusDoc[]> {
  const version = service.caps.version || 'unknown';
  if (corpusCache?.version === version) { return corpusCache.docs; }

  const docs: CorpusDoc[] = [];
  for (const slug of await service.templatesList()) {
    tmpSeq += 1;
    const tmp = path.join(os.tmpdir(), `nika-gen-tpl-${process.pid}-${tmpSeq}.nika.yaml`);
    const res = await service.newFromTemplate(slug, tmp);
    let body = '';
    try {
      body = fs.readFileSync(tmp, 'utf-8');
    } catch {
      body = '';
    }
    fs.unlink(tmp, () => undefined);
    if (res.code === 0 && body.length > 0) {
      docs.push({ id: `template:${slug}`, kind: 'template', slug, text: `${slug}\n${body}`, body });
    }
  }
  for (const slug of await service.examplesList()) {
    docs.push({ id: `example:${slug}`, kind: 'example', slug, text: slug.replace(/[-_]/g, ' ') });
  }
  corpusCache = { version, docs };
  return docs;
}

function specSlice(service: NikaService): string {
  const intel = service.intel;
  if (!intel) { return ''; }
  const verbLine = (v: string): string =>
    `${v}(${(intel.verbFields[v] ?? []).map((f) => f.name).join(' · ')})`;
  return [
    `- Task keys: ${intel.taskFields.map((f) => f.name).join(' · ')}`,
    `- Verb fields: ${['infer', 'exec', 'invoke', 'agent'].map(verbLine).join('  ')}`,
    `- Builtin tools (closed set): ${intel.builtinTools.join(' · ')}`,
  ].join('\n');
}

const PARALLEL_INTENT = /\b(parallel|concurrent|simultaneous|batch|each|every|all of|fan[- ]?out)\b/i;

interface Grounding {
  prompt: string;
  templateBody: string;
  templateSlug: string;
}

async function buildGrounding(service: NikaService, intent: string, corpus: CorpusDoc[]): Promise<Grounding> {
  const ranked = rankBm25(intent, corpus);
  const byId = new Map(corpus.map((d) => [d.id, d]));

  const topTemplate =
    ranked.map((r) => byId.get(r.id)).find((d): d is CorpusDoc => d?.kind === 'template') ??
    corpus.find((d) => d.kind === 'template');
  const exampleSlugs = ranked
    .map((r) => byId.get(r.id))
    .filter((d): d is CorpusDoc => d?.kind === 'example')
    .slice(0, 2)
    .map((d) => d.slug);

  const exemplars: string[] = [];
  for (const slug of exampleSlugs) {
    const body = await service.exampleShow(slug);
    if (body) { exemplars.push(body.trim()); }
  }
  // WorfBench bias: a parallel-shaped intent ALWAYS sees an explicit
  // fan-out exemplar — data refs don't imply ordering in Nika, and
  // graph-shaped generation is the documented LLM weak spot.
  if (PARALLEL_INTENT.test(intent) && topTemplate?.slug !== 'fanout') {
    const fanout = corpus.find((d) => d.kind === 'template' && /fan/.test(d.slug));
    if (fanout?.body) { exemplars.push(fanout.body.trim()); }
  }

  const prompt = [
    'You are authoring ONE Nika workflow (`*.nika.yaml` · envelope `nika: v1`).',
    '',
    'INTENT:',
    intent,
    '',
    'GROUND TRUTH (embedded in the `nika` binary — never invent fields):',
    '- The 4 verbs: infer · exec · invoke · agent. Fetching a URL is',
    '  `invoke: { tool: "nika:fetch" }` with `args: { url: … }`, not a verb.',
    specSlice(service),
    '- Secrets go through `${{ env.VAR }}` or `secrets:` — never literals.',
    '- Use `model: mock/echo` while drafting (deterministic · zero keys).',
    '- Data refs (`${{ tasks.x.output }}`) do NOT imply ordering — declare',
    '  `depends_on` explicitly; truly independent tasks must NOT be chained.',
    '',
    `TEMPLATE (closest embedded skeleton \`${topTemplate?.slug ?? 'chain'}\` — adapt, don't start from zero):`,
    '```yaml',
    (topTemplate?.body ?? '').trim(),
    '```',
    ...exemplars.flatMap((e, i) => ['', `EXEMPLAR ${i + 1}:`, '```yaml', e, '```']),
    '',
    'PROTOCOL: think the tasks + the data flow through in prose FIRST',
    '(reasoning under format constraints measurably degrades). THEN emit',
    'the COMPLETE workflow as ONE fenced yaml block — nothing after it.',
  ].join('\n');

  return {
    prompt,
    templateBody: topTemplate?.body ?? 'nika: v1\nworkflow: generated\n\nmodel: mock/echo\n\ntasks: []\n',
    templateSlug: topTemplate?.slug ?? 'chain',
  };
}

/** The oracle seam: every candidate runs through the real binary. */
function makeCheckSeam(service: NikaService): (yaml: string) => Promise<GenCheckOutcome> {
  return async (yaml: string): Promise<GenCheckOutcome> => {
    tmpSeq += 1;
    const tmp = path.join(os.tmpdir(), `nika-gen-check-${process.pid}-${tmpSeq}.nika.yaml`);
    fs.writeFileSync(tmp, yaml, 'utf-8');
    try {
      const res = await service.runCli(['check', tmp, '--json']);
      const report = parseCheckReport(res.stdout);
      if (!report) {
        return { exit: res.code, findings: Number.MAX_SAFE_INTEGER, hints: 0, codes: [], parsed: false };
      }
      const codes = [
        ...new Set(
          collectFindings(report)
            .filter((f) => f.severity !== 'info')
            .map((f) => f.code),
        ),
      ];
      return {
        exit: res.code,
        findings: countReportFindings(report),
        hints: report.hints.length,
        reportJson: JSON.stringify(report, null, 2),
        codes,
        parsed: true,
      };
    } finally {
      fs.unlink(tmp, () => undefined);
    }
  };
}

// ─── vscode.lm chat surface (runtime-guarded · keeps the 1.75 @types floor,
// same pattern as lmTools.ts — Cursor/VSCodium hosts simply take rung 2) ───

interface LmChatModel {
  vendor: string;
  family: string;
  sendRequest(
    messages: unknown[],
    options: unknown,
    token: unknown,
  ): Thenable<{ text: AsyncIterable<string> }>;
}

interface LmChatSurface {
  model: LmChatModel;
  userMessage: (content: string) => unknown;
}

async function pickLanguageModel(): Promise<LmChatSurface | undefined> {
  const api = vscode as unknown as Record<string, unknown>;
  const lm = api.lm as { selectChatModels?: (selector?: unknown) => Thenable<LmChatModel[]> } | undefined;
  const MessageCtor = api.LanguageModelChatMessage as { User(content: string): unknown } | undefined;
  if (!lm || typeof lm.selectChatModels !== 'function' || !MessageCtor) { return undefined; }
  try {
    const models = await lm.selectChatModels({});
    const model = models[0];
    if (!model) { return undefined; }
    return { model, userMessage: (content) => MessageCtor.User(content) };
  } catch {
    return undefined;
  }
}

export function registerGenerate(
  context: vscode.ExtensionContext,
  service: NikaService,
  log: (level: string, msg: string) => void,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('nika.generateWorkflow', async () => {
      if (!service.available) {
        void vscode.window.showWarningMessage(
          'Nika: the engine binary is required — generation grounds every candidate through `nika check`.',
        );
        return;
      }
      const intent = await vscode.window.showInputBox({
        title: 'Nika: generate a workflow from intent',
        prompt: 'Describe what the workflow should do',
        placeHolder: 'fetch the top HN stories, summarize each in parallel, write a digest file',
      });
      if (!intent || intent.trim().length === 0) { return; }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Nika: generating workflow',
          cancellable: true,
        },
        async (progress, token) => {
          progress.report({ message: 'grounding (templates · exemplars · spec)…' });
          const corpus = await buildCorpus(service);
          const grounding = await buildGrounding(service, intent, corpus);

          const lmSurface = await pickLanguageModel();
          if (!lmSurface) {
            // Rung 2: the user's own chat becomes the llm seam.
            await vscode.env.clipboard.writeText(grounding.prompt);
            const doc = await vscode.workspace.openTextDocument({
              content: grounding.templateBody,
              language: 'nika',
            });
            await vscode.window.showTextDocument(doc, { preview: false });
            void vscode.window.showInformationMessage(
              `Nika: grounded prompt copied (no editor LM API here) — paste it into your AI chat. The \`${grounding.templateSlug}\` template is open as the starting point.`,
            );
            return;
          }

          const { model, userMessage } = lmSurface;
          log('INFO', `generate: model=${model.vendor}/${model.family} intent="${intent.slice(0, 80)}"`);
          const llm = async (prompt: string): Promise<string> => {
            const res = await model.sendRequest([userMessage(prompt)], {}, token);
            let out = '';
            for await (const chunk of res.text) { out += chunk; }
            return out;
          };

          const reground = async (codes: string[]): Promise<string | undefined> => {
            // RepoCoder: re-query the corpus with the FAILING codes'
            // failure prose (canon rows) + the intent.
            const failures = codes
              .map((c) => service.intel?.errorCodes.find((row) => row.code === c)?.failure)
              .filter((f): f is string => f !== undefined);
            if (failures.length === 0) { return undefined; }
            const ranked = rankBm25(
              `${intent} ${failures.join(' ')}`,
              corpus.filter((d) => d.kind === 'example'),
            );
            const slug = ranked[0]?.id.replace(/^example:/, '');
            return slug ? service.exampleShow(slug) : undefined;
          };

          const result: GenResult | undefined = await generateWorkflow(
            grounding.prompt,
            {
              llm,
              check: makeCheckSeam(service),
              reground,
              onProgress: (line) => progress.report({ message: line }),
            },
            { candidates: 3, repairRounds: 2 },
          );
          if (token.isCancellationRequested) { return; }
          if (!result) {
            void vscode.window.showWarningMessage('Nika: the model produced no usable YAML — try rephrasing the intent.');
            return;
          }

          const doc = await vscode.workspace.openTextDocument({ content: result.yaml, language: 'nika' });
          await vscode.window.showTextDocument(doc, { preview: false });
          if (result.clean) {
            void vscode.window.showInformationMessage(
              `Nika: workflow generated — passes \`nika check\` (${result.candidatesTried} candidate(s) · ${result.roundsUsed} repair round(s)). Save as *.nika.yaml.`,
            );
          } else {
            void vscode.window.showWarningMessage(
              `Nika: best draft still has ${result.findings} finding(s) after ${result.roundsUsed} repair round(s) — the diagnostics will guide the rest (try Fix All).`,
            );
          }
        },
      );
    }),
  );
}
