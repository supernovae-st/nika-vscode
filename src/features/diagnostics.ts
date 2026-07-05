// diagnostics.ts — `nika check --json` → editor diagnostics (client path).
//
// Active whenever the LSP is NOT running or unavailable from the selected
// binary: the conformance oracle itself paints the squiggles.
// Findings keep their machine-applicable `fix` — the code-action provider
// reads them back from this controller. The local secrets lint rides the
// same collection (its findings exist BEFORE a secret is ever declared).

import * as vscode from 'vscode';
import {
  byteOffsetToPosition,
  collectFindings,
  type UnifiedFinding,
} from '../core/cliContract';
import { scanSecrets, type SecretFinding } from '../core/credentialLint';
import { collectDataFlow } from '../core/dataflow';
import { redundantEdges } from '../core/graphIntel';
import { collectShapes } from '../core/schemaShape';
import { severityOverrideFor, type SeverityName } from '../core/severityMap';
import { parseDag003 } from '../core/structuralFixes';
import { parseRichWorkflow, type RichWorkflow } from '../workflowParser';
import type { NikaService } from '../nikaService';

export const NIKA_DIAG_SOURCE = 'nika';

export interface StoredFinding {
  finding: UnifiedFinding;
  range: vscode.Range;
}

export interface StoredSecret {
  secret: SecretFinding;
  range: vscode.Range;
}

export interface StoredRedundant {
  task: string;
  dep: string;
  range: vscode.Range;
}

/** Escape a client-parsed id for RegExp use — the loose parser accepts
 * WIP garbage like `a(b)`, which must never throw out of the linter. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Range of `dep` inside `task`'s depends_on (inline item or block line). */
function dependsOnEntryRange(
  doc: vscode.TextDocument,
  wf: RichWorkflow,
  taskId: string,
  dep: string,
): vscode.Range | undefined {
  const task = wf.tasks.find((t) => t.id === taskId);
  if (!task) { return undefined; }
  for (let i = task.line; i <= task.endLine && i < doc.lineCount; i++) {
    const line = doc.lineAt(i).text;
    if (/^\s*depends_on:/.test(line)) {
      const idx = line.indexOf(dep, line.indexOf(':'));
      if (idx !== -1) { return new vscode.Range(i, idx, i, idx + dep.length); }
      continue;
    }
    const block = line.match(new RegExp(`^(\\s*-\\s*)(${escapeRe(dep)})\\s*(#.*)?$`));
    if (block) {
      return new vscode.Range(i, block[1].length, i, block[1].length + dep.length);
    }
  }
  return undefined;
}

function severityOf(f: UnifiedFinding): vscode.DiagnosticSeverity {
  switch (f.severity) {
    case 'error': return vscode.DiagnosticSeverity.Error;
    case 'warning': return vscode.DiagnosticSeverity.Warning;
    default: return vscode.DiagnosticSeverity.Information;
  }
}

const SEVERITY_BY_NAME: Record<Exclude<SeverityName, 'off'>, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

/**
 * Apply the user's `nika.diagnostics.severity` remap to a built diagnostic.
 * Returns false when the code is configured `off` (the finding is dropped).
 * Shared with the workspace (closed-file) lint — ONE remap semantics.
 */
export function applySeverityRemap(d: vscode.Diagnostic): boolean {
  const code = typeof d.code === 'object' ? String(d.code.value) : String(d.code ?? '');
  if (code.length === 0) { return true; }
  const map = vscode.workspace.getConfiguration('nika').get<Record<string, string>>('diagnostics.severity', {});
  const override = severityOverrideFor(code, map);
  if (override === undefined) { return true; }
  if (override === 'off') { return false; }
  d.severity = SEVERITY_BY_NAME[override];
  return true;
}

function isNikaDoc(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'nika' || /\.nika\.ya?ml$/.test(doc.fileName);
}

