// liveDag.ts — the DAG recomposes WHILE you type (the Krea-realtime leg).
//
// Today the panel only reloads on command / run / follow-switch; edits
// leave it stale until the next explicit action. This feature closes
// that gap with a deliberately narrow trigger chain:
//
//   keystroke → debounce 250ms → parseRichWorkflow (client, no engine
//   subprocess) → TOPOLOGY hash (topoKey) → changed? → dag:load with the
//   client-shaped graph (clientDagFor · the same projection the
//   no-engine fallback uses).
//
// The hash is the anti-flicker gate: typing inside a prompt, a `with:`
// block or a comment produces the SAME key → total no-op (no parse
// output is even compared — one string equality). Only real topology
// moves (task added/removed/renamed · verb swapped · after/with edges edited)
// reload the panel, so ELK relayouts exactly when the shape changed.
//
// The engine projection stays the truth: on SAVE the canon path
// (service.dagForDocument · `nika inspect` when available) re-syncs the
// panel. A live run OWNS the DAG (statuses are painting) — liveDag
// suspends while one is active and resumes on the next edit after.

import { workspace, window, type Disposable, type TextDocument } from 'vscode';
import type { DagPanel } from '../dagPanel';
import { clientDagFor } from '../core/clientDag';
import type { NikaService } from '../nikaService';
import { parseRichWorkflow, topoKey } from '../workflowParser';
import { isRunActive } from './runLive';

const DEBOUNCE_MS = 250;
const NIKA_FILE_RE = /\.nika\.ya?ml$/;

export class LiveDag {
  private readonly disposables: Disposable[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** topoKey of the last graph the PANEL saw (whatever loaded it). */
  private lastKey: string | undefined;

  constructor(
    private readonly service: NikaService,
    private readonly panel: DagPanel,
  ) {
    this.disposables.push(
      workspace.onDidChangeTextDocument((e) => {
        if (!this.tracks(e.document) || e.contentChanges.length === 0) { return; }
        if (this.timer) { clearTimeout(this.timer); }
        this.timer = setTimeout(() => this.recompose(e.document), DEBOUNCE_MS);
      }),
      // Save → the canon engine projection re-syncs the sketch (cost
      // intervals · fan-out counts · everything the client parse lacks).
      workspace.onDidSaveTextDocument((doc) => {
        if (!this.tracks(doc)) { return; }
        void this.resyncCanon(doc);
      }),
    );
  }

  /** The narrow trigger chain — every guard is a cheap sync check. */
  private tracks(doc: TextDocument): boolean {
    if (!this.panel.hasPanel) { return false; }
    if (!NIKA_FILE_RE.test(doc.fileName)) { return false; }
    if (window.activeTextEditor?.document !== doc) { return false; }
    if (isRunActive()) { return false; }
    // Only recompose the workflow the panel is SHOWING (follow-mode
    // handles re-targeting; liveDag never steals the panel).
    const shown = this.panel.currentWorkflowUri();
    return shown === undefined || shown === doc.uri.toString();
  }

  private recompose(doc: TextDocument): void {
    if (!this.tracks(doc)) { return; }
    const text = doc.getText();
    const key = topoKey(parseRichWorkflow(text));
    if (key === this.lastKey) { return; }
    this.lastKey = key;
    const graph = clientDagFor(text, doc.uri.toString(), doc.fileName.split('/').pop() ?? 'workflow');
    this.panel.loadGraph(graph);
  }

  private async resyncCanon(doc: TextDocument): Promise<void> {
    this.service.invalidate(doc.uri.toString());
    const graph = await this.service.dagForDocument(doc);
    this.lastKey = topoKey(parseRichWorkflow(doc.getText()));
    this.panel.loadGraph(graph);
  }

  dispose(): void {
    if (this.timer) { clearTimeout(this.timer); }
    for (const d of this.disposables) { d.dispose(); }
  }
}
