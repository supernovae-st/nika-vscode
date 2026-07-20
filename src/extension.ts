import {
  workspace,
  commands,
  ConfigurationTarget,
  ExtensionContext,
  window,
  Uri,
  Position,
  Range,
  ThemeColor,
  Location,
  WorkspaceEdit,
  env,
  languages,
  QuickInputButtons,
  QuickPickItemKind,
  Selection,
  TextEditorRevealType,
  type QuickPickItem,
  type TextDocument,
} from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorkflowTreeProvider } from './workflowTree';
import { registerNikaBadge } from './features/fileBadge';
import { NikaDocLinkProvider } from './features/docLinks';
import { NikaDefinitionProvider } from './features/definitions';
import { journey, SCAFFOLD_MARKERS, type Journey } from './core/journey';
import { DEMO_WORKFLOW, DEMO_WORKFLOW_FILE, demoTargetDir } from './core/demoWorkflow';
import { firstContactMove } from './core/firstContact';
import { welcomeOpenAllowed } from './core/welcomeGuard';
import { subCreateAllowed } from './core/webviewPathGuard';
import { DagPanel, DagPanelSerializer, type DagEditRequest } from './dagPanel';
import type { PersistedLayoutEntry } from './webview/layoutCache';
import {
  addAfterEntry,
  deleteTask,
  duplicateTask,
  insertBetween,
  insertTaskSkeleton,
  removeAfterEntry,
  setTaskModel,
  type Verb,
} from './core/structuralFixes';
import { mergeVerbBand } from './core/verbColors';
import {
  getArtifactName,
  downloadNikaBinary,
  DownloadCancelled,
  GITHUB_RELEASES_URL,
  isBinaryWorking,
  findBundledBinary,
  GITHUB_INSTALL_URL,
} from './binaryInstaller';
import {
  startClient,
  getNikaPath,
  runNikaCommand,
  safeStopClient,
  checkVersionMismatch,
  type ClientState,
} from './lspClient';
import {
  ensureCursorGlobalMcpConfig,
  ensureCursorMcpConfig,
  ensureCursorRules,
  ensureVscodeMcpConfig,
  ensureWindsurfMcpConfig,
  isCursor,
  isWindsurf,
} from './mcpConfig';
import { NikaService } from './nikaService';
import { NikaStatusBar } from './features/statusBar';
import { NikaLanguageStatus } from './features/languageStatus';
import { WorkspaceLint } from './features/workspaceLint';
import { structureNavEntries } from './features/structureNav';
import { registerDebugReplay } from './features/debugReplay';
import { DiagnosticsController } from './features/diagnostics';
import { NikaCodeActionProvider, NikaFixAllProvider } from './features/codeActions';
import { intelEntries } from './features/intel';
import { AuditCodeLensProvider, AuditInlayHintsProvider } from './features/auditLens';
import {
  declareInputFor, pickOutputsFor, promoteVarsFor, typeOutputForLine,
} from './features/contractDoors';
import { makeResilientFor } from './features/armorDoors';
import { chooseCollectionFor, chooseGateFor, setServerIslandsProbe, wireInputsFor } from './features/flowDoors';
import { registerStation } from './features/stationView';
import { chooseDefaultModelFor, ModelLensProvider, pickModelForLine } from './features/modelLens';
import { chooseAgentToolsFor, VerbLensProvider, pickVerbBodyForLine } from './features/verbLens';
import type { NikaVerb } from './core/verbStarters.generated';
import { TaskLensProvider, VerbGutterDecorations } from './features/taskLens';
import { RunDecorations } from './features/runDecorations';
import { LiveDag } from './features/liveDag';
import { YieldRegistry } from './core/capabilityYield';
import {
  SEMANTIC_DOCUMENT_FORMAT,
  SEMANTIC_DOCUMENT_METHOD,
  semanticDocumentFormat,
} from './core/semanticDoc';
import { findTaskRefs, renameTask } from './core/renameRefs';
import { buildAddTaskPicks } from './core/addTaskPicks';
import { commandOnPath } from './core/pathLookup';
import {
  modelRows,
  scaffoldContent,
  starterModelOf,
  starterRows,
  totalStepsFor,
  type StarterPick,
} from './core/newWorkflowWizard';
import { buildSessionPicks } from './core/sessionLauncher';
import { parseOmniAdd } from './core/verbPalette';
import { RunsTreeProvider, collectCardArtifacts, collectTaskAverages, diffTracesOntoDag, latestTraceForGraph, overlayTraceOntoDag, replayIntoDag } from './features/runsView';
import { runWorkflowLive, cancelActiveRun, lastTracePathByWorkflow, isRunActive } from './features/runLive';
import { initCommunityAsk } from './features/communityAsk';
import { initFirstGreen } from './features/firstGreen';
import { flashStatus, informSoftly, initNotify } from './features/notify';
import { latestTraceFor } from './core/tracePersist';
import { explainWorkflow } from './core/explainWorkflow';
import { costDelta } from './core/costDelta';
import { CostBaselineTracker } from './features/costBaseline';
import { registerNikaTaskProvider } from './features/taskProvider';
import { NikaDocProvider, SCHEME as DOC_SCHEME, openNikaDoc } from './features/virtualDocs';
import { registerLmTools } from './features/lmTools';
import { registerMcpDefinitionProvider } from './features/mcpProvider';
import { registerGenerate } from './features/generate';
import { buildAuthoringPrompt } from './core/aiPrompt';
import { collectFindings, countReportFindings, parseCheckReport } from './core/cliContract';
import { auditByTask } from './core/auditByTask';
import { costForecast } from './core/costForecast';
import { computeDirty } from './core/dirtyNodes';
import { loadRecordedHashes } from './core/canvasState';
import { insertPermitsBlock } from './core/permitsEdit';
import { parseRichWorkflow, taskAtLine } from './workflowParser';
import { refAt } from './core/expr';
import {
  buildPreflight,
  collectPreflightFacts,
  factsFromRequirements,
  parseCatalogProviders,
  preflightChipModel,
  renderPreflight,
  type ProviderKeyInfo,
} from './core/preflight';
import { traceStore } from './core/traceStore';
import { foldTrace } from './core/traceFold';
import { renderRunReport } from './core/runReport';
import { verifyChain } from './core/chainVerify';
import { XrayInlayProvider } from './features/xray';
import { registerTestExplorer } from './features/testExplorer';
import { registerSecretsDecor } from './features/secretsDecor';
import { extractRunArtifacts } from './core/artifacts';
import { attemptLadders } from './core/attempts';
import { buildTimeline } from './core/timelineModel';
import { topoWaves } from './core/cliContract';
import { joinContract, parseChildVars, parseInvokeArgKeys } from './core/childContract';
import { scanSecrets } from './core/credentialLint';
import { collectShapes, renderShape } from './core/schemaShape';
import { traceBelongsTo, type HistoryRun } from './core/runHistory';
import { registerHistory } from './features/historyView';
import { answerControlFor, encodeAnswer } from './core/pauseAnswer';
import { BASELINE_REL_PATH, captureBaseline } from './core/lintBaseline';

/** The ONLY commands the welcome surface may execute (webview input —
 *  a compromised webview must not become an executeCommand oracle). Every
 *  entry runs with NO webview-supplied argument (`executeCommand(command)`),
 *  so a listed command must be safe when called bare · `nika.tryDemo`
 *  writes only to a host-chosen path, never one the webview names. */
const WELCOME_COMMANDS = new Set([
  'nika.tryDemo', 'nika.newWorkflow', 'nika.browseExamples', 'nika.replayTrace',
  'nika.showMenu', 'nika.checkWorkflow', 'nika.showReport',
  'nika.inspectWorkflow', 'nika.inferPermits', 'nika.explainWorkflow',
  'nika.openSpec', 'nika.copyAiPrompt', 'nika.setupMcp',
  'nika.restartServer', 'nika.preflightWorkflow', 'nika.runHistory',
]);

/** A free `<stem>[-N].<ext>` under `dir` — the demo sandbox never clobbers
 *  a file the user already has (skip-if-exists → suffix, no prompt). */
async function freeWorkflowUri(dir: Uri, base: string): Promise<Uri> {
  const dot = base.indexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  let candidate = Uri.joinPath(dir, base);
  for (let n = 1; n < 100; n++) {
    try {
      await workspace.fs.stat(candidate);
      candidate = Uri.joinPath(dir, `${stem}-${n}${ext}`);
    } catch {
      break; // stat threw → the name is free
    }
  }
  return candidate;
}

/** Coarse relative-time label for the welcome's recent list. */
function relTime(mtime: number): string {
  const s = Math.max(1, Math.round((Date.now() - mtime) / 1000));
  if (s < 3600) { return `${Math.max(1, Math.round(s / 60))}m ago`; }
  if (s < 86400) { return `${Math.round(s / 3600)}h ago`; }
  if (s < 86400 * 30) { return `${Math.round(s / 86400)}d ago`; }
  return `${Math.round(s / (86400 * 30))}mo ago`;
}

// ─── Shared mutable state ──────────────────────────────────────────────────
// Owned here, passed by reference to module functions via ClientState.
const state: ClientState = {
  client: undefined,
  activeDagPanel: undefined,
  resolvedServerPath: undefined,
};

let outputChannel: import('vscode').OutputChannel | undefined;
let extContext: ExtensionContext;
let svc: NikaService;

// ─── First contact (V-SOTA.A · the missing wire) ────────────────────────────
// Session latches around the pure decision table (core/firstContact.ts):
// armed = this machine never activated the extension before · flown = the
// one-shot aha already fired · offered = the walkthrough opened (once).
let firstContactArmed = false;
let autoDemoFlown = false;
let walkthroughOffered = false;

/** Open the getting-started walkthrough once per machine. The burn is the
 *  walkthroughShown key — written when the walkthrough actually OPENS, so
 *  a first-contact session that dies before it opened re-greets next time. */
function offerWalkthroughOnce(): void {
  if (walkthroughOffered) { return; }
  walkthroughOffered = true;
  void extContext.globalState.update('nika.walkthroughShown', true);
  void commands.executeCommand(
    'workbench.action.openWalkthrough',
    `${extContext.extension.id}#nika.gettingStarted`,
    false,
  );
}

// The journey SSOT (core/journey): refreshed on the events that can
// move it (binary change · workflow create/delete · folder change ·
// init/finish-setup) and consumed by the status menu, New Session and
// the welcome views (via the `nika.journey` context key).
let currentJourney: Journey = journey({
  binaryAvailable: false,
  workspaceOpen: false,
  equipped: false,
  hasWorkflows: false,
});

async function refreshJourney(): Promise<void> {
  const folder = workspace.workspaceFolders?.[0];
  const equipped = !!folder
    && SCAFFOLD_MARKERS.some((m) => fs.existsSync(path.join(folder.uri.fsPath, m)));
  const hasWorkflows = (await workspace.findFiles(
    '**/*.nika.{yaml,yml}', '**/{node_modules,.git,target,dist}/**', 1,
  )).length > 0;
  currentJourney = journey({
    binaryAvailable: svc?.available ?? false,
    workspaceOpen: !!folder,
    equipped,
    hasWorkflows,
  });
  void commands.executeCommand('setContext', 'nika.journey', currentJourney.stage);
}

function log(level: string, msg: string): void {
  if (outputChannel) {
    outputChannel.appendLine(`[${new Date().toISOString()}] [${level}] ${msg}`);
  }
}

const NIKA_FILE_RE = /\.nika\.ya?ml$/;

/** Command-link args arrive as plain strings — commands accept both. */
function toUri(uri?: Uri | string): Uri | undefined {
  if (typeof uri !== 'string') { return uri; }
  try {
    return Uri.parse(uri, true);
  } catch {
    return undefined;
  }
}

function activeNikaDocument(rawUri?: Uri | string): TextDocument | undefined {
  const uri = toUri(rawUri);
  if (uri) {
    return workspace.textDocuments.find((d) => d.uri.toString() === uri.toString())
      ?? workspace.textDocuments.find((d) => d.uri.fsPath === uri.fsPath);
  }
  const doc = window.activeTextEditor?.document;
  return doc && NIKA_FILE_RE.test(doc.fileName) ? doc : undefined;
}

async function requireNikaDocument(rawUri?: Uri | string): Promise<TextDocument | undefined> {
  const uri = toUri(rawUri);
  if (uri) {
    if (!NIKA_FILE_RE.test(uri.fsPath)) {
      void window.showWarningMessage('Nika: commands target .nika.yaml files.');
      return undefined;
    }
    try {
      return await workspace.openTextDocument(uri);
    } catch {
      return undefined;
    }
  }
  const doc = activeNikaDocument();
  if (!doc) {
    void window.showWarningMessage('Nika: open a .nika.yaml file first.');
  }
  return doc;
}

/**
 * The History collection (0.97.0 shape, extracted for V-SOTA.B B2):
 * stat-first, newest-first, fold LAZILY until 12 members — membership
 * is the exact workflow name when the journal carries one
 * (traceBelongsTo), so template-derived siblings sharing task ids never
 * contaminate each other's grid. One scan feeds the History tree AND
 * its markdown export. Returned chronological (oldest → newest): the
 * index IS the exported grid's column number.
 */
