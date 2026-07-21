// searchGate.ts — the root search: one gate for everything.
//
// ⌘K ⌘M opens ONE ranked list holding every launchable thing: the
// manifest commands (chords taught in place) and the add-task
// vocabulary, ranked by the pure model (core/rootSearch · match tier
// first, learned frecency second, declaration order last). The empty
// query is the old journey menu reborn as the resting screen; a
// zero-match query falls onto ranked fallback rows where the query
// becomes the argument. The QuickPick is DYNAMIC: every keystroke
// re-sets the items from our ranking, and `alwaysShow` on every item
// neutralizes the native filter — without it VS Code re-filters the
// list and ghosts the ranking (the annexe-AA risk).
//
// The two ASYNC families append after the first paint (render first —
// the screen is never blank waiting on a scan): F3 the workflow files
// from the ONE watcher-cached scan, F4 the recorded runs from the
// flight recorder's snapshot (re-scanned async only when stale). BUSY
// rides the QuickPick while they load; each landing re-merges and
// re-ranks with the query AS TYPED at that instant. No scan is EVER
// tied to a keystroke (annexe-AA risk ④): the two fetches below fire
// once per open, and onDidChangeValue only re-renders.
//
// The learned half lives in workspaceState under FRECENCY_KEY (the
// Memento pattern): each accepted pick visits its id; `Nika: Reset
// Search Ranking` is the escape — a status-bar breath, never a toast.

import * as vscode from 'vscode';
import { journeyPlaceholder, type Journey } from '../core/journey';
import { buildAddTaskPicks } from '../core/addTaskPicks';
import type { FrecencyStore, SearchItem } from '../core/rootSearch';
import {
  FRECENCY_KEY,
  acceptPick,
  buildCatalog,
  buildRestingFoot,
  buildRestingHead,
  buildRunItems,
  buildWorkflowItems,
  gateScreen,
  mergeCatalog,
  type GateRow,
  type ManifestLike,
  type RunSearchFact,
  type WorkflowSearchFact,
} from '../core/searchCatalog';
import type { NikaService } from '../nikaService';
import type { NikaStatusBar } from './statusBar';

/** The async families' taps — the door pulls each ONCE per open. */
export interface AsyncFamilies {
  /** F3 · the mtime head of the one cached workflow scan, with badges. */
  workflows(): Promise<WorkflowSearchFact[]>;
  /** F4 · the flight recorder's facts (snapshot, or async re-scan when
   *  stale — the source owns that decision, never the keystroke). */
  runs(): Promise<RunSearchFact[]>;
}

interface GateQuickPickItem extends vscode.QuickPickItem {
  row?: SearchItem;
}

/** One row → one QuickPick item · `alwaysShow` on EVERY row, so the
 *  native filter can never fight the model's ranking. */
function toQuickPickItem(r: GateRow): GateQuickPickItem {
  if (r.kind === 'separator') {
    return { label: r.label, kind: vscode.QuickPickItemKind.Separator, alwaysShow: true };
  }
  const description = [r.item.detail, r.item.chord].filter(Boolean).join(' · ');
  return {
    label: r.item.label,
    ...(description !== '' ? { description } : {}),
    alwaysShow: true,
    row: r.item,
  };
}

export function registerSearchGate(
  context: vscode.ExtensionContext,
  service: NikaService,
  statusBar: NikaStatusBar,
  getJourney: () => Journey,
  chords: ReadonlyMap<string, string>,
  families: AsyncFamilies,
): void {
  const readStore = (): FrecencyStore =>
    context.workspaceState.get<FrecencyStore>(FRECENCY_KEY) ?? {};

  context.subscriptions.push(
    // The literal ids below ARE the model's SEARCH_COMMAND / the
    // catalog's RESET_COMMAND (the parity belt reads literals; the
    // searchCatalog belt pins the constants to these strings).
    vscode.commands.registerCommand('nika.search', (initialQuery?: unknown) => {
      const seed = typeof initialQuery === 'string' ? initialQuery : '';

      // The synchronous families, fresh at open (manifest + vocabulary
      // + the journey head — cheap, and the screen is never stale).
      const caps = service.caps;
      const sync = buildCatalog(
        context.extension.packageJSON as ManifestLike,
        chords,
        buildAddTaskPicks(service.toolCats),
      );
      let catalog: SearchItem[] = sync;
      const j = getJourney();
      const activeDoc = vscode.window.activeTextEditor?.document;
      const active = activeDoc?.languageId === 'nika'
        ? activeDoc.uri.path.split('/').pop() ?? 'this workflow'
        : undefined;
      const head = buildRestingHead({
        truth: statusBar.truth(),
        stage: j.stage,
        ...(active !== undefined ? { active } : {}),
        caps: {
          run: caps.run,
          check: caps.check,
          inspect: caps.inspect,
          trace: caps.trace,
          examples: caps.examples,
        },
      }, chords);
      const foot = buildRestingFoot({ inspect: caps.inspect });

      const qp = vscode.window.createQuickPick<GateQuickPickItem>();
      qp.title = 'Nika';
      qp.placeholder = journeyPlaceholder(j.stage, active);
      qp.matchOnDescription = false;
      qp.matchOnDetail = false;
      const render = (q: string): void => {
        qp.items = gateScreen(q, catalog, head, foot, readStore(), Date.now())
          .map(toQuickPickItem);
      };
      qp.onDidChangeValue(render);
      qp.onDidAccept(() => {
        const row = qp.selectedItems[0]?.row;
        if (row === undefined) { return; }
        qp.hide();
        const out = acceptPick(readStore(), row, Date.now());
        void context.workspaceState.update(FRECENCY_KEY, out.store).then(() =>
          vscode.commands.executeCommand(out.command, ...out.args));
      });
      let open = true;
      qp.onDidHide(() => {
        open = false;
        qp.dispose();
      });
      if (seed !== '') { qp.value = seed; }
      render(seed);
      qp.show();

      // The async families (F3 workflows · F4 runs) — fetched ONCE per
      // open, appended when ready. The sync screen is already up (law:
      // render first, a loading gate never claims a dead end it cannot
      // know); each landing re-merges (family precedence survives any
      // arrival order) and re-ranks with the query AS TYPED NOW —
      // qp.value, never the seed. A broken scan lands empty instead of
      // wedging the busy bar.
      let wfItems: SearchItem[] = [];
      let runItems: SearchItem[] = [];
      let pending = 2;
      qp.busy = true;
      const land = (): void => {
        if (!open) { return; }
        pending -= 1;
        catalog = mergeCatalog(sync, wfItems, runItems);
        if (pending === 0) { qp.busy = false; }
        render(qp.value);
      };
      void families.workflows().then(
        (facts) => { wfItems = buildWorkflowItems(facts); land(); },
        () => { land(); },
      );
      void families.runs().then(
        (facts) => { runItems = buildRunItems(facts, Date.now()); land(); },
        () => { land(); },
      );
    }),

    vscode.commands.registerCommand('nika.search.resetRanking', async () => {
      await context.workspaceState.update(FRECENCY_KEY, undefined);
      // A quiet breath in the status bar — never a toast (#498 doctrine).
      vscode.window.setStatusBarMessage('Nika: search ranking reset · declaration order restored', 4000);
    }),
  );
}
