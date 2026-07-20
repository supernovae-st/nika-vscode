// intel.ts — client-side language intelligence, LSP-grade.
//
// Two complementary layers, both live TODAY without a server:
//   · expression intel inside `${{ ... }}` islands (document-derived)
//   · schema intel everywhere else (BINARY-derived: completions + hover
//     for every key/enum come from `nika schema` + `nika spec --canon` —
//     zero hardcoded vocabulary, new fields light up with the binary)
// plus rename/find-references for task ids (the 4 syntactic homes).
// When `nika lsp` ships, the server takes structure diagnostics; these
// providers keep covering what its v0.1 defers (expressions · enums).

import * as vscode from 'vscode';
import { completionContextAt, refAt, scanRefs } from '../core/expr';
import { EXTRACT_MODE_FACTS, extractModeRank } from '../core/extractModes';
import type { YieldEntry } from '../core/capabilityYield';
import { findTaskRefs, isValidTaskId } from '../core/renameRefs';
import { fieldInScope, type FieldDoc, type SchemaIntel } from '../core/schemaIntel';
import { collectShapes, fieldsAt, renderShape, shapeAt } from '../core/schemaShape';
import { formatUsd, humanizeDuration } from '../core/traceFold';
import { traceStore } from '../core/traceStore';
import { yamlContextAt } from '../core/yamlContext';
import { parseRichWorkflow, taskAtLine, type RichWorkflow } from '../workflowParser';
import type { NikaService } from '../nikaService';

function enabled(): boolean {
  return vscode.workspace.getConfiguration('nika').get<boolean>('intel.enabled', true);
}

function upstreamIds(wf: RichWorkflow, currentLine: number): string[] {
  const current = taskAtLine(wf, currentLine);
  return wf.tasks
    .filter((t) => t.id !== current?.id)
    .map((t) => t.id);
}

export class TemplateCompletionProvider implements vscode.CompletionItemProvider {
  static readonly triggers = ['{', '.', ' '];

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] | undefined {
    if (!enabled()) { return undefined; }
    const text = document.getText();
    const offset = document.offsetAt(position);
    const ctx = completionContextAt(text, offset);
    if (!ctx) { return undefined; }

    const wf = parseRichWorkflow(text);

    if (ctx.kind === 'root') {
      const roots: Array<[string, string]> = [
        ['tasks', 'Upstream task outputs — tasks.<id>.output'],
        ['with', 'Aliases bound on THIS task'],
        ['env', 'Environment variables (sovereign secret path)'],
        ['secrets', 'Declared workflow secrets (masked · IFC-tracked)'],
        ['vars', 'Workflow vars block'],
      ];
      return roots.map(([name, doc]) => {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Module);
        item.documentation = doc;
        item.commitCharacters = ['.'];
        return item;
      });
    }

    switch (ctx.root) {
      case 'tasks': {
        if (ctx.path.length === 0) {
          return upstreamIds(wf, position.line).map((id) => {
            const item = new vscode.CompletionItem(id, vscode.CompletionItemKind.Reference);
            const task = wf.tasks.find((t) => t.id === id);
            item.detail = task ? `${task.verb} task (line ${task.line + 1})` : undefined;
            item.commitCharacters = ['.'];
            return item;
          });
        }
        if (ctx.path.length === 1) {
          const items = ['output', 'status'].map((field) => {
            const item = new vscode.CompletionItem(field, vscode.CompletionItemKind.Field);
            item.detail = field === 'output'
              ? 'the task return value'
              : 'terminal status (success · failed · skipped)';
            return item;
          });
          // Typed: when the task declares schema:, output completes WITH it.
          const shape = collectShapes(text).get(ctx.path[0]);
          if (shape) {
            const out = items.find((i) => i.label === 'output');
            if (out) { out.detail = renderShape(shape); }
          }
          return items;
        }
        // DEEP typed completion: tasks.x.output.<field…> from the declared
        // schema (dataflow shape propagation — contracts at the node
        // boundary type the wires).
        if (ctx.path.length >= 2 && ctx.path[1] === 'output') {
          const shape = collectShapes(text).get(ctx.path[0]);
          if (shape) {
            const fields = fieldsAt(shape, ctx.path.slice(2));
            if (fields.length > 0) {
              return fields.map((f) => {
                const item = new vscode.CompletionItem(f.name, vscode.CompletionItemKind.Field);
                item.detail = `${f.type ?? 'any'}${f.required ? '' : ' · optional'}`;
                item.documentation = new vscode.MarkdownString(
                  `from \`${ctx.path[0]}\`'s declared \`schema:\` — the engine PROVES this path at check-time`,
                );
                return item;
              });
            }
          }
        }
        return undefined;
      }
      case 'with': {
        const task = taskAtLine(wf, position.line);
        return (task?.withAliases ?? []).map(
          (a) => new vscode.CompletionItem(a, vscode.CompletionItemKind.Variable),
        );
      }
      case 'secrets':
        return wf.secretsKeys.map(
          (k) => new vscode.CompletionItem(k, vscode.CompletionItemKind.Constant),
        );
      case 'vars':
        return wf.varsKeys.map(
          (k) => new vscode.CompletionItem(k, vscode.CompletionItemKind.Value),
        );
      case 'env': {
        const item = new vscode.CompletionItem('YOUR_ENV_VAR', vscode.CompletionItemKind.Snippet);
        item.insertText = new vscode.SnippetString('${1:NAME}');
        item.documentation = 'Resolved from the process environment at run time — the sovereign way to carry credentials.';
        return [item];
      }
      default:
        return undefined;
    }
  }
}

