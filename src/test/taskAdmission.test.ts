import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionContext, Task, TaskProvider } from 'vscode';
import type { NikaService } from '../nikaService';

const host = vi.hoisted(() => ({
  provider: undefined as TaskProvider | undefined,
  findFiles: vi.fn(),
  relativePath: vi.fn(),
  workspaceFolder: vi.fn(),
  shells: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('vscode', () => ({
  tasks: { registerTaskProvider: (_type: string, provider: TaskProvider) => { host.provider = provider; return { dispose: vi.fn() }; } },
  workspace: { findFiles: host.findFiles, asRelativePath: host.relativePath, getWorkspaceFolder: host.workspaceFolder },
  window: { showWarningMessage: host.warning },
  TaskScope: { Workspace: 1 },
  TaskGroup: { Test: 1, Build: 2 },
  ProcessExecution: class { constructor(binary: string, args: string[]) { host.shells(binary, args); } },
  Task: class { constructor(readonly definition: unknown, readonly scope: unknown, readonly name: string) {} },
}));
import { registerNikaTaskProvider } from '../features/taskProvider';

beforeEach(() => {
  vi.clearAllMocks();
  host.relativePath.mockReturnValue('workflow.nika.yaml');
  host.workspaceFolder.mockReturnValue(undefined);
});
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
    host.findFiles.mockResolvedValue([{ scheme: 'file', fsPath: '/work/workflow.nika.yaml' }]);
    expect(await host.provider!.provideTasks(token)).toHaveLength(2);
    host.provider!.resolveTask({ definition: { type: 'nika', command: 'run', file: 'custom.nika.yaml' }, name: 'custom' } as Task, token);
    expect(host.shells.mock.calls).toEqual([
      ['/admitted/nika', ['check', '/work/workflow.nika.yaml']],
      ['/admitted/nika', ['run', '/work/workflow.nika.yaml']],
      ['/admitted/nika', ['run', 'custom.nika.yaml']],
    ]);
  });
  it('keeps multi-root display names out of argv and binds each task to its actual folder', async () => {
    setup(true);
    const folders = [
      { name: 'api', uri: { fsPath: '/projects/api' }, index: 0 },
      { name: 'web', uri: { fsPath: '/projects/web' }, index: 1 },
    ];
    const files = folders.map((folder) => ({ scheme: 'file', fsPath: `${folder.uri.fsPath}/flow with spaces.nika.yaml` }));
    host.findFiles.mockResolvedValue(files);
    host.relativePath.mockImplementation((uri) => uri.fsPath.slice('/projects/'.length));
    host.workspaceFolder.mockImplementation((uri) => folders.find((folder) => uri.fsPath.startsWith(`${folder.uri.fsPath}/`)));
    const tasks = await host.provider!.provideTasks(token) as Task[];
    expect(host.shells.mock.calls).toEqual(files.flatMap((uri) => [
      ['/admitted/nika', ['check', uri.fsPath]],
      ['/admitted/nika', ['run', uri.fsPath]],
    ]));
    expect(tasks.map((task) => task.scope)).toEqual([folders[0], folders[0], folders[1], folders[1]]);
    expect(tasks.map((task) => task.name)).toEqual([
      'check api/flow with spaces.nika.yaml', 'run api/flow with spaces.nika.yaml',
      'check web/flow with spaces.nika.yaml', 'run web/flow with spaces.nika.yaml',
    ]);
  });
  it('does not turn a virtual document URI into a local process path', async () => {
    setup(true);
    host.findFiles.mockResolvedValue([{ scheme: 'git', fsPath: '/work/virtual.nika.yaml' }]);
    expect(await host.provider!.provideTasks(token)).toEqual([]);
    expect(host.shells).not.toHaveBeenCalled();
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
  it('refuses host command-variable expansion in user-authored task definitions', () => {
    setup(true);
    expect(host.provider!.resolveTask({ definition: { type: 'nika', command: 'run', file: '${command:unexpected}' } } as Task, token)).toBeUndefined();
    expect(host.shells).not.toHaveBeenCalled();
    expect(host.warning).toHaveBeenCalledWith(expect.stringContaining('literal values'));
  });
});
