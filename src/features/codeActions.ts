// codeActions.ts — quick fixes from the check fix grammar + secrets rewrite.
//
// The engine emits ONE machine-applicable fix form (`add "X" to
// permits.<path>`); this provider applies it as a WorkspaceEdit — the
// exact convergence loop agents run in CI, one keystroke in the editor.
// Plus: did-you-mean tool replacement · literal-secret → ${{ env.VAR }} ·
// explain-this-code · insert the whole inferred permits boundary.

import * as vscode from 'vscode';
import { didYouMean } from '../core/graphIntel';
import { applyPermitsFix, parseFix } from '../core/permitsEdit';
import {
  addVarDeclaration,
  parseVar001,
} from '../core/structuralFixes';
import { parseRichWorkflow } from '../workflowParser';
import type { DiagnosticsController } from './diagnostics';
import type { NikaService } from '../nikaService';

/** `unresolved reference \`tasks.X\`` (VAR-001 family · unknown task id). */
function parseUnresolvedTaskRef(message: string): string | undefined {
  return message.match(/unresolved reference\s+`tasks\.([a-z][a-z0-9_]*)`/)?.[1];
}

export class NikaCodeActionProvider implements vscode.CodeActionProvider {
  static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
  };

  constructor(
    private readonly controller: DiagnosticsController,
    private readonly service: NikaService,
    /** True when the LANGUAGE SERVER advertises codeActionProvider —
     *  the rename-shaped quickfixes (tool · task-id did-you-mean) are
     *  then the server's (one fix engine, 0.99.7+ engines); the client
     *  keeps its structural classes (permits repair · secret → env ·
     *  add var), which the server does not carry. Same
     *  yield pattern as the expressionIntel capability handshake. */
    private readonly serverOwnsRenames: () => boolean = () => false,
  ) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const text = document.getText();

    for (const { finding, range: fRange } of this.controller.findingsAt(document.uri, range)) {
      // 1 · the locked fix grammar → one-keystroke permits repair
      if (finding.fix) {
        const parsed = parseFix(finding.fix);
        if (parsed) {
          const rewritten = applyPermitsFix(text, parsed);
          if (rewritten !== undefined) {
            const action = new vscode.CodeAction(
              `Nika: ${finding.fix}`,
              vscode.CodeActionKind.QuickFix,
            );
            action.edit = this.fullRewrite(document, rewritten);
            action.isPreferred = true;
            actions.push(action);
          }
        }
      }

      // 2 · did-you-mean tool replacement (unknown builtin) — yielded
      // to the server when it ships the same rename engine.
      if (finding.source === 'unknown-tool' && finding.suggestion && !this.serverOwnsRenames()) {
        const wrongTool = finding.message.match(/`([^`]+)`/)?.[1];
        if (wrongTool) {
          // Stored findings anchor PRE-edit lines — re-resolve the owning
          // task's CURRENT span by id, so an edit above the finding can't
          // shift this scan onto an unrelated occurrence of the same
          // substring (silent wrong-location rewrite).
          const owner = finding.task !== undefined
            ? parseRichWorkflow(text).tasks.find((t) => t.id === finding.task)
            : undefined;
          const scanStart = owner?.line ?? fRange.start.line;
          const scanEnd = owner !== undefined
            ? Math.min(owner.endLine + 1, document.lineCount)
            : Math.min(fRange.start.line + 30, document.lineCount);
          for (let l = scanStart; l < scanEnd; l++) {
            const idx = document.lineAt(l).text.indexOf(wrongTool);
            if (idx !== -1) {
              const action = new vscode.CodeAction(
                `Nika: replace with \`${finding.suggestion}\``,
                vscode.CodeActionKind.QuickFix,
              );
              action.edit = new vscode.WorkspaceEdit();
              action.edit.replace(
                document.uri,
                new vscode.Range(l, idx, l, idx + wrongTool.length),
                finding.suggestion,
              );
              action.isPreferred = true;
              actions.push(action);
              break;
            }
          }
        }
      }

      // 3 · structural conformance repairs (client classes — the W2
      // boundary fixes [NIKA-VAR-021 hoist · NIKA-PARSE-024 migration]
      // are `nika check --fix`'s, surfaced by the server: one fix engine)
      if (finding.source === 'conformance') {
        // Unknown TASK id in a ref → did-you-mean (Damerau ≤2 · same UX
        // contract as the engine's tool suggestions, client-side).
        const badTask = parseUnresolvedTaskRef(finding.message);
        if (!this.serverOwnsRenames() && badTask) {
          const ids = parseRichWorkflow(text).tasks.map((t) => t.id);
          const suggestion = didYouMean(badTask, ids);
          if (suggestion) {
            const re = new RegExp(`\\btasks\\.${badTask}(?![A-Za-z0-9_])`, 'g');
            const rewritten = text.replace(re, `tasks.${suggestion}`);
            if (rewritten !== text) {
              const action = new vscode.CodeAction(
                `Nika: did you mean \`tasks.${suggestion}\`?`,
                vscode.CodeActionKind.QuickFix,
              );
              action.edit = this.fullRewrite(document, rewritten);
              action.isPreferred = true;
              actions.push(action);
            }
          }
        }

        const varRef = parseVar001(finding.message);
        if (varRef) {
          const rewritten = addVarDeclaration(text, varRef.varName);
          if (rewritten !== undefined) {
            const action = new vscode.CodeAction(
              `Nika: declare \`${varRef.varName}\` in the vars: block`,
              vscode.CodeActionKind.QuickFix,
            );
            action.edit = this.fullRewrite(document, rewritten);
            action.isPreferred = true;
            actions.push(action);
          }
        }
      }

      // 4 · explain the code (engine-embedded pedagogy)
      if (finding.code.startsWith('NIKA-') && this.service.caps.explain) {
        const action = new vscode.CodeAction(
          `Nika: explain ${finding.code}`,
          vscode.CodeActionKind.QuickFix,
        );
        action.command = {
          command: 'nika.explainCode',
          title: 'Explain',
          arguments: [finding.code],
        };
        actions.push(action);
      }
    }

    // 5 · literal secret → ${{ env.VAR }}
    for (const { secret, range: sRange } of this.controller.secretsAt(document.uri, range)) {
      const action = new vscode.CodeAction(
        `Nika: replace literal with \${{ env.${secret.envVar} }}`,
        vscode.CodeActionKind.QuickFix,
      );
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(document.uri, sRange, `\${{ env.${secret.envVar} }}`);
      action.isPreferred = true;
      actions.push(action);
    }

    return actions;
  }

  private fullRewrite(document: vscode.TextDocument, newText: string): vscode.WorkspaceEdit {
    const edit = new vscode.WorkspaceEdit();
    const full = new vscode.Range(0, 0, document.lineCount, 0);
    edit.replace(document.uri, full, newText);
    return edit;
  }
}

