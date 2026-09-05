import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Disposable, ExtensionContext } from 'vscode';

vi.mock('vscode', () => ({
  TreeItem: class {},
  ThemeColor: class {},
  MarkdownString: class {},
  StatusBarAlignment: { Left: 1 },
  EventEmitter: class<T> {
    private listeners = new Set<(value: T) => void>();
    event = (listener: (value: T) => void): Disposable => {
      this.listeners.add(listener);
      return { dispose: () => { this.listeners.delete(listener); } };
    };
    fire(value: T): void { for (const listener of [...this.listeners]) { listener(value); } }
    dispose(): void { this.listeners.clear(); }
  },
  workspace: { workspaceFolders: [{ uri: { fsPath: '/workspace' } }] },
  commands: { registerCommand: () => ({ dispose() {} }) },
  window: {
    createTreeView: () => ({ dispose() {} }),
    createStatusBarItem: () => ({ show() {}, dispose() {} }),
    onDidChangeActiveTextEditor: () => ({ dispose() {} }),
    withProgress: (_options: unknown, task: () => Promise<unknown>) => task(),
  },
}));
vi.mock('../core/binaryVersion', async (original) => ({
  ...await original<typeof import('../core/binaryVersion')>(),
  probeBinaryVersion: vi.fn(async () => '0.118.2'),
}));
vi.mock('../core/spawn', async (original) => ({
  ...await original<typeof import('../core/spawn')>(),
  spawnCli: vi.fn(),
}));
vi.mock('../nikaTerminal', () => ({ runNikaCommand: vi.fn() }));
vi.mock('../features/runLive', () => ({ isRunActive: () => false, onDidChangeRunActive: () => ({ dispose() {} }) }));
import { NikaService, type CliResult } from '../nikaService';
import { spawnCli } from '../core/spawn';
import { registerStation } from '../features/stationView';
import { NikaStatusBar } from '../features/statusBar';

const doctor = { summary: { ok: 0, warn: 0, fail: 1 }, findings: [] };
const deep = { context_version: 1, identity: { version: '0.118.2' } };
const reply = (value: unknown): CliResult => ({ code: 0, stdout: JSON.stringify(value), stderr: '' });
let subscriptions: Disposable[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  subscriptions = [];
  vi.mocked(spawnCli).mockImplementation(async (_binary, args) => {
    if (args[0] === '--help') { return { code: 0, stdout: 'Commands:\n  doctor Diagnose\n  welcome Welcome\n  check Check\n', stderr: '' }; }
    if (args[1] === '--help') { return { code: 2, stdout: '', stderr: '' }; }
    return reply(args[0] === 'doctor' ? doctor : args[0] === 'welcome' ? deep : {});
  });
});

const cachedProbes = [
  { method: 'doctorJson', cache: 'doctorFails', older: doctor, newer: { ...doctor, summary: { ...doctor.summary, fail: 2 } } },
  { method: 'welcomeDeep', cache: 'deep', older: deep, newer: { ...deep, identity: { version: '0.118.3' } } },
  { method: 'speaksGrammar', cache: 'gen1', older: { parse_fatal: false }, newer: { parse_fatal: true } },
] as const;

describe('Station observations belong to the engine generation that produced them', () => {
  it.each(cachedProbes)('$method cannot stamp a revoked engine cache', async ({ method, cache, older }) => {
    const service = await setup();
    let finish!: (result: CliResult) => void;
    vi.spyOn(service, 'runCli').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const oldProbe = service[method]();
    await service.setBinary(undefined);
    expect(service[cache]).toBeUndefined();
    finish(reply(older));
    expect(await oldProbe).toBeDefined();
    expect(service[cache]).toBeUndefined();
    expect(service.probing).toBe(false);
  });

  it.each(cachedProbes)('$method cannot overwrite a newer engine observation', async ({ method, cache, older, newer }) => {
    const service = await setup();
    let finish!: (result: CliResult) => void;
    const run = vi.spyOn(service, 'runCli').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const oldProbe = service[method]();
    await service.setBinary('/replacement/nika');
    run.mockResolvedValue(reply(newer));
    await service[method]();
    const current = service[cache];
    expect(current).toBeDefined();
    finish(reply(older));
    expect(await oldProbe).toBeDefined();
    expect(service[cache]).toEqual(current);
  });
});

afterEach(() => {
  for (const item of subscriptions) { item.dispose(); }
  vi.clearAllTimers();
  vi.useRealTimers();
});

async function setup(): Promise<NikaService> {
  const service = new NikaService();
  await service.setBinary('/selected/nika');
  expect(service.available).toBe(true);
  return service;
}

function mount(service: NikaService): ReturnType<typeof registerStation> {
  return registerStation({ subscriptions, extension: { packageJSON: { version: '0.118.2' } } } as unknown as ExtensionContext, service);
}

