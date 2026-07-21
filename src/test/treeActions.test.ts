// treeActions.test.ts — the tree action panel contract (DESIGN.md §7d).
//
// Four promises held here. REACHABILITY: every inline (hover-only)
// view/item/context command in the manifest has a row in the panel —
// the keyboard reaches everything the mouse reaches, and the belt
// FAILS when a new inline action ships without teaching the panel.
// CURATION: each row kind serves its verbs in the K-grammar order,
// greyed WITH A REASON when a capability is missing, never hidden.
// THREADING: the panel passes the SAME argument the inline icon would
// (the live element · the trace Uri), so the audited command paths
// stay the only paths. HABIT: the item section re-ranks through the
// ROOT search's frecency store (one store · `tree.<command>` ids).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildTreeActionPanel,
  rankTreeRows,
  type TreeActionRow,
  type TreeCaps,
  type TreeItemFacts,
  type TreeViewId,
} from '../core/treeActions';
import { visit } from '../core/rootSearch';

const ALL_ON: TreeCaps = { available: true, run: true, check: true, dap: true };
const NO_ENGINE: TreeCaps = { available: false, run: false, check: false, dap: false };

const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'),
) as {
  contributes: {
    menus: { 'view/item/context': Array<{ command: string; when: string; group?: string }> };
  };
};

/** The manifest's viewItem vocabulary → the panel's facts, one per kind. */
const FACTS: Record<string, { view: TreeViewId; facts: TreeItemFacts }> = {
  workflowFile: {
    view: 'nikaWorkflows',
    facts: {
      kind: 'workflowFile', label: 'deploy.nika.yaml', element: { sentinel: 'file' },
      click: { command: 'vscode.open', args: ['uri'] },
    },
  },
  workflowTask: {
    view: 'nikaWorkflows',
    facts: {
      kind: 'workflowTask', label: 'fetch', element: { sentinel: 'task' },
      click: { command: 'nika.openTaskLocation', args: ['uri', 3] },
    },
  },
  nikaTrace: {
    view: 'nikaRuns',
    facts: { kind: 'trace', label: 'run.ndjson', element: { sentinel: 'trace' }, traceUri: { sentinel: 'uri' } },
  },
  nikaTraceTask: {
    view: 'nikaRuns',
    facts: { kind: 'traceTask', label: 'summarize', element: { sentinel: 'traceTask' } },
  },
  nikaHistoryCell: {
    view: 'nikaRunHistory',
    facts: {
      kind: 'historyCell', label: '#3', element: { sentinel: 'cell' }, hasTrace: true,
      click: { command: 'nika.runDetail', args: ['uri'] },
      traceUri: { sentinel: 'uri' },
    },
  },
  fixable: {
    view: 'nikaStation',
    facts: { kind: 'stationFixable', label: 'ANTHROPIC_API_KEY missing', element: { sentinel: 'row' } },
  },
  doctorHead: {
    view: 'nikaStation',
    facts: { kind: 'stationDoctorHead', label: 'doctor · 2 fails' },
  },
};

const commandsOf = (view: TreeViewId, facts: TreeItemFacts | undefined, caps: TreeCaps): string[] => {
  const p = buildTreeActionPanel(view, facts, caps);
  return [...p.itemRows, ...p.viewRows].map((r) => r.command);
};

describe('reachability — the keyboard reaches everything the hover reaches', () => {
  const entries = pkg.contributes.menus['view/item/context'];

  it('the manifest still carries inline rows to cover (the audit premise)', () => {
    expect(entries.filter((e) => e.group?.startsWith('inline')).length).toBeGreaterThanOrEqual(11);
  });

  for (const e of entries) {
    it(`${e.command} (${e.group ?? 'context'} · ${e.when}) has a panel row`, () => {
      const viewItem = /viewItem == (\w+)/.exec(e.when)?.[1];
      expect(viewItem, e.when).toBeDefined();
      const home = FACTS[viewItem!];
      expect(home, `no panel facts modeled for viewItem ${viewItem}`).toBeDefined();
      expect(commandsOf(home.view, home.facts, ALL_ON)).toContain(e.command);
    });
  }
});

