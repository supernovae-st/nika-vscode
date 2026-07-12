// communityAsk.ts — the ONE earned ask, ever.
//
// The doctrine: working surfaces (check · run · diagnostics) stay
// marketing-free; the single legitimate conversion moment is the FIRST
// completed run — the user just watched their workflow finish. One
// notification, three exits, and the flag is set even on dismissal so
// nobody is ever asked twice. Editor-aware: Cursor/Windsurf/VSCodium
// install from Open VSX, so their review door differs from VS Code's.
import * as vscode from 'vscode';

const KEY = 'nika.communityAsk.v1';

let ctx: vscode.ExtensionContext | undefined;

/** Wired once in activate() — keeps runLive's signature untouched. */
export function initCommunityAsk(context: vscode.ExtensionContext): void {
  ctx = context;
}

/** After a run settles: fires on the first `completed` verdict, then never again. */
export function maybeAskCommunity(verdict: string): void {
  if (verdict !== 'completed' || ctx === undefined || ctx.globalState.get<boolean>(KEY) === true) {
    return;
  }
  // A dismissal is an answer — persist BEFORE the user decides.
  void ctx.globalState.update(KEY, true);
  const openVsx = /cursor|windsurf|vscodium/i.test(vscode.env.appName);
  const star = 'Star on GitHub';
  const rate = openVsx ? 'Review on Open VSX' : 'Rate the extension';
  void vscode.window
    .showInformationMessage(
      'First workflow completed ✓ — Nika is independent open source; a star helps others find it.',
      star,
      rate,
    )
    .then((pick) => {
      if (pick === star) {
        void vscode.env.openExternal(vscode.Uri.parse('https://github.com/supernovae-st/nika'));
      } else if (pick === rate) {
        void vscode.env.openExternal(
          vscode.Uri.parse(
            openVsx
              ? 'https://open-vsx.org/extension/supernovae/nika-lang/reviews'
              : 'https://marketplace.visualstudio.com/items?itemName=supernovae.nika-lang&ssr=false#review-details',
          ),
        );
      }
    });
}
