import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionContext } from 'vscode';
import type { NikaService } from '../nikaService';

const host = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>(), clipboard: vi.fn(), status: vi.fn(), terminal: vi.fn() }));
vi.mock('vscode', () => ({
  TreeItem: class {},
  EventEmitter: class { event = vi.fn(); fire = vi.fn(); },
  workspace: { workspaceFolders: undefined },
  commands: { registerCommand: (id: string, fn: (...args: unknown[]) => unknown) => { host.handlers.set(id, fn); return {}; } },
  env: { clipboard: { writeText: host.clipboard } },
  window: { createTreeView: () => ({}), setStatusBarMessage: host.status, createTerminal: host.terminal },
}));
vi.mock('../nikaTerminal', () => ({ runNikaCommand: host.terminal }));
import { registerStation } from '../features/stationView';

beforeEach(() => {
  vi.clearAllMocks();
  host.handlers.clear();
  registerStation({ subscriptions: [], extension: { packageJSON: { version: '0.118.2' } } } as unknown as ExtensionContext,
    { available: false, caps: {}, onDidChange: () => ({ dispose() {} }) } as unknown as NikaService);
});

describe('doctor prose is not an executable contract', () => {
  it.each(['nika wire zed; unexpected-command', 'nika doctor $(unexpected-command)', 'export SECRET=value', 'brew upgrade nika'])('copies, never executes: %s', async (fix) => {
    await host.handlers.get('nika.station.copyFix')!(fix);
    expect(host.clipboard).toHaveBeenCalledWith(fix);
    expect(host.terminal).not.toHaveBeenCalled();
    expect(host.status).toHaveBeenCalledWith('$(clippy) Suggested fix copied. Review before running.', 4000);
  });
  it('removes the retired executable-fix command and ignores non-text input', async () => {
    expect(host.handlers.has('nika.station.applyFix')).toBe(false);
    await host.handlers.get('nika.station.copyFix')!({ fix: 'nika doctor' });
    await host.handlers.get('nika.station.copyFix')!('');
    expect(host.clipboard).not.toHaveBeenCalled();
    expect(host.terminal).not.toHaveBeenCalled();
  });
});