async function collectHistoryRuns(
  docName: string | undefined,
  ids: ReadonlySet<string>,
): Promise<HistoryRun[]> {
  const glob = workspace.getConfiguration('nika').get<string>('traces.glob', '**/.nika/traces/*.ndjson');
  const files = await workspace.findFiles(glob, '**/node_modules/**', 500);
  const stamped = files
    .map((f) => { try { return { f, m: fs.statSync(f.fsPath).mtimeMs }; } catch { return undefined; } })
    .filter((x): x is { f: Uri; m: number } => x !== undefined)
    .sort((a, b) => b.m - a.m);
  const runs: HistoryRun[] = [];
  for (const { f, m } of stamped) {
    if (runs.length >= 12) { break; }
    try {
      const model = foldTrace(fs.readFileSync(f.fsPath, 'utf-8'));
      const taskIds = [...model.tasks.keys()];
      if (!traceBelongsTo(model.workflowName, docName, taskIds, ids)) { continue; }
      if (taskIds.length === 0) { continue; }
      runs.push({ name: path.basename(f.fsPath), mtimeMs: m, model, fsPath: f.fsPath });
    } catch {
      // unreadable trace — skip (the Runs view's Unreadable section owns that story)
    }
  }
  return runs.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

/**
 * Two-step model picker for the canvas params bar: provider (grouped ·
 * local/open-weight FIRST per the operator presentation-order lock) then
 * the model name (current value prefilled). Returns `provider/model`.
 */
async function pickModel(
  service: NikaService,
  text: string,
  taskId: string,
): Promise<string | undefined> {
  const providers = service.intel?.providers;
  const wf = parseRichWorkflow(text);
  const current = wf.tasks.find((t) => t.id === taskId)?.model ?? wf.defaultModel;

  interface ProviderItem extends QuickPickItem { provider?: string }
  const items: ProviderItem[] = [];
  const push = (group: string, ids: string[]): void => {
    if (ids.length === 0) { return; }
    items.push({ label: group, kind: QuickPickItemKind.Separator });
    for (const id of ids) {
      items.push({ label: id, provider: id, description: current?.startsWith(`${id}/`) ? 'current' : undefined });
    }
  };
  if (providers) {
    // Presentation-order lock: local/open-weight first · mistral · then
    // the rest of the cloud set alphabetically · test last.
    const cloud = [...providers.cloud].sort((a, b) =>
      (a === 'mistral' ? -1 : b === 'mistral' ? 1 : a.localeCompare(b)));
    push('local — sovereign · zero-cloud', [...providers.local].sort());
    push('cloud', cloud);
    push('test — deterministic · zero keys', [...providers.test].sort());
  }

  let provider: string | undefined;
  if (items.length > 0) {
    const picked = await window.showQuickPick(items, {
      title: `Model for \`${taskId}\` — provider`,
      placeHolder: current ? `current: ${current}` : 'pick a provider',
    });
    if (!picked?.provider) { return undefined; }
    provider = picked.provider;
  }

  // Step 2 — the binary's OWN model rows when it exports them (engine
  // ≥0.94 `catalog --json`): exact runnable ids with the facts that
  // matter (ctx window · reasoning · vision · json mode). Free typing
  // stays one row away — and is the whole step on older binaries or
  // catalog-less providers (the local five).
  const rows = provider ? service.catalogModels?.[provider] : undefined;
  if (provider && rows && rows.length > 0) {
    interface ModelItem extends QuickPickItem { value?: string; custom?: boolean }
    const modelItems: ModelItem[] = rows.map((r) => ({
      label: r.model,
      description: [r.desc, current === `${provider}/${r.model}` ? 'current' : undefined]
        .filter(Boolean).join('  ·  '),
      value: `${provider}/${r.model}`,
    }));
    modelItems.push(
      { label: '', kind: QuickPickItemKind.Separator },
      { label: '✎ custom…', description: 'type any provider/model', custom: true },
    );
    const picked = await window.showQuickPick(modelItems, {
      title: `Model for \`${taskId}\` — ${provider}`,
      placeHolder: current ?? 'exact ids from the binary’s catalog',
    });
    if (!picked) { return undefined; }
    if (!picked.custom) { return picked.value; }
  }

  const value = await window.showInputBox({
    title: `Model for \`${taskId}\``,
    prompt: 'provider/model — resolved by the engine at run time',
    value: provider
      ? (current?.startsWith(`${provider}/`) ? current : `${provider}/`)
      : (current ?? ''),
    valueSelection: provider && !current?.startsWith(`${provider}/`)
      ? [provider.length + 1, provider.length + 1]
      : undefined,
    validateInput: (v) =>
      /^[a-z0-9_-]+\/[A-Za-z0-9._:-]+$/.test(v.trim()) ? null : 'expected provider/model (e.g. ollama/llama3.2)',
  });
  return value?.trim() || undefined;
}

/**
 * The no-binary gate: when the engine is missing, every dead end becomes
 * the SAME actionable message — install/detect (→ restartServer, which
 * re-resolves and offers the consent-gated download) or the brew line.
 * Returns true when the engine is available (callers proceed).
 */
async function requireEngine(service: NikaService, doing: string): Promise<boolean> {
  if (service.available) { return true; }
  const pick = await window.showWarningMessage(
    `Nika: ${doing} needs the engine binary — it is not on this machine yet.`,
    'Install / detect',
    'Copy brew command',
  );
  if (pick === 'Install / detect') {
    await commands.executeCommand('nika.restartServer');
    return service.available;
  }
  if (pick === 'Copy brew command') {
    await env.clipboard.writeText('brew install supernovae-st/tap/nika');
    void window.setStatusBarMessage('$(clippy) brew install supernovae-st/tap/nika', 4000);
  }
  return false;
}

// ─── Activation ─────────────────────────────────────────────────────────────

export function activate(context: ExtensionContext): void {
  extContext = context;
  initCommunityAsk(context);
  initFirstGreen(context);
  initNotify(context);
  outputChannel = window.createOutputChannel('Nika');
  context.subscriptions.push(outputChannel);
  log('INFO', `Nika extension v${context.extension.packageJSON.version} activating`);
  log('INFO', `Platform: ${process.platform}/${process.arch}`);

  // First activation EVER → the aha flow (V-SOTA.A · the missing wire).
  // The old greeting opened the walkthrough first; inverted: on the real
  // first contact the DEMO opens and runs itself once the engine is here
  // (see maybeAutoRunDemo below), and the walkthrough follows as optional
  // depth. Two keys: nika.firstActivation.v1 marks the machine's first
  // contact — burned NOW, so the auto-run never replays, even when this
  // session dies mid-flow; nika.walkthroughShown burns when the
  // walkthrough actually opens (offerWalkthroughOnce). An updating user
  // carries walkthroughShown from before this key existed and is never
  // re-greeted, never auto-demoed.
  firstContactArmed = !context.globalState.get<boolean>('nika.firstActivation.v1')
    && !context.globalState.get<boolean>('nika.walkthroughShown');
  if (firstContactArmed) {
    void context.globalState.update('nika.firstActivation.v1', true);
  } else if (!context.globalState.get<boolean>('nika.walkthroughShown')) {
    // The resume path: a first-contact session died before the walkthrough
    // ever opened — greet now, exactly the old flow.
    offerWalkthroughOnce();
  }

  // The ONE seam to the binary + the capability-aware status bar.
  const service = new NikaService();
  svc = service;

  // F5 over a recorded run — the DAP replay wiring (factory · config
  // provider · the Runs-view "Debug this run" action). The adapter IS
  // the engine: `nika dap` over stdio.
  registerDebugReplay(context, () => service.binaryPath, () => service.caps.dap);
  const statusBar = new NikaStatusBar(service, () => currentJourney);
  context.subscriptions.push(statusBar);
  // statusSink is (re)assigned below once the language-status items exist —
  // nothing fires it before activation completes (LSP start is async-after).
  state.rulesIntel = () => service.intel?.providers;

  // Capability context keys drive `when` clauses in package.json menus.
  context.subscriptions.push(service.onDidChange(() => {
    const caps = service.caps;
    // The transition auto-power: a binary that ARRIVES mid-session (the
    // download path) must light everything without a reload.
    void autoEquipOnce();
    void refreshJourney();
    void commands.executeCommand('setContext', 'nika.hasBinary', service.available);
    void commands.executeCommand('setContext', 'nika.capRun', caps.run);
    void commands.executeCommand('setContext', 'nika.capCheck', caps.check);
    void commands.executeCommand('setContext', 'nika.capGraph', caps.inspect);
    void commands.executeCommand('setContext', 'nika.capTrace', caps.trace);
    log('INFO', `Capabilities: ${[...caps.commands].sort().join(' ') || '(none)'} · ${caps.version}`);
  }));

  // Command: Show output channel
  context.subscriptions.push(
    commands.registerCommand('nika.showOutput', () => outputChannel?.show()),
    commands.registerCommand('nika.showMenu', () => statusBar.showMenu()),
  );

  // Language-identity enforcement (proven live on Cursor 2026-07-12: a
  // *.nika.yaml opened as languageId `yaml` DESPITE our extensions field
  // AND a files.associations default — some host/extension layer wins the
  // association fight). This runtime layer always wins: any nika file
  // that opens under another language is set to `nika` on open, which
  // brings the grammar, the language icon and the indent rules with it.
  const enforceNikaLanguage = async (doc: TextDocument) => {
    if (doc.languageId === 'nika' || doc.uri.scheme === 'git') { return; }
    if (/\.nika\.ya?ml$/.test(doc.fileName)) {
      try {
        await languages.setTextDocumentLanguage(doc, 'nika');
      } catch (e) {
        log('WARN', `setTextDocumentLanguage failed: ${String(e)}`);
      }
    }
  };
  context.subscriptions.push(workspace.onDidOpenTextDocument(enforceNikaLanguage));
  context.subscriptions.push(registerNikaBadge());
  // NikaDocLinkProvider + NikaDefinitionProvider register via the
  // capability registry below (#103) — the server's definitionProvider
  // silences the client twin; documentLinkProvider stays client until
  // the server gains it.
  for (const doc of workspace.textDocuments) { void enforceNikaLanguage(doc); }

  // Finish setup — the ONE orchestrated gesture: binary (verified
  // download if needed) → wire host MCP → optional repo init (a repo
  // write stays a consented question) → recap. Every step surfaces its
  // own failure; nothing here is silent.
  context.subscriptions.push(
    commands.registerCommand('nika.finishSetup', async () => {
      await context.globalState.update('nika.downloadDeclined', undefined);
      if (!service.available) {
        const fresh = await resolveBinary(context, true);
        state.resolvedServerPath = fresh;
        await service.setBinary(fresh);
        if (!fresh) { return; } // the download path already spoke
        if (service.caps.lsp && !state.client) {
          startClient(context, state, log, fresh);
        }
      }
      const wired = await equipHost(true);
      const folder = workspace.workspaceFolders?.[0];
      let inited = false;
      if (folder && service.caps.init) {
        const pick = await window.showInformationMessage(
          'Equip this repo too? (`nika init` writes AGENTS.md · agent rules · MCP wiring for this workspace)',
          'Init repo', 'Skip',
        );
        if (pick === 'Init repo') {
          const res = await service.runCli(['init', folder.uri.fsPath], 30000);
          inited = res.code === 0;
          if (!inited) { log('WARN', `finish-setup init failed: ${res.stderr || res.stdout}`); }
        }
      }
      void refreshJourney();
      // Diet: a completed setup is visible in every surface it lit —
      // the recap flashes, no toast survives it.
      flashStatus(
        `$(check) Nika setup complete — engine ${service.caps.version || 'ready'} · MCP ${wired ? 'wired' : 'unchanged'} · LSP ${service.caps.lsp ? 'on' : 'client-side'}${inited ? ' · repo equipped' : ''}`,
        6000,
      );
    }),
  );

  // The ready-to-paste run line — required vars become --var placeholders
  // (the vars CTA lens · the check report names the contract).
  context.subscriptions.push(
    commands.registerCommand('nika.copyRunLine', async (uri?: Uri) => {
      const doc = uri
        ? await workspace.openTextDocument(uri)
        : window.activeTextEditor?.document;
      if (!doc) { return; }
      const rel = workspace.asRelativePath(doc.uri);
      const vars = service.peekCheck(doc.uri.toString())?.report?.requirements?.vars_required ?? [];
      const line = `nika run ${rel}${vars.map((v) => ` --var ${v}=<value>`).join('')}`;
      await env.clipboard.writeText(line);
      flashStatus(`$(clippy) run command copied — ${line}`);
    }),
  );

  // The 10-second proof: the offline hello (mock/echo · zero keys) in
  // the integrated terminal — the first wow, one click.
  context.subscriptions.push(
    commands.registerCommand('nika.runProof', async () => {
      if (!(await requireEngine(service, 'running the 10-second proof'))) { return; }
      runNikaCommand(state.resolvedServerPath, 'examples', 'run 01-hello --model mock/echo');
    }),
  );

  // The one earned ask (mirrors the CLI's community line — #498).
  context.subscriptions.push(
    commands.registerCommand('nika.starOnGitHub', () => {
      void env.openExternal(Uri.parse('https://github.com/supernovae-st/nika'));
    }),
  );

  // The verb band, in the editor: write the four canonical hues into the
  // user's tokenColorCustomizations (an extension cannot DEFAULT these —
  // configurationDefaults excludes token customizations, so the write is
  // this consented command; every other rule/key is preserved verbatim).
  context.subscriptions.push(
    commands.registerCommand('nika.applyVerbColors', async () => {
      const config = workspace.getConfiguration('editor');
      const merged = mergeVerbBand(config.get('tokenColorCustomizations'));
      await config.update('tokenColorCustomizations', merged, ConfigurationTarget.Global);
      void window.showInformationMessage(
        'Nika: verb band applied — infer · exec · invoke · agent carry their canonical hues in every theme.',
      );
    }),
  );
  // Sidebar — workflow explorer (check badges from the cached report ·
  // zero extra spawns) + flight-recorder runs.
  const workflowTree = new WorkflowTreeProvider((uriString) => {
    const report = service.peekCheck(uriString)?.report;
    if (!report) { return undefined; }
    const count = countReportFindings(report);
    return count === 0 ? { kind: 'clean' } : { kind: 'findings', count };
  }, () => service.available);
  context.subscriptions.push(
    window.registerTreeDataProvider('nikaWorkflows', workflowTree),
    service.onDidUpdateDocument(() => workflowTree.refresh()),
  );
  // The living-tree gestures (inline verbs on Workflows rows). Each
  // wrapper receives the tree ITEM and re-routes to the audited
  // command — typeof first (the commands are palette-hidden, but the
  // guard is the law, not the menu).
  const workflowItemUri = (item: unknown): Uri | undefined => {
    if (typeof item !== 'object' || item === null) { return undefined; }
    const uri = (item as { resourceUri?: unknown }).resourceUri;
    return uri instanceof Uri ? uri : undefined;
  };
  const workflowTaskRef = (item: unknown): { uri: Uri; taskId: string } | undefined => {
    if (typeof item !== 'object' || item === null) { return undefined; }
    const bag = item as { uri?: unknown; taskId?: unknown };
    return bag.uri instanceof Uri && typeof bag.taskId === 'string'
      ? { uri: bag.uri, taskId: bag.taskId }
      : undefined;
  };
  context.subscriptions.push(
    commands.registerCommand('nika.workflows.run', (item: unknown) => {
      const uri = workflowItemUri(item);
      if (uri) { void commands.executeCommand('nika.runWorkflow', uri); }
    }),
    commands.registerCommand('nika.workflows.check', (item: unknown) => {
      const uri = workflowItemUri(item);
      if (uri) { void commands.executeCommand('nika.checkWorkflow', uri); }
    }),
    commands.registerCommand('nika.workflows.rerunTask', (item: unknown) => {
      const ref = workflowTaskRef(item);
      if (ref) { void commands.executeCommand('nika.rerunTask', ref.uri, ref.taskId); }
    }),
    commands.registerCommand('nika.workflows.focusTask', (item: unknown) => {
      const ref = workflowTaskRef(item);
      if (ref) { void commands.executeCommand('nika.focusTaskInDag', ref.uri, ref.taskId); }
    }),
  );
  const watcher = workspace.createFileSystemWatcher('**/*.nika.yaml');
  watcher.onDidCreate(() => { workflowTree.refresh(); void refreshJourney(); });
  watcher.onDidDelete(() => { workflowTree.refresh(); void refreshJourney(); });
  watcher.onDidChange(() => workflowTree.refresh());
  context.subscriptions.push(watcher);
  context.subscriptions.push(workspace.onDidChangeWorkspaceFolders(() => void refreshJourney()));
  void refreshJourney();

  const runsTree = new RunsTreeProvider();
  // createTreeView (not registerTreeDataProvider) for the needs-you
  // badge (annexe B #5): it counts ONLY paused runs — a red dot means
  // « a run is blocked on you », never mere activity. `undefined`
  // clears it.
  const runsTreeView = window.createTreeView('nikaRuns', { treeDataProvider: runsTree });
  runsTree.onScan = (paused) => {
    runsTreeView.badge = paused > 0
      ? { value: paused, tooltip: `${paused} run${paused === 1 ? '' : 's'} waiting on your answer` }
      : undefined;
  };
  context.subscriptions.push(runsTreeView);

  // Run History — the native cross-run tree (when-gated on
  // `nika.historyActive` · V-SOTA.B B2). Registered up front, hidden
  // until a `Nika: Run History` loads it; the old markdown grid is its
  // export ($(markdown) in the view title).
  const history = registerHistory(context);

  // The Station — the cockpit tree (engine · doctor · agents ·
  // providers · workspace). Lane A pure: everything it shows comes
  // from `welcome --deep --json` + `doctor --json` + the grammar
  // canary; it degrades honestly to the one install action.
  const station = registerStation(context, service, () => state.resolvedServerPath);

  // Trace watcher: refresh the runs view AND live-overlay a growing trace
  // onto the open DAG (an engine writing a run animates the graph in real
  // time — debounced per file, majority-overlap gated).
  const overlayTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const onTraceEvent = (uri: Uri): void => {
    runsTree.refresh();
    if (!workspace.getConfiguration('nika').get<boolean>('traces.live', true)) { return; }
    if (!dagPanel.hasPanel) { return; }
    const key = uri.toString();
    const pending = overlayTimers.get(key);
    if (pending) { clearTimeout(pending); }
    overlayTimers.set(key, setTimeout(() => {
      overlayTimers.delete(key);
      overlayTraceOntoDag(dagPanel, uri);
    }, 300));
  };
  const traceWatcher = workspace.createFileSystemWatcher('**/.nika/traces/*.ndjson');
  // First journal in a workspace → offer .gitignore coverage ONCE (the
  // AI-SDK devtools pattern, but asked — we never silently edit a user's
  // .gitignore). Choice remembered per workspace.
  const nudgeGitignore = async (): Promise<void> => {
    if (context.workspaceState.get<boolean>('nika.gitignoreNudged')) { return; }
    const root = workspace.workspaceFolders?.[0];
    if (!root) { return; }
    await context.workspaceState.update('nika.gitignoreNudged', true);
    const giPath = path.join(root.uri.fsPath, '.gitignore');
    try {
      const existing = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf-8') : '';
      if (/^\.nika\/?\s*$/m.test(existing) || existing.includes('.nika/')) { return; }
      const choice = await window.showInformationMessage(
        'Nika keeps run journals in .nika/traces/ — add .nika/ to .gitignore?',
        'Add', 'No',
      );
      if (choice === 'Add') {
        // Re-read NOW: the notification is non-modal and unbounded — the
        // snapshot from ask-time would silently revert any edit made
        // (by the user or another tool) while the toast sat there.
        const fresh = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf-8') : '';
        if (/^\.nika\/?\s*$/m.test(fresh) || fresh.includes('.nika/')) { return; }
        fs.writeFileSync(giPath, `${fresh}${fresh.length > 0 && !fresh.endsWith('\n') ? '\n' : ''}.nika/\n`);
      }
    } catch {
      // Garnish law — a nudge must never throw.
    }
  };
  traceWatcher.onDidCreate((uri) => { void nudgeGitignore(); onTraceEvent(uri); });
  traceWatcher.onDidChange(onTraceEvent);
  traceWatcher.onDidDelete(() => runsTree.refresh());
  // First CLEAN check in a workspace → hand over to the next step ONCE
  // (the 2026-07-08 funnel audit: verdicts appeared but nothing said
  // « now run it »). Same discipline as the gitignore nudge: asked,
  // once per workspace, setting-gated, never throws (garnish law).
  context.subscriptions.push(service.onDidUpdateDocument((uriString) => {
    try {
      if (context.workspaceState.get<boolean>('nika.firstCleanNudged')) { return; }
      if (!workspace.getConfiguration('nika').get<boolean>('nudge.firstCleanCheck', true)) { return; }
      const outcome = service.peekCheck(uriString);
      if (outcome?.report?.clean !== true) { return; }
      void context.workspaceState.update('nika.firstCleanNudged', true);
      void (async () => {
        const choice = await window.showInformationMessage(
          'Workflow checks clean — run it: mock/echo needs no key, no server.',
          '▶ Run', '¶ Explain',
        );
        const uri = Uri.parse(uriString);
        if (choice === '▶ Run') { await commands.executeCommand('nika.runWorkflow', uri); }
        if (choice === '¶ Explain') { await commands.executeCommand('nika.explainWorkflow', uri); }
      })();
    } catch {
      // Garnish law — a nudge must never throw.
    }
  }));
  context.subscriptions.push(
    traceWatcher,
    { dispose: () => { for (const t of overlayTimers.values()) { clearTimeout(t); } } },
    commands.registerCommand('nika.refreshRuns', () => runsTree.refresh()),
  );

  // Task provider — package.json declares the `nika` task type; without
  // this registration every tasks.json entry of that type errors out.
  registerNikaTaskProvider(context, service);

  // Diagnostics (check --json + secrets lint) · quick fixes · intel.
  const diagnosticsController = new DiagnosticsController(service);
  context.subscriptions.push(diagnosticsController);

  // Native language-status flyout ({} icon) — engine · check · server,
  // per-file precision beside the global status bar ladder.
  const langStatus = new NikaLanguageStatus(service, diagnosticsController);
  context.subscriptions.push(langStatus);
  state.statusSink = (s) => {
    statusBar.setLspState(s);
    langStatus.setLspState(s);
    station.setLspState(s === 'running' ? 'running' : s === 'starting' ? 'starting' : 'failed');
  };

  // Problems-panel coverage for CLOSED workflows (open ones stay with the
  // controller — ownership hands over on open/close).
  context.subscriptions.push(new WorkspaceLint(service, log));

  // Smart-expand selection + linked editing register via the
  // capability registry below (#103).
  const fixAllProvider = new NikaFixAllProvider(diagnosticsController);
  context.subscriptions.push(
    languages.registerCodeActionsProvider(
      [{ language: 'nika' }, { pattern: '**/*.nika.yaml' }],
      new NikaCodeActionProvider(diagnosticsController, service, () => {
        // The server owns renames when IT advertises code actions
        // (0.99.7+ engines) — read live so a mid-session binary swap
        // flips ownership without a reload.
        const caps = state.client?.initializeResult?.capabilities;
        return Boolean(caps?.codeActionProvider);
      }),
      NikaCodeActionProvider.metadata,
    ),
    languages.registerCodeActionsProvider(
      [{ language: 'nika' }, { pattern: '**/*.nika.yaml' }],
      fixAllProvider,
      NikaFixAllProvider.metadata,
    ),
    commands.registerCommand('nika.fixAll', async () => {
      const doc = activeNikaDocument();
      if (!doc) { return; }
      const rewritten = fixAllProvider.applyAll(doc);
      if (rewritten === undefined) {
        void window.setStatusBarMessage('Nika: nothing auto-fixable', 3000);
        return;
      }
      const edit = new WorkspaceEdit();
      edit.replace(doc.uri, new Range(0, 0, doc.lineCount, 0), rewritten);
      await workspace.applyEdit(edit);
    }),
  );
  // The one-voice registry (#103): every client language provider,
  // keyed by the LSP capability that replaces it. Boot = no server yet
  // → full client intelligence; startClient reconciles on every
  // (re)start; a crash restores the client voice (lspClient wires it).
  const yieldRegistry = new YieldRegistry([
    ...intelEntries(service),
    ...structureNavEntries(),
    {
      cap: 'documentLinkProvider',
      label: 'links:doc',
      make: () => languages.registerDocumentLinkProvider([{ language: 'nika' }], new NikaDocLinkProvider()),
    },
    {
      cap: 'definitionProvider',
      label: 'definition:task',
      make: () => languages.registerDefinitionProvider([{ language: 'nika' }], new NikaDefinitionProvider()),
    },
  ]);
  context.subscriptions.push(yieldRegistry);
  yieldRegistry.reconcile(undefined);
  state.reconcileIntel = (caps) => {
    // The semantic-document lane rides the same two moments as the
    // yield registry: a server advertising the oracle IN OUR FORMAT
    // owns graph projection (one request per refresh — no spawn, and
    // spans the CLI cannot carry); its death restores the CLI lane.
    // A format-1 engine is refused here exactly like isGraphDoc
    // refuses its CLI output — capability-gated, never version-gated.
    // The flow doors' server-island lane: alive exactly while a
    // server with completion runs (the islands ride standard
    // textDocument/completion at the empty when:/for_each: value).
    const completion = caps !== undefined &&
      Boolean((caps as { completionProvider?: unknown }).completionProvider);
    setServerIslandsProbe(() => completion);
    const fmt = semanticDocumentFormat(caps);
    const client = state.client;
    if (caps !== undefined && fmt === SEMANTIC_DOCUMENT_FORMAT && client) {
      service.setSemanticOracle((doc) => client.sendRequest(
        SEMANTIC_DOCUMENT_METHOD,
        client.code2ProtocolConverter.asTextDocumentIdentifier(doc),
      ));
      log('INFO', 'one voice: server owns graph projection (nika/semanticDocument · format 2)');
    } else {
      service.setSemanticOracle(undefined);
      if (caps !== undefined && fmt !== undefined) {
        log('INFO', `graph projection stays on the CLI lane (server speaks format ${fmt})`);
      }
    }
    const r = yieldRegistry.reconcile(caps);
    if (r.silenced.length > 0) {
      log('INFO', `one voice: server owns ${r.silenced.join(' · ')} — client twins silenced`);
    }
    if (r.restored.length > 0 && caps !== undefined) {
      log('INFO', `client voices restored: ${r.restored.join(' · ')}`);
    }
    return r;
  };

  // Audit lenses — inlay cost/when/fan-out + the header audit card.
  const inlayProvider = new AuditInlayHintsProvider(service);
  const xrayProvider = new XrayInlayProvider();
  // Est-vs-actual: until a run exists, the check report's static per-task
  // cost holds the badge slot in gray italic (`est …`); a real run
  // replaces it with the solid actual through the same decorations.
  const runDecor = new RunDecorations((uriString) => {
    const report = service.peekCheck(uriString)?.report;
    if (!report) { return undefined; }
    const out = new Map<string, string>();
    for (const t of report.cost.tasks ?? []) {
      if (typeof t.usd === 'number' && t.usd > 0) {
        const amount = t.usd.toFixed(t.usd < 0.1 ? 4 : 2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
        out.set(t.task, ` est ${t.max_tokens ? '' : '\u2265 '}$${amount}`);
      }
    }
    return out.size > 0 ? out : undefined;
  });
  const registerSecretsDecorDisposable = (): { dispose(): void } => {
    registerSecretsDecor(context);
    return { dispose: () => undefined };
  };

  // Catalog key-story memo (env_var · requires_key · local per provider) —
  // one spawn per binary, shared by the preflight chip and the doc.
  let catalogKeyCache: { binary: string | undefined; map: Record<string, ProviderKeyInfo> | undefined } | undefined;
  const catalogKeys = async (): Promise<Record<string, ProviderKeyInfo> | undefined> => {
    const bin = service.binaryPath;
    if (catalogKeyCache && catalogKeyCache.binary === bin) { return catalogKeyCache.map; }
    let map: Record<string, ProviderKeyInfo> | undefined;
    try {
      const res = await service.runCli(['catalog', '--json'], 10000);
      map = res.code === 0 ? parseCatalogProviders(res.stdout) : undefined;
    } catch {
      map = undefined;
    }
    catalogKeyCache = { binary: bin, map };
    return map;
  };
  const lensProvider = new AuditCodeLensProvider(service);
  const taskLensProvider = new TaskLensProvider();
  context.subscriptions.push(
    inlayProvider,
    lensProvider,
    languages.registerInlayHintsProvider([{ language: 'nika' }], inlayProvider),
    languages.registerInlayHintsProvider([{ language: 'nika' }], xrayProvider),
    traceStore.onDidUpdate(() => xrayProvider.refresh()),
    languages.registerCodeLensProvider([{ language: 'nika' }], lensProvider),
    taskLensProvider,
    languages.registerCodeLensProvider([{ language: 'nika' }], taskLensProvider),
    languages.registerCodeLensProvider([{ language: 'nika' }], new ModelLensProvider()),
    commands.registerCommand('nika.pickModel', (uri: Uri, line: number) =>
      pickModelForLine(service, uri, line),
    ),
    languages.registerCodeLensProvider([{ language: 'nika' }], new VerbLensProvider()),
    commands.registerCommand('nika.pickVerbBody', (uri: Uri, line: number, verb: NikaVerb) =>
      pickVerbBodyForLine(service, uri, line, verb),
    ),
    // The agent register (issue #87): tools: as a catalog multi-pick.
    commands.registerCommand('nika.chooseAgentTools', (uri: Uri, line: number, indent: number) =>
      chooseAgentToolsFor(service, uri, line, indent),
    ),
    // The contract doors (V1): schema · outputs · vars.
    commands.registerCommand('nika.typeOutput', (uri: Uri, line: number, verb: NikaVerb) =>
      typeOutputForLine(uri, line, verb),
    ),
    commands.registerCommand('nika.pickOutputs', (uri?: Uri) => pickOutputsFor(uri)),
    commands.registerCommand('nika.declareInput', (uri?: Uri) => declareInputFor(uri)),
    commands.registerCommand('nika.promoteVars', (uri?: Uri) => promoteVarsFor(uri)),
    // The flow doors (V2): after · when · for_each.
    commands.registerCommand('nika.wireInputs', (uri: Uri, taskId: string) =>
      wireInputsFor(uri, taskId),
    ),
    commands.registerCommand('nika.chooseGate', (uri: Uri, taskId: string) =>
      chooseGateFor(uri, taskId),
    ),
    commands.registerCommand('nika.chooseCollection', (uri: Uri, taskId: string) =>
      chooseCollectionFor(uri, taskId),
    ),
    // The armor doors (V3): the failed-task lens carries (uri, id);
    // the palette path armors the task under the cursor.
    commands.registerCommand('nika.makeResilient', (uri?: Uri, taskId?: string) =>
      makeResilientFor(uri, taskId),
    ),
    commands.registerCommand('nika.chooseDefaultModel', (uri?: Uri) =>
      chooseDefaultModelFor(service, uri),
    ),
    new VerbGutterDecorations(),
    runDecor,
    registerSecretsDecorDisposable(),
    workspace.onDidSaveTextDocument((doc) => {
      if (NIKA_FILE_RE.test(doc.fileName)) { inlayProvider.refresh(); }
    }),
  );

  // Living panel · cursor sync: the caret's task gets a soft halo in the
  // graph (throttled · visible-panel-gated · same-workflow-gated).
  let cursorSyncTimer: ReturnType<typeof setTimeout> | undefined;
  let lastHintedTask: string | null = null;
  let lastLineageTask: string | null = null;
  context.subscriptions.push(
    window.onDidChangeTextEditorSelection((e) => {
      if (!dagPanel.isVisible) { return; }
      if (!workspace.getConfiguration('nika').get<boolean>('dag.cursorSync', true)) { return; }
      const doc = e.textEditor.document;
      if (!NIKA_FILE_RE.test(doc.fileName)) { return; }
      if (dagWorkflowUri?.toString() !== doc.uri.toString()) { return; }
      if (cursorSyncTimer) { clearTimeout(cursorSyncTimer); }
      cursorSyncTimer = setTimeout(() => {
        const text = doc.getText();
        const wf = parseRichWorkflow(text);
        const pos = e.selections[0]?.active;
        const task = taskAtLine(wf, pos?.line ?? 0);
        const id = task?.id ?? null;
        if (id !== lastHintedTask) {
          lastHintedTask = id;
          dagPanel.cursorHint(id);
        }
        // Caret INSIDE `${{ tasks.X… }}` → trace X's data lineage on the
        // canvas (producers + consumers lit, rest dims) — brief couche 3.
        const ref = pos ? refAt(text, doc.offsetAt(pos)) : undefined;
        const lin = ref?.root === 'tasks' && ref.path.length > 0 ? ref.path[0] : null;
        if (lin !== lastLineageTask) {
          lastLineageTask = lin;
          dagPanel.lineage(lin);
        }
      }, 120);
    }),
    { dispose: () => { if (cursorSyncTimer) { clearTimeout(cursorSyncTimer); } } },
  );

  // Source-bound run highlight — the YAML is the timeline: the spans of
  // RUNNING tasks glow while a run (or a replay scrub) is at them. Two
  // feeds, one painter: the webview's transport:tick (replay + live
  // echoes, panel open) and traceStore updates (live, works with the
  // panel closed). Same events → same set → idempotent decorations.
  const runHighlight = window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new ThemeColor('editor.wordHighlightBackground'),
    overviewRulerColor: new ThemeColor('editorCursor.foreground'),
  });
  const paintRunningSpans = (fsPath: string | undefined, ids: string[]): void => {
    if (!workspace.getConfiguration('nika').get<boolean>('editor.runHighlight', true)) { return; }
    for (const ed of window.visibleTextEditors) {
      const doc = ed.document;
      if (!NIKA_FILE_RE.test(doc.fileName)) { continue; }
      if (fsPath !== undefined && doc.uri.fsPath !== fsPath) { continue; }
      if (ids.length === 0) {
        ed.setDecorations(runHighlight, []);
        continue;
      }
      const wf = parseRichWorkflow(doc.getText());
      const ranges = wf.tasks
        .filter((t) => ids.includes(t.id))
        .map((t) => new Range(t.line, 0, t.endLine, 0));
      ed.setDecorations(runHighlight, ranges);
    }
  };
  context.subscriptions.push(
    runHighlight,
    traceStore.onDidUpdate((key) => {
      const rec = traceStore.get(key);
      if (!rec) { return; }
      const running = [...rec.fold.tasks.values()]
        .filter((t) => t.status === 'running' || t.status === 'retrying')
        .map((t) => t.id);
      paintRunningSpans(key, running);
    }),
  );

  // Living panel · follow mode: switching to ANOTHER workflow re-targets
  // the open DAG (debounced — flipping through tabs must not spawn a
  // graph per stop).
  let followTimer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor((editor) => {
      if (!editor || !dagPanel.hasPanel) { return; }
      if (!workspace.getConfiguration('nika').get<boolean>('dag.followActiveEditor', true)) { return; }
      const doc = editor.document;
      if (!NIKA_FILE_RE.test(doc.fileName)) { return; }
      if (dagWorkflowUri?.toString() === doc.uri.toString()) { return; }
      if (followTimer) { clearTimeout(followTimer); }
      followTimer = setTimeout(async () => {
        dagWorkflowUri = doc.uri;
        lastHintedTask = null;
        const graph = await loadGraphFor(doc);
        dagPanel.loadGraph(graph);
        dagPanel.note('⇄', `following ${workspace.asRelativePath(doc.uri)}`, undefined, 'st-note');
        postTrail(doc.uri.toString());
      }, 350);
    }),
    { dispose: () => { if (followTimer) { clearTimeout(followTimer); } } },
  );

  // Editor ⇄ graph: the per-task lens drives the DAG panel.
  context.subscriptions.push(
    commands.registerCommand('nika.focusTaskInDag', async (uri: Uri | string, taskId: string) => {
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      dagWorkflowUri = doc.uri;
      const graph = await loadGraphFor(doc);
      dagPanel.show(graph);
      dagPanel.focusNode(taskId);
    }),
    commands.registerCommand('nika.peekTaskRefs', async (uri: Uri | string, taskId: string, line: number) => {
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      const locations = findTaskRefs(doc.getText(), taskId)
        .filter((r) => r.home !== 'declaration')
        .map((r) => new Location(
          doc.uri,
          new Range(doc.positionAt(r.start), doc.positionAt(r.end)),
        ));
      await commands.executeCommand(
        'editor.action.peekLocations',
        doc.uri,
        new Position(line, 0),
        locations,
        'peek',
      );
    }),
  );

  // Virtual docs — the binary's embedded surface as read-only tabs.
  const docProvider = new NikaDocProvider(service);
  context.subscriptions.push(
    workspace.registerTextDocumentContentProvider(DOC_SCHEME, docProvider),
  );

  // AI agents inside the editor call the oracle natively.
  registerLmTools(context, service, log);

  // VS Code ≥1.101 agent mode discovers `nika mcp` with zero config;
  // Cursor/older hosts silently keep the file-based wiring.
  registerMcpDefinitionProvider(context, service, log);

  // Intent → checked workflow (best-of-N · oracle-scored · bounded repair).
  registerGenerate(context, service, log);

  // DAG webview panel — track the active workflow URI for node-click navigation
  let dagWorkflowUri: Uri | undefined;
  // Composition trail (the dive path): grows on ⎘ jumps, truncates on
  // crumb jumps, resets when the user wanders to a file outside it.
  let compTrail: Array<{ label: string; uri: string }> = [];
  // The welcome-canvas open allowlist (capability): the exact set of
  // workflow URIs the extension surfaced in the last `welcome:data` push.
  // `welcome:open` may open ONLY a member — a compromised webview cannot
  // name a path the extension never showed it (arbitrary local read).
  let welcomeSurfaced: ReadonlySet<string> = new Set<string>();
  const labelOf = (uri: Uri): string => uri.path.split('/').pop() ?? uri.path;
  const postTrail = (currentUri: string): void => {
    const i = compTrail.findIndex((seg) => seg.uri === currentUri);
    if (i === -1) {
      if (compTrail.length > 0) { compTrail = []; dagPanel.postTrail([], 0); }
      return;
    }
    dagPanel.postTrail(compTrail, i);
  };

  // Graph + flight-recorder averages (mean success duration per task
  // across recorded runs of this graph) — every canvas load rides this.
  const loadGraphFor = async (doc: TextDocument) => {
    const text = doc.getText();
    const graph = await service.dagForDocument(doc);
    // The Δ re-run-changed affordance rides the binary's ADR-099 surface.
    graph.resumeCapable = service.caps.resume;
    try {
      const avgs = await collectTaskAverages(new Set(graph.nodes.map((n) => n.id)));
      for (const node of graph.nodes) {
        const avg = avgs.get(node.id);
        if (avg) {
          node.avgMs = avg.avgMs;
          node.avgRuns = avg.runs;
        }
      }
    } catch {
      // Averages are garnish — the graph must never fail on them.
    }
    try {
      // The typed core made card-visible (§3quater last row): a task
      // that declares its output shape wears the fact — the same
      // collectShapes read the editor completions already trust.
      const shapes = collectShapes(text);
      for (const node of graph.nodes) {
        const shape = shapes.get(node.id);
        if (shape) { node.typedShape = renderShape(shape); }
      }
    } catch { /* garnish law */ }
    try {
      // The other side of the secret story (L3 S2): the engine's IFC
      // proves where DECLARED secrets flow; this marks tasks whose
      // YAML span carries PASTED literals (credentialLint · precision-
      // first). The audit lens paints them; the editor squiggle keeps
      // the rewrite.
      const secretFindings = scanSecrets(text);
      if (secretFindings.length > 0) {
        const wf = parseRichWorkflow(text);
        for (const node of graph.nodes) {
          const task = wf.tasks.find((t) => t.id === node.id);
          if (!task) { continue; }
          const n = secretFindings.filter((f) => f.line >= task.line && f.line <= task.endLine).length;
          if (n > 0) { node.secretLiterals = n; }
        }
      }
    } catch { /* garnish law */ }
    try {
      // Composition preview (spec 14): a workflow-call card carries its
      // CHILD's manifest — read from the child's OWN engine projection
      // (never an invented rollup; the spec defers cross-file rollups).
      // Garnish law: the parent graph must never fail on a child read.
      const subNodes = graph.nodes.filter((n) => n.tool?.startsWith('workflow:'));
      for (const node of subNodes.slice(0, 4)) {
        const rel = node.tool!.slice('workflow:'.length).trim();
        if (rel.length === 0) { continue; }
        const childUri = rel.startsWith('/')
          ? Uri.file(rel)
          : Uri.joinPath(doc.uri, '..', rel);
        const childDoc = await workspace.openTextDocument(childUri);
        const child = await service.dagForDocument(childDoc);
        if (child.nodes.length === 0) { continue; }
        let costMin: number | undefined;
        let costMax: number | undefined;
        const grants = new Set<string>();
        for (const c of child.nodes) {
          if (c.costMin !== undefined) { costMin = (costMin ?? 0) + c.costMin; }
          if (c.costMax !== undefined) { costMax = (costMax ?? 0) + c.costMax; }
          for (const g of c.permits ?? []) { grants.add(g); }
        }
        const childWaves = topoWaves(child.nodes, child.edges);
        const waveOf = new Map<string, number>();
        childWaves.forEach((wave, w) => { for (const id of wave) { waveOf.set(id, w); } });
        // The promoted contract (ComfyUI-widgets steal): the child's
        // vars: × this task's args: — the card face becomes the
        // child's callable API. Facts only; check owns findings.
        const contract = joinContract(
          parseChildVars(childDoc.getText()),
          parseInvokeArgKeys(text, node.id),
        ).slice(0, 6);
        node.subManifest = {
          tasks: child.nodes.length,
          waves: childWaves.length,
          ...(contract.length > 0 ? { contract } : {}),
          ...(costMin !== undefined ? { costMin } : {}),
          ...(costMax !== undefined ? { costMax } : {}),
          ...(grants.size > 0 ? { permits: grants.size } : {}),
          // The hover peek (UE collapsed-graph steal): a miniature of
          // the child's REAL projection — bounded, counts past 30.
          ...(child.nodes.length <= 30 ? {
            skeleton: {
              nodes: child.nodes.map((c) => ({ id: c.id, verb: c.verb, wave: waveOf.get(c.id) ?? 0 })),
              edges: child.edges.map((e) => ({ source: e.source, target: e.target })),
            },
          } : {}),
        };
      }
    } catch {
      // A missing/unparseable child keeps its plain door — the chip
      // already offers « Create it » on click.
    }
    try {
      // Recorded media artifacts land ON the cards at load — the latest
      // matching trace's real files (« your generation appears here »,
      // honestly: only what a run actually wrote and still exists).
      const trace = await latestTraceForGraph(new Set(graph.nodes.map((n) => n.id)));
      if (trace) {
        const arts = collectCardArtifacts(trace.ndjson, trace.fsPath);
        for (const node of graph.nodes) {
          const a = arts.get(node.id);
          if (a) { node.artifact = a; }
        }
      }
    } catch {
      // Same law — previews are garnish, never a load failure.
    }
    try {
      // Dirty-nodes: substance changed since the last SUCCESSFUL run
      // (sidecar-recorded) — direct edits + their downstream cone.
      if (doc.uri.scheme === 'file') {
        const recorded = loadRecordedHashes(doc.uri.fsPath);
        const dirty = computeDirty(doc.getText(), recorded);
        for (const node of graph.nodes) {
          if (dirty.stale.has(node.id)) {
            node.stale = true;
            node.staleUpstream = !dirty.direct.has(node.id);
          }
        }
      }
    } catch {
      // Same law: staleness must never break a graph load.
    }
    return graph;
  };

  // The message's workflowUri (persisted in the webview state) wins over
  // the closure — restored panels carry it where the closure is empty.
  const jumpToTask = (taskId: string, workflowUri?: string): void => {
    const target = workflowUri ? Uri.parse(workflowUri) : dagWorkflowUri;
    if (!target) { return; }
    void workspace.openTextDocument(target).then((doc) => {
      const wf = parseRichWorkflow(doc.getText());
      const task = wf.tasks.find((t) => t.id === taskId);
      if (!task) { return; }
      const pos = new Position(task.line, 0);
      void window.showTextDocument(target, { selection: new Range(pos, pos), preview: false });
    });
  };

  // Graph edits land in the YAML (the source of truth) as one
  // WorkspaceEdit each — undoable with plain ⌘Z in the editor.
  const applyDagEdit = async (request: DagEditRequest): Promise<void> => {
    const uri = request.workflowUri ? Uri.parse(request.workflowUri) : dagWorkflowUri;
    if (!uri) { return; }
    // A restored panel's FIRST interaction can be a canvas edit before any
    // URI-setting command runs — anchor the tracked workflow here so the
    // audit/cost/stale pushes (guarded on dagWorkflowUri) aren't dropped.
    dagWorkflowUri = uri;
    const doc = await workspace.openTextDocument(uri);
    const text = doc.getText();
    let newText: string | undefined;
    let revealTask: string | undefined;

    // Verb QuickPick shared by add-task and insert-on-edge. Detail line
    // derives from the embedded schema (projection — a new verb field
    // engine-side shows up here without a release).
    const pickVerb = async (title: string): Promise<Verb | undefined> => {
      const fieldsOf = (v: string): string => {
        const fields = service.intel?.verbFields[v]?.map((f) => f.name) ?? [];
        return fields.length > 0 ? `fields: ${fields.join(' · ')}` : '';
      };
      const verb = await window.showQuickPick(
        [
          { label: 'infer', description: 'LLM call', detail: fieldsOf('infer') },
          { label: 'exec', description: 'subprocess (capability-gated)', detail: fieldsOf('exec') },
          { label: 'invoke', description: 'builtin / MCP tool', detail: fieldsOf('invoke') },
          { label: 'agent', description: 'agent loop · default-deny tools', detail: fieldsOf('agent') },
        ],
        { title },
      );
      return verb?.label as Verb | undefined;
    };

    switch (request.kind) {
      case 'dag:addTask': {
        // Verb preset (the task palette) skips the QuickPick; a palette
        // TOOL pick pins that builtin on the invoke skeleton.
        const isVerb = (v: unknown): v is Verb =>
          v === 'infer' || v === 'exec' || v === 'invoke' || v === 'agent';
        let picked: Verb | undefined = isVerb(request.verb) ? request.verb : undefined;
        picked ??= await pickVerb(
          request.afterTaskId ? `New task after \`${request.afterTaskId}\`` : 'New task',
        );
        if (!picked) { return; }
        const tool = picked === 'invoke' && typeof request.tool === 'string'
          ? request.tool
          : undefined;
        const res = insertTaskSkeleton(text, picked, request.afterTaskId ?? undefined, tool);
        if (res) {
          newText = res.text;
          revealTask = res.taskId;
        }
        break;
      }
      case 'dag:insertOnEdge': {
        // The canvas palette presets verb (and maybe a pinned tool);
        // the QuickPick stays as the no-preset fallback.
        const isVerb = (v: unknown): v is Verb =>
          v === 'infer' || v === 'exec' || v === 'invoke' || v === 'agent';
        let picked: Verb | undefined = isVerb(request.verb) ? request.verb : undefined;
        picked ??= await pickVerb(`Insert between \`${request.from}\` → \`${request.to}\``);
        if (!picked) { return; }
        const tool = picked === 'invoke' && typeof request.tool === 'string'
          ? request.tool
          : undefined;
        const res = insertBetween(text, request.from, request.to, picked, tool);
        if (res) {
          newText = res.text;
          revealTask = res.taskId;
        }
        break;
      }
      case 'dag:editModel': {
        const model = await pickModel(service, text, request.taskId);
        if (!model) { return; }
        newText = setTaskModel(text, request.taskId, model);
        if (newText === undefined) {
          void window.showWarningMessage(`Nika: could not set the model on \`${request.taskId}\` (unknown task or bad provider/model shape).`);
          return;
        }
        revealTask = request.taskId;
        break;
      }
      case 'dag:omni': {
        // `+ <verb|tool> [after id]` adds deterministically — the same
        // vocabulary as the task palette (`+ jq after gather` lands an
        // invoke pinned to nika:jq); anything else routes to the
        // oracle-checked generate pipeline.
        const add = parseOmniAdd(
          request.text,
          new Set(Object.keys(service.toolCats ?? {})),
        );
        if (add) {
          const res = insertTaskSkeleton(text, add.verb, add.after, add.tool);
          if (res) {
            newText = res.text;
            revealTask = res.taskId;
          }
          break;
        }
        await commands.executeCommand('nika.generateWorkflow', request.text);
        return;
      }
      case 'dag:connect':
        // Edge from → to means « to runs after from » — the canvas
        // gesture writes the strict control default (succeeded); the
        // data door stays with: (the binding is authored, not drawn).
        // Idempotent.
        newText = addAfterEntry(text, request.to, request.from);
        break;
      case 'dag:disconnect':
        // Control edges only — a with: binding is a ref the body
        // reads, never blind-deleted from a canvas gesture.
        newText = removeAfterEntry(text, request.to, request.from);
        break;
      case 'dag:deleteTask': {
        const res = deleteTask(text, request.taskId);
        if (res && 'blockedBy' in res) {
          void window.showWarningMessage(
            `Nika: \`${request.taskId}\` is still referenced by ${res.blockedBy.map((b) => `\`${b}\``).join(' · ')} — detach those first.`,
          );
          return;
        }
        if (res) {
          const confirm = await window.showWarningMessage(
            `Delete task \`${request.taskId}\`?`,
            { modal: true },
            'Delete',
          );
          if (confirm !== 'Delete') { return; }
          newText = res.text;
        }
        break;
      }
      case 'dag:duplicateTask': {
        const res = duplicateTask(text, request.taskId);
        if (res) {
          newText = res.text;
          revealTask = res.taskId;
        }
        break;
      }
    }
    if (newText === undefined || newText === text) { return; }

    const edit = new WorkspaceEdit();
    edit.replace(uri, new Range(0, 0, doc.lineCount, 0), newText);
    await workspace.applyEdit(edit);

    // Refresh the projection from the edited (dirty) document.
    service.invalidate(uri.toString());
    const fresh = await workspace.openTextDocument(uri);
    const graph = await loadGraphFor(fresh);
    dagPanel.loadGraph(graph);
    if (revealTask) { dagPanel.focusNode(revealTask); }

    // Narrate the edit (the feed tells the session's story).
    switch (request.kind) {
      case 'dag:addTask':
        dagPanel.note('＋', `task added${revealTask ? ` · ${revealTask}` : ''}`, revealTask, 'st-note');
        break;
      case 'dag:connect':
        dagPanel.note('⌥', `${request.to} now depends on ${request.from}`, request.to, 'st-note');
        break;
      case 'dag:disconnect':
        dagPanel.note('⌥', `${request.to} no longer depends on ${request.from}`, request.to, 'st-note');
        break;
      case 'dag:deleteTask':
        dagPanel.note('✕', `task deleted · ${request.taskId}`, undefined, 'st-note');
        break;
      case 'dag:duplicateTask':
        dagPanel.note('❏', `task duplicated · ${request.taskId} → ${revealTask ?? '?'}`, revealTask, 'st-note');
        break;
      case 'dag:insertOnEdge':
        dagPanel.note('＋', `${revealTask ?? '?'} spliced into ${request.from} → ${request.to}`, revealTask, 'st-note');
        break;
      case 'dag:editModel':
        // Δ = the what-changed family (glyphRegistry) — ⌁ stays the
        // when:-gate's own mark, never a change note.
        dagPanel.note('Δ', `model changed · ${request.taskId}`, request.taskId, 'st-note');
        break;
      case 'dag:omni':
        dagPanel.note('＋', `task added from the bar${revealTask ? ` · ${revealTask}` : ''}`, revealTask, 'st-note');
        break;
    }
  };

  // Post-run stale refresh: recompute against the just-updated sidecar
  // and repaint BADGES only (the run's painted statuses must survive).
  // ADR-099 answer flow: the paused run asked a question — ask the HUMAN
  // with the right control for the mode (confirm → pick · choice → pick
  // of the workflow's own options · input → box), then resume the exact
  // journal the engine announced, injecting `--answer task=value`.
  // One-shot ledger: a pause answered THIS session must not silently
  // re-fire from a stale notification — the gate guards side effects,
  // and a forced re-answer re-EXECUTES everything downstream (ADR-099:
  // --answer forces the prompt past its cache hit).
  const answeredPauses = new Set<string>();
  const answerPausedRun = async (
    fsPath: string,
    paused: { task: string; mode: string; message?: string; choices?: string[]; tracePath?: string },
  ): Promise<void> => {
    const question = paused.message ?? `Answer for task \`${paused.task}\``;
    // The pure routing seam (pauseAnswer.ts · pinned by tests): confirm →
    // Yes/No · choice WITH parsed options → the workflow's own picker ·
    // everything else (input · choice-without-options · unknown future
    // modes) → the INPUT BOX — a string is engine-validated against the
    // gate's own contract, while a boolean would fail a choice gate
    // every time. Values ride encodeAnswer (text stays text).
    const control = answerControlFor(paused.mode, paused.choices?.length ?? 0);
    let value: string | undefined;
    if (control === 'input') {
      const raw = await window.showInputBox({ prompt: question, ignoreFocusOut: true });
      value = raw === undefined ? undefined : encodeAnswer('input', raw);
    } else if (control === 'choice') {
      const pick = (await window.showQuickPick(paused.choices!, { placeHolder: question, ignoreFocusOut: true })) ?? undefined;
      value = pick === undefined ? undefined : encodeAnswer('choice', pick);
    } else {
      const pick = await window.showQuickPick(
        [
          { label: '$(check) Yes', value: 'true' },
          { label: '$(x) No', value: 'false' },
        ],
        { placeHolder: question, ignoreFocusOut: true },
      );
      value = pick?.value;
    }
    if (value === undefined) { return; }
    // The singleton supersede: launching ANY run kills the in-flight one
    // (module-level activeRun). A background notification click is a
    // non-obvious trigger for that — warn instead of silently killing
    // someone's live inference spend (the 0.97.0 review's finding).
    if (isRunActive()) {
      const go = await window.showWarningMessage(
        'Nika: a run is in flight — answering now will cancel it.',
        'Answer anyway',
      );
      if (go !== 'Answer anyway') { return; }
    }
    // The paused record carries its OWN journal (captured at pause time) —
    // the by-workflow map is live and any run since (a mock preview
    // included) would have repointed it at the wrong file.
    const trace = paused.tracePath ?? lastTracePathByWorkflow.get(fsPath);
    if (!trace || !fs.existsSync(trace)) {
      void window.showWarningMessage('Nika: the paused journal was not found — resume from the Runs view instead.');
      return;
    }
    if (answeredPauses.has(trace)) {
      const again = await window.showWarningMessage(
        'Nika: this pause was already answered — answering again RE-RUNS the gated side effects.',
        'Answer again',
      );
      if (again !== 'Answer again') { return; }
    }
    answeredPauses.add(trace);
    runWorkflowLive(service, dagPanel, fsPath, log, undefined, {
      extraArgs: ['--resume', trace, '--answer', `${paused.task}=${value}`],
      onClose: () => refreshStaleBadges(fsPath),
      onPaused: (next) => { void onRunPaused(fsPath, next); },
    });
  };
  // The pause NOTIFICATION — the question itself is the message; one
  // button starts the answer flow (never a modal, never auto-answered);
  // « Show node » deep-links to the waiting card on the canvas
  // (annexe B #5 — the needs-you toast lands you AT the ask).
  const onRunPaused = async (
    fsPath: string,
    paused: { task: string; mode: string; message?: string; choices?: string[]; tracePath?: string },
  ): Promise<void> => {
    const q = paused.message ?? `task \`${paused.task}\` awaits an answer`;
    const choice = await window.showInformationMessage(`Nika paused — ${q}`, 'Answer…', 'Show node');
    if (choice === 'Answer…') { await answerPausedRun(fsPath, paused); }
    if (choice === 'Show node') {
      dagPanel.show();
      dagPanel.focusNode(paused.task);
    }
  };

  const refreshStaleBadges = (fsPath: string): void => {
    try {
      const text = fs.readFileSync(fsPath, 'utf-8');
      const dirty = computeDirty(text, loadRecordedHashes(fsPath));
      dagPanel.staleUpdate([...dirty.stale], [...dirty.direct]);
    } catch {
      // Garnish law.
    }
    // The run that just closed wrote its trace — its artifacts land on
    // the cards NOW (the after-story in pixels, statuses untouched).
    void (async () => {
      try {
        const ids = dagPanel.currentGraphIds();
        if (!ids || ids.size === 0) { return; }
        const trace = await latestTraceForGraph(ids);
        if (!trace) { return; }
        const arts = collectCardArtifacts(trace.ndjson, trace.fsPath);
        if (arts.size > 0) { dagPanel.artifactsUpdate([...arts.values()]); }
      } catch {
        // Garnish law — a close must never throw on its epilogue.
      }
    })();
  };

  const dagPanel = new DagPanel(
    context.extensionUri,
    jumpToTask,
    (request) => { void applyDagEdit(request); },
    () => { void commands.executeCommand('nika.showDag'); },
    {
      get: () => context.workspaceState.get<number>('nika.dagColumn'),
      set: (column) => { void context.workspaceState.update('nika.dagColumn', column); },
    },
    // Canvas ▶/▶mock — preview streams `run --model mock/echo` (zero
    // keys); a normal run rides the full capability-gated command.
    (preview, workflowUri, resume) => {
      void (async () => {
        if (resume) {
          await resumeWorkflowFlow(workflowUri ?? dagWorkflowUri);
          return;
        }
        const doc = await requireNikaDocument(workflowUri ?? dagWorkflowUri);
        if (!doc) { return; }
        if (!preview) {
          await commands.executeCommand('nika.runWorkflow', doc.uri);
          return;
        }
        if (!service.caps.run) {
          void informSoftly('binary-predates-run', 'Nika: this binary predates `run` — update it to preview workflows.');
          return;
        }
        if (doc.uri.scheme !== 'file') { return; }
        // Preview runs the file on disk too — save so mock lights the
        // graph the editor shows, and fingerprints match what ran.
        if (doc.isDirty) { await doc.save(); }
        dagWorkflowUri = doc.uri;
        const graph = await loadGraphFor(doc);
        dagPanel.show(graph);
        runWorkflowLive(service, dagPanel, doc.uri.fsPath, log, undefined, {
          extraArgs: ['--model', 'mock/echo'],
          onClose: () => refreshStaleBadges(doc.uri.fsPath),
          onPaused: (paused) => { void onRunPaused(doc.uri.fsPath, paused); },
        });
      })();
    },
    () => cancelActiveRun(),
    // Card actions ▸ — the CodeLens lever, reachable from the canvas: ONE
    // task + its upstream cone through the same rerunTask flow.
    (taskId, workflowUri) => {
      void commands.executeCommand(
        'nika.rerunTask',
        workflowUri ?? dagWorkflowUri,
        taskId,
      );
    },
    // The red teaches (wave G): the failed card's code → the explain
    // doc (the SAME pedagogy the editor's quick fix opens).
    (code) => { void commands.executeCommand('nika.explainCode', code); },
    // Failed card ⑂ — fork from THIS task: the newest trace for the
    // open graph rehydrates upstream (the Runs-view lever, reachable
    // where the failure is actually seen).
    (taskId, _workflowUri) => {
      void (async () => {
        const ids = dagPanel.currentGraphIds();
        const latest = ids ? await latestTraceForGraph(ids) : undefined;
        if (!latest) {
          void window.showWarningMessage('Nika: no recorded run to fork from yet.');
          return;
        }
        await commands.executeCommand('nika.forkFromTask', {
          traceUri: Uri.file(latest.fsPath),
          taskId,
        });
      })();
    },
    // The timeline lens (L1): the webview asks, the extension builds
    // the truth — the newest recorded trace for the OPEN graph folds
    // into wave-ordered rows (real clocks · retry ladders · the $
    // column) and posts back. One mechanism: the same fold the Runs
    // view and the replay read.
    (_timelineUri) => {
      void (async () => {
        const ids = dagPanel.currentGraphIds();
        const latest = ids ? await latestTraceForGraph(ids) : undefined;
        if (!latest) {
          void window.setStatusBarMessage('Nika: no recorded run yet — the timeline reads recorded truth', 4000);
          dagPanel.postTimeline({ rows: [], startMs: 0, spanMs: 1 });
          return;
        }
        const model = foldTrace(latest.ndjson);
        const ladders = attemptLadders(latest.ndjson);
        const waves = topoWaves(
          [...(ids ?? new Set<string>())].map((id) => ({ id })),
          dagPanel.currentGraphEdges(),
        );
        dagPanel.postTimeline(buildTimeline(model, ladders, waves, dagPanel.currentGraphAvgs()));
      })();
    },
    // The welcome surface (empty canvas) — open recent · WHITELISTED
    // command · describe → the oracle-checked generate flow.
    (msg) => {
      void (async () => {
        if (msg.kind === 'welcome:open') {
          // The uri is webview-supplied and untrusted: open ONLY a
          // workflow the extension surfaced (capability, not a filter).
          // An unsurfaced uri is a compromised canvas probing for an
          // arbitrary file read — refuse quietly (an anomaly, not a
          // user error): a discreet log line, no toast.
          if (!welcomeOpenAllowed(msg.uri, welcomeSurfaced)) {
            log('WARN', 'welcome:open refused a uri the canvas was not shown');
            return;
          }
          const doc = await workspace.openTextDocument(Uri.parse(msg.uri));
          await window.showTextDocument(doc, { preview: false });
          await commands.executeCommand('nika.showDag');
          return;
        }
        if (msg.kind === 'welcome:describe') {
          await commands.executeCommand('nika.generateWorkflow', msg.text);
          return;
        }
        if (WELCOME_COMMANDS.has(msg.command)) {
          await commands.executeCommand(msg.command);
        }
      })();
    },
    // Empty canvas shown → push the recent list (async, degrades silent).
    () => { void state.pushWelcomeData?.(); },
    // Composition chip ⎘ — resolve the child path against the PARENT
    // workflow's directory (the path is as-written, usually relative).
    // `workflowUri` is the panel's OWN shown-graph uri (host-authoritative
    // · never the webview's echo — see the dag:openSub dispatch guard); the
    // activeTextEditor fallback is reached ONLY for a uri-less client sketch.
    (path, workflowUri) => {
      void (async () => {
        const parent = workflowUri ?? window.activeTextEditor?.document.uri.toString();
        const base = parent !== undefined
          ? Uri.joinPath(Uri.parse(parent), '..')
          : workspace.workspaceFolders?.[0]?.uri;
        const target = path.startsWith('/')
          ? Uri.file(path)
          : base !== undefined ? Uri.joinPath(base, path) : undefined;
        if (!target) { return; }
        // Grow the dive trail: seed the parent on the first jump; a
        // re-dive from a mid-trail parent truncates the deeper tail.
        if (parent !== undefined) {
          const pi = compTrail.findIndex((seg) => seg.uri === parent);
          if (pi === -1) {
            compTrail = [{ label: labelOf(Uri.parse(parent)), uri: parent }];
          } else {
            compTrail = compTrail.slice(0, pi + 1);
          }
          if (compTrail[compTrail.length - 1]?.uri !== target.toString()) {
            compTrail.push({ label: labelOf(target), uri: target.toString() });
          }
        }
        try {
          const doc = await workspace.openTextDocument(target);
          await window.showTextDocument(doc);
        } catch {
          // The write belt (the ONLY webview-reachable write): the sub
          // ref is dispatch-gated (surfaced set · raw string), and the
          // create is offered ONLY when the RESOLVED target sits inside
          // the workspace with the exact workflow extension — a `..`-
          // riding ref normalizes outside and never gets the button.
          if (!subCreateAllowed({
            path: target.path,
            inWorkspace: workspace.getWorkspaceFolder(target) !== undefined,
          })) {
            log('WARN', 'openSub: create refused outside the workspace');
            void window.showWarningMessage(`Nika: the sub-workflow does not exist yet — ${path}`);
            return;
          }
          void window
            .showWarningMessage(`Nika: the sub-workflow does not exist yet — ${path}`, 'Create it')
            .then(async (pick) => {
              if (pick !== 'Create it') { return; }
              const name = path.split('/').pop()?.replace(/\.nika\.yaml$/, '') ?? 'sub';
              await workspace.fs.writeFile(target, Buffer.from(
                `# yaml-language-server: $schema=https://nika.sh/spec/v1/workflow.schema.json\nnika: v1\nworkflow:\n  id: ${name}\n\nmodel: mock/echo\n\ntasks:\n  start:\n    infer:\n      prompt: ""\n`,
                'utf-8',
              ));
              const doc = await workspace.openTextDocument(target);
              await window.showTextDocument(doc);
            });
        }
      })();
    },
    // Breadcrumb crumb click — open that document; the follow handler
    // repaints the graph and re-posts the trail with the new active.
    (uri) => {
      void (async () => {
        try {
          const doc = await workspace.openTextDocument(Uri.parse(uri));
          await window.showTextDocument(doc);
        } catch { /* a deleted trail file — the next follow clears it */ }
      })();
    },
    // Cross-session ELK layout cache (the columnStore pattern): the
    // webview's LRU seeds from workspaceState at dag:ready and flushes
    // back debounced — layouts survive panel disposal without re-ELK.
    {
      get: () => context.workspaceState.get<PersistedLayoutEntry[]>('nika.layoutCache.v1'),
      set: (entries) => { void context.workspaceState.update('nika.layoutCache.v1', entries); },
    },
  );
  state.activeDagPanel = dagPanel;

  // ─── The missing wire (V-SOTA.A): first contact runs the demo itself ──────
  // On a machine's FIRST activation ever, once the engine is here (at the
  // first probe, or the moment Finish Setup lands it mid-session), the demo
  // opens AND runs on mock/echo — zero key · zero network · zero spend, so
  // consent is trivially satisfied and the on-canvas banner names the state.
  // The DAG lights itself in under ten seconds; the walkthrough follows as
  // optional depth (the create/run/dag steps already checked by the run).
  // Guard: a workspace already carrying *.nika.yaml is an existing user's
  // territory — never auto-open there (core/firstContact.ts pins the table
  // and the gesture budget). Reduced-motion does NOT gate this: a real run
  // is content, not decoration.
  const maybeAutoRunDemo = async (): Promise<void> => {
    if (!firstContactArmed || autoDemoFlown) { return; }
    if (!service.available) {
      // Engine not here yet — the current flow greets (door + walkthrough)
      // and the wire STAYS armed for a binary landing this session.
      offerWalkthroughOnce();
      return;
    }
    autoDemoFlown = true; // claim the one shot BEFORE any await (double-fire guard)
    const existing = await workspace.findFiles('**/*.nika.{yaml,yml}', '**/node_modules/**', 1);
    const move = firstContactMove({
      armed: true,
      flown: false,
      binaryAvailable: true,
      workspaceHasWorkflows: existing.length > 0,
    });
    if (move !== 'auto-demo') {
      offerWalkthroughOnce();
      return;
    }
    const target = await commands.executeCommand<Uri | undefined>('nika.tryDemo');
    if (!target) {
      offerWalkthroughOnce();
      return;
    }
    runWorkflowLive(service, dagPanel, target.fsPath, log, undefined, {
      extraArgs: ['--model', 'mock/echo'],
      onClose: () => {
        refreshStaleBadges(target.fsPath);
        // The depth, offered AFTER the aha — beside the green DAG.
        offerWalkthroughOnce();
      },
      onPaused: (paused) => { void onRunPaused(target.fsPath, paused); },
    });
    // Posted AFTER the spawn: run:state claims the verdict spot on start,
    // so this lands on top of it — the honest « what is happening » state,
    // visible on the canvas while the demo streams (never a toast).
    dagPanel.runVerdict('▶', 'offline demo — mock provider, no keys', 'st-running');
  };
  context.subscriptions.push(service.onDidChange(() => {
    maybeAutoRunDemo().catch((e) => {
      // A failed wire never dead-ends the first contact: say so in the
      // log and fall back to the greeting (the demo stays one gesture).
      log('WARN', `first-contact auto-demo failed: ${String(e)}`);
      offerWalkthroughOnce();
    });
  }));

  // Native right-click on a canvas card: the node group carries
  // data-vscode-context (webviewSection 'nikaTask'), VS Code renders a
  // REAL context menu (package.json webview/context) and hands each
  // command the parsed context — the same levers the canvas gestures
  // already use (rerunTask · applyDagEdit · jumpToTask), zero DOM menus.
  type CanvasMenuCtx = { taskId?: string; workflowUri?: string } | undefined;
  context.subscriptions.push(
    commands.registerCommand('nika.canvas.runTask', (ctx: CanvasMenuCtx) => {
      if (!ctx?.taskId) { return; }
      void commands.executeCommand('nika.rerunTask', ctx.workflowUri ?? dagWorkflowUri, ctx.taskId);
    }),
    commands.registerCommand('nika.canvas.duplicateTask', (ctx: CanvasMenuCtx) => {
      if (!ctx?.taskId) { return; }
      void applyDagEdit({ kind: 'dag:duplicateTask', taskId: ctx.taskId, workflowUri: ctx.workflowUri });
    }),
    commands.registerCommand('nika.canvas.deleteTask', (ctx: CanvasMenuCtx) => {
      if (!ctx?.taskId) { return; }
      void applyDagEdit({ kind: 'dag:deleteTask', taskId: ctx.taskId, workflowUri: ctx.workflowUri });
    }),
    commands.registerCommand('nika.canvas.openYaml', (ctx: CanvasMenuCtx) => {
      if (!ctx?.taskId) { return; }
      jumpToTask(ctx.taskId, ctx.workflowUri);
    }),
    commands.registerCommand('nika.canvas.copyTaskId', (ctx: CanvasMenuCtx) => {
      if (!ctx?.taskId) { return; }
      void env.clipboard.writeText(ctx.taskId);
    }),
    commands.registerCommand('nika.canvas.focusTask', (ctx: CanvasMenuCtx) => {
      if (!ctx?.taskId) { return; }
      dagPanel.focusNode(ctx.taskId);
    }),
    commands.registerCommand('nika.canvas.renameTask', (ctx: CanvasMenuCtx) => {
      void (async () => {
        if (!ctx?.taskId) { return; }
        const doc = await requireNikaDocument(ctx.workflowUri ?? dagWorkflowUri);
        if (!doc) { return; }
        const text = doc.getText();
        const oldId = ctx.taskId;
        const newId = await window.showInputBox({
          title: `Rename task \`${oldId}\``,
          value: oldId,
          prompt: 'Every reference follows — ${{ tasks.X }} islands · after: entries.',
          validateInput: (v) => {
            if (!/^[a-z][a-z0-9_]*$/.test(v)) { return 'snake_case — ^[a-z][a-z0-9_]*$'; }
            if (v !== oldId && findTaskRefs(text, v).length > 0) {
              return `\`${v}\` already exists (or is referenced) in this workflow`;
            }
            return undefined;
          },
        });
        if (!newId || newId === oldId) { return; }
        const renamed = renameTask(text, oldId, newId);
        if (renamed === undefined) {
          void window.showWarningMessage(`Nika: could not rename \`${oldId}\` — task not found.`);
          return;
        }
        const edit = new WorkspaceEdit();
        edit.replace(doc.uri, new Range(0, 0, doc.lineCount, 0), renamed);
        await workspace.applyEdit(edit);
        service.invalidate(doc.uri.toString());
        const fresh = await workspace.openTextDocument(doc.uri);
        dagPanel.loadGraph(await loadGraphFor(fresh));
        dagPanel.focusNode(newId);
        dagPanel.note('✎', `task renamed · ${oldId} → ${newId}`, newId, 'st-note');
      })();
    }),
  );

  // The webview's running-set feed → the YAML highlight (replay + live).
  // A panel with NO workflow uri (trace-synthesized graph) must never
  // wildcard-paint every visible nika file — scope or clear, nothing else.
  dagPanel.onTransportTick = (running) => {
    const uri = dagPanel.currentWorkflowUri();
    if (!uri) {
      paintRunningSpans(undefined, []);
      return;
    }
    paintRunningSpans(Uri.parse(uri).fsPath, running);
  };
  // The preflight chip's click → the full flight-plan document.
  dagPanel.onOpenPreflight = () => {
    void commands.executeCommand('nika.preflightWorkflow', dagWorkflowUri);
  };

  // Canvas glyphs speak the binary's vocabulary (`nika tools --json`) —
  // seeded now, refreshed whenever the service re-probes the binary.
  dagPanel.setToolCats(service.toolCats);
  context.subscriptions.push(service.onDidChange(() => {
    dagPanel.setToolCats(service.toolCats);
  }));

  // Recent workflows for the welcome (mtime-sorted · top 6 · rel labels).
  state.pushWelcomeData = async (): Promise<void> => {
    try {
      const files = await workspace.findFiles('**/*.nika.yaml', '**/node_modules/**', 30);
      const stats = await Promise.all(files.map(async (f) => {
        try {
          const st = await workspace.fs.stat(f);
          return { uri: f, mtime: st.mtime };
        } catch {
          return undefined;
        }
      }));
      const picked = stats
        .filter((v): v is { uri: Uri; mtime: number } => v !== undefined)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 6);
      const recent = await Promise.all(picked.map(async (v) => {
        const row: { name: string; uri: string; rel: string; skeleton?: { nodes: Array<{ id: string; verb: string; wave: number }>; edges: Array<{ source: string; target: string }> } } = {
          name: v.uri.path.split('/').pop() ?? v.uri.path,
          uri: v.uri.toString(),
          rel: relTime(v.mtime),
        };
        // The gallery thumbnail (L5): each file's OWN projection in
        // miniature — the peek renderer's data, same bounds, same
        // garnish law (a broken file keeps its plain row).
        try {
          const rowDoc = await workspace.openTextDocument(v.uri);
          const dag = await service.dagForDocument(rowDoc);
          if (dag.nodes.length > 0 && dag.nodes.length <= 30) {
            const rowWaves = topoWaves(dag.nodes, dag.edges);
            const rowWaveOf = new Map<string, number>();
            rowWaves.forEach((wave, w) => { for (const id of wave) { rowWaveOf.set(id, w); } });
            row.skeleton = {
              nodes: dag.nodes.map((n) => ({ id: n.id, verb: n.verb, wave: rowWaveOf.get(n.id) ?? 0 })),
              edges: dag.edges.map((e) => ({ source: e.source, target: e.target })),
            };
          }
        } catch { /* plain row */ }
        return row;
      }));
      // Record the capability for the open gate: the webview may open
      // exactly these workflows (nothing else) until the next push.
      welcomeSurfaced = new Set(recent.map((r) => r.uri));
      dagPanel.welcomeData(recent, !service.available);
    } catch {
      // The welcome degrades to actions-only — never an error surface.
    }
  };

  // Δ re-run what changed — `run --resume <newest trace>` (ADR-099). The
  // ENGINE decides the dirty slice by def_hash/input_hash; unchanged
  // tasks cache-hit their recorded output. ONE flow shared by the canvas
  // Δ button and the `nika.resumeWorkflow` palette command.
  async function resumeWorkflowFlow(uriLike?: Uri | string): Promise<void> {
    const doc = await requireNikaDocument(uriLike ?? dagWorkflowUri);
    if (!doc) { return; }
    if (!service.caps.resume) {
      void informSoftly(
        'binary-predates-resume',
        'Nika: this binary predates `run --resume` (the 0.93 line) — update it to re-run only what changed.',
      );
      return;
    }
    if (doc.isDirty) { await doc.save(); }
    if (doc.uri.scheme !== 'file') { return; }
    const trace = latestTraceFor(doc.uri.fsPath);
    if (!trace) {
      // Diet: narration of an automatic fallback — a flash, the run
      // itself is the visible answer.
      flashStatus('$(play) no recorded run to resume from — running the whole workflow');
      await commands.executeCommand('nika.runWorkflow', doc.uri);
      return;
    }
    dagWorkflowUri = doc.uri;
    const graph = await loadGraphFor(doc);
    dagPanel.show(graph);
    runWorkflowLive(service, dagPanel, doc.uri.fsPath, log, undefined, {
      extraArgs: ['--resume', trace],
      onClose: () => refreshStaleBadges(doc.uri.fsPath),
      onPaused: (paused) => { void onRunPaused(doc.uri.fsPath, paused); },
    });
  }

  // Session narration → the activity feed (check verdicts · live when the
  // panel shows THIS workflow). onDidUpdateDocument fires for BOTH check
  // and graph completions — dedupe on the verdict so one edit narrates once.
  let lastCheckNote = '';
  const costBaselines = new CostBaselineTracker(service);
  context.subscriptions.push(
    service.onDidUpdateDocument((uriString) => {
      if (!dagPanel.hasPanel || dagWorkflowUri?.toString() !== uriString) { return; }
      // Mid-switch TOCTOU: dagWorkflowUri is reassigned BEFORE the new
      // graph reaches the panel (loadGraphFor is async) — without this,
      // the incoming file's audit/cost would paint the OUTGOING graph.
      const shown = dagPanel.currentWorkflowUri();
      if (shown !== undefined && shown !== uriString) { return; }
      const report = service.peekCheck(uriString)?.report;
      if (!report) { return; }
      // Per-card audit badges: the static-check moat surfaced on the
      // cards (⚠N · worst severity · click → report). Pushed on every
      // check completion, even a clean one (clears stale badges).
      const unified = collectFindings(report);
      const rollup = auditByTask(unified);
      // NIKA-DAG-006 — the engine PROVED the gate false under every
      // reachable combination: the card wears « never runs » as a fact.
      const deadGates = [...new Set(unified
        .filter((f) => f.code === 'NIKA-DAG-006' && f.task !== undefined)
        .map((f) => f.task as string))];
      dagPanel.auditUpdate(
        [...rollup].map(([taskId, a]) => ({ taskId, count: a.count, worst: a.worst })),
        deadGates,
      );
      // Static cost forecast on the run pill (forecasting on the wire —
      // audited before a token is spent · honest about unbounded).
      const forecast = costForecast(report.cost);
      dagPanel.costUpdate(forecast ?? null);
      // Preflight verdict chip — the glanceable half of the flight plan
      // (missing keys/secrets = red · flows = amber · ready = green).
      // Async only for the catalog memo; same TOCTOU re-guards as delta.
      void (async () => {
        const docText = workspace.textDocuments
          .find((d) => d.uri.toString() === uriString)?.getText();
        if (docText === undefined) { return; }
        const catalog = await catalogKeys();
        if (!dagPanel.hasPanel || dagWorkflowUri?.toString() !== uriString) { return; }
        if (service.peekCheck(uriString)?.report !== report) { return; }
        const model = buildPreflight({
          workflowName: '',
          facts: report.requirements !== undefined
            ? factsFromRequirements(report.requirements, docText)
            : collectPreflightFacts(docText),
          report,
          catalog,
          envPresent: (n) => (process.env[n] ?? '').length > 0,
        });
        dagPanel.preflightUpdate(preflightChipModel(model));
      })();
      // The check refreshed static costs → est badges may have changed.
      runDecor.repaint();
      // Enrichment pass (Infracost lesson): the CHANGE vs the last commit
      // is the review signal. Async — the chip lands instantly above, the
      // delta rides in when the git baseline resolves (cached per HEAD).
      if (forecast && uriString.startsWith('file:')) {
        void (async () => {
          const fsPath = Uri.parse(uriString).fsPath;
          const delta = costDelta(report.cost, await costBaselines.baselineFor(fsPath));
          if (!delta) { return; }
          // Re-check the guards — the panel may have switched files (or
          // a newer check may have landed) while the baseline resolved.
          if (!dagPanel.hasPanel || dagWorkflowUri?.toString() !== uriString) { return; }
          const nowShown = dagPanel.currentWorkflowUri();
          if (nowShown !== undefined && nowShown !== uriString) { return; }
          if (service.peekCheck(uriString)?.report !== report) { return; }
          dagPanel.costUpdate({ ...forecast, delta });
        })();
      }
      const findings = countReportFindings(report);
      const verdict = `${uriString}#${findings}`;
      if (verdict === lastCheckNote) { return; }
      lastCheckNote = verdict;
      if (findings === 0) {
        // The taught moment (friction census · in-canvas, never a
        // toast): a clean check is the READY state — say the next move.
        dagPanel.note('✓', 'check clean — ready to run ▶ (R · or mock M, zero keys)', undefined, 'st-success');
      } else {
        dagPanel.note('✗', `check · ${findings} finding${findings === 1 ? '' : 's'} — each teaches its fix (Shift+Enter for the report)`, undefined, 'st-failed');
      }
    }),
  );
  context.subscriptions.push(dagPanel);
  context.subscriptions.push(new LiveDag(service, dagPanel));
  // A live run must never paint a disposed panel (or outlive the session).
  context.subscriptions.push({ dispose: () => cancelActiveRun() });
  context.subscriptions.push(
    window.registerWebviewPanelSerializer(
      DagPanel.viewType,
      new DagPanelSerializer(dagPanel),
    ),
  );

  // Register all commands SYNCHRONOUSLY before any async work.

  context.subscriptions.push(
    commands.registerCommand('nika.openTaskLocation', (uri: Uri, line: number) => {
      const pos = new Position(line, 0);
      window.showTextDocument(uri, { selection: new Range(pos, pos), preview: false });
    }),
  );

  // Command: Run current workflow (capability-gated · honest when pending)
  context.subscriptions.push(
    // Command: re-run ONE task + its upstream cone (the CodeLens lever ·
    // engine `run --task` — the full-file audit still happens engine-side).
    commands.registerCommand('nika.rerunTask', async (uri: Uri | string, taskId: string) => {
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      if (doc.isDirty) { await doc.save(); }
      dagWorkflowUri = doc.uri;
      const graph = await service.dagForDocument(doc);
      dagPanel.show(graph);
      runWorkflowLive(service, dagPanel, doc.uri.fsPath, log, taskId, {
        onPaused: (paused) => { void onRunPaused(doc.uri.fsPath, paused); },
      });
    }),
    // Command: Δ resume — the palette twin of the canvas button (ADR-099).
    commands.registerCommand('nika.resumeWorkflow', async (uri?: Uri) => {
      await resumeWorkflowFlow(uri);
    }),
    // Command: ⑂ fork-from-step — re-run FROM a recorded task: everything
    // upstream rehydrates from the trace (ADR-099 `--resume --from`), the
    // task and its downstream re-execute. Counterfactual iteration without
    // re-spending the cone above. Reached from a Runs-view task row or the
    // palette (trace picker → task picker).
    commands.registerCommand('nika.forkFromTask', async (item?: { traceUri?: Uri; taskId?: string }) => {
      if (!(await requireEngine(service, 'forking a run'))) { return; }
      let traceUri = item?.traceUri;
      let taskId = item?.taskId;
      if (!traceUri) {
        const glob = workspace.getConfiguration('nika').get<string>('traces.glob', '**/.nika/traces/*.ndjson');
        const files = await workspace.findFiles(glob, '**/node_modules/**', 30);
        const root = workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
        const sorted = files
          .map((f) => { try { return { f, m: fs.statSync(f.fsPath).mtimeMs }; } catch { return undefined; } })
          .filter((x): x is { f: Uri; m: number } => x !== undefined)
          .sort((a, b) => b.m - a.m);
        const pick = await window.showQuickPick(
          sorted.map(({ f }) => ({
            label: path.basename(f.fsPath),
            description: path.relative(root, f.fsPath),
            uri: f,
          })),
          { placeHolder: 'Fork from which recorded run?' },
        );
        if (!pick) { return; }
        traceUri = pick.uri;
      }
      let fold;
      try {
        fold = foldTrace(fs.readFileSync(traceUri.fsPath, 'utf-8'));
      } catch {
        void window
          .showWarningMessage(
            'Nika: this trace is unreadable — it may be truncated (a killed run) or from another engine generation.',
            'Reveal in Finder', 'Copy path',
          )
          .then((pick) => {
            if (pick === 'Reveal in Finder') { void commands.executeCommand('revealFileInOS', traceUri); }
            if (pick === 'Copy path') { void env.clipboard.writeText(traceUri.fsPath); }
          });
        return;
      }
      if (!taskId) {
        const pick = await window.showQuickPick(
          [...fold.tasks.values()].map((t) => ({
            label: t.id,
            description: [t.status, t.durationMs !== undefined ? `${(t.durationMs / 1000).toFixed(1)}s` : undefined]
              .filter(Boolean).join(' · '),
          })),
          { placeHolder: 'Fork from which task? It and its downstream re-run; upstream rehydrates from the trace.' },
        );
        if (!pick) { return; }
        taskId = pick.label;
      }
      // The workflow this trace belongs to — found, not demanded. The
      // journal stamps its workflow name on workflow_started: EXACT name
      // match is the law when present (an active sibling sharing task
      // ids can no longer hijack the fork — the 0.97.0 review's finding);
      // ambiguity asks, never silent-runs. The majority-overlap heuristic
      // survives only for nameless (truncated/foreign) journals.
      const overlapOf = (text: string): number => {
        const ids = new Set(parseRichWorkflow(text).tasks.map((t) => t.id));
        return fold.tasks.size === 0
          ? 0
          : [...fold.tasks.keys()].filter((id) => ids.has(id)).length / fold.tasks.size;
      };
      const wanted = fold.workflowName;
      let doc = activeNikaDocument();
      if (wanted !== undefined) {
        if (doc && parseRichWorkflow(doc.getText()).name !== wanted) { doc = undefined; }
        if (!doc) {
          const wfFiles = await workspace.findFiles('**/*.nika.yaml', '**/node_modules/**', 500);
          const matches: Uri[] = [];
          for (const f of wfFiles) {
            try {
              if (parseRichWorkflow(fs.readFileSync(f.fsPath, 'utf-8')).name === wanted) {
                matches.push(f);
              }
            } catch {
              // unreadable candidate — skip
            }
          }
          let chosen: Uri | undefined = matches.length === 1 ? matches[0] : undefined;
          if (matches.length > 1) {
            const root = workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
            const pick = await window.showQuickPick(
              matches.map((f) => ({ label: path.relative(root, f.fsPath), uri: f })),
              { placeHolder: `Several files declare workflow \`${wanted}\` — fork which one?` },
            );
            if (!pick) { return; }
            chosen = pick.uri;
          }
          if (chosen) {
            doc = await workspace.openTextDocument(chosen);
            await window.showTextDocument(doc, { preview: false });
          }
        }
      } else if (!doc || overlapOf(doc.getText()) < 0.5) {
        doc = undefined;
        const wfFiles = await workspace.findFiles('**/*.nika.yaml', '**/node_modules/**', 200);
        let best: { uri: Uri; score: number } | undefined;
        for (const f of wfFiles) {
          try {
            const score = overlapOf(fs.readFileSync(f.fsPath, 'utf-8'));
            if (score >= 0.5 && (best === undefined || score > best.score)) {
              best = { uri: f, score };
            }
          } catch {
            // unreadable candidate — skip
          }
        }
        if (best) {
          doc = await workspace.openTextDocument(best.uri);
          await window.showTextDocument(doc, { preview: false });
        }
      }
      if (!doc) {
        void window.showWarningMessage(
          wanted !== undefined
            ? `Nika: no workspace file declares workflow \`${wanted}\` — open the workflow this run came from.`
            : 'Nika: no workspace workflow matches this trace — open the workflow the run came from.',
        );
        return;
      }
      const ids = new Set(parseRichWorkflow(doc.getText()).tasks.map((t) => t.id));
      if (!ids.has(taskId)) {
        void window.showWarningMessage(`Nika: task \`${taskId}\` is not in the active workflow.`);
        return;
      }
      if (doc.isDirty) { await doc.save(); }
      dagWorkflowUri = doc.uri;
      dagPanel.show(await service.dagForDocument(doc));
      dagPanel.note('⑂', `fork from ${taskId} — upstream rehydrates from ${path.basename(traceUri.fsPath)}`, taskId, 'st-note');
      runWorkflowLive(service, dagPanel, doc.uri.fsPath, log, undefined, {
        extraArgs: ['--resume', traceUri.fsPath, '--from', taskId],
        onClose: () => refreshStaleBadges(doc.uri.fsPath),
        onPaused: (paused) => { void onRunPaused(doc.uri.fsPath, paused); },
      });
    }),
    // Command: dry-run — the engine's static plan, ZERO effects (spec §10).
    // A human surface (the engine refuses it with --json), so it rides the
    // terminal: audit → PLAN → mock → run → resume, the full ladder.
    commands.registerCommand('nika.dryRunWorkflow', async (uri?: Uri) => {
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      if (!service.caps.run) {
        void informSoftly('binary-predates-run', 'Nika: this binary predates `run` — update it to preview the execution plan.');
        return;
      }
      if (doc.isDirty) { await doc.save(); }
      runNikaCommand(state.resolvedServerPath, 'run --dry-run', doc.uri.fsPath);
    }),
    commands.registerCommand('nika.runWorkflow', async (uri?: Uri) => {
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      // The engine runs the file on disk — save first so it runs what the
      // editor (and the DAG) shows, and so the run's fingerprints record
      // the content that actually ran (not stale on-disk text).
      if (doc.isDirty) { await doc.save(); }
      if (service.caps.run) {
        // Live: paint `run --json`'s event stream onto the DAG in real
        // time (the overlay the panel was built for). A plain terminal
        // run stays one keystroke away via the palette for raw output.
        if (doc.uri.scheme === 'file'
          && workspace.getConfiguration('nika').get<boolean>('run.liveDag', true)) {
          dagWorkflowUri = doc.uri;
          const graph = await loadGraphFor(doc);
          dagPanel.show(graph);
          runWorkflowLive(service, dagPanel, doc.uri.fsPath, log, undefined, {
            onClose: () => refreshStaleBadges(doc.uri.fsPath),
            onPaused: (paused) => { void onRunPaused(doc.uri.fsPath, paused); },
          });
          return;
        }
        runNikaCommand(state.resolvedServerPath, 'run', doc.uri.fsPath);
        return;
      }
      // `run` has shipped in the engine (nika-runtime L3); this branch
      // is the OLD-binary path — the resolved binary predates it. Point
      // at the update, not at a "run is the future" framing that is no
      // longer true.
      const choice = await window.showInformationMessage(
        'Nika: this binary predates `run` — update it to execute workflows. Until then, audit before run.',
        'Check instead',
        'Update guide',
      );
      if (choice === 'Check instead') { await commands.executeCommand('nika.checkWorkflow', doc.uri); }
      if (choice === 'Update guide') { void env.openExternal(Uri.parse(GITHUB_INSTALL_URL)); }
    }),
  );

  // Command: Validate current workflow — diagnostics + report tab.
  context.subscriptions.push(
    commands.registerCommand('nika.checkWorkflow', async (uri?: Uri) => {
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      if (!service.caps.check) {
        // Old binary → terminal fallback. MISSING binary → the gate
        // (a "command not found" terminal is a dead end, not guidance).
        if (!(await requireEngine(service, 'checking a workflow'))) { return; }
        runNikaCommand(state.resolvedServerPath, 'check', doc.uri.fsPath);
        return;
      }
      service.invalidate(doc.uri.toString());
      diagnosticsController.refreshAll();
      lensProvider.refresh();
      const outcome = await service.checkDocument(doc);
      if (!outcome) { return; }
      if (outcome.report?.clean === true) {
        void window.setStatusBarMessage('$(pass-filled) nika check: clean', 4000);
      } else {
        await openNikaDoc('report', doc.uri.toString(), 'json');
      }
    }),
  );

  context.subscriptions.push(
    commands.registerCommand('nika.showReport', async (uri?: Uri) => {
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      await openNikaDoc('report', doc.uri.toString(), 'json');
    }),
  );

  // Command: Inspect anatomy in a terminal (tasks · verbs · cost · permits).
  context.subscriptions.push(
    commands.registerCommand('nika.inspectWorkflow', async (uri?: Uri) => {
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      if (!(await requireEngine(service, 'inspecting a workflow'))) { return; }
      runNikaCommand(state.resolvedServerPath, 'inspect', doc.uri.fsPath);
    }),
    // Command: deterministic workflow explanation (offline · zero LLM) —
    // the engine's graph+check projections composed into a readable
    // story: waves · cost ceiling · what it touches · structural risks.
    commands.registerCommand('nika.explainWorkflow', async (uri?: Uri) => {
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      // Engine ≥0.98 narrates files itself (the 30s arc) — ONE voice for
      // the story across terminal and editor, wires drawing included.
      // The client composer stays the pre-explain-binary fallback (the
      // brain-in-the-engine law: the projection swaps the moment the
      // binary carries the seam).
      if (service.caps.explainFile) {
        const res = await service.runDocCli(doc, (file) => ['explain', file]);
        if (res && res.code === 0 && res.stdout.trim().length > 0) {
          const preview = await workspace.openTextDocument({
            language: 'plaintext',
            content: res.stdout,
          });
          await window.showTextDocument(preview, { preview: true });
          return;
        }
        // A dirty/finding file falls through — the client path renders
        // its own conformance warning below.
      }
      let graph;
      try {
        graph = await service.dagForDocument(doc);
      } catch {
        graph = undefined;
      }
      if (!graph || graph.nodes.length === 0) {
        void window
          .showWarningMessage(
            'Nika: cannot explain — the graph did not parse.',
            'Open check report',
          )
          .then((pick) => {
            if (pick === 'Open check report') { void commands.executeCommand('nika.showReport'); }
          });
        return;
      }
      const md = explainWorkflow(graph, service.peekCheck(doc.uri.toString())?.report);
      const preview = await workspace.openTextDocument({ language: 'markdown', content: md });
      try {
        await commands.executeCommand('markdown.showPreview', preview.uri);
      } catch {
        await window.showTextDocument(preview, { preview: true });
      }
    }),
  );

  // Command: Preflight — the flight plan (cost · secrets · permits · keys)
  // BEFORE any token is spent. Every line derived: check --json + catalog
  // --json + the YAML + the environment as THIS process sees it. Nothing
  // executes; « declared » is never upgraded to « verified ».
  context.subscriptions.push(
    commands.registerCommand('nika.preflightWorkflow', async (uri?: Uri) => {
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      if (!(await requireEngine(service, 'preflighting a workflow'))) { return; }
      const outcome = await service.checkDocument(doc);
      let graph;
      try { graph = await service.dagForDocument(doc); } catch { graph = undefined; }
      const catalog = await catalogKeys();
      const rec = traceStore.get(doc.uri.fsPath);
      let lastRun: { durationMs?: number; costUsd?: number } | undefined;
      if (rec) {
        const tasks = [...rec.fold.tasks.values()];
        const starts = tasks.map((t) => t.startMs).filter((n): n is number => n !== undefined);
        const ends = tasks.map((t) => t.endMs).filter((n): n is number => n !== undefined);
        const cost = tasks.reduce((a, t) => a + (t.usd ?? 0), 0);
        lastRun = {
          durationMs: starts.length > 0 && ends.length > 0
            ? Math.max(...ends) - Math.min(...starts)
            : undefined,
          costUsd: cost > 0 ? cost : undefined,
        };
      }
      const md = renderPreflight(buildPreflight({
        workflowName: path.basename(doc.uri.fsPath).replace(/\.nika\.ya?ml$/i, ''),
        facts: outcome?.report?.requirements !== undefined
          ? factsFromRequirements(outcome.report.requirements, doc.getText())
          : collectPreflightFacts(doc.getText()),
        report: outcome?.report,
        graph,
        catalog,
        envPresent: (n) => (process.env[n] ?? '').length > 0,
        lastRun,
      }));
      const preview = await workspace.openTextDocument({ language: 'markdown', content: md });
      try {
        await commands.executeCommand('markdown.showPreview', preview.uri);
      } catch {
        await window.showTextDocument(preview, { preview: true });
      }
    }),
  );

  // Command: Insert the inferred permits: boundary (default-deny, one keystroke).
  context.subscriptions.push(
    commands.registerCommand('nika.inferPermits', async (uri?: Uri) => {
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      const permits = await service.inferPermits(doc);
      if (!permits) {
        if (!service.available) {
          void window
            .showWarningMessage('Nika: permits need the engine binary — it is not on this machine yet.', 'Finish setup')
            .then((pick) => { if (pick === 'Finish setup') { void commands.executeCommand('nika.finishSetup'); } });
        } else {
          void window
            .showWarningMessage('Nika: could not infer a permits boundary — the workflow did not parse.', 'Open check report')
            .then((pick) => { if (pick === 'Open check report') { void commands.executeCommand('nika.showReport'); } });
        }
        return;
      }
      const editor = await window.showTextDocument(doc);
      const rewritten = insertPermitsBlock(doc.getText(), permits);
      await editor.edit((b) => {
        b.replace(new Range(0, 0, doc.lineCount, 0), rewritten);
      });
      // Diet: the inserted block is visible in the editor — flash only.
      flashStatus('$(shield) inferred permits boundary inserted — the workflow is now default-deny');
    }),
  );

  // Command: Explain a NIKA-XXXX code (engine-embedded pedagogy).
  context.subscriptions.push(
    commands.registerCommand('nika.explainCode', async (code?: string) => {
      const value = code ?? await window.showInputBox({
        prompt: 'NIKA error code',
        placeHolder: 'NIKA-440 (or bare 440)',
      });
      if (!value) { return; }
      await openNikaDoc('explain', value.trim(), 'markdown');
    }),
  );

  // Command: Add Task — the task palette's vocabulary, from the editor.
  // One QuickPick: the 4 verbs, then every builtin as a pre-wired invoke
  // (binary-fed catalog when present · the fallback vocabulary offline).
  // Inserts AFTER the task under the cursor (end of file otherwise) and
  // lands the selection on the new id — the same skeleton the canvas
  // palette and the omni `+ jq after gather` produce.
  context.subscriptions.push(
    commands.registerCommand('nika.addTask', async () => {
      const doc = activeNikaDocument();
      if (!doc) {
        void window.showInformationMessage('Nika: open a .nika.yaml file first.');
        return;
      }
      const editor = window.visibleTextEditors.find(
        (e) => e.document.uri.toString() === doc.uri.toString(),
      );
      const text = doc.getText();
      const after = editor
        ? taskAtLine(parseRichWorkflow(text), editor.selection.active.line)?.id
        : undefined;

      const picks = buildAddTaskPicks(service.toolCats);
      const picked = await window.showQuickPick(
        picks.map((x) =>
          x.kind === 'separator'
            ? { label: x.label, kind: QuickPickItemKind.Separator }
            : { label: x.label, description: x.description, pick: x },
        ),
        {
          title: after ? `Nika: new task after \`${after}\`` : 'Nika: new task',
          placeHolder: 'a verb — or type a builtin (jq · fetch · write …) for a pre-wired invoke',
          matchOnDescription: true,
        },
      ) as { pick?: import('./core/addTaskPicks').AddTaskPick } | undefined;
      const pick = picked?.pick;
      if (!pick?.verb) { return; }

      const res = insertTaskSkeleton(text, pick.verb, after, pick.tool);
      if (!res) {
        void window.showWarningMessage('Nika: could not insert a task here (no tasks block?).');
        return;
      }
      const edit = new WorkspaceEdit();
      edit.replace(doc.uri, new Range(0, 0, doc.lineCount, 0), res.text);
      await workspace.applyEdit(edit);
      service.invalidate(doc.uri.toString());

      // Land ON the new id (the fresh doc — the edit may have grown it).
      const fresh = await workspace.openTextDocument(doc.uri);
      const shown = await window.showTextDocument(fresh, editor?.viewColumn);
      const at = fresh.getText().indexOf(`id: ${res.taskId}`);
      if (at >= 0) {
        const pos = fresh.positionAt(at + 4);
        shown.selection = new Selection(pos, fresh.positionAt(at + 4 + res.taskId.length));
        shown.revealRange(new Range(pos, pos), TextEditorRevealType.InCenter);
      }
    }),
  );

  // Command: New Session — the intent-first launcher (Cursor's « New
  // Agent » panel is a proprietary list nika cannot join; this is the
  // extension's own front door). State-aware: an equipped workspace
  // stops advertising setup, a binary-less one leads with install, and
  // the GUIDED WIZARD (the binary's own `nika new` on a TTY — a chat in
  // the terminal, a checked file out) sits at the top when available.
  context.subscriptions.push(
    commands.registerCommand('nika.openWalkthrough', () => {
      void commands.executeCommand(
        'workbench.action.openWalkthrough',
        'supernovae.nika-lang#nika.gettingStarted',
        false,
      );
    }),
    commands.registerCommand('nika.newSession', async () => {
      await refreshJourney();
      const picks = buildSessionPicks({
        hasFolder: currentJourney.workspaceOpen,
        equipped: currentJourney.equipped,
        binary: service.available,
        capNew: service.caps.newTemplate,
        capExamples: service.caps.examples,
      });
      const items = picks.map((x) =>
        x.kind === 'separator'
          ? { label: '', kind: QuickPickItemKind.Separator }
          : { label: x.label, description: x.description, pick: x },
      );
      const picked = await window.showQuickPick(items as { label: string; pick?: import('./core/sessionLauncher').SessionPick }[], {
        title: 'New session',
        placeHolder: 'what do you want to do?',
      });
      const pick = picked?.pick;
      if (!pick) { return; }
      if (pick.terminal) {
        const nika = state.resolvedServerPath ?? getNikaPath();
        const terminal = window.createTerminal({
          name: 'Nika: wizard',
          cwd: workspace.workspaceFolders?.[0]?.uri.fsPath,
        });
        terminal.show();
        terminal.sendText(`"${nika}" ${pick.terminal}`);
        return;
      }
      if (pick.command) { void commands.executeCommand(pick.command); }
    }),
  );

  // Command: Init Project — the one-gesture project setup. Runs the
  // binary's own scaffold (`nika init` — 7 files: AGENTS.md · .cursor/
  // {rules,mcp.json} · .vscode schema wiring · copilot brief · CLAUDE.md
  // · the authoring skill; skip-if-exists, the engine's discipline) and
  // then wires the HOST (mcp + rules for Cursor/Windsurf/VS Code). One
  // click = a fully equipped repo; the button IS the consent to write.
  context.subscriptions.push(
    commands.registerCommand('nika.initProject', async () => {
      const folder = workspace.workspaceFolders?.[0];
      if (!folder) {
        void window.showErrorMessage('Nika: open a folder first.');
        return;
      }
      if (!state.resolvedServerPath && !getNikaPath()) {
        const pick = await window.showWarningMessage(
          'Nika: Init Project needs the engine binary — it is not on this machine yet.',
          'Install binary first',
        );
        if (pick === 'Install binary first') {
          void commands.executeCommand('nika.restartServer');
        }
        return;
      }
      const res = await service.runCli(['init', folder.uri.fsPath, '--color', 'never'], 30000);
      if (res.code !== 0) {
        log('WARN', `nika init failed (${res.code}): ${res.stderr || res.stdout}`);
        void window.showErrorMessage('Nika: init failed — see the output channel.');
        return;
      }
      const created = (res.stdout.match(/created /g) ?? []).length;
      const skipped = (res.stdout.match(/skipped/g) ?? []).length;
      await configureMcpForHost(state.resolvedServerPath, service.intel?.providers, false);
      void refreshJourney();
      void window.showInformationMessage(
        `Nika: project equipped — ${created} file(s) scaffolded${skipped ? `, ${skipped} kept` : ''}, MCP + agent rules wired.`,
        'Open walkthrough',
      ).then((choice) => {
        if (choice === 'Open walkthrough') {
          void commands.executeCommand(
            'workbench.action.openWalkthrough',
            'supernovae.nika-lang#nika.gettingStarted',
            false,
          );
        }
      });
    }),
  );

  // Command: New workflow — the multi-step wizard (annexe A #14 · the
  // quickinput-sample pattern): (1/3) name → (2/3) starter (four verbs
  // · engine templates · blank) → (3/3) model (mock/echo default ·
  // locals first). Back walks the steps; rows derive pure
  // (core/newWorkflowWizard).
  const wizardName = (prior?: string): Promise<string | undefined> =>
    new Promise((resolve) => {
      const box = window.createInputBox();
      box.title = 'New workflow (1/3)';
      box.step = 1;
      box.totalSteps = 3;
      box.prompt = 'Workflow name (without extension)';
      box.placeholder = 'my-workflow';
      box.value = prior ?? '';
      box.ignoreFocusOut = true;
      const valid = (v: string): boolean => /^[a-z0-9-]+$/.test(v);
      box.onDidChangeValue((v) => {
        box.validationMessage = v.length === 0 || valid(v) ? undefined : 'Use lowercase letters, numbers, hyphens';
      });
      box.onDidAccept(() => {
        if (!valid(box.value)) {
          box.validationMessage = 'Use lowercase letters, numbers, hyphens';
          return;
        }
        resolve(box.value);
        box.hide();
      });
      box.onDidHide(() => { resolve(undefined); box.dispose(); });
      box.show();
    });

  interface WizardStarterItem extends QuickPickItem { pick?: StarterPick }
  const wizardStarter = (templates: string[]): Promise<StarterPick | 'back' | undefined> =>
    new Promise((resolve) => {
      const qp = window.createQuickPick<WizardStarterItem>();
      qp.title = 'New workflow (2/3)';
      qp.step = 2;
      qp.totalSteps = 3;
      qp.placeholder = 'a verb starter, an engine template, or the blank page';
      qp.buttons = [QuickInputButtons.Back];
      qp.ignoreFocusOut = true;
      qp.items = starterRows(templates).map((r) =>
        r.separator
          ? ({ label: r.label, kind: QuickPickItemKind.Separator } as WizardStarterItem)
          : { label: r.label, description: r.description, detail: r.detail, pick: r.pick });
      qp.onDidTriggerButton((b) => {
        if (b === QuickInputButtons.Back) { resolve('back'); qp.hide(); }
      });
      qp.onDidAccept(() => {
        const pick = qp.selectedItems[0]?.pick;
        if (pick) { resolve(pick); qp.hide(); }
      });
      qp.onDidHide(() => { resolve(undefined); qp.dispose(); });
      qp.show();
    });

  interface WizardModelItem extends QuickPickItem { value?: string; custom?: boolean }
  const wizardModel = (pick: StarterPick): Promise<string | 'back' | undefined> =>
    new Promise((resolve) => {
      const qp = window.createQuickPick<WizardModelItem>();
      const current = starterModelOf(pick);
      qp.title = 'New workflow (3/3)';
      qp.step = 3;
      qp.totalSteps = 3;
      qp.placeholder = current ?? 'mock/echo — deterministic · zero keys (the default)';
      qp.buttons = [QuickInputButtons.Back];
      qp.ignoreFocusOut = true;
      qp.items = modelRows(service.catalogModels, current).map((r) =>
        r.separator
          ? ({ label: r.label, kind: QuickPickItemKind.Separator } as WizardModelItem)
          : { label: r.label, description: r.description, detail: r.detail, value: r.value, custom: r.custom });
      qp.onDidTriggerButton((b) => {
        if (b === QuickInputButtons.Back) { resolve('back'); qp.hide(); }
      });
      qp.onDidAccept(() => {
        const sel = qp.selectedItems[0];
        if (!sel) { return; }
        if (sel.custom === true) {
          qp.hide();
          void window.showInputBox({
            title: 'New workflow (3/3) — custom model',
            prompt: 'provider/model — resolved by the engine at run time',
            placeHolder: 'ollama/llama3.2',
            ignoreFocusOut: true,
            validateInput: (v) =>
              /^[a-z0-9_-]+\/[A-Za-z0-9._:-]+$/.test(v.trim()) ? null : 'expected provider/model (e.g. ollama/llama3.2)',
          }).then((typed) => { resolve(typed?.trim() || undefined); });
          return;
        }
        if (sel.value !== undefined) { resolve(sel.value); qp.hide(); }
      });
      qp.onDidHide(() => { resolve(undefined); qp.dispose(); });
      qp.show();
    });

  context.subscriptions.push(
    commands.registerCommand('nika.newWorkflow', async () => {
      const folder = workspace.workspaceFolders?.[0];
      if (!folder) {
        window.showErrorMessage('Nika: open a folder first.');
        return;
      }
      const templates = await service.templatesList();

      // The step loop — Back re-enters the prior step with its value.
      let name: string | undefined;
      let starterPick: StarterPick | undefined;
      let model: string | undefined;
      let step: 1 | 2 | 3 | 'done' | 'cancel' = 1;
      while (step !== 'done' && step !== 'cancel') {
        if (step === 1) {
          name = await wizardName(name);
          step = name === undefined ? 'cancel' : 2;
        } else if (step === 2) {
          const picked = await wizardStarter(templates);
          if (picked === undefined) { step = 'cancel'; }
          else if (picked === 'back') { step = 1; }
          else {
            starterPick = picked;
            // Engine templates write their own file (models live inside)
            // — their path honestly has no model step.
            step = totalStepsFor(picked) === 2 ? 'done' : 3;
          }
        } else {
          const picked = await wizardModel(starterPick as StarterPick);
          if (picked === undefined) { step = 'cancel'; }
          else if (picked === 'back') { step = 2; }
          else { model = picked; step = 'done'; }
        }
      }
      if (step === 'cancel' || name === undefined || starterPick === undefined) { return; }

      const filePath = Uri.joinPath(folder.uri, `${name}.nika.yaml`);
      // Never silently clobber an existing workflow (a raw fs.writeFile
      // has no undo) — typing an existing name must be an explicit choice.
      try {
        await workspace.fs.stat(filePath);
        const overwrite = await window.showWarningMessage(
          `${name}.nika.yaml already exists — overwrite it?`,
          { modal: true },
          'Overwrite',
        );
        if (overwrite !== 'Overwrite') { return; }
      } catch {
        // stat threw → the file doesn't exist → free to create.
      }

      if (starterPick.kind === 'template') {
        const res = await service.newFromTemplate(starterPick.slug, filePath.fsPath);
        if (res.code === 0) {
          const doc = await workspace.openTextDocument(filePath);
          await window.showTextDocument(doc);
          return;
        }
        // The engine could not write it — fall to the blank page rather
        // than a dead end (same fallback the pre-wizard flow had).
        log('WARN', `nika new failed (${res.code}): ${res.stderr || res.stdout}`);
        starterPick = { kind: 'blank' };
      }

      const content = Buffer.from(
        scaffoldContent(name, starterPick, model ?? 'mock/echo'),
        'utf-8',
      );
      await workspace.fs.writeFile(filePath, content);
      const doc = await workspace.openTextDocument(filePath);
      await window.showTextDocument(doc);
      // The taught moment — in the canvas feed when it is open (our
      // surface, never a toast): the scaffold's next moves, one line.
      dagPanel.note('＋', 'workflow created — N adds a task · ▶ runs (mock, zero keys) · the commented break_me teaches failure', undefined, 'st-note');
    }),
  );

  context.subscriptions.push(
    commands.registerCommand('nika.showTasks', () => {
      commands.executeCommand('workbench.action.focusOutline');
    }),
  );

  // Command: Show DAG webview (engine projection → client fallback).
  context.subscriptions.push(
    commands.registerCommand('nika.showDag', async (uri?: Uri) => {
      // The door (#1): an explicit uri (explorer · menu) keeps the guard;
      // a bare invocation (sidebar · walkthrough · palette) PROBES without
      // toasting — no workflow in focus opens the welcome home, never a
      // warning that dead-ends its own « ◇ Open the canvas ».
      const doc = uri ? await requireNikaDocument(uri) : activeNikaDocument();
      if (!doc) {
        dagPanel.show();
        void state.pushWelcomeData?.();
        return;
      }
      dagWorkflowUri = doc.uri;
      // The skeleton (#6): reveal NOW, fill when the graph lands — a slow
      // first spawn breathes the welcome ghost under « loading <name>… »,
      // never a dead click on a frozen panel.
      dagPanel.show();
      dagPanel.loading(path.basename(doc.uri.fsPath));
      dagPanel.loadGraph(await loadGraphFor(doc));
    }),
  );

  // Command: Try the demo — the one-gesture sandbox. A runnable hello-canvas
  // (four waves · mock/echo · zero key · zero network) lands on disk and
  // opens beside the canvas. The COMMAND never runs anything: pressing ▶
  // (mock) is the user's gesture — the one exception lives in the
  // first-contact wire (maybeAutoRunDemo), which starts the mock run
  // ITSELF after calling this, consent trivially satisfied (zero cost ·
  // zero key · zero network · the banner names the state). The write path
  // is host-chosen (workspace root · or tmp when no folder is open), NEVER
  // supplied by the webview: this command takes no argument, so riding the
  // welcome whitelist buys a compromised webview no arbitrary write. It
  // returns the landed uri so the wire knows what to run.
  context.subscriptions.push(
    commands.registerCommand('nika.tryDemo', async () => {
      // The write path is host-chosen (workspace root · or a tmp scratch
      // dir when no folder is open) — NEVER webview-supplied.
      const { dir, scratch } = demoTargetDir(workspace.workspaceFolders?.[0]?.uri.fsPath, os.tmpdir());
      const dirUri = Uri.file(dir);
      if (scratch) { await workspace.fs.createDirectory(dirUri); }
      const target = await freeWorkflowUri(dirUri, DEMO_WORKFLOW_FILE);
      await workspace.fs.writeFile(target, Buffer.from(DEMO_WORKFLOW, 'utf-8'));
      const doc = await workspace.openTextDocument(target);
      await window.showTextDocument(doc, { preview: false });
      // Canvas beside — an explicit uri keeps the guard AND rides the
      // skeleton (reveal now · loading · fill). The ▶ waits for the user.
      await commands.executeCommand('nika.showDag', target);
      return target;
    }),
  );

  // Command: Export the DAG (mermaid/dot derive from the ONE json projection).
  const exportDag = (format: 'mermaid' | 'dot') => async (uri?: Uri): Promise<void> => {
    const doc = await requireNikaDocument(uri);
    if (!doc) { return; }
    const text = await service.graphFormat(doc, format);
    if (!text) {
      void window.showWarningMessage(`Nika: graph --format ${format} unavailable (workflow must pass conformance).`);
      return;
    }
    const untitled = await workspace.openTextDocument({
      content: text,
      language: format === 'mermaid' ? 'markdown' : 'dot',
    });
    await window.showTextDocument(untitled, { preview: true });
  };
  context.subscriptions.push(
    // ONE export command, format picked (Rams: two palette rows for one
    // gesture was inflation; direct calls pass the format as arg).
    commands.registerCommand('nika.exportDag', async (arg?: unknown) => {
      // Menus pass the resource Uri as first arg — only a literal format
      // string skips the picker (direct calls: executeCommand('…', 'dot')).
      const format = arg === 'mermaid' || arg === 'dot' ? arg : undefined;
      const pick = format ?? (await window.showQuickPick(
        [
          { label: 'Mermaid', description: 'markdown-embeddable diagram', value: 'mermaid' as const },
          { label: 'Graphviz dot', description: 'render with dot/neato', value: 'dot' as const },
        ],
        { title: 'Export DAG as…' },
      ))?.value;
      if (pick) { await exportDag(pick)(); }
    }),
  );

  // Command: Replay a trace through the DAG (replay = re-render, never re-execute).
  context.subscriptions.push(
    // Command: run report — the provable-after document: verdict · per-task
    // table · artifacts with provenance · failures, all read from the trace
    // (gaps stated, never filled). Local markdown, shareable by file.
    commands.registerCommand('nika.runReport', async (arg?: Uri | { trace?: { uri: Uri } }) => {
      let target = arg instanceof Uri ? arg : arg?.trace?.uri;
      if (!target) {
        const glob = workspace.getConfiguration('nika').get<string>('traces.glob', '**/.nika/traces/*.ndjson');
        const files = await workspace.findFiles(glob, '**/node_modules/**', 50);
        if (files.length === 0) {
          void window.showInformationMessage('Nika: no traces found (.nika/traces/*.ndjson).');
          return;
        }
        const root = workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
        const picked = await window.showQuickPick(
          files
            .map((f) => { try { return { f, m: fs.statSync(f.fsPath).mtimeMs }; } catch { return undefined; } })
            .filter((x): x is { f: Uri; m: number } => x !== undefined)
            .sort((a, b) => b.m - a.m)
            .map(({ f }) => ({ label: path.basename(f.fsPath), description: path.relative(root, f.fsPath), uri: f })),
          { placeHolder: 'Report on which recorded run?' },
        );
        if (!picked) { return; }
        target = picked.uri;
      }
      let ndjson: string;
      try {
        ndjson = fs.readFileSync(target.fsPath, 'utf-8');
      } catch {
        void window
          .showWarningMessage(
            'Nika: this trace is unreadable — it may be truncated (a killed run) or from another engine generation.',
            'Reveal in Finder', 'Copy path',
          )
          .then((pick) => {
            if (pick === 'Reveal in Finder') { void commands.executeCommand('revealFileInOS', target); }
            if (pick === 'Copy path') { void env.clipboard.writeText(target.fsPath); }
          });
        return;
      }
      // Artifact paths in the journal are as-recorded (often run-cwd
      // relative). Resolve honestly: absolute-and-exists, or workspace-
      // root join that exists, or the trace dir's grandparent (the run
      // cwd for `.nika/traces/x.ndjson`) — otherwise no inline preview.
      const traceDir = path.dirname(target.fsPath);
      const runCwd = path.dirname(path.dirname(traceDir));
      const resolvePath = (p: string): string | undefined => {
        const candidates = path.isAbsolute(p)
          ? [p]
          : [
            path.join(runCwd, p),
            ...(workspace.workspaceFolders ?? []).map((f) => path.join(f.uri.fsPath, p)),
          ];
        return candidates.find((c) => { try { return fs.existsSync(c); } catch { return false; } });
      };
      const md = renderRunReport({
        traceName: path.basename(target.fsPath).replace(/\.ndjson$/, ''),
        model: foldTrace(ndjson),
        artifacts: extractRunArtifacts(ndjson),
        resolvePath,
        ladders: attemptLadders(ndjson),
        chain: verifyChain(ndjson),
      });
      const preview = await workspace.openTextDocument({ language: 'markdown', content: md });
      try {
        await commands.executeCommand('markdown.showPreview', preview.uri);
      } catch {
        await window.showTextDocument(preview, { preview: true });
      }
    }),
    // Command: run history — the cross-run grid (tasks × last N runs ·
    // flaky + slowdown callouts), computed from the journal directory
    // alone with the same majority-overlap law as replay.
    commands.registerCommand('nika.runHistory', async (uri?: Uri) => {
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      const ids = new Set(parseRichWorkflow(doc.getText()).tasks.map((t) => t.id));
      if (ids.size === 0) {
        void window.showInformationMessage('Nika: no tasks parsed — fix the workflow first.');
        return;
      }
      const docName = parseRichWorkflow(doc.getText()).name;
      // The collection is the 0.97.0 shape verbatim (collectHistoryRuns):
      // stat-first, newest-first, lazy fold to 12, exact-name membership.
      // The surface changed (annexe R R13): the tree is native, the
      // markdown grid is one $(markdown) gesture away as the export.
      const runs = await collectHistoryRuns(docName, ids);
      await history.show(
        doc.uri,
        path.basename(doc.uri.fsPath).replace(/\.nika\.ya?ml$/i, ''),
        runs,
      );
    }),
    commands.registerCommand('nika.replayTrace', async (uri?: Uri) => {
      let target = uri;
      if (!target) {
        const glob = workspace.getConfiguration('nika').get<string>('traces.glob', '**/.nika/traces/*.ndjson');
        const files = await workspace.findFiles(glob, '**/node_modules/**', 50);
        if (files.length === 0) {
          void window.showInformationMessage('Nika: no traces found (.nika/traces/*.ndjson).');
          return;
        }
        const picked = await window.showQuickPick(
          files
            .map((f) => ({ label: path.basename(f.fsPath), description: workspace.asRelativePath(f), uri: f, mtime: fs.statSync(f.fsPath).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime),
          { title: 'Nika: replay a recorded run' },
        );
        if (!picked) { return; }
        target = picked.uri;
      }
      const active = activeNikaDocument();
      if (active) { dagWorkflowUri = active.uri; }
      await replayIntoDag(dagPanel, service, target, active);
    }),
    // The native click-through (V-SOTA.B B2.c): a task row in the Runs
    // view replays ITS run onto the canvas and centers that task — the
    // per-task navigation the report document cannot carry (annexe R
    // R13: `command:` links are dead in the preview). Zero new protocol
    // kinds: replayIntoDag + focusNode both predate this wrapper. The
    // inline menu passes the tree item — typeof first (law 8).
    commands.registerCommand('nika.runs.showTaskInDag', async (item?: { traceUri?: Uri; taskId?: string }) => {
      const traceUri = item?.traceUri;
      const taskId = item?.taskId;
      if (!(traceUri instanceof Uri) || typeof taskId !== 'string' || taskId.length === 0) { return; }
      const active = activeNikaDocument();
      if (active) { dagWorkflowUri = active.uri; }
      await replayIntoDag(dagPanel, service, traceUri, active);
      dagPanel.focusNode(taskId);
    }),
    commands.registerCommand('nika.watchDemo', () => {
      runNikaCommand(state.resolvedServerPath, 'trace replay --demo', '');
    }),
    // Command: diff two recorded runs on the DAG ("why is this run 3x
    // slower"). First pick = BASE (reference) · second = COMPARE (under
    // scrutiny). Paints compare's statuses + movement badges vs base.
    // Command: export a recorded run to OTLP/JSON lines — every OTel tool
    // (Jaeger drag-drop · Aspire · Grafana · Langfuse) becomes a nika
    // viewer. Pure projection via `nika trace export`; file lands beside
    // the journal, sovereign, zero collector.
    // Command: engine-authoritative chain verdict on one click — the
    // tooltip's client walk is instant; this is the engine's own word
    // (and the full head, for the anchor comparison).
    commands.registerCommand('nika.verifyTrace', async (arg?: { trace?: { uri: Uri } }) => {
      const trace = arg?.trace?.uri;
      if (!trace) {
        void window.showInformationMessage('Nika: pick a run in the Runs view to verify.');
        return;
      }
      const res = await service.runCli(['trace', 'verify', trace.fsPath], 15000);
      const noise = (res.stderr || res.stdout).trim();
      if (/unrecognized subcommand|unexpected argument/.test(noise)) {
        void window.showErrorMessage('Nika: this engine has no `trace verify` — needs nika ≥ 0.97 (brew upgrade nika).');
        return;
      }
      const first = (res.stdout || noise).split('\n')[0]?.trim() ?? 'no output';
      if (res.code === 0) {
        void window.showInformationMessage(`Nika: ${first}`);
      } else {
        void window.showWarningMessage(`Nika: ${first}`);
      }
    }),

    // Command: reproduce a recorded run against another journal of the
    // SAME workflow — the engine's determinism taxonomy (0.96+): each
    // task classified reproduced / NONDETERMINISTIC / authored /
    // environment / status-changed, with the attestation comparison.
    commands.registerCommand('nika.reproduceRun', async (arg?: { trace?: { uri: Uri } }) => {
      const recorded = arg?.trace?.uri;
      if (!recorded) {
        void window.showInformationMessage('Nika: pick a run in the Runs view to reproduce.');
        return;
      }
      const name = (() => {
        try { return foldTrace(fs.readFileSync(recorded.fsPath, 'utf-8')).workflowName; } catch { return undefined; }
      })();
      const glob = workspace.getConfiguration('nika').get<string>('traces.glob', '**/.nika/traces/*.ndjson');
      const files = (await workspace.findFiles(glob, '**/node_modules/**', 100))
        .filter((f) => f.fsPath !== recorded.fsPath);
      const candidates = files
        .map((f) => {
          try {
            const text = fs.readFileSync(f.fsPath, 'utf-8');
            return { f, name: foldTrace(text).workflowName, m: fs.statSync(f.fsPath).mtimeMs };
          } catch { return undefined; }
        })
        .filter((x): x is { f: Uri; name: string | undefined; m: number } => x !== undefined)
        .filter((x) => name === undefined || x.name === name)
        .sort((a, b) => b.m - a.m);
      if (candidates.length === 0) {
        void window.showInformationMessage(
          `Nika: no other recorded run of “${name ?? 'this workflow'}” — run it again, then reproduce.`,
        );
        return;
      }
      const root = workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
      const picked = await window.showQuickPick(
        candidates.map(({ f }) => ({
          label: path.basename(f.fsPath),
          description: path.relative(root, f.fsPath),
          f,
        })),
        {
          // A nameless recorded journal (torn head · unreadable fold) can't
          // filter the candidates — every trace in the workspace is listed.
          // Say so instead of letting the list masquerade as same-workflow
          // (a cross-workflow compare renders a confident MISSING/ADDED
          // taxonomy — never silently).
          placeHolder:
            name === undefined
              ? 'Recorded journal has no workflow name — ALL traces listed, pick its sibling carefully (fresh side)'
              : 'Reproduce against which run? (fresh side)',
        },
      );
      if (!picked) { return; }
      const res = await service.runCli(['trace', 'reproduce', recorded.fsPath, picked.f.fsPath], 20000);
      const noise = (res.stderr || '').trim();
      if (/unrecognized subcommand|unexpected argument/.test(noise)) {
        void window.showErrorMessage('Nika: this engine has no `trace reproduce` — needs nika ≥ 0.97 (brew upgrade nika).');
        return;
      }
      const doc = await workspace.openTextDocument({ language: 'markdown', content: [
        `# Reproduce — ${path.basename(recorded.fsPath)} vs ${picked.label}`,
        '',
        '```',
        res.stdout.trim() || noise,
        '```',
      ].join('\n') });
      await window.showTextDocument(doc, { preview: true });
    }),

    commands.registerCommand('nika.exportOtel', async (arg?: Uri | { trace?: { uri: Uri } }) => {
      const target = arg instanceof Uri ? arg : arg?.trace?.uri;
      if (!target) {
        void window.showInformationMessage('Nika: pick a run in the Runs view to export.');
        return;
      }
      const res = await service.runCli(['trace', 'export', target.fsPath], 15000);
      if (res.code !== 0) {
        const noise = (res.stderr || res.stdout).trim();
        // A binary older than the verb: say so instead of parroting clap.
        const msg = /unrecognized subcommand|unexpected argument/.test(noise)
          ? 'Nika: this engine predates `trace export` — update nika (brew upgrade nika).'
          : `Nika: export failed — ${noise.slice(0, 200) || 'no output (timeout?)'}`;
        void window.showErrorMessage(msg);
        return;
      }
      // The engine STATES where it wrote (`exported → <path>` on stdout) —
      // parse that instead of assuming the extension's own suffix rule: a
      // custom traces glob (`.jsonl` journals) made the assumed path a
      // no-op replace, so Reveal/Copy pointed at the RAW journal and the
      // "exported" toast lied (the 0.97.2 review's F4).
      const stated = /exported → (\S+)/.exec(res.stdout)?.[1];
      const out = stated !== undefined
        ? path.resolve(path.dirname(target.fsPath), stated)
        : target.fsPath.replace(/\.ndjson$/, '.otlp.jsonl');
      const pick = await window.showInformationMessage(
        'Nika: OTel trace exported — drag it into Jaeger UI, or POST to any OTLP endpoint.',
        'Reveal', 'Copy Path',
      );
      if (pick === 'Reveal') { void commands.executeCommand('revealFileInOS', Uri.file(out)); }
      if (pick === 'Copy Path') { await env.clipboard.writeText(out); }
    }),
  );

  context.subscriptions.push(
    commands.registerCommand('nika.diffTraces', async (uri?: Uri) => {
      const glob = workspace.getConfiguration('nika').get<string>('traces.glob', '**/.nika/traces/*.ndjson');
      const files = await workspace.findFiles(glob, '**/node_modules/**', 50);
      if (files.length < 2) {
        void window.showInformationMessage('Nika: need at least two traces to diff.');
        return;
      }
      const items = files
        .map((f) => ({ label: path.basename(f.fsPath), description: workspace.asRelativePath(f), uri: f, mtime: fs.statSync(f.fsPath).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      let base = uri;
      if (!base) {
        const picked = await window.showQuickPick(items, { title: 'Diff runs 1/2 — the BASE (reference) run' });
        if (!picked) { return; }
        base = picked.uri;
      }
      const rest = items.filter((i) => i.uri.toString() !== base?.toString());
      const compare = await window.showQuickPick(rest, { title: 'Diff runs 2/2 — the run to compare against it' });
      if (!compare) { return; }
      // The diff paints the SHOWING graph — load the active workflow first
      // when the panel is empty (same ritual as replay).
      const active = activeNikaDocument();
      if (active && dagWorkflowUri?.toString() !== active.uri.toString()) {
        dagWorkflowUri = active.uri;
        dagPanel.loadGraph(await service.dagForDocument(active));
      }
      if (!diffTracesOntoDag(dagPanel, base, compare.uri)) {
        void window.showInformationMessage('Nika: these traces do not match the workflow the DAG is showing.');
      }
    }),
    // Command: capture the lint ratchet baseline — records TODAY's findings
    // as the grandfathered debt (.nika/lint-baseline.json). New findings
    // stay loud; re-capture after cleanups burns the debt down.
    commands.registerCommand('nika.captureLintBaseline', async () => {
      const root = workspace.workspaceFolders?.[0]?.uri;
      if (!root) {
        void window.showInformationMessage('Nika: open a workspace folder first.');
        return;
      }
      // Without the engine every check comes back empty — capturing now
      // would OVERWRITE the real grandfathered-debt record with nothing.
      if (!(await requireEngine(service, 'capturing the lint baseline'))) { return; }
      const files = await workspace.findFiles('**/*.nika.yaml', '**/node_modules/**', 300);
      const perFile = new Map<string, string[]>();
      await window.withProgress(
        { location: { viewId: 'nikaWorkflows' }, title: 'Nika: capturing lint baseline' },
        async () => {
          for (const f of files) {
            const res = await service.runCli(['check', f.fsPath, '--json']);
            const report = parseCheckReport(res.stdout);
            if (!report) { continue; }
            const codes = collectFindings(report).map((x) => x.code);
            if (codes.length > 0) { perFile.set(workspace.asRelativePath(f, false), codes); }
          }
        },
      );
      const baseline = captureBaseline(perFile, new Date().toISOString().slice(0, 10));
      const target = Uri.joinPath(root, BASELINE_REL_PATH);
      await workspace.fs.writeFile(target, Buffer.from(`${JSON.stringify(baseline, null, 1)}\n`, 'utf-8'));
      const total = Object.values(baseline.counts).reduce((a, b) => a + b, 0);
      // Diet: the written baseline file is the durable answer — flash.
      flashStatus(`$(check) baseline captured — ${total} finding(s) grandfathered across ${perFile.size} file(s); new findings stay loud`, 6000);
    }),
  );

  // Command: embedded spec / schema / examples (binary = SSOT · zero network).
  context.subscriptions.push(
    commands.registerCommand('nika.openSpec', () => openNikaDoc('spec', undefined, 'markdown')),
    commands.registerCommand('nika.openSchema', () => openNikaDoc('schema', undefined, 'json')),
    commands.registerCommand('nika.browseExamples', async () => {
      const slugs = await service.examplesList();
      if (slugs.length === 0) {
        void window.showInformationMessage('Nika: no embedded examples available from this binary.');
        return;
      }
      const picked = await window.showQuickPick(slugs, { title: 'Nika: embedded examples' });
      if (picked) { await openNikaDoc('example', picked, 'yaml'); }
    }),
  );

  // Command: copy the deterministic AI authoring prompt.
  context.subscriptions.push(
    commands.registerCommand('nika.copyAiPrompt', async () => {
      const doc = activeNikaDocument();
      await env.clipboard.writeText(buildAuthoringPrompt(doc ? workspace.asRelativePath(doc.uri) : undefined));
      flashStatus('$(clippy) AI authoring protocol copied — paste it into any agent');
    }),
  );

  // Command: Verify the nika binary (walkthrough step 1 completion event).
  context.subscriptions.push(
    commands.registerCommand('nika.checkBinary', async () => {
      const p = state.resolvedServerPath ?? getNikaPath();
      if (p && (await isBinaryWorking(p))) {
        flashStatus(`$(check) nika binary OK · ${p} · ${service.caps.version}`, 6000);
      } else {
        window.showWarningMessage(
          'Nika: binary not found — install it or let the extension download it.',
          'Install instructions',
        ).then(choice => {
          if (choice) { commands.executeCommand('vscode.open', Uri.parse(GITHUB_INSTALL_URL)); }
        });
      }
    }),
  );

  // Command: Wire MCP + agent rules for the current client (consent via command).
  context.subscriptions.push(
    commands.registerCommand('nika.setupMcp', async () => {
      const folder = workspace.workspaceFolders?.[0];
      if (!folder) {
        window.showWarningMessage('Nika: open a folder before wiring MCP and agent rules.');
        return;
      }
      if (!service.caps.mcp) {
        window.showWarningMessage(
          'Nika: this binary does not expose `nika mcp` yet. Update Nika, then run setup again.',
          'Install instructions',
        ).then(choice => {
          if (choice) { commands.executeCommand('vscode.open', Uri.parse(GITHUB_INSTALL_URL)); }
        });
        return;
      }
      if (service.caps.init) {
        const init = await service.runCli(['init', folder.uri.fsPath], 30000);
        if (init.code !== 0) {
          log('WARN', `nika init failed during agent setup (${init.code}): ${init.stderr || init.stdout}`);
          window.showWarningMessage('Nika: `nika init` failed; MCP wiring skipped. See the Nika output channel.');
          return;
        }
      } else {
        void informSoftly('binary-predates-init', 'Nika: this binary has no `init`; wiring MCP only.');
      }
      // The engine's own idempotent writer is canonical when present
      // (registry SSOT, covers cursor·vscode·windsurf·claude·codex) —
      // the extension's hand-writers stay as the older-binary fallback.
      if (service.caps.wire) {
        const target = isCursor() ? 'cursor' : isWindsurf() ? 'windsurf' : 'vscode';
        const res = await service.runCli(['wire', target, '--dir', folder.uri.fsPath], 30000);
        if (res.code === 0) {
          const extra = await window.showInformationMessage(
            `Nika: MCP + agent rules wired for ${target} (engine-canonical).`,
            'Also wire codex',
            'Also wire claude',
          );
          if (extra) {
            const t2 = extra.endsWith('codex') ? 'codex' : 'claude';
            const r2 = await service.runCli(['wire', t2, '--dir', folder.uri.fsPath], 30000);
            if (r2.code === 0) {
              flashStatus(`$(plug) ${t2} wired — its agent now calls the same oracle`);
            } else {
              log('WARN', `nika wire ${t2} failed (${r2.code}): ${r2.stderr || r2.stdout}`);
              window.showWarningMessage(`Nika: wire ${t2} failed — see the output channel.`);
            }
          }
          return;
        }
        log('WARN', `nika wire ${target} failed (${res.code}): ${res.stderr || res.stdout} — falling back to extension writers`);
      }
      await configureMcpForHost(state.resolvedServerPath, service.intel?.providers);
    }),
  );

  // Command: Doctor — the engine diagnoses its own environment (terminal
  // keeps the exact fix commands + colors; diagnose-only, never mutates).
  context.subscriptions.push(
    commands.registerCommand('nika.doctor', async () => {
      if (!(await requireEngine(service, 'running the doctor'))) { return; }
      runNikaCommand(state.resolvedServerPath, 'doctor', '');
    }),
  );

  // Command: Doctor --ping (0.94+) — opt-in TCP probe of the LOCAL
  // provider ports only (loopback + configured URLs · 300ms cap ·
  // nothing sent on the socket). The default doctor stays offline.
  context.subscriptions.push(
    commands.registerCommand('nika.doctorPing', async () => {
      if (!(await requireEngine(service, 'pinging local providers'))) { return; }
      runNikaCommand(state.resolvedServerPath, 'doctor --ping', '');
    }),
  );

  // Command: Golden test — `nika test <file>` (mock provider · offline ·
  // deterministic). The golden lives BESIDE the file (`<file>.golden.json`),
  // so the engine refuses stdin here — the doc must be saved first.
  const runGoldenTest = async (uri: Uri | undefined, update: boolean): Promise<void> => {
    const doc = await requireNikaDocument(uri);
    if (!doc) { return; }
    if (!service.caps.test) {
      if (!(await requireEngine(service, 'golden-testing a workflow'))) { return; }
      void window.showWarningMessage('Nika: this engine has no `test` subcommand — needs nika ≥ 0.94 (brew upgrade nika).');
      return;
    }
    if (doc.isDirty && !(await doc.save())) { return; }
    runNikaCommand(state.resolvedServerPath, update ? 'test --update' : 'test', doc.uri.fsPath);
  };
  context.subscriptions.push(
    commands.registerCommand('nika.testWorkflow', (uri?: Uri) => runGoldenTest(uri, false)),
    commands.registerCommand('nika.testUpdate', (uri?: Uri) => runGoldenTest(uri, true)),
  );

  // Test Explorer — golden-backed workflows in the native testing UI
  // (per-file run · re-pin profile · engine diff as the message).
  registerTestExplorer(context, service);

  // Command: Restart language server
  context.subscriptions.push(
    commands.registerCommand('nika.restartServer', async () => {
      if (state.client) {
        await safeStopClient(state.client);
        state.client = undefined;
      }
      // Re-RESOLVE the binary before restarting: the restart gesture is
      // what a user reaches for right after installing nika — it must
      // pick the fresh binary up (PATH · bundled · cached · download).
      // An explicit gesture also re-opens the download question a user
      // previously declined (the auto path stays silent after a decline).
      await context.globalState.update('nika.downloadDeclined', undefined);
      const fresh = await resolveBinary(context, true);
      state.resolvedServerPath = fresh;
      await service.setBinary(fresh);
      if (fresh) { checkVersionMismatch(context, log, fresh); }
      void state.pushWelcomeData?.();
      if (service.caps.lsp) {
        startClient(context, state, log, state.resolvedServerPath);
        flashStatus('$(check) language server restarted');
      } else {
        void informSoftly('binary-predates-lsp', 'Nika: this binary has no `lsp` yet — client-side intelligence stays active.');
      }
    }),
  );

  // ─── Binary discovery → capability probe → (maybe) LSP ────────────────────

  void (async () => {
    const binaryPath = await resolveBinary(context);
    state.resolvedServerPath = binaryPath;
    await service.setBinary(binaryPath);
    // Version-skew is a BINARY fact, not an LSP one — warn on every
    // resolution, not only when `nika lsp` happens to start (an old
    // extension against a new non-LSP binary got no signal before).
    if (binaryPath) { checkVersionMismatch(context, log, binaryPath); }

    // Cursor host → one toast EVER pointing at the two setup moves this
    // extension cannot make itself: the marketplace plugin (rules + skill
    // + subagent + hooks + MCP in one Add — no install API exists, the
    // nudge guides) and the workspace wiring (nika.setupMcp). Deliberately
    // NOT gated on the binary: the plugin teaches the install line, so the
    // no-binary user is exactly who must see it. Same one-shot discipline
    // as the binary nudge below.
    if (isCursor() && (workspace.workspaceFolders?.length ?? 0) > 0
        && !context.globalState.get<boolean>('nika.cursorPluginNudgeShown')) {
      // Empty-window law: without a folder, « Wire this workspace » can
      // only error — the one-shot must not burn there. The state writes
      // ONLY when the toast can actually help.
      await context.globalState.update('nika.cursorPluginNudgeShown', true);
      void window.showInformationMessage(
        'Nika: running in Cursor — install the nika plugin (rules · skill · subagent · hooks · MCP in one Add), or wire just this workspace.',
        'Open Marketplace',
        'Wire this workspace',
      ).then((choice) => {
        if (choice === 'Open Marketplace') {
          void env.openExternal(Uri.parse('https://cursor.com/marketplace?q=nika'));
        } else if (choice === 'Wire this workspace') {
          void commands.executeCommand('nika.setupMcp');
        }
      });
    }

    if (!binaryPath) {
      statusBar.setLspState('off');
      langStatus.setLspState('off');
      // One toast EVER (not one per window per day): after the first
      // nudge the status bar + welcome canvas carry the missing-binary
      // state, and every engine-gated command explains itself on use.
      if (!context.globalState.get<boolean>('nika.binaryNudgeShown')) {
        await context.globalState.update('nika.binaryNudgeShown', true);
        const choice = await window.showWarningMessage(
          'Nika: binary not found. Install it (brew install supernovae-st/tap/nika) or let the extension download it.',
          'Open Install Guide',
        );
        if (choice === 'Open Install Guide') {
          void env.openExternal(Uri.parse(GITHUB_INSTALL_URL));
        }
      }
      return;
    }

    // Auto-power: the binary is here — wire MCP for this host without a
    // gesture (`nika wire` is idempotent by contract · the engine writer
    // is registry-canonical), once per machine. `nika.autoSetup: false`
    // opts out; the toast names the switch.
    await autoEquipOnce();

    // « Does this project exist yet? » — the per-WORKSPACE intelligence:
    // the repo carries .nika.yaml workflows but is not equipped (no
    // .cursor/rules/nika.mdc scaffold). One toast per WORKSPACE
    // (workspaceState — the machine-global nudge above is about the
    // plugin, this one is about THIS repo), offering the one-gesture
    // setup. Skip-if-equipped: init is idempotent but the ask is noise.
    void (async () => {
      if (context.workspaceState.get<boolean>('nika.initNudgeShown')) { return; }
      await refreshJourney();
      // Working-but-unequipped is the ONE case the nudge exists for —
      // the journey SSOT carries both facts (the old inline probes died
      // with the orphan `nika.workspaceEquipped` context).
      if (currentJourney.stage !== 'working' || currentJourney.equipped) { return; }
      await context.workspaceState.update('nika.initNudgeShown', true);
      void window.showInformationMessage(
        'Nika: this repo has workflows but is not equipped (agent rules · MCP · schema wiring). Set it up?',
        'Init Project',
        'Not now',
      ).then((choice) => {
        if (choice === 'Init Project') {
          void commands.executeCommand('nika.initProject');
        }
      });
    })();

    log('INFO', service.caps.mcp
      ? 'nika mcp is available — run "Nika: Setup MCP + Agent Rules" to wire agents explicitly'
      : 'nika mcp not in this binary — agent MCP setup unavailable');


    if (service.caps.lsp) {
      // The engine ships `nika lsp` — full server takes over; the client
      // keeps expression intel (server is structure-level at v0.1) and the
      // secrets lint, but check-diagnostics defer to the server.
      diagnosticsController.lspOwnsDiagnostics = true;
      startClient(context, state, log, binaryPath);
    } else {
      statusBar.setLspState('off');
      langStatus.setLspState('off');
      log('INFO', 'nika lsp not in this binary — client-side intelligence active');
    }
  })();
}

/**
 * The one auto-power move: wire MCP for this host (engine-canonical
 * `nika wire`, idempotent · Cursor-global fallback). Shared by the
 * activation path, the binary-becomes-available TRANSITION (a download
 * mid-session must light everything without a reload — the gap the
 * first cut had) and the Finish-setup orchestrator.
 */
async function equipHost(silent = false): Promise<boolean> {
  const folder = workspace.workspaceFolders?.[0];
  let wired = false;
  if (svc.caps.wire && folder) {
    const target = isCursor() ? 'cursor' : isWindsurf() ? 'windsurf' : 'vscode';
    const res = await svc.runCli(['wire', target, '--dir', folder.uri.fsPath], 30000);
    wired = res.code === 0;
    if (!wired) {
      log('WARN', `auto wire ${target} failed (${res.code}): ${res.stderr || res.stdout}`);
    }
  }
  if (!wired && isCursor() && state.resolvedServerPath) {
    await ensureCursorGlobalMcpConfig(state.resolvedServerPath, log);
    wired = true;
  }
  if (wired && !silent) {
    // ONE toast per activation (Rams pass): the Cursor plugin pointer
    // rides it; the separate one-shot stays for the auto-setup-off path.
    const cursorTail = isCursor()
      ? ' Agent side: install the nika plugin (Settings → Plugins → search "nika").'
      : '';
    if (isCursor()) {
      void extContext.globalState.update('nika.cursorPluginNudgeShown', true);
      // Diet exception (reason): the Cursor plugin pointer names a move
      // this extension cannot make itself — worth one toast, once ever.
      void informSoftly('cursor-live-plugin', `Nika is live — MCP wired, language server on, diagnostics running (opt out: nika.autoSetup).${cursorTail}`);
    } else {
      // Diet: the pill + views already show the lit state — flash only.
      flashStatus('$(check) Nika is live — MCP wired · language server on · diagnostics running', 6000);
    }
  }
  return wired;
}

/** One-shot per machine, only when auto-setup is on and a binary exists. */
async function autoEquipOnce(): Promise<void> {
  if (!svc.available) { return; }
  if (!workspace.getConfiguration('nika').get<boolean>('autoSetup', true)) { return; }
  if (extContext.globalState.get<boolean>('nika.autoEquipDone')) { return; }
  await extContext.globalState.update('nika.autoEquipDone', true);
  await equipHost();
}

async function configureMcpForHost(
  resolvedServerPath: string | undefined,
  providers: Parameters<typeof ensureCursorRules>[1],
  notify = true,
): Promise<void> {
  if (!workspace.workspaceFolders?.[0]) {
    window.showWarningMessage('Nika: open a folder before wiring MCP and agent rules.');
    return;
  }
  if (isCursor()) {
    await ensureCursorMcpConfig(resolvedServerPath, log);
    await ensureCursorRules(log, providers);
    if (notify) {
      flashStatus('$(plug) MCP + .cursor/rules wired for Cursor');
    }
  } else if (isWindsurf()) {
    await ensureWindsurfMcpConfig(resolvedServerPath, log);
    if (notify) {
      flashStatus('$(plug) MCP config wired for Windsurf');
    }
  } else {
    await ensureVscodeMcpConfig(resolvedServerPath, log);
    if (notify) {
      flashStatus('$(plug) MCP config wired (.vscode/mcp.json)');
    }
  }
  // The PATH gap, CLOSED instead of warned (first-run intelligence):
  // when the only binary is the extension-downloaded one, `nika` is not
  // on PATH and the workspace config's portable command cannot start the
  // oracle. Cursor gets the machine-scoped ~/.cursor/mcp.json with the
  // absolute path (never committed · other servers untouched); the probe
  // guarantees a brew install is never shadowed.
  const nikaOnPath = commandOnPath('nika', process.env.PATH, process.platform, (c) => {
    try { fs.accessSync(c, fs.constants.X_OK); return true; } catch { return false; }
  });
  if (resolvedServerPath && path.isAbsolute(resolvedServerPath) && !nikaOnPath && isCursor()) {
    await ensureCursorGlobalMcpConfig(resolvedServerPath, log);
    if (notify) {
      void informSoftly('cursor-global-mcp-path', 'Nika: `nika` is not on PATH — the machine-scoped ~/.cursor/mcp.json now points at the downloaded binary.');
    }
  } else if (notify && resolvedServerPath && path.isAbsolute(resolvedServerPath) && !nikaOnPath && !isWindsurf()) {
    window.showWarningMessage(
      `Nika MCP workspace config uses the portable command "nika". Add ${path.dirname(resolvedServerPath)} to PATH if your agent cannot start MCP.`,
    );
  }
}

/** Discovery priority: explicit config → bundled → PATH (`nika` · `nika-cli`) → cached → download. */
async function resolveBinary(context: ExtensionContext, explicit = false): Promise<string | undefined> {
  const configPath = getNikaPath();
  if (configPath !== 'nika') {
    if (await isBinaryWorking(configPath)) {
      log('INFO', `Using configured binary: ${configPath}`);
      return configPath;
    }
    // An explicit setting that does not run was the ONE silent
    // no-binary state — say so, then let the fallbacks play.
    log('WARN', `Configured nika.server.path does not run: ${configPath}`);
    void window.showWarningMessage(
      `Nika: the configured server path does not run (\`${configPath}\`) — falling back to bundled/PATH discovery.`,
      'Open settings',
    ).then((pick) => {
      if (pick === 'Open settings') {
        void commands.executeCommand('workbench.action.openSettings', 'nika.server.path');
      }
    });
  }

  const bundled = findBundledBinary(context);
  if (bundled) {
    log('INFO', `Using bundled binary: ${bundled}`);
    return bundled;
  }

  for (const candidate of ['nika', 'nika-cli']) {
    if (await isBinaryWorking(candidate)) {
      log('INFO', `Using PATH binary: ${candidate}`);
      return candidate;
    }
  }

  const storagePath = context.globalStorageUri.fsPath;
  const isWindows = process.platform === 'win32';
  const cachedBinary = path.join(storagePath, isWindows ? 'nika.exe' : 'nika');
  if (fs.existsSync(cachedBinary)) {
    if (await isBinaryWorking(cachedBinary)) {
      log('INFO', `Using cached binary: ${cachedBinary}`);
      return cachedBinary;
    }
    fs.unlink(cachedBinary, () => undefined);
  }

  const autoDownload = workspace.getConfiguration('nika').get<boolean>('server.autoDownload', true);
  if (!autoDownload || getArtifactName() === null) {
    return undefined;
  }
  // First-run CONSENT before any network fetch (marketplace policy for
  // extensions that download executables · sovereignty: nothing leaves or
  // arrives without an explicit yes). Remembered globally once granted —
  // and a DECLINE is remembered too: the modal never re-fires on startup
  // (the status bar + welcome canvas keep the install affordance); only
  // the explicit restart/re-detect gesture asks again.
  if (!context.globalState.get<boolean>('nika.downloadConsent')) {
    if (context.globalState.get<boolean>('nika.downloadDeclined')) { return undefined; }
    // The first-EVER activation just auto-opened the walkthrough — a
    // modal on top of it is two surfaces shouting at once (the boot
    // collision · one door per moment). That first boot stays silent:
    // the walkthrough's « Finish Setup » button IS the download door,
    // and the status bar + welcome views keep the affordance. The
    // modal may ask from the SECOND boot on.
    if (!explicit && !context.globalState.get<boolean>('nika.bootAskArmed')) {
      await context.globalState.update('nika.bootAskArmed', true);
      return undefined;
    }
    const pick = await window.showInformationMessage(
      'Nika engine not found. Download the official binary from GitHub releases? (HTTPS · SHA-256 verified · ~10 MB)',
      { modal: true },
      'Download',
    );
    if (pick !== 'Download') {
      await context.globalState.update('nika.downloadDeclined', true);
      return undefined;
    }
    await context.globalState.update('nika.downloadConsent', true);
  }
  try {
    const downloaded = await downloadNikaBinary(storagePath);
    if (downloaded && fs.existsSync(downloaded) && (await isBinaryWorking(downloaded))) {
      // The moment of highest intent — the toast carries the NEXT moves
      // instead of dead-ending (first-install audit 2026-07-12). Wiring
      // still requires the explicit click: downloading a binary is not
      // consent to write .cursor/.vscode files into the user's repo.
      void window.showInformationMessage(
        'Nika engine downloaded. Wire this workspace (MCP + agent rules) or take the 5-minute tour?',
        'Wire workspace',
        'Open walkthrough',
      ).then((choice) => {
        if (choice === 'Wire workspace') {
          void commands.executeCommand('nika.setupMcp');
        } else if (choice === 'Open walkthrough') {
          void commands.executeCommand(
            'workbench.action.openWalkthrough',
            'supernovae.nika-lang#nika.gettingStarted',
            false,
          );
        }
      });
      return downloaded;
    }
  } catch (err) {
    if (err instanceof DownloadCancelled) {
      // A user's Stop is a decision, not a failure — flash, keep doors.
      flashStatus('$(circle-slash) download cancelled — the status bar keeps the install door');
      return undefined;
    }
    const message = err instanceof Error ? err.message : String(err);
    log('WARN', `Download failed: ${message}`);
    // The click MUST answer (operator live 2026-07-12: a silent catch
    // read as « the button does nothing ») — name the failure, hand the
    // two exits; Details opens the output channel (the deep story).
    void window.showErrorMessage(
      `Nika download failed: ${message}`,
      'Copy brew command',
      'Open releases',
      'Details',
    ).then((pick) => {
      if (pick === 'Copy brew command') {
        void env.clipboard.writeText('brew install supernovae-st/tap/nika');
        flashStatus('$(clippy) brew command copied — run it in a terminal, then Install / detect from the status bar', 6000);
      } else if (pick === 'Open releases') {
        void env.openExternal(Uri.parse(GITHUB_RELEASES_URL));
      } else if (pick === 'Details') {
        void commands.executeCommand('nika.showOutput');
      }
    });
  }
  return undefined;
}

export function deactivate(): Thenable<void> | undefined {
  if (!state.client) {
    return undefined;
  }
  // safeStopClient guards the Starting-state reject the real host surfaced.
  return safeStopClient(state.client);
}
