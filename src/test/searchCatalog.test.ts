// searchCatalog.test.ts · the gate's pure half against the REAL manifest.
//
// F1 derives from package.json itself, so the pins cannot rot: the row
// count IS the manifest count minus the palette-hidden rows minus the
// two doors. F2 is the offline add-task vocabulary (4 verbs + the
// fallback builtins). The resting screen recycles the journey menu
// head under `Now` and the accept step proves the loop the gate
// ships: two visits teach the ranking, reset unlearns it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAddTaskPicks } from '../core/addTaskPicks';
import { chordLabels, type KeybindingContribution } from '../core/chordLabels';
import { SEARCH_COMMAND, type FrecencyStore } from '../core/rootSearch';
import {
  MENU_COMMAND,
  RESET_COMMAND,
  RUNS_SEARCH_CAP,
  acceptPick,
  applyAliases,
  buildCatalog,
  buildCommandItems,
  buildRestingFoot,
  buildRestingHead,
  buildRunItems,
  buildTaskItems,
  buildWorkflowItems,
  gateScreen,
  hiddenPaletteCommands,
  mergeCatalog,
  rowDescription,
  type ManifestLike,
  type RestingDeps,
  type RunSearchFact,
  type WorkflowSearchFact,
} from '../core/searchCatalog';

const NOW = Date.UTC(2026, 6, 21, 10, 0, 0);

describe('the door ids (the literals the gate registers)', () => {
  it('constants and manifest agree with the registered literals', () => {
    expect(SEARCH_COMMAND).toBe('nika.search');
    expect(MENU_COMMAND).toBe('nika.showMenu');
    expect(RESET_COMMAND).toBe('nika.search.resetRanking');
  });
});

const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'),
) as ManifestLike & {
  contributes: { keybindings: KeybindingContribution[] };
};

const chords = chordLabels(pkg.contributes.keybindings, true);
const f1 = buildCommandItems(pkg, chords);
const f2 = buildTaskItems(buildAddTaskPicks(undefined), f1.length);
const catalog = buildCatalog(pkg, chords, buildAddTaskPicks(undefined));

describe('F1 · the manifest commands', () => {
  it('holds every palette-visible command except the two doors', () => {
    const declared = pkg.contributes?.commands?.length ?? 0;
    const hidden = hiddenPaletteCommands(pkg).size;
    expect(f1).toHaveLength(declared - hidden - 2);
    expect(f1.length).toBeGreaterThan(50);
  });

  it('excludes the palette-hidden rows and both doors, keeps the escape', () => {
    const ids = new Set(f1.map((x) => x.id));
    expect(ids.has('nika.starOnGitHub')).toBe(false);
    expect(ids.has('nika.watchDemo')).toBe(false);
    expect(ids.has(SEARCH_COMMAND)).toBe(false);
    expect(ids.has(MENU_COMMAND)).toBe(false);
    expect(ids.has(RESET_COMMAND)).toBe(true);
  });

  it('prints the chord on every chorded row (the manifest derivation)', () => {
    const byId = new Map(f1.map((x) => [x.id, x]));
    expect(byId.get('nika.runWorkflow')?.chord).toBe('⌘+k ⌘+e');
    expect(byId.get('nika.checkWorkflow')?.chord).toBe('⌘+k ⌘+k');
    expect(byId.get('nika.doctor')?.chord).toBeUndefined();
  });

  it('rides the command id as a keyword (muscle memory finds showdag)', () => {
    const dag = f1.find((x) => x.id === 'nika.showDag');
    expect(dag?.keywords).toEqual(['nika.showDag']);
    const hit = gateScreen('showdag', catalog, [], [], {}, NOW);
    expect(hit[0]).toMatchObject({ kind: 'item', item: { id: 'nika.showDag' } });
  });

  it('runs the command bare and keeps declaration order', () => {
    expect(f1[0].run).toEqual({ command: f1[0].id });
    expect(f1.map((x) => x.declOrder)).toEqual(f1.map((_, i) => i));
  });
});

