import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from 'vscode';

const host = vi.hoisted(() => ({ execute: vi.fn(), process: vi.fn(), warning: vi.fn(), folders: [{}] as unknown[] | undefined }));
vi.mock('vscode', () => ({
  tasks: { executeTask: host.execute },
  window: { showWarningMessage: host.warning },
  workspace: { getWorkspaceFolder: () => undefined, get workspaceFolders() { return host.folders; } },
  Uri: { file: (value: string) => value },
  TaskScope: { Workspace: 2 },
  TaskRevealKind: { Always: 1 },
  TaskPanelKind: { New: 3 },
  ProcessExecution: class {
    constructor(binary: string, args: string[], options: unknown) { host.process(binary, args, options); }
  },
  Task: class {
    constructor(readonly definition: unknown, readonly scope: unknown, readonly name: string) {}
  },
}));
import { nikaProcessExecution, runNikaCommand } from '../nikaTerminal';

beforeEach(() => { vi.clearAllMocks(); host.execute.mockResolvedValue({}); host.folders = [{}]; });

describe('literal terminal process boundary', () => {
  it('preserves metacharacters as separate argv entries, including the workflow path', async () => {
    const binary = '/tools/nika "quoted" $(not-a-command)';
    const file = '/work/space and $dollar/`literal`.nika.yaml';
    const args = ['run', '--var', 'value=a b; $(not-a-command) | "quoted"\nnext', '🦋'];
    await runNikaCommand(binary, args, file);
    expect(host.process).toHaveBeenCalledWith(binary, [...args, file], { cwd: '/work/space and $dollar' });
    const task = host.execute.mock.calls[0][0] as Task;
    expect(task.presentationOptions).toMatchObject({ echo: false, focus: true, close: false });
    expect(JSON.stringify(task.definition)).not.toContain('value=');
  });
  it('runs no-file commands in the current workspace', async () => {
    await runNikaCommand('/tools/nika', ['doctor']);
    expect(host.process).toHaveBeenCalledWith('/tools/nika', ['doctor'], { cwd: undefined });
    expect(host.execute.mock.calls[0][0].scope).toBe(2);
  });
  it('refuses an empty window before creating a task, with a concrete next step', async () => {
    host.folders = undefined;
    expect(await runNikaCommand('/tools/nika', ['doctor'])).toBe(false);
    expect(host.execute).not.toHaveBeenCalled();
    expect(host.process).not.toHaveBeenCalled();
    expect(host.warning).toHaveBeenCalledWith(expect.stringContaining('open a folder'));
  });
  it('copies argv before passing it to VS Code', () => {
    const args = ['check'];
    nikaProcessExecution('/tools/nika', args);
    args.push('changed');
    expect(host.process.mock.calls[0][1]).toEqual(['check']);
  });
  it.each(['${command:unexpected}', '${input:unexpected}', '${env:SECRET}'])('refuses host variable evaluation: %s', async (value) => {
    await runNikaCommand('/tools/nika', ['run', '--var', `value=${value}`]);
    expect(host.process).not.toHaveBeenCalled();
    expect(host.execute).not.toHaveBeenCalled();
    expect(host.warning).toHaveBeenCalledWith(expect.stringContaining('VS Code variable'));
  });
  it('also rejects host variables in the executable and working directory', () => {
    expect(() => nikaProcessExecution('/tools/${env:NIKA}', ['check'])).toThrow('VS Code variable');
    expect(() => nikaProcessExecution('/tools/nika', ['check'], '/work/${command:bad}')).toThrow('VS Code variable');
  });
  it('refuses empty or NUL-containing invocations without exposing their content', async () => {
    await runNikaCommand('/tools/nika', []);
    await runNikaCommand('/tools/nika', ['run', 'secret\0data']);
    expect(host.execute).not.toHaveBeenCalled();
    expect(host.warning.mock.calls.flat().join(' ')).not.toContain('secret');
  });
  it('does nothing without an admitted binary and reports launch errors without echoing argv', async () => {
    await runNikaCommand(undefined, ['doctor']);
    expect(host.execute).not.toHaveBeenCalled();
    host.execute.mockRejectedValue(new Error('secret invocation'));
    await runNikaCommand('/tools/nika', ['doctor']);
    expect(host.warning).toHaveBeenCalledWith('Nika: could not start the terminal task. Check the Tasks output for details.');
  });
});