export class DiagnosticsController implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection(NIKA_DIAG_SOURCE);
  private readonly findings = new Map<string, StoredFinding[]>();
  private readonly secrets = new Map<string, StoredSecret[]>();
  private readonly redundant = new Map<string, StoredRedundant[]>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly disposables: vscode.Disposable[] = [];
  /** Fires around each lint pass — the language status busy indicator. */
  private readonly runStateEmitter = new vscode.EventEmitter<{ uri: string; running: boolean }>();
  readonly onDidRunState = this.runStateEmitter.event;
  /** When true, the LSP owns check diagnostics — only the secrets lint runs. */
  lspOwnsDiagnostics = false;

  constructor(private readonly service: NikaService) {
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => this.schedule(doc, 0)),
      vscode.workspace.onDidSaveTextDocument((doc) => this.schedule(doc, 0)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (!isNikaDoc(e.document)) { return; }
        this.service.invalidate(e.document.uri.toString());
        const mode = vscode.workspace.getConfiguration('nika').get<string>('diagnostics.runOn', 'type');
        if (mode === 'type') { this.schedule(e.document, 600); }
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        // Cancel any pending debounce — a timer firing after close would
        // re-populate the maps and spawn a check for a dead document.
        const key = doc.uri.toString();
        const pending = this.timers.get(key);
        if (pending) {
          clearTimeout(pending);
          this.timers.delete(key);
        }
        this.collection.delete(doc.uri);
        this.findings.delete(key);
        this.secrets.delete(key);
      }),
      this.service.onDidChange(() => this.refreshAll()),
    );
    this.refreshAll();
  }

  refreshAll(): void {
    for (const doc of vscode.workspace.textDocuments) {
      this.schedule(doc, 0);
    }
  }

  findingsAt(uri: vscode.Uri, range: vscode.Range): StoredFinding[] {
    return (this.findings.get(uri.toString()) ?? []).filter((s) => s.range.intersection(range) !== undefined);
  }

  secretsAt(uri: vscode.Uri, range: vscode.Range): StoredSecret[] {
    return (this.secrets.get(uri.toString()) ?? []).filter((s) => s.range.intersection(range) !== undefined);
  }

  redundantAt(uri: vscode.Uri, range: vscode.Range): StoredRedundant[] {
    return (this.redundant.get(uri.toString()) ?? []).filter((s) => s.range.intersection(range) !== undefined);
  }

  /** Latest check outcome facts for the code lens (ceiling · waves). */
  private schedule(doc: vscode.TextDocument, delayMs: number): void {
    if (!isNikaDoc(doc)) { return; }
    const mode = vscode.workspace.getConfiguration('nika').get<string>('diagnostics.runOn', 'type');
    if (mode === 'off') {
      this.collection.delete(doc.uri);
      return;
    }
    const key = doc.uri.toString();
    const existing = this.timers.get(key);
    if (existing) { clearTimeout(existing); }
    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key);
      void this.run(doc);
    }, delayMs));
  }

  private async run(doc: vscode.TextDocument): Promise<void> {
    this.runStateEmitter.fire({ uri: doc.uri.toString(), running: true });
    try {
      await this.runInner(doc);
    } finally {
      this.runStateEmitter.fire({ uri: doc.uri.toString(), running: false });
    }
  }

  private async runInner(doc: vscode.TextDocument): Promise<void> {
    const diagnostics: vscode.Diagnostic[] = [];
    const text = doc.getText();

    // 1 · local secrets lint (pure · works with zero binary)
    const storedSecrets: StoredSecret[] = [];
    if (vscode.workspace.getConfiguration('nika').get<boolean>('secretsLint.enabled', true)) {
      for (const s of scanSecrets(text)) {
        const range = new vscode.Range(s.line, s.startCol, s.line, s.endCol);
        const d = new vscode.Diagnostic(
          range,
          `literal ${s.kind} — secrets never belong in workflow YAML; use \${{ env.${s.envVar} }}`,
          vscode.DiagnosticSeverity.Warning,
        );
        d.source = NIKA_DIAG_SOURCE;
        d.code = 'nika.literal-secret';
        d.tags = [];
        if (applySeverityRemap(d)) { diagnostics.push(d); }
        // Stored regardless — the ${{ env.VAR }} quick fix stays reachable
        // even when the user silenced the squiggle.
        storedSecrets.push({ secret: s, range });
      }
    }
    this.secrets.set(doc.uri.toString(), storedSecrets);

    // 1bis · transitive reduction (Aho-Garey-Ullman 1972): an order-only
    // depends_on already guaranteed through a longer path narrows the
    // parallelism for nothing — surface it as an Information hint with a
    // one-click removal. Data-carrying edges are exempt: a wire the task
    // READS stays, even when ordering survives without it.
    const storedRedundant: StoredRedundant[] = [];
    {
      const wf = parseRichWorkflow(text);
      const flow = collectDataFlow(text);
      // Reachability uses ALL edges; only data-free ones may be removed.
      const allEdges = wf.tasks.flatMap((t) => t.dependsOn.map((d) => ({ source: d, target: t.id })));
      const redundantAll = redundantEdges(wf.tasks.map((t) => t.id), allEdges);
      for (const edge of redundantAll) {
        const carries = (flow.inputs.get(edge.target) ?? []).some((b) => b.from === edge.source);
        if (carries) { continue; }
        const range = dependsOnEntryRange(doc, wf, edge.target, edge.source);
        if (!range) { continue; }
        const d = new vscode.Diagnostic(
          range,
          `redundant depends_on: \`${edge.target}\` already runs after \`${edge.source}\` through a longer path — removing this widens parallelism (transitive reduction)`,
          vscode.DiagnosticSeverity.Information,
        );
        d.source = NIKA_DIAG_SOURCE;
        d.code = 'nika.redundant-dep';
        d.tags = [vscode.DiagnosticTag.Unnecessary];
        const srcTask = wf.tasks.find((t) => t.id === edge.source);
        if (srcTask) {
          d.relatedInformation = [new vscode.DiagnosticRelatedInformation(
            new vscode.Location(doc.uri, doc.lineAt(Math.min(srcTask.line, doc.lineCount - 1)).range),
            `\`${edge.source}\` already orders \`${edge.target}\` through the longer path from here`,
          )];
        }
        if (applySeverityRemap(d)) { diagnostics.push(d); }
        storedRedundant.push({ task: edge.target, dep: edge.source, range });
      }
    }
    this.redundant.set(doc.uri.toString(), storedRedundant);

    // 1ter · declared-but-unconsumed schema: a task PROMISES a typed shape
    // (`schema:`) but nothing downstream ever reads `tasks.X…`. Sinks are
    // exempt — their output IS the workflow's result. Consumption is the
    // bare-regex scan (when:/outputs:/CEL live OUTSIDE ${{ }} islands).
    {
      const wf = parseRichWorkflow(text);
      const shapes = collectShapes(text);
      const dependedUpon = new Set<string>();
      for (const t of wf.tasks) {
        for (const d of t.dependsOn) { dependedUpon.add(d); }
      }
      for (const t of wf.tasks) {
        if (!dependedUpon.has(t.id)) { continue; } // sink — result carrier
        if (!shapes.has(t.id)) { continue; }
        if (new RegExp(`\\btasks\\.${escapeRe(t.id)}\\b`).test(text)) { continue; }
        for (let i = t.line; i <= t.endLine && i < doc.lineCount; i++) {
          const m = doc.lineAt(i).text.match(/^(\s*)schema:/);
          if (!m) { continue; }
          const d = new vscode.Diagnostic(
            new vscode.Range(i, m[1].length, i, m[1].length + 'schema:'.length),
            `\`${t.id}\` declares a typed output that nothing consumes — no downstream \`\${{ tasks.${t.id}… }}\` ref exists; wire the output or drop the \`schema:\` promise`,
            vscode.DiagnosticSeverity.Information,
          );
          d.source = NIKA_DIAG_SOURCE;
          d.code = 'nika.unused-schema';
          if (applySeverityRemap(d)) { diagnostics.push(d); }
          break;
        }
      }
    }

    // 2 · the conformance oracle (skipped when the LSP owns diagnostics)
    const stored: StoredFinding[] = [];
    if (!this.lspOwnsDiagnostics && this.service.caps.check) {
      const outcome = await this.service.checkDocument(doc);
      if (outcome && !outcome.report && outcome.exit !== 0) {
        // Hard parse failures bypass the JSON report (`PARSE ✗ …` lines).
        // The WORST error class must not be the only one without a
        // squiggle — surface the raw first line at the document top.
        const firstLine = outcome.raw.split('\n').find((l) => l.trim().length > 0) ?? 'nika check failed';
        const d = new vscode.Diagnostic(
          doc.lineAt(0).range,
          firstLine.replace(/^PARSE\s*[✗x]\s*/i, ''),
          vscode.DiagnosticSeverity.Error,
        );
        d.source = NIKA_DIAG_SOURCE;
        d.code = 'nika.parse';
        if (applySeverityRemap(d)) { diagnostics.push(d); }
      }
      if (outcome?.report) {
        const wf = parseRichWorkflow(text);
        const taskLine = new Map(wf.tasks.map((t) => [t.id, t.line]));
        for (const f of collectFindings(outcome.report)) {
          const range = this.rangeFor(doc, text, f, taskLine);
          const d = new vscode.Diagnostic(range, f.message, severityOf(f));
          d.source = NIKA_DIAG_SOURCE;
          d.code = f.code.startsWith('NIKA-')
            ? { value: f.code, target: vscode.Uri.parse(`https://nika.sh/errors/${f.code}`) }
            : f.code;
          // DAG-003 names two tasks — light the producer's declaration so
          // the Problems panel walks the user to both ends of the wire.
          if (f.code === 'NIKA-DAG-003') {
            const dag = parseDag003(f.message);
            const declLine = dag ? taskLine.get(dag.missing) : undefined;
            if (dag && declLine !== undefined) {
              d.relatedInformation = [new vscode.DiagnosticRelatedInformation(
                new vscode.Location(doc.uri, doc.lineAt(Math.min(declLine, doc.lineCount - 1)).range),
                `\`${dag.missing}\` is produced here — declare it in \`${dag.task}\`'s depends_on`,
              )];
            }
          }
          if (applySeverityRemap(d)) { diagnostics.push(d); }
          // Stored regardless — quick fixes outlive a silenced squiggle.
          stored.push({ finding: f, range });
        }
      }
    }
    this.findings.set(doc.uri.toString(), stored);

    this.collection.set(doc.uri, diagnostics);
  }

  private rangeFor(
    doc: vscode.TextDocument,
    text: string,
    f: UnifiedFinding,
    taskLine: Map<string, number>,
  ): vscode.Range {
    if (f.span) {
      const start = byteOffsetToPosition(text, f.span.start);
      const end = byteOffsetToPosition(text, f.span.end);
      return new vscode.Range(start.line, start.character, end.line, end.character);
    }
    if (f.task !== undefined) {
      const line = taskLine.get(f.task);
      if (line !== undefined) {
        return doc.lineAt(Math.min(line, doc.lineCount - 1)).range;
      }
    }
    return doc.lineAt(0).range;
  }

  dispose(): void {
    for (const t of this.timers.values()) { clearTimeout(t); }
    this.timers.clear();
    this.collection.dispose();
    this.runStateEmitter.dispose();
    for (const d of this.disposables) { d.dispose(); }
  }
}