export class TemplateHoverProvider implements vscode.HoverProvider {
  constructor(private readonly service?: NikaService) {}

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    if (!enabled()) { return undefined; }
    const text = document.getText();

    // 1 · ${{ tasks.X }} reference card — typed when a schema declares it
    const ref = refAt(text, document.offsetAt(position));
    if (ref && ref.root === 'tasks' && ref.path.length > 0) {
      const wf = parseRichWorkflow(text);
      const task = wf.tasks.find((t) => t.id === ref.path[0]);
      if (task) {
        const md = new vscode.MarkdownString();
        md.appendCodeblock(`${task.id}:`, 'yaml');
        const facts = [`verb \`${task.verb}\``];
        if (task.model ?? wf.defaultModel) { facts.push(`model \`${task.model ?? wf.defaultModel}\``); }
        if (task.tool) { facts.push(`tool \`${task.tool}\``); }
        if (task.producers.length > 0) { facts.push(`runs after ${task.producers.map((p) => `\`${p}\``).join(' · ')}`); }
        md.appendMarkdown(`${facts.join(' · ')}  \n_line ${task.line + 1}_`);

        // Hover ACTIONS (rust-analyzer pattern): the card can drive the
        // graph and the reference peek directly.
        md.isTrusted = { enabledCommands: ['nika.focusTaskInDag', 'nika.peekTaskRefs'] };
        md.supportThemeIcons = true;
        const dagArgs = encodeURIComponent(JSON.stringify([document.uri.toString(), task.id]));
        const refArgs = encodeURIComponent(JSON.stringify([document.uri.toString(), task.id, task.line]));
        md.appendMarkdown(
          `\n\n[$(target) Focus in DAG](command:nika.focusTaskInDag?${dagArgs} "Light this task's lineage in the graph")` +
          ` · [$(references) References](command:nika.peekTaskRefs?${refArgs} "Peek every home of this id")`,
        );

        // Shape propagation: hovering output(.path) shows the DECLARED type.
        const shape = collectShapes(text).get(task.id);
        if (shape && ref.path.length >= 2 && ref.path[1] === 'output') {
          const at = shapeAt(shape, ref.path.slice(2));
          if (at) {
            md.appendMarkdown(`  \n**shape** \`${renderShape(at)}\` — from \`${task.id}\`'s \`schema:\` (engine-proven at check-time)`);
          } else {
            md.appendMarkdown(`  \n⚠ \`${ref.path.slice(1).join('.')}\` is NOT in \`${task.id}\`'s declared schema \`${renderShape(shape)}\` — \`nika check\` will flag it`);
          }
        } else if (shape) {
          md.appendMarkdown(`  \n**output shape** \`${renderShape(shape)}\``);
        }

        // Last run — the traceStore fold for THIS document (live runner or
        // trace overlay). No entry / never-moved task → the card is exactly
        // what it always was.
        const lastRun = traceStore.get(document.uri.fsPath)?.fold.tasks.get(task.id);
        if (lastRun && lastRun.status !== 'pending') {
          const runFacts = [`**${lastRun.status}**`];
          if (lastRun.durationMs !== undefined) { runFacts.push(humanizeDuration(lastRun.durationMs)); }
          if (lastRun.usd !== undefined) { runFacts.push(formatUsd(lastRun.usd)); }
          md.appendMarkdown(`\n\n$(history) Last run · ${runFacts.join(' · ')}`);
          if (lastRun.preview) {
            // One settle-line of story (error detail on ✗ · verb·tool note
            // otherwise) — backticks swapped so the code span can't break.
            md.appendMarkdown(`  \n\`${lastRun.preview.replace(/`/g, '´')}\``);
          }
        }
        return new vscode.Hover(md);
      }
    }

    const intel = this.service?.intel;
    if (!intel) { return undefined; }
    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_:.-]+/);
    if (!wordRange) { return undefined; }
    const word = document.getText(wordRange);
    const lineText = document.lineAt(position.line).text;

    // 1bis · the envelope key — `nika: v1` at the top level is the ONE
    // `nika:`-prefixed token that is NOT a tool (operator screenshot
    // 2026-07-12: the bare key hit the unknown-builtin warning). Teach
    // what it is instead.
    if (/^nika:\s/.test(lineText) && (word === 'nika:' || word === 'nika' || word === 'v1')) {
      const md = new vscode.MarkdownString();
      md.appendMarkdown(
        '**`nika: v1`** — the envelope, frozen forever. Every workflow starts with '
        + '`nika: v1` · `workflow: <kebab-id>` · `tasks:` — the version never changes '
        + 'with engine releases.',
      );
      return new vscode.Hover(md, wordRange);
    }

    // 2 · builtin tool hover — `nika:read` etc. (the closed set). The
    // bare `nika:` word (no tool name after the colon) never lands here.
    if (word.startsWith('nika:') && word.length > 'nika:'.length) {
      if (intel.builtinTools.includes(word)) {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**\`${word}\`** — stdlib builtin (closed set of ${intel.builtinTools.length} · from the embedded schema).`);
        return new vscode.Hover(md, wordRange);
      }
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`⚠ \`${word}\` is NOT in the embedded builtin set — \`nika check\` will flag it.`);
      return new vscode.Hover(md, wordRange);
    }

    // 2bis · model value hover — sovereignty group from the canon
    const modelMatch = lineText.match(/^\s*model:\s*["']?([A-Za-z0-9_./-]+)/);
    if (modelMatch && modelMatch[1].includes(word)) {
      const provider = modelMatch[1].split('/')[0];
      const group = intel.providers.local.includes(provider) ? 'local — sovereign (zero-cloud path · Rule 1)'
        : intel.providers.cloud.includes(provider) ? 'cloud'
        : intel.providers.test.includes(provider) ? 'test — deterministic · zero keys'
        : undefined;
      if (group) {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**\`${provider}\`** — ${group} provider  \n_from the embedded canon (\`nika spec --canon\`)_`);
        return new vscode.Hover(md, wordRange);
      }
    }

    // 3 · field-key hover — schema description for `key:` under the cursor
    const keyMatch = lineText.match(/^\s*(?:-\s+)?([A-Za-z0-9_-]+):/);
    if (keyMatch && keyMatch[1] === word) {
      const ctx = yamlContextAt(text, position.line, lineText.indexOf(':') + 2);
      let field: FieldDoc | undefined;
      if (ctx?.kind === 'value') {
        const scopes: Array<'top' | 'task' | 'infer' | 'exec' | 'invoke' | 'agent'> = ctx.verb
          ? [ctx.verb as 'infer', 'task', 'top']
          : [taskAtLine(parseRichWorkflow(text), position.line) ? 'task' as const : 'top' as const, 'top'];
        for (const scope of scopes) {
          field = fieldInScope(intel, scope, word);
          if (field?.doc || field?.values) { break; }
        }
      }
      if (field && (field.doc || field.values)) {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**\`${field.name}\`**${field.doc ? ` — ${field.doc}` : ''}`);
        if (field.values) {
          md.appendMarkdown(`  \nvalues: ${field.values.map((v) => `\`${v}\``).join(' · ')}`);
        }
        md.appendMarkdown('  \n_from the embedded schema (`nika schema`)_');
        return new vscode.Hover(md, wordRange);
      }
    }

    return undefined;
  }
}

// ─── Schema-driven completions (vocabulary FROM the binary) ─────────────────

export class SchemaCompletionProvider implements vscode.CompletionItemProvider {
  static readonly triggers = [':', ' '];

  constructor(private readonly service: NikaService) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] | undefined {
    if (!enabled()) { return undefined; }
    const intel = this.service.intel;
    if (!intel) { return undefined; }
    const text = document.getText();

    // Islands are owned by the template provider.
    if (completionContextAt(text, document.offsetAt(position))) { return undefined; }

    const ctx = yamlContextAt(text, position.line, position.character);
    if (!ctx) { return undefined; }

    if (ctx.kind === 'top-key' || ctx.kind === 'task-key' || ctx.kind === 'verb-key') {
      const fields = ctx.kind === 'top-key' ? intel.topLevel
        : ctx.kind === 'task-key' ? intel.taskFields
        : intel.verbFields[ctx.verb] ?? [];
      return fields.map((f) => this.keyItem(f));
    }

    // VALUE completions per known field.
    return this.valueItems(intel, ctx.key, ctx.verb, ctx.tool, document, position.line);
  }

  private keyItem(f: FieldDoc): vscode.CompletionItem {
    const item = new vscode.CompletionItem(f.name, vscode.CompletionItemKind.Field);
    item.insertText = new vscode.SnippetString(`${f.name}: $0`);
    if (f.doc) { item.documentation = new vscode.MarkdownString(f.doc); }
    item.detail = f.values ? f.values.join(' · ') : undefined;
    return item;
  }

  private valueItems(
    intel: SchemaIntel,
    key: string,
    verb: string | undefined,
    tool: string | undefined,
    document?: vscode.TextDocument,
    line?: number,
  ): vscode.CompletionItem[] | undefined {
    const enumItems = (values: string[], kind = vscode.CompletionItemKind.EnumMember): vscode.CompletionItem[] =>
      values.map((v) => new vscode.CompletionItem(v, kind));

    // Closed enums declared by the schema itself (capture · source · …).
    const scopes: Array<'top' | 'task' | 'infer' | 'exec' | 'invoke' | 'agent'> = verb
      ? [verb as 'infer', 'task', 'top'] : ['task', 'top'];
    for (const scope of scopes) {
      const field = fieldInScope(intel, scope, key);
      if (field?.values) { return enumItems(field.values); }
    }

    switch (key) {
      case 'tool': {
        const items = enumItems(intel.builtinTools, vscode.CompletionItemKind.Function);
        const mcp = new vscode.CompletionItem('mcp:server/tool', vscode.CompletionItemKind.Reference);
        mcp.insertText = new vscode.SnippetString('mcp:${1:server}/${2:tool}');
        mcp.documentation = 'An MCP tool — `mcp:<server>/<tool>` namespace.';
        items.push(mcp);
        return items;
      }
      case 'model': {
        const items: vscode.CompletionItem[] = [];
        const groups: Array<[string, string[]]> = [
          ['cloud', intel.providers.cloud],
          ['local (sovereign)', intel.providers.local],
          ['test', intel.providers.test],
        ];
        for (const [groupName, providers] of groups) {
          for (const p of providers) {
            const item = new vscode.CompletionItem(`${p}/`, vscode.CompletionItemKind.Module);
            item.detail = `${groupName} provider`;
            item.insertText = p === 'mock' ? 'mock/echo' : new vscode.SnippetString(`${p}/\${1:model}`);
            item.documentation = p === 'mock'
              ? 'Deterministic echo — zero keys · zero network · perfect while iterating.'
              : `Combined form \`${p}/<model>\` (from the embedded canon).`;
            items.push(item);
          }
        }
        return items;
      }
      case 'mode':
        if (verb === 'invoke' && tool === 'nika:fetch') {
          // List = engine truth (embedded canon) · teaching = spec SSOT
          // (extract-modes-v0.1). A mode the register does not know
          // still completes, bare — neither source invents for the other.
          return intel.extractModes.map((mode, i) => {
            const item = new vscode.CompletionItem(mode, vscode.CompletionItemKind.EnumMember);
            const fact = EXTRACT_MODE_FACTS.get(mode);
            if (fact) {
              item.detail = `→ ${fact.output}`;
              item.documentation = fact.use;
            }
            item.sortText = String(extractModeRank(mode)).padStart(2, '0') + String(i).padStart(3, '0');
            return item;
          });
        }
        return undefined;
      case 'when':
        return enumItems(['true', 'false'], vscode.CompletionItemKind.Value);
      case 'after': {
        // Complete OTHER task ids — the producer keys of the control map.
        if (!document || line === undefined) { return undefined; }
        const wf = parseRichWorkflow(document.getText());
        const current = taskAtLine(wf, line);
        return wf.tasks
          .filter((t) => t.id !== current?.id)
          .map((t) => {
            const item = new vscode.CompletionItem(t.id, vscode.CompletionItemKind.Reference);
            item.detail = `${t.verb} task (line ${t.line + 1})`;
            item.insertText = new vscode.SnippetString(`${t.id}: \${1|succeeded,failed,skipped,terminal|}`);
            return item;
          });
      }
      default:
        return undefined;
    }
  }
}

