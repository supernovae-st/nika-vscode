import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { NikaService } from '../nikaService';

const host = vi.hoisted(() => ({
  profiles: new Map<string, (request: unknown, token: unknown) => Promise<void>>(),
  run: Object.fromEntries(['started', 'passed', 'failed', 'skipped', 'errored', 'end']
    .map((key) => [key, vi.fn()])),
  read: vi.fn(),
}));
vi.mock('fs', () => ({
  readFileSync: host.read, existsSync: () => true,
  readdirSync: () => ['workflow-2026-09-01T00-00-00.ndjson'],
}));
vi.mock('vscode', () => ({
  tests: { createTestController: () => ({
    items: new Map(),
    createTestRun: () => host.run,
    createRunProfile: (name: string, _kind: unknown, run: (request: unknown, token: unknown) => Promise<void>) => {
      host.profiles.set(name, run);
    },
  }) },
  TestTag: class {},
  TestMessage: class { constructor(readonly message: string) {} },
  TestRunProfileKind: { Run: 1 },
  workspace: {
    getConfiguration: () => ({ get: (_key: string, value: unknown) => value }),
    createFileSystemWatcher: () => ({ onDidCreate: vi.fn(), onDidChange: vi.fn(), onDidDelete: vi.fn() }),
  },
}));
import { registerTestExplorer } from '../features/testExplorer';

const event = (kind: string) => JSON.stringify({ kind, fields: [{ key: 'task', value: 'a' }] });
const complete = `${event('task_completed')}\n${event('workflow_completed')}\n`;
const item = {
  id: 'file:///fixture/workflow.nika.yaml#a',
  uri: { fsPath: '/fixture/workflow.nika.yaml' }, children: new Map(),
};

beforeEach(() => {
  vi.clearAllMocks();
  host.profiles.clear();
  // A stale successful file exists, but it cannot identify this child run.
  host.read.mockReturnValue(complete);
});

async function execute(result: { code: number; stdout: string; stderr: string; err?: string }, target = item) {
  const runCli = vi.fn().mockResolvedValue(result);
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  registerTestExplorer(context, { caps: { run: true }, runCli } as unknown as NikaService, async () => []);
  await host.profiles.get('Run (engine)')?.({ include: [target] }, { isCancellationRequested: false });
  expect(host.run.end).toHaveBeenCalledTimes(1);
  return runCli;
}

describe('test explorer judges only its current process capture', () => {
  it('uses current task failure, never an older green journal', async () => {
    await execute({ code: 1, stdout: `${event('task_failed')}\n${event('workflow_failed')}\n`, stderr: '' });
    expect(host.read).not.toHaveBeenCalled();
    expect(host.run.failed).toHaveBeenCalledWith(item, expect.anything(), undefined);
    expect(host.run.passed).not.toHaveBeenCalled();
  });
  it('requests the machine event stream for the exact task and cwd', async () => {
    const runCli = await execute({ code: 0, stdout: complete, stderr: '' });
    expect(runCli).toHaveBeenCalledWith(
      ['run', item.uri.fsPath, '--json', '--color', 'never', '--task', 'a'],
      300000, undefined, '/fixture',
    );
    expect(host.run.passed).toHaveBeenCalledWith(item, undefined);
    expect(host.read).not.toHaveBeenCalled();
  });
  it.each([
    { code: 6, stdout: complete, err: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' },
    { code: 6, stdout: complete, err: 'timeout' },
    { code: 1, stdout: complete },
    { code: 0, stdout: event('task_completed') },
    { code: 0, stdout: '' },
    { code: 0, stdout: `${complete}broken-json\n` },
  ])('refuses an incomplete or contradictory result: %j', async (result) => {
    await execute({ ...result, stderr: '' });
    expect(host.run.errored).toHaveBeenCalledWith(item, expect.anything());
    expect(host.run.passed).not.toHaveBeenCalled();
    expect(host.read).not.toHaveBeenCalled();
  });
  it('cannot paint the workflow green while its current task failed', async () => {
    const workflow = { ...item, id: 'file:///fixture/workflow.nika.yaml', children: new Map([[item.id, item]]) };
    await execute({ code: 0, stdout: `${event('task_failed')}\n${event('workflow_completed')}\n`, stderr: '' }, workflow);
    expect(host.run.passed).not.toHaveBeenCalled();
    expect(host.run.errored).toHaveBeenCalledWith(workflow, expect.anything());
  });
});
