import { isAbsolute } from 'node:path';
import type { CliResult } from './spawn';

export interface HostWiringRequest {
  target: 'cursor' | 'vscode' | 'windsurf';
  directory?: string;
  mcp: boolean;
  wire: boolean;
  binaryPath?: string;
  nikaOnPath: boolean;
}

export type HostWiringOutcome =
  | { kind: 'wired'; via: 'engine' | 'host-absolute' }
  | { kind: 'failed' | 'unsupported'; detail: string };

export interface HostWiringEffects {
  runCli(args: string[], timeoutMs: number): Promise<CliResult>;
  machineAbsolute(target: 'cursor' | 'windsurf', binaryPath: string): Promise<{
    state: 'wired' | 'unchanged' | 'refused-malformed' | 'skipped';
    file?: string;
  }>;
}

/** Called only after the existing setup command or autoSetup authorization.
 * Select one writer before acting; an engine result never selects another.
 * The engine currently writes the portable `nika` command, so Cursor/Windsurf
 * download-only machine configuration is a distinct, upfront host operation.
 */
export async function wireHostOnce(
  request: HostWiringRequest,
  effects: HostWiringEffects,
): Promise<HostWiringOutcome> {
  if (!request.mcp) {
    return { kind: 'unsupported', detail: 'This binary does not expose nika mcp; update it before wiring.' };
  }
  if (request.target !== 'vscode' && !request.nikaOnPath
      && request.binaryPath && isAbsolute(request.binaryPath)) {
    const result = await effects.machineAbsolute(request.target, request.binaryPath);
    if (result.state === 'wired' || result.state === 'unchanged') {
      return { kind: 'wired', via: 'host-absolute' };
    }
    return {
      kind: 'failed',
      detail: result.state === 'refused-malformed'
        ? `Refusing to overwrite malformed MCP config ${result.file ?? `for ${request.target}`}.`
        : `${request.target} MCP configuration was not written${result.file ? `: ${result.file}` : '.'}`,
    };
  }
  if (!request.wire) {
    return { kind: 'unsupported', detail: 'This binary does not expose nika wire; update it before wiring.' };
  }
  if (!request.directory) {
    return { kind: 'unsupported', detail: 'Open a folder before wiring MCP.' };
  }
  const result = await effects.runCli(['wire', request.target, '--dir', request.directory], 30000);
  return result.code === 0
    ? { kind: 'wired', via: 'engine' }
    : { kind: 'failed', detail: result.stderr || result.stdout || `nika wire exited ${result.code}` };
}