// ─── Rename + references (the 4 syntactic homes of a task id) ───────────────

function taskIdAt(document: vscode.TextDocument, position: vscode.Position): { id: string; range: vscode.Range } | undefined {
  const wordRange = document.getWordRangeAtPosition(position, /[a-z][a-z0-9_]*/);
  if (!wordRange) { return undefined; }
  const word = document.getText(wordRange);
  const wf = parseRichWorkflow(document.getText());
  if (!wf.tasks.some((t) => t.id === word)) { return undefined; }
  return { id: word, range: wordRange };
}

export class TaskRenameProvider implements vscode.RenameProvider {
  prepareRename(document: vscode.TextDocument, position: vscode.Position): vscode.Range {
    const hit = taskIdAt(document, position);
    if (!hit) { throw new Error('Rename targets a task id (declaration or reference).'); }
    return hit.range;
  }

  provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
  ): vscode.WorkspaceEdit | undefined {
    const hit = taskIdAt(document, position);
    if (!hit) { return undefined; }
    if (!isValidTaskId(newName)) {
      throw new Error('Task ids are snake_case: ^[a-z][a-z0-9_]*$ (CEL-safe — the engine grammar).');
    }
    const edit = new vscode.WorkspaceEdit();
    for (const ref of findTaskRefs(document.getText(), hit.id)) {
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(ref.start), document.positionAt(ref.end)),
        newName,
      );
    }
    return edit;
  }
}

