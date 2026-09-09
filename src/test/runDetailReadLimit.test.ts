import { beforeEach, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';

const host = vi.hoisted(() => ({
  provider: undefined as vscode.TextDocumentContentProvider | undefined,
  read: vi.fn(() => '{"kind":"workflow_completed"}\n'),
  stat: vi.fn(() => ({ size: 16 * 1024 * 1024 + 1, mtimeMs: 12, isFile: () => true })),
  open: vi.fn(() => 7), close: vi.fn(),
}));
vi.mock('fs', () => ({
  constants: { O_RDONLY: 0, O_NONBLOCK: 4 },
  statSync: host.stat, fstatSync: host.stat, readFileSync: host.read,
  openSync: host.open, closeSync: host.close, readSync: host.read,
}));
vi.mock('vscode', () => ({
  EventEmitter: class { event = vi.fn(); fire = vi.fn(); },
  workspace: { registerTextDocumentContentProvider: (_scheme: string, provider: vscode.TextDocumentContentProvider) => {
    host.provider = provider;
  } },
  commands: { registerCommand: vi.fn() },
}));
import { registerRunDetail } from '../features/runDetail';

beforeEach(() => { vi.clearAllMocks(); });

it('refuses an oversized recorded run before reading any payload into the detail page', () => {
  registerRunDetail({ subscriptions: [] } as unknown as vscode.ExtensionContext);
  const page = host.provider?.provideTextDocumentContent(
    { query: encodeURIComponent('/fixture/oversized.ndjson') } as vscode.Uri,
    {} as vscode.CancellationToken,
  );
  expect(host.read).not.toHaveBeenCalled();
  expect(page).toContain('16 MiB');
  expect(page).not.toContain('**completed**');
});
