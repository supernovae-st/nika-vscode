import {
  workspace,
  commands,
  ExtensionContext,
  window,
  Uri,
  Position,
  Range,
  Location,
  WorkspaceEdit,
  env,
  languages,
  type TextDocument,
} from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WorkflowTreeProvider } from './workflowTree';
import { DagPanel, DagPanelSerializer, type DagEditRequest } from './dagPanel';
import {
  addDependsOn,
  deleteTask,
  insertTaskSkeleton,
  removeDependsOn,
  type Verb,
} from './core/structuralFixes';
import {
  getArtifactName,
  downloadNikaBinary,
  isBinaryWorking,
  findBundledBinary,
  GITHUB_INSTALL_URL,
} from './binaryInstaller';
import {
  startClient,
  getNikaPath,
  runNikaCommand,
  type ClientState,
} from './lspClient';
import {
  ensureCursorMcpConfig,
  ensureCursorRules,
  ensureVscodeMcpConfig,
  ensureWindsurfMcpConfig,
  isCursor,
  isWindsurf,
} from './mcpConfig';
import { NikaService } from './nikaService';
import { NikaStatusBar } from './features/statusBar';
import { DiagnosticsController } from './features/diagnostics';
import { NikaCodeActionProvider, NikaFixAllProvider } from './features/codeActions';
import { registerIntel } from './features/intel';
import { AuditCodeLensProvider, AuditInlayHintsProvider } from './features/auditLens';
import { TaskLensProvider, VerbGutterDecorations } from './features/taskLens';
import { findTaskRefs } from './core/renameRefs';
import { RunsTreeProvider, overlayTraceOntoDag, replayIntoDag } from './features/runsView';
import { runWorkflowLive, cancelActiveRun } from './features/runLive';
import { registerNikaTaskProvider } from './features/taskProvider';
import { NikaDocProvider, SCHEME as DOC_SCHEME, openNikaDoc } from './features/virtualDocs';
import { registerLmTools } from './features/lmTools';
import { registerGenerate } from './features/generate';
import { buildAuthoringPrompt } from './core/aiPrompt';
import { countReportFindings } from './core/cliContract';
import { insertPermitsBlock } from './core/permitsEdit';
import { parseRichWorkflow, taskAtLine } from './workflowParser';

// ─── Shared mutable state ──────────────────────────────────────────────────
// Owned here, passed by reference to module functions via ClientState.
const state: ClientState = {
  client: undefined,
  statusBarItem: undefined,
  statusPollInterval: undefined,
  activeDagPanel: undefined,
  resolvedServerPath: undefined,
};

let outputChannel: import('vscode').OutputChannel | undefined;

function log(level: string, msg: string): void {
  if (outputChannel) {
    outputChannel.appendLine(`[${new Date().toISOString()}] [${level}] ${msg}`);
  }
}

const NIKA_FILE_RE = /\.nika\.ya?ml$/;

function activeNikaDocument(uri?: Uri): TextDocument | undefined {
  if (uri) {
    return workspace.textDocuments.find((d) => d.uri.toString() === uri.toString())
      ?? workspace.textDocuments.find((d) => d.uri.fsPath === uri.fsPath);
  }
  const doc = window.activeTextEditor?.document;
  return doc && NIKA_FILE_RE.test(doc.fileName) ? doc : undefined;
}