export class TaskReferenceProvider implements vscode.ReferenceProvider {
  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
  ): vscode.Location[] | undefined {
    const hit = taskIdAt(document, position);
    if (!hit) { return undefined; }
    return findTaskRefs(document.getText(), hit.id)
      .filter((r) => context.includeDeclaration || r.home !== 'declaration')
      .map((r) => new vscode.Location(
        document.uri,
        new vscode.Range(document.positionAt(r.start), document.positionAt(r.end)),
      ));
  }
}

export class TemplateDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Definition | undefined {
    if (!enabled()) { return undefined; }
    const text = document.getText();
    const wf = parseRichWorkflow(text);
    const lines = text.split('\n');

    // Find `  key:` inside a top-level block (`vars:` · `secrets:`).
    const blockEntryLine = (blockKey: string, entry: string): number | undefined => {
      const start = lines.findIndex((l) => new RegExp(`^${blockKey}:\\s*(#.*)?$`).test(l));
      if (start === -1) { return undefined; }
      for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].trim() === '') { continue; }
        if (/^\S/.test(lines[i])) { break; }
        if (new RegExp(`^ {2}${entry}\\s*:`).test(lines[i])) { return i; }
      }
      return undefined;
    };

    // 1 · ${{ <root>.X }} under the cursor — every root resolves somewhere.
    const ref = refAt(text, document.offsetAt(position));
    if (ref && ref.path.length > 0) {
      const name = ref.path[0];
      switch (ref.root) {
        case 'tasks': {
          const task = wf.tasks.find((t) => t.id === name);
          if (task) { return new vscode.Location(document.uri, new vscode.Position(task.line, 0)); }
          break;
        }
        case 'with': {
          // The alias binds on the ENCLOSING task's with: block — find
          // that block, then the alias key at deeper indent inside it.
          const task = taskAtLine(wf, position.line);
          if (task) {
            const rel = lines.slice(task.line, task.endLine + 1)
              .findIndex((l) => /^\s*with:\s*(#.*)?$/.test(l));
            if (rel !== -1) {
              const withIdx = task.line + rel;
              const withIndent = lines[withIdx].search(/\S/);
              for (let i = withIdx + 1; i <= task.endLine; i++) {
                const indent = lines[i].search(/\S/);
                if (lines[i].trim() === '') { continue; }
                if (indent <= withIndent) { break; }
                if (new RegExp(`^ {${indent}}${name}\\s*:`).test(lines[i])) {
                  return new vscode.Location(document.uri, new vscode.Position(i, 0));
                }
              }
            }
          }
          break;
        }
        case 'vars': {
          const line = blockEntryLine('vars', name);
          if (line !== undefined) { return new vscode.Location(document.uri, new vscode.Position(line, 0)); }
          break;
        }
        case 'secrets': {
          const line = blockEntryLine('secrets', name);
          if (line !== undefined) { return new vscode.Location(document.uri, new vscode.Position(line, 0)); }
          break;
        }
        default:
          break; // env.X has no in-file home
      }
    }

    // 2 · a task id inside an after: entry (inline map or block form)
    const lineText = document.lineAt(position.line).text;
    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_-]+/);
    if (wordRange && /after:\s*\{|^\s*[a-z][a-z0-9_]*\s*:\s*(succeeded|failed|skipped|terminal)\b/.test(lineText)) {
      const word = document.getText(wordRange);
      const task = wf.tasks.find((t) => t.id === word);
      if (task && task.line !== position.line) {
        return new vscode.Location(document.uri, new vscode.Position(task.line, 0));
      }
    }

    return undefined;
  }
}

