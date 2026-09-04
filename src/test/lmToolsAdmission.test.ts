import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionContext } from 'vscode';
import type { NikaService } from '../nikaService';
import { noCapabilities } from '../core/capabilities';

const host = vi.hoisted(() => ({
  tools: new Map<string, { invoke(options: unknown, token?: unknown): Promise<unknown> }>(),
  folders: [{ name: 'first', uri: { fsPath: '/first' } }, { name: 'second', uri: { fsPath: '/second' } }],
}));
vi.mock('vscode', () => ({
  workspace: {
    get workspaceFolders() { return host.folders; },
    getConfiguration: () => ({ get: () => true }),
  },
  window: {},
  lm: {
    registerTool: (name: string, tool: { invoke(options: unknown): Promise<unknown> }) => {
      host.tools.set(name, tool);
      return { dispose: () => host.tools.delete(name) };
    },
  },
  LanguageModelTextPart: class { constructor(public value: string) {} },
  LanguageModelToolResult: class { constructor(public parts: unknown[]) {} },
}));
import { registerLmTools } from '../features/lmTools';

function setup(available = false, welcome = false): {
  service: NikaService; refresh(): void; dispose(): void;
} {
  let refresh = (): void => {};
  const subscriptions: { dispose(): unknown }[] = [];
  const service = {
    available, caps: { ...noCapabilities(), welcome },
    runCli: vi.fn(async () => ({ code: 0, stdout: '{"context_version":1}', stderr: '' })),
    onDidChange: (listener: () => void) => { refresh = listener; return { dispose: vi.fn() }; },
  } as unknown as NikaService;
  registerLmTools({ subscriptions } as ExtensionContext, service, vi.fn());
  return { service, refresh: () => refresh(), dispose: () => subscriptions.forEach((item) => item.dispose()) };
}

beforeEach(() => {
  host.tools.clear();
  host.folders = [{ name: 'first', uri: { fsPath: '/first' } }, { name: 'second', uri: { fsPath: '/second' } }];
});

describe('LM tools use admitted current capabilities', () => {
  it('advertises no engine tools before admission and revokes them on restart refusal', () => {
    const state = setup();
    expect(host.tools.size).toBe(0);
    Object.assign(state.service, { available: true });
    state.service.caps.welcome = true;
    state.refresh();
    expect(host.tools.has('nika_workspace')).toBe(true);
    Object.assign(state.service, { available: false });
    state.refresh();
    expect(host.tools.size).toBe(0);
    expect(state.service.runCli).not.toHaveBeenCalled();
    state.dispose();
  });
  it('canonical workspace success keeps explicit folder and multi-root qualification', async () => {
    const state = setup(true, true);
    const result = await host.tools.get('nika_workspace')!.invoke({}) as { parts: { value: string }[] };
    expect(state.service.runCli).toHaveBeenCalledExactlyOnceWith(['welcome', '--deep', '--json'], 30000, undefined, '/first');
    expect(result.parts[0].value).toContain('covers only first');
    state.dispose();
  });
  it('a refused canonical workspace call has no context retry', async () => {
    const state = setup(true, true);
    vi.mocked(state.service.runCli).mockResolvedValue({ code: 2, stdout: '', stderr: 'original refusal' });
    const result = await host.tools.get('nika_workspace')!.invoke({}) as { parts: { value: string }[] };
    expect(result.parts[0].value).toContain('original refusal');
    expect(state.service.runCli).toHaveBeenCalledExactlyOnceWith(['welcome', '--deep', '--json'], 30000, undefined, '/first');
    state.dispose();
  });
  it('missing welcome capability cannot register a legacy-only workspace tool', () => {
    const state = setup(true);
    state.service.caps.commands.add('context');
    state.refresh();
    expect(host.tools.has('nika_workspace')).toBe(false);
    expect(state.service.runCli).not.toHaveBeenCalled();
    state.dispose();
  });
  it('an empty window runs no workspace aggregation', async () => {
    const state = setup(true, true);
    host.folders = [];
    await host.tools.get('nika_workspace')!.invoke({});
    expect(state.service.runCli).not.toHaveBeenCalled();
    state.dispose();
  });
});
