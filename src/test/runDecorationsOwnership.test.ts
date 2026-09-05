import { afterEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ active: undefined as unknown, visible: [] as unknown[] }));
vi.mock('vscode', () => ({
  window: {
    get activeTextEditor() { return host.active; },
    get visibleTextEditors() { return host.visible; },
    createTextEditorDecorationType: () => ({ dispose: vi.fn() }),
    onDidChangeActiveTextEditor: () => ({ dispose: vi.fn() }),
  },
  workspace: {
    onDidChangeTextDocument: () => ({ dispose: vi.fn() }),
    getConfiguration: () => ({ get: () => true }),
  },
  DecorationRangeBehavior: { ClosedClosed: 1 },
  Range: class {},
  ThemeColor: class {},
  MarkdownString: class { appendMarkdown() { return this; } },
}));
vi.mock('../workflowParser', () => ({ parseRichWorkflow: () => ({ tasks: [{ id: 'a', line: 0 }] }) }));

import { RunDecorations } from '../features/runDecorations';
import { traceStore } from '../core/traceStore';
import { foldTrace } from '../core/traceFold';

const file = '/fixture/decorations.nika.yaml';
function editor(fsPath = file) {
  return {
    document: {
      uri: { fsPath, toString: () => fsPath }, languageId: 'nika', fileName: fsPath,
      getText: () => '', lineCount: 1, lineAt: () => ({ range: { end: {} } }),
    },
    setDecorations: vi.fn(),
  };
}
afterEach(() => { traceStore.clear(file); host.active = undefined; host.visible = []; });

describe('run badges follow observation ownership in every visible editor', () => {
  it('retracts actuals in both split editors, without repainting another workflow', () => {
    const left = editor();
    const right = editor();
    const other = editor('/fixture/other.nika.yaml');
    host.active = left;
    host.visible = [left, right, other];
    const badges = new RunDecorations();
    try {
      traceStore.set(file, foldTrace(JSON.stringify({
        kind: 'task_completed', fields: [{ key: 'task', value: 'a' }],
      })));
      expect(left.setDecorations.mock.lastCall?.[1]).toHaveLength(1);
      expect(right.setDecorations.mock.lastCall?.[1]).toHaveLength(1);
      traceStore.clear(file);
      expect(left.setDecorations.mock.lastCall?.[1]).toEqual([]);
      expect(right.setDecorations.mock.lastCall?.[1]).toEqual([]);
      expect(other.setDecorations).not.toHaveBeenCalled();
    } finally { badges.dispose(); }
  });
});
