import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionContext, Task, TaskProvider } from 'vscode';
import type { NikaService } from '../nikaService';

const host = vi.hoisted(() => ({
  provider: undefined as TaskProvider | undefined,
  findFiles: vi.fn(),
  shells: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('vscode', () => ({
  tasks: { registerTaskProvider: (_type: string, provider: TaskProvider) => { host.provider = provider; return { dispose: vi.fn() }; } },
  workspace: { findFiles: host.findFiles, asRelativePath: () => 'workflow.nika.yaml', getWorkspaceFolder: () => undefined },
  window: { showWarningMessage: host.warning },
  TaskScope: { Workspace: 1 },
  TaskGroup: { Test: 1, Build: 2 },
  ShellExecution: class { constructor(binary: string, args: string[]) { host.shells(binary, args); } },
  Task: class {},
}));
import { registerNikaTaskProvider } from '../features/taskProvider';

beforeEach(() => { vi.clearAllMocks(); });
const token = {} as Parameters<TaskProvider['provideTasks']>[0];
function setup(available: boolean): NikaService {
  const service = {
    available, binaryPath: available ? '/admitted/nika' : undefined,
    supportError: available ? undefined : 'Update to Nika 0.118.1',
    caps: { check: true, run: true },
  } as NikaService;
  registerNikaTaskProvider({ subscriptions: [] } as unknown as ExtensionContext, service);
  return service;
}

describe('native task engine admission', () => {
  it('neither advertises nor resolves an executable task after refusal', async () => {
    setup(false);
    expect(await host.provider!.provideTasks(token)).toEqual([]);
    expect(host.provider!.resolveTask({ definition: { type: 'nika', command: 'run' } } as Task, token)).toBeUndefined();
    expect(host.findFiles).not.toHaveBeenCalled();
    expect(host.shells).not.toHaveBeenCalled();
    expect(host.warning).toHaveBeenCalledWith('Nika: Update to Nika 0.118.1');
  });
  it('uses only the admitted binary for auto-provided and explicit tasks', async () => {
    setup(true);
    host.findFiles.mockResolvedValue([{}]);
    expect(await host.provider!.provideTasks(token)).toHaveLength(2);
    host.provider!.resolveTask({ definition: { type: 'nika', command: 'run', file: 'custom.nika.yaml' }, name: 'custom' } as Task, token);
    expect(host.shells.mock.calls).toEqual([
      ['/admitted/nika', ['check', 'workflow.nika.yaml']],
      ['/admitted/nika', ['run', 'workflow.nika.yaml']],
      ['/admitted/nika', ['run', 'custom.nika.yaml']],
    ]);
  });
  it('does not advertise tasks if admission is revoked while files are being found', async () => {
    const service = setup(true);
    let finish!: (files: unknown[]) => void;
    host.findFiles.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pending = host.provider!.provideTasks(token);
    Object.assign(service, { available: false, binaryPath: undefined });
    finish([{}]);
    expect(await pending).toEqual([]);
    expect(host.shells).not.toHaveBeenCalled();
  });
});