describe('F2 · the add-task vocabulary', () => {
  it('maps the offline vocabulary: 4 verbs + 28 builtins = 32 rows', () => {
    expect(f2).toHaveLength(32);
    expect(f2.filter((x) => x.id.startsWith('task.add.nika:'))).toHaveLength(28);
  });

  it('each row runs the existing add command with its verb/tool pinned', () => {
    const infer = f2.find((x) => x.id === 'task.add.infer');
    expect(infer?.run).toEqual({ command: 'nika.addTask', args: ['infer'] });
    const jq = f2.find((x) => x.id === 'task.add.nika:jq');
    expect(jq?.run).toEqual({ command: 'nika.addTask', args: ['invoke', 'nika:jq'] });
    expect(jq?.keywords).toEqual(['jq']);
  });

  it('declOrder continues globally after F1 (family precedence law)', () => {
    expect(f2[0].declOrder).toBe(f1.length);
    const last = catalog[catalog.length - 1];
    expect(last.declOrder).toBe(catalog.length - 1);
    expect(catalog).toHaveLength(f1.length + f2.length);
  });
});

describe('the resting screen', () => {
  const caps = { run: true, check: true, inspect: true, trace: true, examples: true };
  const ok: RestingDeps['truth'] = { severity: 'ok' };

  it('a working stage with an active file leads with its rows', () => {
    const head = buildRestingHead({ truth: ok, stage: 'working', active: 'daily.nika.yaml', caps }, chords);
    expect(head.map((r) => r.id)).toEqual(['nika.runWorkflow', 'nika.checkWorkflow', 'nika.showDag']);
    expect(head[0].chord).toBe('⌘+k ⌘+e');
    expect(head[0].detail).toBe('daily.nika.yaml');
  });

  it('a degraded lane outranks every journey step', () => {
    const head = buildRestingHead({
      truth: { severity: 'error', headline: { label: 'Install the engine', command: 'nika.finishSetup' } },
      stage: 'working',
      active: 'daily.nika.yaml',
      caps,
    }, chords);
    expect(head[0].id).toBe('nika.finishSetup');
  });

  it('each early stage keeps its old menu head', () => {
    const noBin = buildRestingHead({ truth: ok, stage: 'noBinary', caps }, chords);
    expect(noBin.map((r) => r.id)).toEqual(['nika.finishSetup']);
    const unequipped = buildRestingHead({ truth: ok, stage: 'unequipped', caps }, chords);
    expect(unequipped.map((r) => r.id)).toEqual(['nika.initProject', 'nika.runProof']);
    const empty = buildRestingHead({ truth: ok, stage: 'empty', caps }, chords);
    expect(empty.map((r) => r.id)).toEqual(['nika.runProof', 'nika.newSession']);
  });

  it('the footer keeps the lens deck and the earned ask', () => {
    expect(buildRestingFoot({ inspect: true }).map((r) => r.id))
      .toEqual(['nika.showDag', 'nika.starOnGitHub']);
    expect(buildRestingFoot({ inspect: false }).map((r) => r.id))
      .toEqual(['nika.starOnGitHub']);
  });

  it('the empty query is a screen, never a void: Now · Everything · footer', () => {
    const head = buildRestingHead({ truth: ok, stage: 'working', active: 'a.nika.yaml', caps }, chords);
    const rows = gateScreen('', catalog, head, buildRestingFoot({ inspect: true }), {}, NOW);
    expect(rows[0]).toEqual({ kind: 'separator', label: 'Now' });
    const everything = rows.findIndex((r) => r.kind === 'separator' && r.label === 'Everything');
    expect(everything).toBe(1 + head.length);
    const items = rows.filter((r) => r.kind === 'item');
    expect(items.length).toBe(head.length + catalog.length + 2);
  });

  it('stays non-empty with no journey head at all', () => {
    const rows = gateScreen('', catalog, [], [], {}, NOW);
    expect(rows[0]).toEqual({ kind: 'separator', label: 'Everything' });
    expect(rows.length).toBe(1 + catalog.length);
  });
});

describe('the typed screen and the no-dead-ends tier', () => {
  it('a typed query is the ranked list alone, separators gone', () => {
    const rows = gateScreen('check', catalog, [], [], {}, NOW);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.kind === 'item')).toBe(true);
  });

  it('zero matches fall onto the fallback rows, query as argument', () => {
    const rows = gateScreen('daily digest email', catalog, [], [], {}, NOW);
    const ids = rows.map((r) => (r.kind === 'item' ? r.item.id : ''));
    expect(ids).toContain('fallback.generate');
    expect(ids).toContain('fallback.new');
    const generate = rows.find((r) => r.kind === 'item' && r.item.id === 'fallback.generate');
    expect(generate?.kind === 'item' && generate.item.run.args).toEqual(['daily digest email']);
  });

  it('a typo lands a did-you-mean that re-enters the door', () => {
    const rows = gateScreen('jw', [f2.find((x) => x.id === 'task.add.nika:jq')!], [], [], {}, NOW);
    const first = rows[0];
    expect(first.kind).toBe('item');
    if (first.kind === 'item') {
      expect(first.item.id).toBe('fallback.didYouMean');
      expect(first.item.run.command).toBe(SEARCH_COMMAND);
      expect(first.item.run.args).toEqual(['jq']);
    }
  });
});

