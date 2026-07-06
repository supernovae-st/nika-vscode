// xray.ts — ghost values in the source: inlay hints showing what each
// `${{ tasks.X… }}` ref RESOLVED TO in the last matching recorded run.
// Passive by design (suggest at pause points, never mid-edit noise):
// hints exist only when a matching trace exists, refresh when a run
// lands, and say nothing they cannot prove — no recorded value, no
// hint; engine-masked outputs simply never reached the journal.

import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseRichWorkflow } from '../workflowParser';
import { parseTraceOutputs, xrayHintsForText } from '../core/xray';

interface CacheEntry {
  traceFsPath: string;
  mtimeMs: number;
  outputs: Map<string, unknown>;
}

export class XrayInlayProvider implements vscode.InlayHintsProvider {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeInlayHints = this.emitter.event;
  /** doc fsPath → parsed outputs of its newest matching trace. */
  private readonly cache = new Map<string, CacheEntry>();

  /** A finished run changed the recorded truth — re-pull the hints. */
  refresh(): void {
    this.emitter.fire();
  }

  async provideInlayHints(
    doc: vscode.TextDocument,
    range: vscode.Range,
  ): Promise<vscode.InlayHint[]> {
    if (!vscode.workspace.getConfiguration('nika').get<boolean>('editor.xray', true)) { return []; }
    const outputs = await this.outputsFor(doc);
    if (!outputs || outputs.size === 0) { return []; }
    const hints: vscode.InlayHint[] = [];
    for (const h of xrayHintsForText(doc.getText(), outputs)) {
      const pos = doc.positionAt(h.offset);
      if (!range.contains(pos)) { continue; }
      const hint = new vscode.InlayHint(pos, h.label, vscode.InlayHintKind.Type);
      hint.paddingLeft = true;
      hint.tooltip = new vscode.MarkdownString().appendCodeblock(h.full, 'json');
      hints.push(hint);
    }
    return hints;
  }

  /** Newest trace whose tasks majority-overlap THIS doc (the replay law). */
  private async outputsFor(doc: vscode.TextDocument): Promise<Map<string, unknown> | undefined> {
    const ids = new Set(parseRichWorkflow(doc.getText()).tasks.map((t) => t.id));
    if (ids.size === 0) { return undefined; }
    const glob = vscode.workspace.getConfiguration('nika').get<string>(
      'traces.glob',
      '**/.nika/traces/*.ndjson',
    );
    let files: vscode.Uri[];
    try {
      files = await vscode.workspace.findFiles(glob, '**/node_modules/**', 60);
    } catch {
      return undefined;
    }
    const newest = files
      .map((uri) => {
        try {
          return { uri, mtimeMs: fs.statSync(uri.fsPath).mtimeMs };
        } catch {
          return undefined;
        }
      })
      .filter((f): f is { uri: vscode.Uri; mtimeMs: number } => f !== undefined)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 12);
    for (const f of newest) {
      const cached = this.cache.get(doc.uri.fsPath);
      if (cached && cached.traceFsPath === f.uri.fsPath && cached.mtimeMs === f.mtimeMs) {
        return cached.outputs;
      }
      let outputs: Map<string, unknown>;
      try {
        outputs = parseTraceOutputs(fs.readFileSync(f.uri.fsPath, 'utf-8'));
      } catch {
        continue;
      }
      if (outputs.size === 0) { continue; }
      const overlap = [...outputs.keys()].filter((id) => ids.has(id)).length;
      if (overlap < Math.ceil(outputs.size * 0.6)) { continue; }
      this.cache.set(doc.uri.fsPath, {
        traceFsPath: f.uri.fsPath,
        mtimeMs: f.mtimeMs,
        outputs,
      });
      return outputs;
    }
    return undefined;
  }
}
