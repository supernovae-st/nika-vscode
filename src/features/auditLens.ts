// auditLens.ts — the static-audit moat made visible: inlay hints + code lens.
//
// Nika is the language you can audit BEFORE running: cost ceiling ·
// permits boundary · when-gates · fan-out are all static facts. This
// module paints them in the editor margin instead of leaving them buried
// in a terminal report. Sources: `graph --format json` (per-task) and
// `check --json` (workflow ceiling) — both engine-derived, never guessed.

import * as vscode from 'vscode';
import { countReportFindings } from '../core/cliContract';
import { findLensAnchors, findPermitsLine } from '../core/lensAnchors';
import {
  ADD_TASK_DOOR, DECLARE_BOUNDARY_DOOR, DECLARE_INPUT_DOOR, makeCallableDoorTitle,
  PUBLISH_DOOR, TIGHTEN_BOUNDARY_DOOR, varsDoorTitle,
} from '../core/lensVocab';
import { findOutputsBlock } from '../core/outputsEdit';
import { findVarsBlock, parseVarEntries } from '../core/varsEdit';
import type { NikaService } from '../nikaService';

function isNikaDoc(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'nika' || /\.nika\.ya?ml$/.test(doc.fileName);
}

function usd(n: number): string {
  return `$${n.toFixed(n < 0.1 ? 4 : 2)}`;
}

// ─── Inlay hints — per-task static facts at the `- id:` line ────────────────

