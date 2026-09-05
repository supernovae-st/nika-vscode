import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'path';

const host = vi.hoisted(() => ({ choose: vi.fn(), warn: vi.fn() }));
vi.mock('vscode', () => ({
  window: { showOpenDialog: host.choose, showWarningMessage: host.warn },
  Uri: { file: (fsPath: string) => ({ scheme: 'file', fsPath }) },
}));
import { chooseResumeJournal } from '../features/resumeSource';
const workflow = path.resolve('fixture', 'workflow.nika.yaml');
const journal = path.resolve('fixture', '.nika', 'traces', 'engine.ndjson');
beforeEach(() => { vi.clearAllMocks(); });

describe('one explicit resume source', () => {
  it('retains the exact absolute engine announcement without another lookup', async () => {
    expect(await chooseResumeJournal(workflow, journal)).toBe(journal);
    expect(host.choose).not.toHaveBeenCalled();
  });
  it('uses the chosen local journal without declaring it admitted', async () => {
    host.choose.mockResolvedValue([{ scheme: 'file', fsPath: journal }]);
    expect(await chooseResumeJournal(workflow)).toBe(journal);
    expect(host.choose).toHaveBeenCalledWith(expect.objectContaining({ canSelectMany: false }));
    expect(host.warn).not.toHaveBeenCalled();
  });
  it.each([undefined, []])('cancellation selects nothing and cannot trigger a fresh run', async (selected) => {
    host.choose.mockResolvedValue(selected);
    expect(await chooseResumeJournal(workflow)).toBeUndefined();
    expect(host.warn).not.toHaveBeenCalled();
  });
  it.each([
    [{ scheme: 'untitled', fsPath: journal }],
    [{ scheme: 'file', fsPath: 'relative.ndjson' }],
    [{ scheme: 'file', fsPath: journal }, { scheme: 'file', fsPath: journal }],
  ])('refuses an ambiguous or non-local selection', async (selected) => {
    host.choose.mockResolvedValue(selected);
    expect(await chooseResumeJournal(workflow)).toBeUndefined();
    expect(host.warn).toHaveBeenCalledTimes(1);
  });
  it('does not treat a relative announcement as an engine-owned identity', async () => {
    host.choose.mockResolvedValue(undefined);
    expect(await chooseResumeJournal(workflow, 'relative.ndjson')).toBeUndefined();
    expect(host.choose).toHaveBeenCalledTimes(1);
  });
});
