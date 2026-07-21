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
// The learned half lives in workspaceState under FRECENCY_KEY (the
// Memento pattern): each accepted pick visits its id; `Nika: Reset
// Search Ranking` is the escape — a status-bar breath, never a toast.

import * as vscode from 'vscode';
import { journeyPlaceholder, type Journey } from '../core/journey';
import { buildAddTaskPicks } from '../core/addTaskPicks';
import { SEARCH_COMMAND, type FrecencyStore, type SearchItem } from '../core/rootSearch';
import {
  FRECENCY_KEY,
  RESET_COMMAND,
  acceptPick,
  buildCatalog,
  buildRestingFoot,
  buildRestingHead,
  gateScreen,
  type GateRow,
  type ManifestLike,
} from '../core/searchCatalog';
import type { NikaService } from '../nikaService';
import type { NikaStatusBar } from './statusBar';

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
): void {
  const readStore = (): FrecencyStore =>
    context.workspaceState.get<FrecencyStore>(FRECENCY_KEY) ?? {};

  context.subscriptions.push(
    vscode.commands.registerCommand(SEARCH_COMMAND, (initialQuery?: unknown) => {
      const seed = typeof initialQuery === 'string' ? initialQuery : '';

      // The synchronous families, fresh at open (manifest + vocabulary
      // + the journey head — cheap, and the screen is never stale).
      const caps = service.caps;
      const catalog = buildCatalog(
        context.extension.packageJSON as ManifestLike,
        chords,
        buildAddTaskPicks(service.toolCats),
      );
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
      qp.onDidHide(() => qp.dispose());
      if (seed !== '') { qp.value = seed; }
      render(seed);
      qp.show();
    }),

    vscode.commands.registerCommand(RESET_COMMAND, async () => {
      await context.workspaceState.update(FRECENCY_KEY, undefined);
      // A quiet breath in the status bar — never a toast (#498 doctrine).
      vscode.window.setStatusBarMessage('Nika: search ranking reset · declaration order restored', 4000);
    }),
  );
}
