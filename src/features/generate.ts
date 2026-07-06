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
import { refinedIntent, slugifyIntent } from '../core/generateStaging';
import { rankBm25, type RankDoc } from '../core/intentRank';
import { runCliOnText } from '../core/spawn';
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
    let body: string;
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
    const res = await runCliOnText(service, (file) => ['check', file, '--json'], yaml, 30000, 'gen');
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
    vscode.commands.registerCommand('nika.generateWorkflow', async (prefilled?: string) => {
      if (!service.available) {
        // The welcome hero lands here — the typed intent must SURVIVE
        // the missing engine, and the way out must be one click.
        const pick = await vscode.window.showWarningMessage(
          'Nika: generation needs the engine binary — every candidate is grounded through `nika check`.',
          'Install / detect',
        );
        if (pick === 'Install / detect') {
          await vscode.commands.executeCommand('nika.restartServer');
          if (service.available) {
            await vscode.commands.executeCommand('nika.generateWorkflow', prefilled);
          }
        }
        return;
      }
      // The canvas omnibar passes the intent directly; the palette path
      // still asks. Either way the SAME oracle-checked pipeline runs.
      const intent = typeof prefilled === 'string' && prefilled.trim().length > 0
        ? prefilled
        : await vscode.window.showInputBox({
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

          // Ghost-stage: the candidate opens as an UNTITLED doc — the
          // applied-but-not-committed state (nothing written to disk).
          // Save commits it · Refine re-runs the SAME pipeline with an
          // added instruction · Discard drops it. Never a silent write.
          await stageGeneratedWorkflow(service, result, intent, {
            llm,
            check: makeCheckSeam(service),
            reground,
            onProgress: (line) => progress.report({ message: line }),
          }, log);
        },
      );
    }),
  );
}

/** The Save / Refine / Discard review loop over a generated candidate. */
async function stageGeneratedWorkflow(
  service: NikaService,
  first: GenResult,
  baseIntent: string,
  seams: Parameters<typeof generateWorkflow>[1],
  log: (level: string, msg: string) => void,
): Promise<void> {
  let result = first;
  // The staged editor: replaced in place on each Refine.
  let doc = await vscode.workspace.openTextDocument({ content: result.yaml, language: 'nika' });
  const editor = await vscode.window.showTextDocument(doc, { preview: false });

  for (;;) {
    const summary = result.clean
      ? `Nika: draft ready — passes \`nika check\` (${result.candidatesTried} candidate(s) · ${result.roundsUsed} repair round(s)).`
      : `Nika: best draft still has ${result.findings} finding(s) after ${result.roundsUsed} repair round(s).`;
    const choice = await vscode.window.showInformationMessage(
      summary,
      'Save workflow',
      'Refine',
      'Discard',
    );

    if (choice === 'Save workflow') {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        void vscode.window.showWarningMessage('Nika: open a folder to save the workflow (or Save As from the editor).');
        continue;
      }
      const name = await vscode.window.showInputBox({
        title: 'Nika: save generated workflow',
        prompt: 'Filename (without extension)',
        value: slugifyIntent(baseIntent),
        validateInput: (v) => /^[a-z0-9-]+$/.test(v) ? null : 'Use lowercase letters, numbers, hyphens',
      });
      if (!name) { continue; }
      const target = vscode.Uri.joinPath(folder.uri, `${name}.nika.yaml`);
      // Never silently clobber an existing workflow — the slug default
      // makes a collision easy and a raw fs.writeFile has no undo.
      let exists = false;
      try { await vscode.workspace.fs.stat(target); exists = true; } catch { /* free */ }
      if (exists) {
        const overwrite = await vscode.window.showWarningMessage(
          `${name}.nika.yaml already exists — overwrite it?`,
          { modal: true },
          'Overwrite',
        );
        if (overwrite !== 'Overwrite') { continue; } // back to the stage loop
      }
      // Persist the CURRENT staged text (the user may have hand-edited).
      await vscode.workspace.fs.writeFile(target, Buffer.from(doc.getText(), 'utf-8'));
      const saved = await vscode.workspace.openTextDocument(target);
      await vscode.window.showTextDocument(saved, { preview: false });
      void vscode.window.showInformationMessage(`Nika: saved ${name}.nika.yaml — it flows into check + DAG now.`);
      return;
    }

    if (choice === 'Refine') {
      const refinement = await vscode.window.showInputBox({
        title: 'Nika: refine the workflow',
        prompt: 'What should change? (the whole intent stays in view)',
        placeHolder: 'add a step that writes the digest to a file',
      });
      if (!refinement || refinement.trim().length === 0) { continue; }
      const refined = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Nika: refining', cancellable: false },
        async () => {
          const corpus = await buildCorpus(service);
          const grounding = await buildGrounding(service, refinedIntent(baseIntent, refinement), corpus);
          return generateWorkflow(grounding.prompt, seams, { candidates: 3, repairRounds: 2 });
        },
      );
      if (!refined) {
        void vscode.window.showWarningMessage('Nika: refinement produced no usable YAML — the current draft is unchanged.');
        continue;
      }
      result = refined;
      log('INFO', `generate refine: clean=${refined.clean} findings=${refined.findings}`);
      // Replace the staged text in place (the editor keeps its position).
      const full = new vscode.Range(0, 0, doc.lineCount, 0);
      await editor.edit((b) => b.replace(full, refined.yaml));
      doc = editor.document;
      continue;
    }

    if (choice === 'Discard') {
      // Explicit only — a dismissed notification must NOT eat the draft.
      if (editor.document.isUntitled) {
        await vscode.window.showTextDocument(doc, { preview: false });
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      }
      return;
    }

    // Dismissed / timed out — leave the staged draft open, lose nothing.
    return;
  }
}