describe('the assigned aliases (applyAliases · the Raycast law)', () => {
  it('attaches the alias to its target row, id verbatim', () => {
    const out = applyAliases(catalog, { rw: 'nika.runWorkflow' });
    const target = out.find((x) => x.id === 'nika.runWorkflow');
    expect(target?.aliases).toEqual(['rw']);
    // Nobody else grew one.
    expect(out.filter((x) => x.aliases !== undefined)).toHaveLength(1);
  });

  it('a target the catalog does not hold is dropped in silence', () => {
    const out = applyAliases(catalog, { zz: 'nika.ghostCommand' });
    expect(out.every((x) => x.aliases === undefined)).toBe(true);
    expect(out.map((x) => x.id)).toEqual(catalog.map((x) => x.id));
  });

  it('an empty alias and a non-string target are dropped at build', () => {
    const broken = { '': 'nika.runWorkflow', '   ': 'nika.checkWorkflow', gd: 7 };
    const out = applyAliases(catalog, broken as unknown as Record<string, string>);
    expect(out.every((x) => x.aliases === undefined)).toBe(true);
  });

  it('several aliases may share one target: all attach, file order kept', () => {
    const out = applyAliases(catalog, { rw: 'nika.runWorkflow', r2: 'nika.runWorkflow' });
    expect(out.find((x) => x.id === 'nika.runWorkflow')?.aliases).toEqual(['rw', 'r2']);
  });

  it('the alias key is trimmed before it ships', () => {
    const out = applyAliases(catalog, { ' rw ': 'nika.runWorkflow' });
    expect(out.find((x) => x.id === 'nika.runWorkflow')?.aliases).toEqual(['rw']);
  });

  it('async family ids are valid targets too (applied on the merge)', () => {
    const wf = buildWorkflowItems([
      { fsPath: '/w/deploy.nika.yaml', relPath: 'deploy.nika.yaml', mtimeMs: NOW, openArg: 'u' },
    ]);
    const merged = applyAliases(mergeCatalog(catalog, wf, []), { dp: 'workflow./w/deploy.nika.yaml' });
    expect(merged.find((x) => x.id === 'workflow./w/deploy.nika.yaml')?.aliases).toEqual(['dp']);
  });

  it('the aliased row leads its screen over a giant learned habit', () => {
    const aliased = applyAliases(catalog, { rw: 'nika.runWorkflow' });
    // `rw` scatters into plenty of labels: hand one of them a giant habit.
    const rival = gateScreen('rw', aliased, [], [], {}, NOW)
      .flatMap((r) => (r.kind === 'item' ? [r.item.id] : []))
      .find((id) => id !== 'nika.runWorkflow');
    expect(rival).toBeDefined();
    const habit: FrecencyStore = { [rival!]: { count: 1_000_000, lastMs: NOW } };
    const rows = gateScreen('rw', aliased, [], [], habit, NOW);
    const first = rows[0];
    expect(first.kind === 'item' && first.item.id).toBe('nika.runWorkflow');
  });

  it('a broken alias query falls back on the normal ranking (no dead end)', () => {
    const aliased = applyAliases(catalog, { qqzz: 'nika.ghostCommand' });
    const rows = gateScreen('qqzz', aliased, [], [], {}, NOW);
    const ids = rows.map((r) => (r.kind === 'item' ? r.item.id : ''));
    expect(ids).not.toContain('nika.ghostCommand');
    expect(ids).toContain('fallback.generate');
  });

  it('the badge seat teaches the alias last: detail · chord · alias', () => {
    const full = applyAliases(
      [{
        id: 'a', family: 'command', label: 'Run', detail: 'the run',
        chord: '⌘K ⌘R', declOrder: 0, run: { command: 'a' },
      }],
      { rw: 'a' },
    )[0];
    expect(rowDescription(full)).toBe('the run · ⌘K ⌘R · rw');
    expect(rowDescription({ ...full, aliases: ['rw', 'r2'] })).toBe('the run · ⌘K ⌘R · rw · r2');
  });

  it('the seat is unchanged for a row without an alias', () => {
    const plain = catalog.find((x) => x.chord !== undefined && x.detail === undefined);
    expect(plain).toBeDefined();
    expect(rowDescription(plain!)).toBe(plain!.chord);
    expect(rowDescription({ ...plain!, detail: 'd' })).toBe(`d · ${plain!.chord}`);
  });
});

