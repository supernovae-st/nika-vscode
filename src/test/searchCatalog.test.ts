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
  acceptPick,
  buildCatalog,
  buildCommandItems,
  buildRestingFoot,
  buildRestingHead,
  buildTaskItems,
  gateScreen,
  hiddenPaletteCommands,
  type ManifestLike,
  type RestingDeps,
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

  it('the history fallback runs bare until PR-3 teaches it a query', () => {
    const rows = gateScreen('zzzz qqqq', catalog, [], [], {}, NOW);
    const history = rows.find((r) => r.kind === 'item' && r.item.id === 'fallback.history');
    expect(history?.kind).toBe('item');
    if (history?.kind === 'item') {
      const out = acceptPick({}, history.item, NOW);
      expect(out.command).toBe('nika.runHistory');
      expect(out.args).toEqual([]);
    }
  });
});