/**
 * Outline / breadcrumbs for `nika` documents. The language id is ours, so
 * the built-in YAML symbol provider never applies — without this the
 * outline is EMPTY and `nika.showTasks` focuses a blank view.
 */
export class NikaDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const wf = parseRichWorkflow(document.getText());
    const symbols: vscode.DocumentSymbol[] = [];

    const lineRange = (line: number): vscode.Range =>
      document.lineAt(Math.min(line, document.lineCount - 1)).range;

    for (const task of wf.tasks) {
      const full = new vscode.Range(
        task.line, 0,
        Math.min(task.endLine, document.lineCount - 1),
        document.lineAt(Math.min(task.endLine, document.lineCount - 1)).text.length,
      );
      const symbol = new vscode.DocumentSymbol(
        task.id,
        task.verb,
        vscode.SymbolKind.Function,
        full,
        lineRange(task.line),
      );
      symbols.push(symbol);
    }

    if (wf.permitsLine !== undefined) {
      symbols.push(new vscode.DocumentSymbol(
        'permits',
        'security boundary',
        vscode.SymbolKind.Interface,
        lineRange(wf.permitsLine),
        lineRange(wf.permitsLine),
      ));
    }

    return symbols;
  }
}

// ─── Semantic tokens · the islands light up like code, not strings ──────────

