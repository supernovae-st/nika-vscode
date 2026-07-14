// taskLens.ts — per-task editor surfaces: a code lens row above every
// the task key (focus the node in the DAG · peek its references) and subtle
// verb-tinted gutter dots. The editor and the graph become ONE surface:
// the lens drives the webview, the webview's double-click drives the
// editor back.

import * as vscode from 'vscode';
import { wornArmor } from '../core/armorEdit';
import { findTaskKey } from '../core/flowEdit';
import {
  ARMOR_DOOR, COLLECTION_DOOR, GATE_DOOR, graphDoorTitle, RERUN_DOOR,
  WIRE_INPUTS_DOOR,
} from '../core/lensVocab';
import { countTaskRefs } from '../core/renameRefs';
import { traceStore } from '../core/traceStore';
import { NIKA_VERB_HEX } from '../design-tokens.generated';
import { parseRichWorkflow } from '../workflowParser';

function isNikaDoc(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'nika' || /\.nika\.ya?ml$/.test(doc.fileName);
}

/** The flow doors — each on the task-level line it rewrites (never on
 * the id row: an absent key is discoverable via LSP, not lens noise). */
const FLOW_DOORS = [
  {
    key: 'after',
    command: 'nika.wireInputs',
    title: WIRE_INPUTS_DOOR,
    tooltip: 'Re-pick what this task waits for (control · {producer: predicate}) — descendants never offered (cycle-safe); block maps collapse to the flow form',
  },
  {
    key: 'when',
    command: 'nika.chooseGate',
    title: GATE_DOOR,
    tooltip: 'Swap the CEL v0.1 gate — LOCAL reads only (vars · with): upstream state becomes after:, an upstream value crosses through with: first',
  },
  {
    key: 'for_each',
    command: 'nika.chooseCollection',
    title: COLLECTION_DOOR,
    tooltip: 'Swap the collection this task maps over — ${{ item }} is the element, ${{ index }} its position',
  },
] as const;

export class TaskLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    // The armor door reads the latest fold — a fresh run must repaint.
    this.disposables.push(this.emitter, traceStore.onDidUpdate(() => this.emitter.fire()));
  }

  dispose(): void {
    for (const d of this.disposables) { d.dispose(); }
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!isNikaDoc(document)) { return []; }
    if (!vscode.workspace.getConfiguration('nika').get<boolean>('codeLens.enabled', true)) {
      return [];
    }
    const text = document.getText();
    const lines = text.split('\n');
    const wf = parseRichWorkflow(text);
    const fold = traceStore.get(document.uri.fsPath)?.fold;
    // ONE aggregate pass for every task's ref count — the per-task
    // findTaskRefs walk made this repaint O(V·L), quadratic on the
    // generated hundreds-of-tasks DAGs (equivalence pinned in tests).
    const refCounts = countTaskRefs(text, new Set(wf.tasks.map((t) => t.id)));
    const lenses: vscode.CodeLens[] = [];

    for (const task of wf.tasks) {
      const range = document.lineAt(Math.min(task.line, document.lineCount - 1)).range;
      for (const door of FLOW_DOORS) {
        const at = findTaskKey(lines, task, door.key);
        if (!at) { continue; }
        lenses.push(new vscode.CodeLens(new vscode.Range(at.line, 0, at.line, 0), {
          command: door.command,
          title: door.title,
          tooltip: door.tooltip,
          arguments: [document.uri, task.id],
        }));
      }
      // ONE fused lens per task — two lines of lens per task on a 20-task
      // file is noise, not signal. References stay reachable natively
      // (⇧F12 · our ReferenceProvider) and via the peek command.
      lenses.push(new vscode.CodeLens(range, {
        command: 'nika.rerunTask',
        title: RERUN_DOOR,
        tooltip: 'Run THIS task and its upstream cone only (nika run --task) — the regenerate-one-block move',
        arguments: [document.uri, task.id],
      }));
      lenses.push(new vscode.CodeLens(range, {
        command: 'nika.focusTaskInDag',
        title: graphDoorTitle(refCounts.get(task.id) ?? 0),
        tooltip: 'Focus this task in the DAG (lineage lit) — ⇧F12 peeks its references',
        arguments: [document.uri, task.id],
      }));
      // The armor door — contextual, not ambient: only on a task the
      // LAST RUN proved fragile, and only while a wall is missing.
      // (Proactive armoring stays one palette command away.)
      if (fold?.tasks.get(task.id)?.status === 'failed'
        && wornArmor(lines, task).size < 3) {
        lenses.push(new vscode.CodeLens(range, {
          command: 'nika.makeResilient',
          title: ARMOR_DOOR,
          tooltip: 'This task failed its last run — retry absorbs transient errors; recover/skip catch the rest; timeout bounds the wait. A wrong prompt needs editing, not armor.',
          arguments: [document.uri, task.id],
        }));
      }
    }
    return lenses;
  }
}

// ─── Verb gutter dots · the file scannable at a glance ──────────────────────

// The 4 verb hues — the shared visual vocabulary SSOT (nika-spec
// design/tokens.yaml, projected here as design-tokens.generated.ts):
// a verb's color is language identity, identical on every Nika surface.
const VERB_DOT_COLORS: Record<string, string> = NIKA_VERB_HEX;

function dotUri(color: string): vscode.Uri {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><circle cx="7" cy="8" r="2.6" fill="${color}" fill-opacity="0.9"/></svg>`;
  return vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
}

export class VerbGutterDecorations implements vscode.Disposable {
  private readonly types = new Map<string, vscode.TextEditorDecorationType>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    for (const [verb, color] of Object.entries(VERB_DOT_COLORS)) {
      this.types.set(verb, vscode.window.createTextEditorDecorationType({
        gutterIconPath: dotUri(color),
        gutterIconSize: 'auto',
      }));
    }
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((ed) => { if (ed) { this.apply(ed); } }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        const ed = vscode.window.activeTextEditor;
        if (ed && e.document === ed.document) { this.apply(ed); }
      }),
    );
    if (vscode.window.activeTextEditor) { this.apply(vscode.window.activeTextEditor); }
  }

  private apply(editor: vscode.TextEditor): void {
    if (!isNikaDoc(editor.document)) { return; }
    const enabled = vscode.workspace.getConfiguration('nika').get<boolean>('decorations.verbDots', true);
    const wf = enabled ? parseRichWorkflow(editor.document.getText()) : { tasks: [] };
    const byVerb = new Map<string, vscode.Range[]>();
    for (const task of wf.tasks) {
      if (!this.types.has(task.verb)) { continue; }
      (byVerb.get(task.verb) ?? byVerb.set(task.verb, []).get(task.verb)!).push(
        editor.document.lineAt(Math.min(task.line, editor.document.lineCount - 1)).range,
      );
    }
    for (const [verb, type] of this.types) {
      editor.setDecorations(type, byVerb.get(verb) ?? []);
    }
  }

  dispose(): void {
    for (const t of this.types.values()) { t.dispose(); }
    for (const d of this.disposables) { d.dispose(); }
  }
}