describe('acceptPick · the learned loop', () => {
  it('two visits teach the ranking: the picked row climbs its tier', () => {
    let store: FrecencyStore = {};
    const resting = (): string[] =>
      gateScreen('', catalog, [], [], store, NOW)
        .filter((r) => r.kind === 'item')
        .map((r) => (r.kind === 'item' ? r.item.id : ''));
    const target = catalog[catalog.length - 1];
    expect(resting()[0]).not.toBe(target.id);
    store = acceptPick(store, target, NOW).store;
    store = acceptPick(store, target, NOW).store;
    expect(store[target.id]?.count).toBe(2);
    expect(resting()[0]).toBe(target.id);
  });

  it('names the launch verbatim for a catalog row', () => {
    const jq = f2.find((x) => x.id === 'task.add.nika:jq')!;
    const out = acceptPick({}, jq, NOW);
    expect(out.command).toBe('nika.addTask');
    expect(out.args).toEqual(['invoke', 'nika:jq']);
  });

  it('the history fallback finally carries its query (PR-3 landed the argument)', () => {
    const rows = gateScreen('zzzz qqqq', catalog, [], [], {}, NOW);
    const history = rows.find((r) => r.kind === 'item' && r.item.id === 'fallback.history');
    expect(history?.kind).toBe('item');
    if (history?.kind === 'item') {
      const out = acceptPick({}, history.item, NOW);
      expect(out.command).toBe('nika.runHistory');
      expect(out.args).toEqual(['zzzz qqqq']);
    }
  });
});

// ─── The async families (F3 workflows · F4 runs — the append) ───────────────

const DAY = 86_400_000;