export class AuditInlayHintsProvider implements vscode.InlayHintsProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeInlayHints = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly service: NikaService) {
    this.disposables.push(
      this.emitter,
      service.onDidChange(() => this.emitter.fire()),
      // When a fresh check/graph lands (debounced diagnostics or explicit
      // command), re-query so the peek path below picks it up.
      service.onDidUpdateDocument(() => this.emitter.fire()),
    );
  }

  refresh(): void {
    this.emitter.fire();
  }

  dispose(): void {
    for (const d of this.disposables) { d.dispose(); }
  }

  async provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): Promise<vscode.InlayHint[] | undefined> {
    if (!isNikaDoc(document)) { return undefined; }
    if (!vscode.workspace.getConfiguration('nika').get<boolean>('inlayHints.enabled', true)) {
      return undefined;
    }
    // Providers re-fire on EVERY edit; spawning `nika graph` per keystroke
    // would be brutal. Dirty buffer → cheap peek (last projection, possibly
    // stale). Clean buffer → authoritative (version-cached) call.
    const doc = document.isDirty
      ? this.service.peekGraph(document.uri.toString())
      : await this.service.graphDocument(document);
    if (!doc) { return undefined; }

    const hints: vscode.InlayHint[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (const node of doc.nodes) {
      // Locate the `- id: <node.id>` line (client anchor for engine facts).
      const lineIdx = lines.findIndex((l) => new RegExp(`^\\s*-\\s*id:\\s*["']?${escapeRe(node.id)}["']?\\s*(#.*)?$`).test(l));
      if (lineIdx === -1 || lineIdx < range.start.line || lineIdx > range.end.line) { continue; }

      // Interactive label parts (rust-analyzer pattern): each fact carries
      // its own tooltip; the cost part CLICKS through to the full report.
      const parts: vscode.InlayHintLabelPart[] = [];
      const push = (part: vscode.InlayHintLabelPart): void => {
        if (parts.length > 0) { part.value = `  ${part.value}`; }
        parts.push(part);
      };
      if (node.cost_interval) {
        const p = new vscode.InlayHintLabelPart(`${usd(node.cost_interval[0])}–${usd(node.cost_interval[1])}`);
        p.tooltip = new vscode.MarkdownString(
          `**${node.id}** · static cost interval \`${usd(node.cost_interval[0])} → ${usd(node.cost_interval[1])}\` (min path → worst case) — click for the full pre-flight report`,
        );
        p.command = { command: 'nika.showReport', title: 'Open check report', arguments: [document.uri] };
        push(p);
      }
      if (node.when && node.when !== 'true') {
        const p = new vscode.InlayHintLabelPart('⌁ when');
        p.tooltip = new vscode.MarkdownString(`gated: \`when: ${node.when}\` — the task runs only when this CEL condition holds`);
        push(p);
      }
      if (node.fan_out) {
        const p = new vscode.InlayHintLabelPart(node.fan_out.count != null ? `×${node.fan_out.count}` : '×n');
        p.tooltip = new vscode.MarkdownString(`fan-out: ${node.fan_out.kind}${node.fan_out.count != null ? ` ×${node.fan_out.count}` : ' (count known at run time)'}`);
        push(p);
      }
      if (parts.length === 0) { continue; }

      const position = new vscode.Position(lineIdx, lines[lineIdx].length);
      const hint = new vscode.InlayHint(position, parts, vscode.InlayHintKind.Type);
      hint.paddingLeft = true;
      hints.push(hint);
    }
    return hints;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Code lens — the workflow header audit card ─────────────────────────────

export class AuditCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly service: NikaService) {
    this.disposables.push(
      this.emitter,
      service.onDidChange(() => this.emitter.fire()),
      service.onDidUpdateDocument(() => this.emitter.fire()),
      vscode.workspace.onDidSaveTextDocument(() => this.emitter.fire()),
    );
  }

  refresh(): void {
    this.emitter.fire();
  }

  dispose(): void {
    for (const d of this.disposables) { d.dispose(); }
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    if (!isNikaDoc(document)) { return []; }
    if (!vscode.workspace.getConfiguration('nika').get<boolean>('codeLens.enabled', true)) {
      return [];
    }

    // One placement law (core/lensAnchors · operator layout 2026-07-12):
    // each row sits on the line it serves — the GitHub door above
    // `nika:` · Check/DAG/Run above `workflow:` · Explain above
    // `description:` · the STATUS row above `tasks:` (the plan's numbers
    // over the plan) — never over the license/header comments. Partial
    // files fall back up that chain, so no door disappears.
    const lines = document.getText().split('\n');
    const anchors = findLensAnchors(lines);
    const row = (line: number): vscode.Range => new vscode.Range(line, 0, line, 0);
    const env = row(anchors.env);
    const actions = row(anchors.actions);
    const explain = row(anchors.explain);
    const status = row(anchors.status);
    const lenses: vscode.CodeLens[] = [
      // The project door: nika is independent open source — the envelope
      // names the language, the lens names where it lives.
      new vscode.CodeLens(env, {
        command: 'nika.starOnGitHub',
        title: '$(github) GitHub',
        tooltip: 'supernovae-st/nika — the engine source · issues · releases',
      }),
      new vscode.CodeLens(actions, {
        command: 'nika.checkWorkflow',
        title: '$(check) Check',
        arguments: [document.uri],
      }),
      new vscode.CodeLens(actions, {
        command: 'nika.showDag',
        title: '$(type-hierarchy) DAG',
        arguments: [document.uri],
      }),
      // The beginner's missing door (2026-07-08 funnel audit): the
      // deterministic narrative existed but was palette-only — it now
      // sits on the line it narrates.
      new vscode.CodeLens(explain, {
        command: 'nika.explainWorkflow',
        title: '$(book) Explain',
        arguments: [document.uri],
        tooltip: 'What this workflow does, wave by wave — cost · touches · risks (offline, zero LLM)',
      }),
    ];

    if (this.service.caps.run) {
      lenses.push(new vscode.CodeLens(actions, {
        command: 'nika.runWorkflow',
        title: '$(play) Run',
        arguments: [document.uri],
      }));
    } else if (this.service.caps.trace) {
      lenses.push(new vscode.CodeLens(actions, {
        command: 'nika.watchDemo',
        title: '$(play-circle) Demo replay',
        tooltip: '`run` ships with the engine runtime (L3) — watch the flight-recorder demo meanwhile',
      }));
    }

    if (this.service.caps.check) {
      // Same per-keystroke discipline as inlay hints: dirty → peek only.
      const outcome = document.isDirty
        ? this.service.peekCheck(document.uri.toString())
        : await this.service.checkDocument(document);
      if (outcome?.report) {
        const r = outcome.report;
        const waveTotal = r.waves.reduce((acc, w) => acc + w.length, 0);
        const clean = r.clean === true;
        const findingCount = countReportFindings(r);
        // Verdict + ceiling share the target (the report) — ONE segment,
        // not two (the Rams pass: the status row's budget is the sin the
        // morning screenshot flagged).
        const bounded0 = r.cost.bounded_total_usd;
        const ceilingTail = typeof bounded0 === 'number' && bounded0 > 0
          ? ` · ≤ ${usd(bounded0)}`
          : '';
        const findingsTitle = clean
          ? `$(pass-filled) clean${ceilingTail}`
          : `$(warning) ${findingCount} finding${findingCount === 1 ? '' : 's'}${ceilingTail}`;
        lenses.push(new vscode.CodeLens(status, {
          command: 'nika.showReport',
          title: findingsTitle,
          arguments: [document.uri],
          tooltip: 'Open the full static pre-flight report (check --json) — verdict · findings · the cost ceiling',
        }));
        if (waveTotal > 0) {
          lenses.push(new vscode.CodeLens(status, {
            command: 'nika.showDag',
            title: `$(layers) ${waveTotal} task${waveTotal === 1 ? '' : 's'} · ${r.waves.length} wave${r.waves.length === 1 ? '' : 's'}`,
            arguments: [document.uri],
          }));
        }
        // The two CTAs the report asks for (operator pass 2026-07-12):
        // an undeclared boundary offers the one-gesture infer; required
        // vars offer the ready-to-paste run line.
        if (r.hints.some((h) => h.kind === 'permits')) {
          lenses.push(new vscode.CodeLens(status, {
            command: 'nika.inferPermits',
            title: DECLARE_BOUNDARY_DOOR,
            arguments: [document.uri],
            tooltip: 'Insert the tightest permits: block the workflow needs — default-deny from then on',
          }));
        }
        const varsRequired = r.requirements?.vars_required ?? [];
        if (varsRequired.length > 0) {
          lenses.push(new vscode.CodeLens(status, {
            command: 'nika.copyRunLine',
            title: varsDoorTitle(varsRequired.length),
            arguments: [document.uri],
            tooltip: `Copy the run line with ${varsRequired.join(' · ')} as --var placeholders`,
          }));
        }
        // A dead-spend hint + no outputs: — the workflow burns tokens
        // nothing reads AND returns nothing; publishing is one of the
        // two honest fixes (the other is deleting the task).
        if (r.hints.some((h) => h.kind === 'dead-spend')
          && !lines.some((l) => /^outputs:/.test(l))) {
          lenses.push(new vscode.CodeLens(status, {
            command: 'nika.pickOutputs',
            title: PUBLISH_DOOR,
            arguments: [document.uri],
            tooltip: 'A task\'s output goes unread (dead-spend) — publish it as the workflow\'s return value',
          }));
        }

      }
    }

    // The writing doors (operator pass 2026-07-13). The plan row grows
    // the plan: add-a-task puts the palette's vocabulary one click away
    // — binary or not, the offline fallback teaches the same 4 verbs.
    if (anchors.hasTasks) {
      lenses.push(new vscode.CodeLens(status, {
        command: 'nika.addTask',
        title: ADD_TASK_DOOR,
        tooltip: 'New task from the palette — a verb, or a builtin as a pre-wired invoke (⌥⌘T)',
      }));
    }
    // A DECLARED boundary drifts as tasks accumulate; its line offers
    // the same one-gesture recompute the undeclared case gets.
    if (this.service.caps.check) {
      const permitsLine = findPermitsLine(lines);
      if (permitsLine !== undefined) {
        lenses.push(new vscode.CodeLens(row(permitsLine), {
          command: 'nika.inferPermits',
          title: TIGHTEN_BOUNDARY_DOOR,
          arguments: [document.uri],
          tooltip: 'Recompute the tightest permits: block from what the workflow actually needs — replaces this block (one undo)',
        }));
      }
    }
    // The contract doors sit on the lines they grow: vars: (the input
    // half — typed inputs make the workflow a callable unit) and
    // outputs: (the return half — what CLI · MCP · compose callers read).
    const varsBlock = findVarsBlock(lines);
    if (varsBlock) {
      lenses.push(new vscode.CodeLens(row(varsBlock.line), {
        command: 'nika.declareInput',
        title: DECLARE_INPUT_DOOR,
        arguments: [document.uri],
        tooltip: 'Add an input — reachable as ${{ vars.<name> }}; typed inputs validate at launch and power MCP/UI callers',
      }));
      const untyped = parseVarEntries(lines, varsBlock)
        .filter((e) => !e.typed && e.inline !== undefined).length;
      if (untyped > 0) {
        lenses.push(new vscode.CodeLens(row(varsBlock.line), {
          command: 'nika.promoteVars',
          title: makeCallableDoorTitle(untyped),
          arguments: [document.uri],
          tooltip: 'Promote untyped rows to the typed form — type: inferred from each default, value preserved (one undo)',
        }));
      }
    }
    const outputsBlock = findOutputsBlock(lines);
    if (outputsBlock) {
      lenses.push(new vscode.CodeLens(row(outputsBlock.line), {
        command: 'nika.pickOutputs',
        title: PUBLISH_DOOR,
        arguments: [document.uri],
        tooltip: 'Re-pick what this workflow returns — custom rows survive, picked tasks publish ${{ tasks.<id>.output }}',
      }));
    }

    return lenses;
  }
}