async function requireNikaDocument(uri?: Uri): Promise<TextDocument | undefined> {
  if (uri) {
    if (!NIKA_FILE_RE.test(uri.fsPath)) {
      void window.showWarningMessage('Nika commands target .nika.yaml files.');
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
    void window.showWarningMessage('Open a .nika.yaml file first.');
  }
  return doc;
}

// ─── Activation ─────────────────────────────────────────────────────────────

export function activate(context: ExtensionContext): void {
  outputChannel = window.createOutputChannel('Nika Language Server');
  context.subscriptions.push(outputChannel);
  log('INFO', `Nika extension v${context.extension.packageJSON.version} activating`);
  log('INFO', `Platform: ${process.platform}/${process.arch}`);

  // The ONE seam to the binary + the capability-aware status bar.
  const service = new NikaService();
  const statusBar = new NikaStatusBar(service);
  context.subscriptions.push(statusBar);
  state.statusSink = (s) => statusBar.setLspState(s === 'starting' ? 'starting' : s === 'running' ? 'running' : 'failed');
  state.rulesIntel = () => service.intel?.providers;

  // Capability context keys drive `when` clauses in package.json menus.
  context.subscriptions.push(service.onDidChange(() => {
    const caps = service.caps;
    void commands.executeCommand('setContext', 'nika.hasBinary', service.available);
    void commands.executeCommand('setContext', 'nika.capRun', caps.run);
    void commands.executeCommand('setContext', 'nika.capCheck', caps.check);
    void commands.executeCommand('setContext', 'nika.capGraph', caps.graph);
    void commands.executeCommand('setContext', 'nika.capTrace', caps.trace);
    log('INFO', `Capabilities: ${[...caps.commands].sort().join(' ') || '(none)'} · ${caps.version}`);
  }));

  // Command: Show output channel
  context.subscriptions.push(
    commands.registerCommand('nika.showOutput', () => outputChannel?.show()),
    commands.registerCommand('nika.showMenu', () => statusBar.showMenu()),
  );

  // Sidebar — workflow explorer (check badges from the cached report ·
  // zero extra spawns) + flight-recorder runs.
  const workflowTree = new WorkflowTreeProvider((uriString) => {
    const report = service.peekCheck(uriString)?.report;
    if (!report) { return undefined; }
    const count = countReportFindings(report);
    return count === 0 ? { kind: 'clean' } : { kind: 'findings', count };
  });
  context.subscriptions.push(
    window.registerTreeDataProvider('nikaWorkflows', workflowTree),
    service.onDidUpdateDocument(() => workflowTree.refresh()),
  );
  const watcher = workspace.createFileSystemWatcher('**/*.nika.yaml');
  watcher.onDidCreate(() => workflowTree.refresh());
  watcher.onDidDelete(() => workflowTree.refresh());
  watcher.onDidChange(() => workflowTree.refresh());
  context.subscriptions.push(watcher);

  const runsTree = new RunsTreeProvider();
  context.subscriptions.push(window.registerTreeDataProvider('nikaRuns', runsTree));

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
  traceWatcher.onDidCreate(onTraceEvent);
  traceWatcher.onDidChange(onTraceEvent);
  traceWatcher.onDidDelete(() => runsTree.refresh());
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
  const fixAllProvider = new NikaFixAllProvider(diagnosticsController);
  context.subscriptions.push(
    languages.registerCodeActionsProvider(
      [{ language: 'nika' }, { pattern: '**/*.nika.yaml' }],
      new NikaCodeActionProvider(diagnosticsController, service),
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
  registerIntel(context, service);

  // Audit lenses — inlay cost/when/fan-out + the header audit card.
  const inlayProvider = new AuditInlayHintsProvider(service);
  const lensProvider = new AuditCodeLensProvider(service);
  context.subscriptions.push(
    inlayProvider,
    lensProvider,
    languages.registerInlayHintsProvider([{ language: 'nika' }], inlayProvider),
    languages.registerCodeLensProvider([{ language: 'nika' }], lensProvider),
    languages.registerCodeLensProvider([{ language: 'nika' }], new TaskLensProvider()),
    new VerbGutterDecorations(),
    workspace.onDidSaveTextDocument((doc) => {
      if (NIKA_FILE_RE.test(doc.fileName)) { inlayProvider.refresh(); }
    }),
  );

  // Living panel · cursor sync: the caret's task gets a soft halo in the
  // graph (throttled · visible-panel-gated · same-workflow-gated).
  let cursorSyncTimer: ReturnType<typeof setTimeout> | undefined;
  let lastHintedTask: string | null = null;
  context.subscriptions.push(
    window.onDidChangeTextEditorSelection((e) => {
      if (!dagPanel.isVisible) { return; }
      if (!workspace.getConfiguration('nika').get<boolean>('dag.cursorSync', true)) { return; }
      const doc = e.textEditor.document;
      if (!NIKA_FILE_RE.test(doc.fileName)) { return; }
      if (dagWorkflowUri?.toString() !== doc.uri.toString()) { return; }
      if (cursorSyncTimer) { clearTimeout(cursorSyncTimer); }
      cursorSyncTimer = setTimeout(() => {
        const wf = parseRichWorkflow(doc.getText());
        const task = taskAtLine(wf, e.selections[0]?.active.line ?? 0);
        const id = task?.id ?? null;
        if (id !== lastHintedTask) {
          lastHintedTask = id;
          dagPanel.cursorHint(id);
        }
      }, 120);
    }),
    { dispose: () => { if (cursorSyncTimer) { clearTimeout(cursorSyncTimer); } } },
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
        const graph = await service.dagForDocument(doc);
        dagPanel.loadGraph(graph);
        dagPanel.note('⇄', `following ${workspace.asRelativePath(doc.uri)}`, undefined, 'st-note');
      }, 350);
    }),
    { dispose: () => { if (followTimer) { clearTimeout(followTimer); } } },
  );

  // Editor ⇄ graph: the per-task lens drives the DAG panel.
  context.subscriptions.push(
    commands.registerCommand('nika.focusTaskInDag', async (uri: Uri, taskId: string) => {
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      dagWorkflowUri = doc.uri;
      const graph = await service.dagForDocument(doc);
      dagPanel.show(graph);
      dagPanel.focusNode(taskId);
    }),
    commands.registerCommand('nika.peekTaskRefs', async (uri: Uri, taskId: string, line: number) => {
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

  // Intent → checked workflow (best-of-N · oracle-scored · bounded repair).
  registerGenerate(context, service, log);

  // DAG webview panel — track the active workflow URI for node-click navigation
  let dagWorkflowUri: Uri | undefined;

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
    const doc = await workspace.openTextDocument(uri);
    const text = doc.getText();
    let newText: string | undefined;
    let revealTask: string | undefined;

    switch (request.kind) {
      case 'dag:addTask': {
        // Detail line derives from the embedded schema (projection — a
        // new verb field engine-side shows up here without a release).
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
          { title: request.afterTaskId ? `New task after \`${request.afterTaskId}\`` : 'New task' },
        );
        if (!verb) { return; }
        const res = insertTaskSkeleton(text, verb.label as Verb, request.afterTaskId ?? undefined);
        if (res) {
          newText = res.text;
          revealTask = res.taskId;
        }
        break;
      }
      case 'dag:connect':
        // Edge from → to means « to depends_on from ». Idempotent.
        newText = addDependsOn(text, request.to, request.from);
        break;
      case 'dag:disconnect':
        newText = removeDependsOn(text, request.to, request.from);
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
    }
    if (newText === undefined || newText === text) { return; }

    const edit = new WorkspaceEdit();
    edit.replace(uri, new Range(0, 0, doc.lineCount, 0), newText);
    await workspace.applyEdit(edit);

    // Refresh the projection from the edited (dirty) document.
    service.invalidate(uri.toString());
    const fresh = await workspace.openTextDocument(uri);
    const graph = await service.dagForDocument(fresh);
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
    }
  };

  const dagPanel = new DagPanel(
    context.extensionUri,
    jumpToTask,
    undefined,
    (request) => { void applyDagEdit(request); },
    () => { void commands.executeCommand('nika.showDag'); },
    {
      get: () => context.workspaceState.get<number>('nika.dagColumn'),
      set: (column) => { void context.workspaceState.update('nika.dagColumn', column); },
    },
  );
  state.activeDagPanel = dagPanel;

  // Session narration → the activity feed (check verdicts · live when the
  // panel shows THIS workflow). onDidUpdateDocument fires for BOTH check
  // and graph completions — dedupe on the verdict so one edit narrates once.
  let lastCheckNote = '';
  context.subscriptions.push(
    service.onDidUpdateDocument((uriString) => {
      if (!dagPanel.hasPanel || dagWorkflowUri?.toString() !== uriString) { return; }
      const report = service.peekCheck(uriString)?.report;
      if (!report) { return; }
      const findings = countReportFindings(report);
      const verdict = `${uriString}#${findings}`;
      if (verdict === lastCheckNote) { return; }
      lastCheckNote = verdict;
      if (findings === 0) {
        dagPanel.note('✓', 'check clean', undefined, 'st-success');
      } else {
        dagPanel.note('✗', `check · ${findings} finding${findings === 1 ? '' : 's'}`, undefined, 'st-failed');
      }
    }),
  );
  context.subscriptions.push(dagPanel);
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
    commands.registerCommand('nika.runWorkflow', async (uri?: Uri) => {
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      if (service.caps.run) {
        // Live: paint `run --json`'s event stream onto the DAG in real
        // time (the overlay the panel was built for). A plain terminal
        // run stays one keystroke away via the palette for raw output.
        if (doc.uri.scheme === 'file'
          && workspace.getConfiguration('nika').get<boolean>('run.liveDag', true)) {
          dagWorkflowUri = doc.uri;
          const graph = await service.dagForDocument(doc);
          dagPanel.show(graph);
          runWorkflowLive(service, dagPanel, doc.uri.fsPath, log);
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
        'This `nika` binary predates the `run` verb (it shipped with the engine runtime at L3). Update the binary to execute workflows — until then, audit before run.',
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
      runNikaCommand(state.resolvedServerPath, 'inspect', doc.uri.fsPath);
    }),
  );

  // Command: Insert the inferred permits: boundary (default-deny, one keystroke).
  context.subscriptions.push(
    commands.registerCommand('nika.inferPermits', async (uri?: Uri) => {
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      const permits = await service.inferPermits(doc);
      if (!permits) {
        void window.showWarningMessage('Nika: could not infer a permits boundary (binary missing or workflow not parseable).');
        return;
      }
      const editor = await window.showTextDocument(doc);
      const rewritten = insertPermitsBlock(doc.getText(), permits);
      await editor.edit((b) => {
        b.replace(new Range(0, 0, doc.lineCount, 0), rewritten);
      });
      void window.showInformationMessage('Nika: inferred permits boundary inserted — the workflow is now default-deny.');
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

  // Command: New workflow — engine templates first, starter fallback.
  context.subscriptions.push(
    commands.registerCommand('nika.newWorkflow', async () => {
      const folder = workspace.workspaceFolders?.[0];
      if (!folder) {
        window.showErrorMessage('Open a folder first.');
        return;
      }
      const name = await window.showInputBox({
        prompt: 'Workflow name (without extension)',
        placeHolder: 'my-workflow',
        validateInput: (v) => /^[a-z0-9-]+$/.test(v) ? null : 'Use lowercase letters, numbers, hyphens',
      });
      if (!name) { return; }
      const filePath = Uri.joinPath(folder.uri, `${name}.nika.yaml`);

      const templates = await service.templatesList();
      if (templates.length > 0) {
        const picked = await window.showQuickPick(
          [...templates.map((t) => ({ label: t, description: 'embedded engine template' })),
           { label: '$(pencil) blank starter', description: 'minimal envelope · mock/echo' }],
          { title: 'Nika: new workflow from template' },
        );
        if (!picked) { return; }
        if (!picked.label.includes('blank starter')) {
          const res = await service.newFromTemplate(picked.label, filePath.fsPath);
          if (res.code === 0) {
            const doc = await workspace.openTextDocument(filePath);
            await window.showTextDocument(doc);
            return;
          }
          log('WARN', `nika new failed (${res.code}): ${res.stderr || res.stdout}`);
        }
      }

      const content = Buffer.from(
        `# yaml-language-server: $schema=https://nika.sh/schema/v1.json\nnika: v1\nworkflow: ${name}\n\nmodel: mock/echo  # deterministic · swap for anthropic/claude-sonnet-4-6\n\ntasks:\n  - id: start\n    infer:\n      prompt: ""\n`,
        'utf-8',
      );
      await workspace.fs.writeFile(filePath, content);
      const doc = await workspace.openTextDocument(filePath);
      await window.showTextDocument(doc);
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
      const doc = await requireNikaDocument(uri);
      if (!doc) { return; }
      dagWorkflowUri = doc.uri;
      const graph = await service.dagForDocument(doc);
      dagPanel.show(graph);
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
    commands.registerCommand('nika.exportDagMermaid', exportDag('mermaid')),
    commands.registerCommand('nika.exportDagDot', exportDag('dot')),
  );

  // Command: Replay a trace through the DAG (replay = re-render, never re-execute).
  context.subscriptions.push(
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
    commands.registerCommand('nika.watchDemo', () => {
      runNikaCommand(state.resolvedServerPath, 'trace replay --demo', '');
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
      void window.showInformationMessage('Nika: AI authoring protocol copied — paste it into any agent.');
    }),
  );

  // Command: Verify the nika binary (walkthrough step 1 completion event).
  context.subscriptions.push(
    commands.registerCommand('nika.checkBinary', async () => {
      const p = state.resolvedServerPath ?? getNikaPath();
      if (p && (await isBinaryWorking(p))) {
        window.showInformationMessage(`Nika binary OK · ${p} · ${service.caps.version}`);
      } else {
        window.showWarningMessage(
          'Nika binary not found. Install it or let the extension download it.',
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
      await configureMcpForHost(state.resolvedServerPath, service.intel?.providers);
    }),
  );

  // Command: Restart language server
  context.subscriptions.push(
    commands.registerCommand('nika.restartServer', async () => {
      if (state.client) {
        await state.client.stop();
        state.client = undefined;
      }
      if (service.caps.lsp) {
        startClient(context, state, log, state.resolvedServerPath);
        window.showInformationMessage('Nika language server restarted.');
      } else {
        window.showInformationMessage('`nika lsp` is not available from this binary yet — client-side intelligence stays active.');
      }
    }),
  );

  // ─── Binary discovery → capability probe → (maybe) LSP ────────────────────

  void (async () => {
    const binaryPath = await resolveBinary(context);
    state.resolvedServerPath = binaryPath;
    await service.setBinary(binaryPath);

    if (!binaryPath) {
      statusBar.setLspState('off');
      const choice = await window.showWarningMessage(
        'Nika binary not found. Install it (cargo install nika) or let the extension download it.',
        'Open Install Guide',
      );
      if (choice === 'Open Install Guide') {
        void env.openExternal(Uri.parse(GITHUB_INSTALL_URL));
      }
      return;
    }

    if (service.caps.mcp) {
      await configureMcpForHost(binaryPath, service.intel?.providers, false);
    } else {
      log('INFO', 'nika mcp not in this binary — agent MCP setup skipped');
    }

    if (service.caps.lsp) {
      // The engine ships `nika lsp` — full server takes over; the client
      // keeps expression intel (server is structure-level at v0.1) and the
      // secrets lint, but check-diagnostics defer to the server.
      diagnosticsController.lspOwnsDiagnostics = true;
      startClient(context, state, log, binaryPath);
    } else {
      statusBar.setLspState('off');
      log('INFO', 'nika lsp not in this binary (ships in-binary at v0.81) — client-side intelligence active');
    }
  })();
}

async function configureMcpForHost(
  resolvedServerPath: string | undefined,
  providers: Parameters<typeof ensureCursorRules>[1],
  notify = true,
): Promise<void> {
  if (isCursor()) {
    await ensureCursorMcpConfig(resolvedServerPath, log);
    await ensureCursorRules(log, providers);
    if (notify) {
      window.showInformationMessage('Nika MCP + .cursor/rules wired for Cursor.');
    }
  } else if (isWindsurf()) {
    await ensureWindsurfMcpConfig(resolvedServerPath, log);
    if (notify) {
      window.showInformationMessage('Nika MCP config wired for Windsurf.');
    }
  } else {
    await ensureVscodeMcpConfig(resolvedServerPath, log);
    if (notify) {
      window.showInformationMessage('Nika MCP config wired (.vscode/mcp.json).');
    }
  }
}

/** Discovery priority: explicit config → bundled → PATH (`nika` · `nika-cli`) → cached → download. */
async function resolveBinary(context: ExtensionContext): Promise<string | undefined> {
  const configPath = getNikaPath();
  if (configPath !== 'nika') {
    log('INFO', `Using configured binary: ${configPath}`);
    return configPath;
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
  // arrives without an explicit yes). Remembered globally once granted.
  if (!context.globalState.get<boolean>('nika.downloadConsent')) {
    const pick = await window.showInformationMessage(
      'Nika engine not found. Download the official binary from GitHub releases? (HTTPS · SHA-256 verified · ~10 MB)',
      { modal: true },
      'Download',
    );
    if (pick !== 'Download') { return undefined; }
    await context.globalState.update('nika.downloadConsent', true);
  }
  try {
    const downloaded = await downloadNikaBinary(storagePath);
    if (downloaded && fs.existsSync(downloaded) && (await isBinaryWorking(downloaded))) {
      window.showInformationMessage('Nika engine downloaded successfully.');
      return downloaded;
    }
  } catch (err) {
    log('WARN', `Download failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return undefined;
}

export function deactivate(): Thenable<void> | undefined {
  if (state.statusPollInterval !== undefined) {
    clearInterval(state.statusPollInterval);
    state.statusPollInterval = undefined;
  }
  if (!state.client) {
    return undefined;
  }
  return state.client.stop();
}