export const SEMANTIC_LEGEND = new vscode.SemanticTokensLegend(
  ['keyword', 'property', 'variable', 'function', 'type'],
  ['declaration'],
);

export class NikaSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  constructor(private readonly service?: NikaService) {}

  provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.SemanticTokens {
    const builder = new vscode.SemanticTokensBuilder(SEMANTIC_LEGEND);
    const text = document.getText();
    // A ${{ }} on a comment line does NOTHING (spec) — semantic tokens
    // painted over TextMate's gray and lied (operator screenshot).
    const commentLine = new Set<number>();
    {
      const all = text.split('\n');
      for (let i = 0; i < all.length; i++) {
        if (/^\s*#/.test(all[i])) { commentLine.add(i); }
      }
    }

    // Island refs: root = keyword · path segments = property/variable.
    for (const ref of scanRefs(text)) {
      const rootPos = document.positionAt(ref.start);
      if (commentLine.has(rootPos.line)) { continue; }
      builder.push(rootPos.line, rootPos.character, ref.root.length, 0, 0);
      let cursor = ref.start + ref.root.length;
      for (const seg of ref.path) {
        cursor += 1; // the dot
        const segPos = document.positionAt(cursor);
        const isTaskId = ref.root === 'tasks' && cursor === ref.start + ref.root.length + 1;
        builder.push(segPos.line, segPos.character, seg.length, isTaskId ? 4 : 1, 0);
        cursor += seg.length;
      }
    }

    // Task key declarations (`X:` under tasks) + builtin tool literals.
    const tools = new Set(this.service?.intel?.builtinTools ?? []);
    const lines = text.split('\n');
    let inTasks = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^[A-Za-z0-9_-]+\s*:/.test(lines[i])) { inTasks = /^tasks\s*:/.test(lines[i]); }
      const id = inTasks ? lines[i].match(/^( {2})([a-z][a-z0-9_]*)(?=\s*:\s*(?:#.*)?$)/) : null;
      if (id) {
        builder.push(i, id[1].length, id[2].length, 4, 1);
      }
      for (const m of lines[i].matchAll(/nika:[a-z_]+/g)) {
        if (commentLine.has(i)) { continue; }
        if (tools.size === 0 || tools.has(m[0])) {
          builder.push(i, m.index ?? 0, m[0].length, 3, 0);
        }
      }
    }
    return builder.build();
  }
}

// ─── Document highlights · cursor on a task id lights every home ────────────

export class TaskHighlightProvider implements vscode.DocumentHighlightProvider {
  provideDocumentHighlights(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.DocumentHighlight[] | undefined {
    const hit = taskIdAt(document, position);
    if (!hit) { return undefined; }
    return findTaskRefs(document.getText(), hit.id).map((r) => new vscode.DocumentHighlight(
      new vscode.Range(document.positionAt(r.start), document.positionAt(r.end)),
      r.home === 'declaration' ? vscode.DocumentHighlightKind.Write : vscode.DocumentHighlightKind.Read,
    ));
  }
}

// ─── Folding · per-task + top-level blocks (with collapsed summaries) ───────

export class NikaFoldingProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
    const text = document.getText();
    const wf = parseRichWorkflow(text);
    const ranges: vscode.FoldingRange[] = [];

    for (const task of wf.tasks) {
      if (task.endLine > task.line) {
        ranges.push(new vscode.FoldingRange(task.line, task.endLine, vscode.FoldingRangeKind.Region));
      }
    }

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!/^(vars|secrets|permits|outputs|env|tasks):\s*(#.*)?$/.test(lines[i])) { continue; }
      let end = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === '') { end = j; continue; }
        if (/^\S/.test(lines[j])) { break; }
        end = j;
      }
      while (end > i && lines[end].trim() === '') { end -= 1; }
      if (end > i) {
        ranges.push(new vscode.FoldingRange(i, end, vscode.FoldingRangeKind.Region));
      }
    }
    return ranges;
  }
}