describe('Station refresh is driven by inputs, not its own observations', () => {
  it('status repainting does not launch more grammar probes while one is pending', async () => {
    const service = await setup();
    let finish!: (result: CliResult) => void;
    const pending = new Promise<CliResult>((resolve) => { finish = resolve; });
    const run = service.runCli.bind(service);
    vi.spyOn(service, 'runCli').mockImplementation((args, ...rest) => args[0] === 'check' ? pending : run(args, ...rest));
    const grammar = vi.spyOn(service, 'speaksGrammar');
    subscriptions.push(new NikaStatusBar(service));
    await service.doctorJson();
    await service.welcomeDeep();
    const callsWhilePending = grammar.mock.calls.length;
    finish(reply({ parse_fatal: false }));
    await vi.advanceTimersByTimeAsync(0);
    expect(callsWhilePending).toBe(1);
    expect(grammar).toHaveBeenCalledTimes(1);
  });

  it('concurrent Station and status callers share one grammar process per generation', async () => {
    const service = await setup();
    let finish!: (result: CliResult) => void;
    const pending = new Promise<CliResult>((resolve) => { finish = resolve; });
    const run = vi.spyOn(service, 'runCli').mockReturnValue(pending);
    const first = service.speaksGrammar();
    const second = service.speaksGrammar();
    finish(reply({ parse_fatal: false }));
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a retired canary cannot detach a replacement canary that is still pending', async () => {
    const service = await setup();
    let finishOld!: (result: CliResult) => void;
    const finishNew: ((result: CliResult) => void)[] = [];
    const run = vi.spyOn(service, 'runCli')
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockImplementation(() => new Promise((resolve) => { finishNew.push(resolve); }));
    const oldProbe = service.speaksGrammar();
    await service.setBinary('/replacement/nika');
    const newProbe = service.speaksGrammar();
    finishOld(reply({ parse_fatal: false }));
    expect(await oldProbe).toBe(true);
    expect(service.gen1).toBeUndefined();
    const repeated = service.speaksGrammar();
    const calls = run.mock.calls.length;
    // Keep even the mutant bounded: settle every promise it created.
    for (const finish of finishNew) { finish(reply({ parse_fatal: true })); }
    expect(calls).toBe(2);
    expect(await Promise.all([newProbe, repeated])).toEqual([false, false]);
  });

  it('an unanswered canary can be explicitly retried without an automatic loop', async () => {
    const service = await setup();
    const run = vi.spyOn(service, 'runCli').mockResolvedValueOnce({ code: 2, stdout: '', stderr: 'unavailable' })
      .mockResolvedValue(reply({ parse_fatal: false }));
    expect(await service.speaksGrammar()).toBeUndefined();
    expect(service.gen1).toBeUndefined();
    expect(await service.speaksGrammar()).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('completed probes repaint status without recursively starting new sweeps', async () => {
    const service = await setup();
    const observed: boolean[] = [];
    subscriptions.push(service.onDidChange(() => observed.push(service.probing)));
    const engineChanged = vi.fn();
    subscriptions.push(service.onDidChangeEngine(engineChanged));
    const diagnose = vi.spyOn(service, 'doctorJson');
    mount(service);
    await vi.advanceTimersByTimeAsync(1200);
    expect(service.deep?.engineVersion).toBe('0.118.2');
    expect(service.doctorFails).toBe(1);
    expect(observed).toContain(true);
    expect(observed.at(-1)).toBe(false);
    expect(engineChanged).not.toHaveBeenCalled();
    expect(diagnose).toHaveBeenCalledTimes(1);
  });

  it('an in-flight probe does not schedule another sweep at the debounce boundary', async () => {
    const service = await setup();
    let finish!: (result: CliResult) => void;
    const pending = new Promise<CliResult>((resolve) => { finish = resolve; });
    const run = service.runCli.bind(service);
    vi.spyOn(service, 'runCli').mockImplementation((args, ...rest) => args[0] === 'doctor' ? pending : run(args, ...rest));
    const diagnose = vi.spyOn(service, 'doctorJson');
    mount(service);
    await vi.advanceTimersByTimeAsync(1200);
    const callsWhilePending = diagnose.mock.calls.length;
    finish(reply(doctor));
    await vi.advanceTimersByTimeAsync(1200);
    expect(callsWhilePending).toBe(1);
    expect(diagnose).toHaveBeenCalledTimes(1);
    expect(service.probing).toBe(false);
  });

  it('still refreshes explicitly and after a real engine replacement', async () => {
    const service = await setup();
    const diagnose = vi.spyOn(service, 'doctorJson');
    const { provider } = mount(service);
    await vi.advanceTimersByTimeAsync(0);
    await provider.refresh();
    expect(diagnose).toHaveBeenCalledTimes(2);
    await service.setBinary('/replacement/nika');
    await vi.advanceTimersByTimeAsync(1200);
    expect(diagnose).toHaveBeenCalledTimes(3);
    expect(provider.getChildren().length).toBeGreaterThan(0);
  });

  it('disposal cancels the trailing engine-change refresh', async () => {
    const service = await setup();
    const diagnose = vi.spyOn(service, 'doctorJson');
    mount(service);
    await vi.advanceTimersByTimeAsync(0);
    await service.setBinary('/replacement/nika');
    subscriptions.splice(0).forEach((item) => item.dispose());
    await vi.advanceTimersByTimeAsync(1200);
    expect(diagnose).toHaveBeenCalledTimes(1);
  });
});
