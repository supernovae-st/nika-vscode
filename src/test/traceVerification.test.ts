import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { NikaService } from '../nikaService';
import { traceVerificationDocument } from '../core/traceVerification';

const host = vi.hoisted(() => ({
  command: undefined as ((arg?: unknown) => Promise<void>) | undefined,
  open: vi.fn(async (doc: unknown) => doc), show: vi.fn(), warning: vi.fn(), information: vi.fn(),
}));
vi.mock('vscode', () => ({
  commands: { registerCommand: (_name: string, command: typeof host.command) => { host.command = command; } },
  workspace: { openTextDocument: host.open },
  window: { showTextDocument: host.show, showWarningMessage: host.warning, showInformationMessage: host.information },
}));
import { registerTraceVerification } from '../features/traceVerification';

const trace = path.resolve('literal ; $marker [trace].ndjson');
const machine = (over: Record<string, unknown> = {}) => ({
  verify_version: 1, trace, tier: 'sealed', exit: 0,
  chain: { headline: 'intact', head: 'a'.repeat(64), events: 4 },
  seal: { tier: 'sealed', key_id: 'key' }, anchor: { tier: 'not-present' },
  replay: { tier: 'not-asked' }, lines: ['chain intact', 'seal verified', 'anchor not present'], ...over,
});
const result = (doc = machine()) => ({ code: doc.exit as number, stdout: JSON.stringify(doc), stderr: '' });

beforeEach(() => { vi.clearAllMocks(); host.command = undefined; });

describe('engine verification envelope, not another proof implementation', () => {
  it('preserves every proof leg and additive field, including a future tier', () => {
    const doc = machine({ tier: 'future-tier', additional: { fact: 7 } });
    expect(JSON.parse(traceVerificationDocument(result(doc), trace) ?? 'null')).toEqual(doc);
  });
  it('retains a nonzero refusal document with all engine explanations', () => {
    const doc = machine({ tier: 'broken', exit: 1, lines: ['BROKEN at line 2', 'claims unverified'] });
    expect(JSON.parse(traceVerificationDocument(result(doc), trace) ?? 'null')).toEqual(doc);
  });
  it.each([
    { verify_version: 0 }, { verify_version: 2 }, { trace: '/different.ndjson' },
    { exit: -1 }, { exit: 256 }, { exit: 1.5 }, { exit: '0' },
    { tier: '' }, { tier: null }, { lines: ['fact', 1] }, { lines: 'fact' },
  ])('refuses a malformed, foreign or unsupported envelope: %j', (over) => {
    expect(traceVerificationDocument(result(machine(over)), trace)).toBeUndefined();
  });
  it.each(['null', '[]', '{', 'legacy prose', '{"verify_version":1}'])('refuses non-documents: %s', (stdout) => {
    expect(traceVerificationDocument({ code: 0, stdout, stderr: '' }, trace)).toBeUndefined();
  });
  it.each(['timeout', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'])('never admits a complete-looking failed capture: %s', (err) => {
    expect(traceVerificationDocument({ ...result(), err }, trace)).toBeUndefined();
  });
  it('refuses disagreement between the process and document exit', () => {
    expect(traceVerificationDocument({ ...result(), code: 1 }, trace)).toBeUndefined();
  });
});

describe('one explicit verify command', () => {
  function register(runCli = vi.fn().mockResolvedValue(result())) {
    registerTraceVerification({ subscriptions: [] } as unknown as vscode.ExtensionContext,
      { runCli } as unknown as NikaService);
    expect(runCli).not.toHaveBeenCalled();
    return runCli;
  }
  it('requests exact literal argv with a deadline and presents the complete JSON', async () => {
    const runCli = register();
    await host.command?.({ trace: { uri: { scheme: 'file', fsPath: trace } } });
    expect(runCli).toHaveBeenCalledExactlyOnceWith(['trace', 'verify', trace, '--json'], 15000);
    expect(host.open).toHaveBeenCalledExactlyOnceWith({ language: 'json', content: JSON.stringify(machine(), null, 2) + '\n' });
    expect(host.show).toHaveBeenCalledTimes(1);
    expect(host.warning).not.toHaveBeenCalled();
  });
  it.each([undefined, { trace: { uri: { scheme: 'https', fsPath: trace } } },
    { trace: { uri: { scheme: 'file', fsPath: 'relative.ndjson' } } }])('rejects a missing or nonlocal target: %j', async (arg) => {
    const runCli = register();
    await host.command?.(arg);
    expect(runCli).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
  });
  it.each([vi.fn().mockRejectedValue(new Error('transport')),
    vi.fn().mockResolvedValue({ ...result(), err: 'timeout' }),
    vi.fn().mockResolvedValue(result(machine({ verify_version: 2 })))])('refuses failed verification without another reader or prose fallback', async (runCli) => {
    register(runCli);
    await host.command?.({ trace: { uri: { scheme: 'file', fsPath: trace } } });
    expect(host.open).not.toHaveBeenCalled();
    expect(host.warning).toHaveBeenCalledTimes(1);
  });
});
