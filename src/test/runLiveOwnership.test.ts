import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { DagPanel } from '../dagPanel';
import type { NikaService } from '../nikaService';

const host = vi.hoisted(() => ({
  spawn: vi.fn(), warning: vi.fn(), store: vi.fn(), persist: vi.fn(), hashes: vi.fn(),
  active: vi.fn(), community: vi.fn(),
  celebrate: vi.fn(), clear: vi.fn(),
}));
vi.mock('child_process', () => ({ spawn: host.spawn }));
vi.mock('vscode', () => ({
  EventEmitter: class { event = vi.fn(); fire = host.active; },
  workspace: { getConfiguration: () => ({ get: () => 200 }) },
  window: { showWarningMessage: host.warning },
  commands: { executeCommand: vi.fn() },
}));
vi.mock('../features/communityAsk', () => ({ maybeAskCommunity: host.community }));
vi.mock('../features/firstGreen', () => ({ maybeCelebrateFirstGreen: host.celebrate }));
vi.mock('../features/runsView', () => ({ cancelActiveReplay: vi.fn() }));
vi.mock('../core/canvasState', () => ({ saveRunHashes: host.hashes }));
vi.mock('../core/tracePersist', () => ({ persistTrace: host.persist, pruneTraces: vi.fn() }));
vi.mock('../core/traceStore', () => ({ traceStore: { set: host.store, clear: host.clear } }));

class Child extends EventEmitter {
  pid: number | undefined = 1;
  stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  kill = vi.fn((_signal?: NodeJS.Signals) => true);
}
let api: typeof import('../features/runLive');
let children: Child[];
let panel: DagPanel;
let service: NikaService;
const log = vi.fn();
const file = '/fixture/workflow.nika.yaml';
function event(kind: string, fields: { key: string; value: string }[] = []): string {
  return `${JSON.stringify({ kind, timestamp: 0, fields })}\n`;
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  host.warning.mockResolvedValue(undefined);
  host.celebrate.mockReturnValue(false);
  children = [];
  host.spawn.mockImplementation(() => { const child = new Child(); children.push(child); return child; });
  panel = Object.fromEntries(['clearTransport', 'note', 'setRunState', 'runProgress',
    'batchUpdateStatus', 'runVerdict'].map((name) => [name, vi.fn()])) as unknown as DagPanel;
  service = { binaryPath: '/admitted/nika', setBinary: vi.fn() } as unknown as NikaService;
  api = await import('../features/runLive');
});
afterEach(() => { vi.useRealTimers(); });

