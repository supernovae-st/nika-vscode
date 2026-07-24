// lmTools.ts — expose the conformance oracle to in-editor AI agents.
//
// Registers the Nika tool family (`nika_check` · `nika_explain` ·
// `nika_graph` · `nika_workspace` when the binary carries the verb) as Language Model
// Tools (VS Code `vscode.lm` API): Copilot-class agents validate the
// workflows they write through the REAL oracle instead of guessing —
// the same convergence loop `nika setup --agents` wires for MCP clients.
//
// Runtime-guarded: hosts without the lm namespace (or with it disabled)
// skip registration silently. Typed against a minimal local surface so
// the extension keeps its low @types floor.

import * as path from 'path';
import * as vscode from 'vscode';
import { countReportFindings } from '../core/cliContract';
import { flashStatus } from './notify';
import type { NikaService } from '../nikaService';

interface LmTextPartCtor { new (value: string): unknown }
interface LmResultCtor { new (parts: unknown[]): unknown }

interface LmNamespace {
  registerTool(name: string, tool: {
    invoke(options: { input: unknown }, token: unknown): Promise<unknown> | unknown;
  }): vscode.Disposable;
}

function lmSurface(): { lm: LmNamespace; TextPart: LmTextPartCtor; Result: LmResultCtor } | undefined {
  const api = vscode as unknown as Record<string, unknown>;
  const lm = api.lm as LmNamespace | undefined;
  const TextPart = api.LanguageModelTextPart as LmTextPartCtor | undefined;
  const Result = api.LanguageModelToolResult as LmResultCtor | undefined;
  if (!lm || typeof lm.registerTool !== 'function' || !TextPart || !Result) {
    return undefined;
  }
  return { lm, TextPart, Result };
}

async function docFor(filePath: unknown): Promise<vscode.TextDocument | undefined> {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return vscode.window.activeTextEditor?.document;
  }
  // Agents pass workspace-relative paths; Uri.file() would resolve those
  // against the extension host cwd and silently target the wrong file.
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', filePath);
  try {
    return await vscode.workspace.openTextDocument(vscode.Uri.file(resolved));
  } catch {
    return undefined;
  }
}

export function registerLmTools(
  context: vscode.ExtensionContext,
  service: NikaService,
  log: (level: string, msg: string) => void,
): void {
  if (!vscode.workspace.getConfiguration('nika').get<boolean>('ai.toolsEnabled', true)) {
    return;
  }
  const surface = lmSurface();
  if (!surface) {
    log('INFO', 'vscode.lm tools unavailable on this host — skipping AI tool registration');
    return;
  }
  const { lm, TextPart, Result } = surface;
  const text = (s: string): unknown => new Result([new TextPart(s)]);

  // The human editing alongside gets ONE quiet status breath when an
  // agent runs the oracle — the check itself was invisible (the report
  // returns to the AGENT only). Throttled per file so a looping agent
  // breathes once, never spams.
  const agentCheckSeen = new Map<string, number>();
  const breatheAgentCheck = (fsPath: string, findings: number): void => {
    const now = Date.now();
    const last = agentCheckSeen.get(fsPath) ?? 0;
    if (now - last < 10000) { return; }
    agentCheckSeen.set(fsPath, now);
    flashStatus(
      `$(hubot) agent checked ${path.basename(fsPath)} · ${findings === 0 ? 'clean' : `${findings} finding${findings === 1 ? '' : 's'}`}`,
    );
  };

  context.subscriptions.push(
    lm.registerTool('nika_check', {
      invoke: async (options) => {
        const input = (options.input ?? {}) as { filePath?: string };
        const doc = await docFor(input.filePath);
        if (!doc) { return text('No workflow file found — pass filePath or open a .nika.yaml.'); }
        const outcome = await service.checkDocument(doc);
        if (!outcome) { return text('The nika binary is not available (check capability missing).'); }
        if (outcome.report) { breatheAgentCheck(doc.uri.fsPath, countReportFindings(outcome.report)); }
        return text(outcome.report ? JSON.stringify(outcome.report) : outcome.raw);
      },
    }),
    lm.registerTool('nika_explain', {
      invoke: async (options) => {
        const input = (options.input ?? {}) as { code?: string };
        if (!input.code) { return text('Pass a NIKA error code, e.g. {"code": "NIKA-440"}.'); }
        const explained = await service.explain(input.code);
        return text(explained ?? `Unknown code ${input.code} (or explain capability missing).`);
      },
    }),
    lm.registerTool('nika_graph', {
      invoke: async (options) => {
        const input = (options.input ?? {}) as { filePath?: string };
        const doc = await docFor(input.filePath);
        if (!doc) { return text('No workflow file found — pass filePath or open a .nika.yaml.'); }
        const graph = await service.graphDocument(doc);
        return text(graph
          ? JSON.stringify(graph)
          : 'Graph projection unavailable — the workflow must pass conformance first (run nika_check).');
      },
    }),
  );
  // The workspace aggregate — `welcome --deep --json` on the 0.104
  // line (the RENAMED context verb; the old spelling stays as the
  // dev-build fallback). Registered only when the probed binary
  // carries one of the doors — the tool list itself stays honest (a
  // host asking for nika_workspace on an old binary would get a
  // permanent error, so it never appears).
  if (service.caps.welcome || service.caps.context) {
    const args = service.caps.welcome
      ? ['welcome', '--deep', '--json']
      : ['context', '--json'];
    context.subscriptions.push(
      lm.registerTool('nika_workspace', {
        invoke: async () => {
          // Scope honesty: no folder → refuse (an undefined cwd would
          // silently aggregate the extension host's OWN directory);
          // multi-root → say which root the aggregate covers.
          const folders = vscode.workspace.workspaceFolders ?? [];
          if (folders.length === 0) {
            return text('No workspace folder open — nika_workspace aggregates a folder.');
          }
          const res = await service.runCli(args, 30000, undefined,
            folders[0].uri.fsPath);
          if (res.code !== 0) {
            return text(`nika ${args[0]} failed (exit ${res.code}): ${res.stderr || res.stdout}`);
          }
          return text(folders.length > 1
            ? `NOTE: multi-root workspace — this aggregate covers only ${folders[0].name}.\n${res.stdout}`
            : res.stdout);
        },
      }),
    );
    log('INFO', `Registered LM tool: nika_workspace (${args[0]} capability probed)`);
  }
  log('INFO', 'Registered LM tools: nika_check · nika_explain · nika_graph');
}