const wfFact = (over: Partial<WorkflowSearchFact> & { fsPath: string }): WorkflowSearchFact => ({
  relPath: over.fsPath.replace(/^\//, ''),
  mtimeMs: NOW - DAY,
  openArg: `uri:${over.fsPath}`,
  ...over,
});

describe('F3 · the workflow files', () => {
  const facts: WorkflowSearchFact[] = [
    wfFact({ fsPath: '/w/old.nika.yaml', mtimeMs: NOW - 3 * DAY }),
    wfFact({ fsPath: '/w/flows/deploy.nika.yaml', mtimeMs: NOW - 1000, badge: { kind: 'findings', count: 2 } }),
    wfFact({ fsPath: '/w/daily.nika.yaml', mtimeMs: NOW - DAY, badge: { kind: 'clean' } }),
  ];
  const items = buildWorkflowItems(facts);

  it('newest first — the mtime is the relevance prior', () => {
    expect(items.map((x) => x.label)).toEqual(['deploy.nika.yaml', 'daily.nika.yaml', 'old.nika.yaml']);
    expect(items.map((x) => x.declOrder)).toEqual([0, 1, 2]);
  });

  it('speaks the groupWorkflows state only when a verdict is KNOWN', () => {
    const byLabel = new Map(items.map((x) => [x.label, x]));
    expect(byLabel.get('deploy.nika.yaml')?.detail).toBe('2 findings');
    expect(byLabel.get('daily.nika.yaml')?.detail).toBe('clean');
    expect(byLabel.get('old.nika.yaml')?.detail).toBeUndefined();
  });

  it('opens the file with the door\'s own handle; the relPath is a keyword', () => {
    const deploy = items[0];
    expect(deploy.family).toBe('workflow');
    expect(deploy.id).toBe('workflow./w/flows/deploy.nika.yaml');
    expect(deploy.run).toEqual({ command: 'vscode.open', args: ['uri:/w/flows/deploy.nika.yaml'] });
    expect(deploy.keywords).toEqual(['w/flows/deploy.nika.yaml']);
    // Folder-qualified typing reaches the row through the keyword.
    const rows = gateScreen('flows/dep', mergeCatalog([], items, []), [], [], {}, NOW);
    expect(rows[0]).toMatchObject({ kind: 'item', item: { id: deploy.id } });
  });
});

const runFact = (over: Partial<RunSearchFact> & { fsPath: string }): RunSearchFact => ({
  mtimeMs: NOW - DAY,
  status: 'completed',
  openArg: `uri:${over.fsPath}`,
  ...over,
});

describe('F4 · the recorded runs', () => {
  it('paused leads whatever its mtime (the bucketOf pin), then running, then newest', () => {
    const items = buildRunItems([
      runFact({ fsPath: '/t/fresh.ndjson', mtimeMs: NOW - 1000 }),
      runFact({ fsPath: '/t/stale-paused.ndjson', mtimeMs: NOW - 9 * DAY, status: 'paused' }),
      runFact({ fsPath: '/t/live.ndjson', mtimeMs: NOW - 2000, status: 'running' }),
    ], NOW);
    expect(items.map((x) => x.label)).toEqual(['stale-paused.ndjson', 'live.ndjson', 'fresh.ndjson']);
  });

  it('the cap cuts the tail — a paused run always survives it', () => {
    const crowd: RunSearchFact[] = Array.from({ length: RUNS_SEARCH_CAP + 5 }, (_, i) =>
      runFact({ fsPath: `/t/run-${String(i).padStart(3, '0')}.ndjson`, mtimeMs: NOW - i * 1000 }));
    const paused = runFact({ fsPath: '/t/waiting.ndjson', mtimeMs: NOW - 30 * DAY, status: 'paused' });
    const items = buildRunItems([...crowd, paused], NOW);
    expect(items).toHaveLength(RUNS_SEARCH_CAP);
    expect(items[0].label).toBe('waiting.ndjson');
  });

  it('the status and the workflow name ride as keywords — typing `paused` finds the run', () => {
    const items = buildRunItems([
      runFact({ fsPath: '/t/a.ndjson', status: 'paused', workflowName: 'daily-digest' }),
      runFact({ fsPath: '/t/b.ndjson' }),
    ], NOW);
    const a = items.find((x) => x.label === 'a.ndjson')!;
    expect(a.detail).toBe('paused · daily-digest');
    expect(a.keywords).toEqual(['paused', 'daily-digest']);
    expect(a.run).toEqual({ command: 'nika.replayTrace', args: ['uri:/t/a.ndjson'] });
    const rows = gateScreen('paused', mergeCatalog([], [], items), [], [], {}, NOW);
    expect(rows[0]).toMatchObject({ kind: 'item', item: { id: 'run./t/a.ndjson' } });
  });
});

describe('the append (mergeCatalog · the landing re-rank)', () => {
  const wf = buildWorkflowItems([wfFact({ fsPath: '/w/digest.nika.yaml' })]);
  const runs = buildRunItems([runFact({ fsPath: '/t/digest-run.ndjson' })], NOW);

  it('re-numbers globally F1 F2 then F3 then F4, whatever order the families landed', () => {
    const merged = mergeCatalog(catalog, wf, runs);
    expect(merged.map((x) => x.declOrder)).toEqual(merged.map((_, i) => i));
    expect(merged[catalog.length].family).toBe('workflow');
    expect(merged[merged.length - 1].family).toBe('run');
    // The sync families keep their seats — precedence inside a tier.
    expect(merged.slice(0, catalog.length).map((x) => x.id)).toEqual(catalog.map((x) => x.id));
  });

  it('a query typed BEFORE the landing finds the appended row after it (the current-q re-rank)', () => {
    const q = 'digest.nika';
    const before = gateScreen(q, catalog, [], [], {}, NOW);
    // Pre-landing: zero real matches — the fallback screen holds the q.
    expect(before.every((r) => r.kind === 'item' && r.item.id.startsWith('fallback.'))).toBe(true);
    const after = gateScreen(q, mergeCatalog(catalog, wf, runs), [], [], {}, NOW);
    expect(after[0]).toMatchObject({ kind: 'item', item: { id: 'workflow./w/digest.nika.yaml' } });
  });

  it('never an empty screen: any query, landed or not, yields rows (the no-results law)', () => {
    for (const q of ['', '   ', 'zzzz qqqq', 'a'.repeat(200), '§ø∆']) {
      for (const cat of [catalog, mergeCatalog(catalog, wf, runs)]) {
        expect(gateScreen(q, cat, [], [], {}, NOW).length).toBeGreaterThan(0);
      }
    }
  });
});