// ─── Workspace symbols · jump to any task in any workflow (⌘T) ──────────────

export class NikaWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  async provideWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
    const files = await vscode.workspace.findFiles('**/*.nika.yaml', '**/node_modules/**', 50);
    const needle = query.toLowerCase();
    const symbols: vscode.SymbolInformation[] = [];
    for (const uri of files) {
      let doc: vscode.TextDocument;
      try {
        doc = await vscode.workspace.openTextDocument(uri);
      } catch {
        continue;
      }
      const wf = parseRichWorkflow(doc.getText());
      for (const task of wf.tasks) {
        if (needle.length > 0 && !task.id.toLowerCase().includes(needle)) { continue; }
        symbols.push(new vscode.SymbolInformation(
          task.id,
          vscode.SymbolKind.Function,
          wf.name ?? '',
          new vscode.Location(uri, new vscode.Position(task.line, 0)),
        ));
      }
    }
    return symbols;
  }
}

/**
 * The intel providers as capability-keyed factories (#103): each entry
 * names the LSP server capability that REPLACES it — the YieldRegistry
 * silences the client twin when the shipped binary advertises it, and
 * restores it on crash/downgrade. Server owns MEANING; the client keeps
 * whatever the server does not speak.
 */
export function intelEntries(service: NikaService): YieldEntry[] {
  const selector: vscode.DocumentSelector = [
    { language: 'nika', scheme: 'file' },
    { language: 'nika', scheme: 'untitled' },
  ];
  return [
    {
      cap: 'completionProvider',
      label: 'completion:template',
      make: () => vscode.languages.registerCompletionItemProvider(
        selector,
        new TemplateCompletionProvider(),
        ...TemplateCompletionProvider.triggers,
      ),
    },
    {
      cap: 'completionProvider',
      label: 'completion:schema',
      make: () => vscode.languages.registerCompletionItemProvider(
        selector,
        new SchemaCompletionProvider(service),
        ...SchemaCompletionProvider.triggers,
      ),
    },
    {
      cap: 'hoverProvider',
      label: 'hover:template',
      make: () => vscode.languages.registerHoverProvider(selector, new TemplateHoverProvider(service)),
    },
    {
      cap: 'definitionProvider',
      label: 'definition:template',
      make: () => vscode.languages.registerDefinitionProvider(selector, new TemplateDefinitionProvider()),
    },
    {
      cap: 'documentSymbolProvider',
      label: 'symbols:document',
      make: () => vscode.languages.registerDocumentSymbolProvider(selector, new NikaDocumentSymbolProvider()),
    },
    {
      cap: 'renameProvider',
      label: 'rename:task',
      make: () => vscode.languages.registerRenameProvider(selector, new TaskRenameProvider()),
    },
    {
      cap: 'referencesProvider',
      label: 'references:task',
      make: () => vscode.languages.registerReferenceProvider(selector, new TaskReferenceProvider()),
    },
    {
      cap: 'semanticTokensProvider',
      label: 'semanticTokens:document',
      make: () => vscode.languages.registerDocumentSemanticTokensProvider(
        selector,
        new NikaSemanticTokensProvider(service),
        SEMANTIC_LEGEND,
      ),
    },
    {
      cap: 'documentHighlightProvider',
      label: 'highlight:task',
      make: () => vscode.languages.registerDocumentHighlightProvider(selector, new TaskHighlightProvider()),
    },
    {
      cap: 'foldingRangeProvider',
      label: 'folding:document',
      make: () => vscode.languages.registerFoldingRangeProvider(selector, new NikaFoldingProvider()),
    },
    {
      cap: 'workspaceSymbolProvider',
      label: 'symbols:workspace',
      make: () => vscode.languages.registerWorkspaceSymbolProvider(new NikaWorkspaceSymbolProvider()),
    },
  ];
}