describe('curation — each kind serves its verbs, primary first', () => {
  it('a workflow file: run leads, check follows, open closes', () => {
    const p = buildTreeActionPanel('nikaWorkflows', FACTS.workflowFile.facts, ALL_ON);
    expect(p.itemRows.map((r) => r.command)).toEqual([
      'nika.workflows.run', 'nika.workflows.check', 'vscode.open',
    ]);
    expect(p.title).toBe('Workflows · deploy.nika.yaml');
    // The chord teachers point at the palette commands that own chords.
    expect(p.itemRows[0].teach).toBe('nika.runWorkflow');
    expect(p.itemRows[1].teach).toBe('nika.checkWorkflow');
  });

  it('a trace: the detail leads (the row\'s own Enter), the flight recorder follows', () => {
    const p = buildTreeActionPanel('nikaRuns', FACTS.nikaTrace.facts, ALL_ON);
    expect(p.itemRows.map((r) => r.command)).toEqual([
      'nika.runDetail', 'nika.replayTrace', 'nika.diffTraces', 'nika.debugReplay',
      'nika.verifyTrace', 'nika.reproduceRun', 'nika.runReport', 'nika.exportOtel',
    ]);
  });

  it('a history cell: detail leads, replay and the provable report follow (the Q4 named case)', () => {
    const p = buildTreeActionPanel('nikaRunHistory', FACTS.nikaHistoryCell.facts, ALL_ON);
    expect(p.itemRows.map((r) => r.command)).toEqual([
      'nika.runDetail', 'nika.replayTrace', 'nika.history.report',
    ]);
    expect(p.itemRows.every((r) => r.off === undefined)).toBe(true);
  });

  it('a section is a screen, never a void: view rows still answer', () => {
    const p = buildTreeActionPanel('nikaRuns', { kind: 'section', label: 'Today' }, ALL_ON);
    expect(p.itemRows).toEqual([]);
    expect(p.viewRows.map((r) => r.command)).toEqual([
      'nika.refreshRuns', 'nika.runHistory', 'nika.diffTraces',
    ]);
    expect(p.title).toBe('Runs');
  });

  it('no selection at all: same law', () => {
    const p = buildTreeActionPanel('nikaRunHistory', undefined, ALL_ON);
    expect(p.itemRows).toEqual([]);
    expect(p.viewRows.map((r) => r.command)).toEqual([
      'nika.history.exportDoc', 'nika.history.close',
    ]);
  });
});

describe('greyed with a reason — never hidden, never silent', () => {
  it('no engine: run and check rows stay, each naming the missing piece', () => {
    const p = buildTreeActionPanel('nikaWorkflows', FACTS.workflowFile.facts, NO_ENGINE);
    const run = p.itemRows.find((r) => r.command === 'nika.workflows.run');
    const check = p.itemRows.find((r) => r.command === 'nika.workflows.check');
    expect(run?.off).toContain('needs the engine');
    expect(check?.off).toContain('needs the engine');
  });

  it('an engine that predates a capability names the exact gap', () => {
    const caps: TreeCaps = { available: true, run: false, check: true, dap: false };
    const p = buildTreeActionPanel('nikaWorkflows', FACTS.workflowFile.facts, caps);
    expect(p.itemRows.find((r) => r.command === 'nika.workflows.run')?.off)
      .toBe('this engine predates `nika run`');
    expect(p.itemRows.find((r) => r.command === 'nika.workflows.check')?.off).toBeUndefined();
  });

  it('no `nika dap`: the debug row explains instead of vanishing', () => {
    const caps: TreeCaps = { ...ALL_ON, dap: false };
    const p = buildTreeActionPanel('nikaRuns', FACTS.nikaTrace.facts, caps);
    const dbg = p.itemRows.find((r) => r.command === 'nika.debugReplay');
    expect(dbg).toBeDefined();
    expect(dbg?.off).toBe('this engine has no `nika dap`');
  });

  it('a history cell without a recorded path: the reason rides every row', () => {
    const facts: TreeItemFacts = { kind: 'historyCell', label: '#4', element: {}, hasTrace: false };
    const p = buildTreeActionPanel('nikaRunHistory', facts, ALL_ON);
    // No click (no path) → no detail row; replay + report stay VISIBLE,
    // each greyed with the reason (the §7d law: explain, never hide).
    expect(p.itemRows.map((r) => r.command)).toEqual(['nika.replayTrace', 'nika.history.report']);
    for (const r of p.itemRows) { expect(r.off).toBe('this run recorded no trace path'); }
  });
});