describe('live run ownership and settlement', () => {
  it.each([
    { tail: event('workflow_completed'), code: 1 },
    { tail: event('workflow_completed'), code: null },
    { tail: '', code: 0 },
    { tail: `${event('workflow_completed')}broken-json\n`, code: 0 },
    { tail: `${event('task_failed', [{ key: 'task', value: 'other' }])}${event('workflow_completed')}`, code: 0 },
  ])('never turns an incomplete or contradictory process capture green: %j', ({ tail, code }) => {
    const onClose = vi.fn();
    api.runWorkflowLive(service, panel, file, log, undefined, { onClose });
    children[0].stdout.emit('data', event('task_completed', [{ key: 'task', value: 'work' }]) + tail);
    children[0].emit('close', code);
    expect(JSON.stringify(vi.mocked(panel.runVerdict).mock.calls)).toContain('observation');
    expect(JSON.stringify(vi.mocked(panel.runVerdict).mock.calls)).not.toContain('st-success');
    expect(host.persist).not.toHaveBeenCalled();
    expect(host.hashes).not.toHaveBeenCalled();
    expect(host.celebrate).not.toHaveBeenCalled();
    expect(host.community).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.isRunActive()).toBe(false);
  });

  it('drains an over-limit stream without manufacturing a final verdict or another journal', () => {
    const onClose = vi.fn();
    api.runWorkflowLive(service, panel, file, log, undefined, { onClose });
    children[0].stdout.emit('data', event('task_started', [{ key: 'task', value: 'work' }]));
    children[0].stdout.emit('data', 'x'.repeat(16 * 1024 * 1024 + 1));
    expect(children[0].kill).not.toHaveBeenCalled();
    expect(api.isRunActive()).toBe(true);
    expect(host.clear).toHaveBeenCalledWith(file);
    host.store.mockClear();
    children[0].stdout.emit('data', event('workflow_completed'));
    children[0].emit('close', 0);
    expect(JSON.stringify(vi.mocked(panel.runVerdict).mock.calls)).toContain('live preview incomplete');
    expect(host.store).not.toHaveBeenCalled();
    expect(host.persist).not.toHaveBeenCalled();
    expect(host.hashes).not.toHaveBeenCalled();
    expect(host.celebrate).not.toHaveBeenCalled();
    expect(host.community).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.isRunActive()).toBe(false);
  });

  it('coalesces tiny chunks and cancels any delayed paint when the process closes', () => {
    api.runWorkflowLive(service, panel, file, log);
    const text = event('task_started', [{ key: 'task', value: 'work' }]);
    for (const character of text) { children[0].stdout.emit('data', character); }
    expect(panel.batchUpdateStatus).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(panel.batchUpdateStatus).toHaveBeenCalledTimes(1);
    children[0].stdout.emit('data', event('task_completed', [{ key: 'task', value: 'work' }]));
    children[0].stdout.emit('data', event('workflow_completed'));
    children[0].emit('close', 0);
    const paints = vi.mocked(panel.batchUpdateStatus).mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(panel.batchUpdateStatus).toHaveBeenCalledTimes(paints);
    expect(JSON.stringify(vi.mocked(panel.runVerdict).mock.calls)).toContain('every task landed');
  });

  it('preserves the current announced path and complete head across stderr chunks', () => {
    const head = 'ab'.repeat(32);
    const header = `nika run: trace: .nika/traces/a space.ndjson · 7 events · chain ${head} · sealed\n`;
    api.runWorkflowLive(service, panel, file, log);
    const cut = header.indexOf(head) + 31;
    children[0].stderr.emit('data', header.slice(0, cut));
    children[0].stderr.emit('data', header.slice(cut));
    children[0].stdout.emit('data', event('workflow_completed'));
    children[0].emit('close', 0);
    expect(api.lastTracePathByWorkflow.get(file)).toBe('/fixture/.nika/traces/a space.ndjson');
    expect(JSON.stringify(vi.mocked(panel.runVerdict).mock.calls)).toContain(`7 events · chain ${head}`);
  });

  it('holds one process until close and retains only the latest replacement', () => {
    api.runWorkflowLive(service, panel, file, log);
    api.runWorkflowLive(service, panel, '/fixture/discarded.nika.yaml', log);
    api.runWorkflowLive(service, panel, '/fixture/latest.nika.yaml', log);
    expect(host.spawn).toHaveBeenCalledTimes(1);
    expect(children[0].kill).toHaveBeenCalledTimes(1);
    expect(api.isRunActive()).toBe(true);
    children[0].emit('close', null, 'SIGTERM');
    expect(host.spawn).toHaveBeenCalledTimes(2);
    expect(host.spawn.mock.calls[1][1][1]).toBe('/fixture/latest.nika.yaml');
    expect(api.isRunActive()).toBe(true);
  });

  it('fences superseded output, errors, callbacks and duplicate close events', () => {
    const onClose = vi.fn();
    api.runWorkflowLive(service, panel, file, log, undefined, { onClose });
    const old = children[0];
    api.runWorkflowLive(service, panel, file, log);
    vi.mocked(panel.note).mockClear();
    old.stdout.emit('data', event('task_started', [{ key: 'task', value: 'old' }]));
    old.stderr.emit('data', 'trace: old.ndjson');
    old.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
    expect(host.store).not.toHaveBeenCalled();
    expect(panel.note).not.toHaveBeenCalled();
    expect(api.lastTracePathByWorkflow.has(file)).toBe(false);
    expect(service.setBinary).not.toHaveBeenCalled();
    expect(host.warning).not.toHaveBeenCalled();
    old.emit('close', -2);
    expect(onClose).not.toHaveBeenCalled();
    expect(host.persist).not.toHaveBeenCalled();
    old.emit('close', -2);
    old.stdout.emit('data', event('workflow_completed'));
    expect(api.isRunActive()).toBe(true);
    expect(panel.setRunState).toHaveBeenLastCalledWith(true);
    api.cancelActiveRun();
    expect(children[1].kill).toHaveBeenCalledTimes(1);
  });

  it('stop discards a queued replacement but does not declare settlement', () => {
    api.runWorkflowLive(service, panel, file, log);
    api.runWorkflowLive(service, panel, file, log);
    api.cancelActiveRun();
    api.cancelActiveRun();
    expect(api.isRunActive()).toBe(true);
    expect(children[0].kill).toHaveBeenCalledTimes(1);
    children[0].emit('close', null);
    expect(api.isRunActive()).toBe(false);
    expect(host.spawn).toHaveBeenCalledTimes(1);
  });

  it('escalates an unclosed stop once without releasing ownership on a timer', () => {
    api.runWorkflowLive(service, panel, file, log);
    api.cancelActiveRun();
    vi.advanceTimersByTime(5000);
    expect(children[0].kill.mock.calls).toEqual([[], ['SIGKILL']]);
    expect(api.isRunActive()).toBe(true);
    vi.advanceTimersByTime(60000);
    expect(children[0].kill).toHaveBeenCalledTimes(2);
    children[0].emit('close', null);
    expect(api.isRunActive()).toBe(false);
  });

  it('cancels the escalation timer on close and calls the owned completion once', () => {
    const onClose = vi.fn();
    api.runWorkflowLive(service, panel, file, log, undefined, { onClose });
    api.cancelActiveRun();
    children[0].stdout.emit('data', event('task_started', [{ key: 'task', value: 'work' }]));
    children[0].stdout.emit('data', event('task_cancelled', [{ key: 'task', value: 'work' }]));
    children[0].stdout.emit('data', event('workflow_cancelled'));
    children[0].emit('close', 130);
    children[0].emit('close', 130);
    vi.advanceTimersByTime(60000);
    expect(children[0].kill).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(panel.runVerdict).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(panel.runVerdict).mock.calls)).toContain('earlier effects may remain');
    expect(JSON.stringify(vi.mocked(panel.runVerdict).mock.calls)).not.toContain('nothing half-written');
  });

  it('spawn errors await close and cannot clear a newly selected binary', () => {
    api.runWorkflowLive(service, panel, file, log);
    children[0].pid = undefined;
    Object.assign(service, { binaryPath: '/newly/admitted/nika' });
    children[0].emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
    expect(api.isRunActive()).toBe(true);
    expect(service.setBinary).not.toHaveBeenCalled();
    children[0].emit('close', -2);
    expect(api.isRunActive()).toBe(false);
    expect(panel.runVerdict).not.toHaveBeenCalled();
  });

  it('releases ownership even if a consumer completion callback throws', () => {
    api.runWorkflowLive(service, panel, file, log, undefined, {
      onClose: () => { throw new Error('consumer failed'); },
    });
    expect(() => children[0].emit('close', 0)).toThrow('consumer failed');
    expect(api.isRunActive()).toBe(false);
  });

  it('releases ownership even if painting the idle state throws', () => {
    api.runWorkflowLive(service, panel, file, log);
    vi.mocked(panel.setRunState).mockImplementation(() => { throw new Error('view disposed'); });
    expect(() => children[0].emit('close', 0)).toThrow('view disposed');
    expect(api.isRunActive()).toBe(false);
  });

  it('does not confuse a signal error with failure to spawn', () => {
    api.runWorkflowLive(service, panel, file, log);
    children[0].emit('error', Object.assign(new Error('signal failed'), { code: 'EPERM' }));
    expect(host.warning).toHaveBeenCalledWith('Nika: run process error — signal failed');
    expect(service.setBinary).not.toHaveBeenCalled();
    children[0].stdout.emit('data', event('workflow_completed'));
    children[0].emit('close', 0);
    expect(panel.runVerdict).toHaveBeenCalledTimes(1);
    expect(api.isRunActive()).toBe(false);
  });

  it('does not publish an old delayed celebration after a subsequent run settles', () => {
    host.celebrate.mockReturnValue(true);
    api.runWorkflowLive(service, panel, file, log);
    children[0].stdout.emit('data', event('workflow_completed'));
    children[0].emit('close', 0);
    host.celebrate.mockReturnValue(false);
    api.runWorkflowLive(service, panel, file, log);
    children[1].emit('close', 0);
    host.community.mockClear();
    vi.advanceTimersByTime(1500);
    expect(host.community).not.toHaveBeenCalled();
  });
});