// ─── Fix All · the check→repair convergence loop as ONE editor action ──────
// Applies every machine-applicable repair (permits fixes · var
// declarations) to a fixpoint, bounded. This is the same loop agents
// run in CI — `source.fixAll.nika` makes it a save action
// (`editor.codeActionsOnSave`).

export const NIKA_FIX_ALL = vscode.CodeActionKind.SourceFixAll.append('nika');

export class NikaFixAllProvider implements vscode.CodeActionProvider {
  static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [NIKA_FIX_ALL],
  };

  constructor(private readonly controller: DiagnosticsController) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    if (context.only && !context.only.contains(NIKA_FIX_ALL) && !NIKA_FIX_ALL.contains(context.only)) {
      return [];
    }
    const rewritten = this.applyAll(document);
    if (rewritten === undefined) { return []; }
    const action = new vscode.CodeAction('Nika: fix all auto-fixable issues', NIKA_FIX_ALL);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), rewritten);
    action.edit = edit;
    return [action];
  }

  /**
   * ONE pass over the CURRENT stored findings. Findings are anchored to
   * the pre-edit text, so a second in-memory round would apply against
   * shifted offsets; the debounced re-check supplies the next round's
   * findings — the fixpoint runs across save/check cycles, not here.
   */
  applyAll(document: vscode.TextDocument): string | undefined {
    const fullRange = new vscode.Range(0, 0, document.lineCount, 0);
    let text = document.getText();
    let changed = false;

    for (const { finding } of this.controller.findingsAt(document.uri, fullRange)) {
      if (finding.fix) {
        const parsed = parseFix(finding.fix);
        if (parsed) {
          const next = applyPermitsFix(text, parsed);
          if (next !== undefined && next !== text) { text = next; changed = true; }
        }
      }
      if (finding.source === 'conformance') {
        const varRef = parseVar001(finding.message);
        if (varRef) {
          const next = addVarDeclaration(text, varRef.varName);
          if (next !== undefined && next !== text) { text = next; changed = true; }
        }
      }
    }
    return changed ? text : undefined;
  }
}