describe('threading — the same argument the inline icon would pass', () => {
  it('element rows carry the LIVE element (station fix · fork · report)', () => {
    for (const key of ['fixable', 'nikaTraceTask', 'nikaHistoryCell'] as const) {
      const { view, facts } = FACTS[key];
      const p = buildTreeActionPanel(view, facts, ALL_ON);
      const elementRows = p.itemRows.filter((r) => r.args.includes(facts.element));
      expect(elementRows.length, key).toBeGreaterThan(0);
    }
  });

  it('detail, replay and diff take the trace URI, not the element (their real shape)', () => {
    const p = buildTreeActionPanel('nikaRuns', FACTS.nikaTrace.facts, ALL_ON);
    const detail = p.itemRows.find((r) => r.command === 'nika.runDetail');
    const replay = p.itemRows.find((r) => r.command === 'nika.replayTrace');
    const diff = p.itemRows.find((r) => r.command === 'nika.diffTraces');
    expect(detail?.args).toEqual([FACTS.nikaTrace.facts.traceUri]);
    expect(replay?.args).toEqual([FACTS.nikaTrace.facts.traceUri]);
    expect(diff?.args).toEqual([FACTS.nikaTrace.facts.traceUri]);
  });

  it('the click row replicates the row\'s own gesture verbatim', () => {
    const p = buildTreeActionPanel('nikaWorkflows', FACTS.workflowTask.facts, ALL_ON);
    const go = p.itemRows.find((r) => r.command === 'nika.openTaskLocation');
    expect(go?.args).toEqual(['uri', 3]);
  });
});

describe('habit — the root-search store re-ranks the item section', () => {
  const rows: readonly TreeActionRow[] = buildTreeActionPanel(
    'nikaRuns', FACTS.nikaTrace.facts, ALL_ON,
  ).itemRows;

  it('unvisited: curated order holds', () => {
    expect(rankTreeRows(rows, {}, 1000).map((r) => r.command))
      .toEqual(rows.map((r) => r.command));
  });

  it('an action you keep taking rises (the ids speak the store\'s dialect)', () => {
    const now = 1_700_000_000_000;
    let store = visit({}, 'tree.nika.runReport', now);
    store = visit(store, 'tree.nika.runReport', now);
    const ranked = rankTreeRows(rows, store, now);
    expect(ranked[0].command).toBe('nika.runReport');
    // Everyone else keeps the curated order behind the habit.
    expect(ranked.slice(1).map((r) => r.command)).toEqual(
      rows.filter((r) => r.command !== 'nika.runReport').map((r) => r.command),
    );
  });

  it('every row id rides the tree.<command> shape — one store, no collisions', () => {
    for (const r of rows) { expect(r.id).toBe(`tree.${r.command}`); }
  });
});

describe('the door (features/treeActions) — source contract, the belt idiom', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../features/treeActions.ts', import.meta.url)), 'utf-8');

  it('consumes the ROOT search store — visit() + FRECENCY_KEY, never a second key', () => {
    expect(src).toContain("import { FRECENCY_KEY } from '../core/searchCatalog'");
    expect(src).toMatch(/visit\(readStore\(\), row\.id/);
    // Every Memento seam rides the imported key — a string literal at
    // a workspaceState call site would be a second store.
    const seams = src.match(/workspaceState\.(?:get|update)[^)\n]*/g) ?? [];
    expect(seams.length).toBeGreaterThan(0);
    for (const s of seams) { expect(s).toContain('FRECENCY_KEY'); }
  });

  it('greyed rows explain and never launch (the off-guard precedes the launch)', () => {
    const accept = src.slice(src.indexOf('onDidAccept'));
    expect(accept.indexOf('row.off !== undefined'))
      .toBeLessThan(accept.indexOf('executeCommand(row.command'));
  });

  it('the four keybinding args are the only focus authority the door trusts', () => {
    expect(src).toContain("registerCommand('nika.treeActions'");
    expect(src).toMatch(/typeof viewIdArg === 'string'/);
  });
});
