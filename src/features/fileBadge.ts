// The nika identity in the Explorer, without touching the user's file
// icon theme: a FileDecoration badge (the git-letters surface) on every
// workflow file. Icon themes match by extension and win over language
// fallbacks (proven live: Material maps *.yaml), so the badge is the
// one theme-agnostic identity layer an extension can add.
import {
  CancellationToken,
  Disposable,
  FileDecoration,
  FileDecorationProvider,
  Uri,
  window,
  workspace,
} from 'vscode';
import { isNikaWorkflowPath } from '../core/nikaPath';

class NikaBadgeProvider implements FileDecorationProvider {
  provideFileDecoration(uri: Uri, _token: CancellationToken): FileDecoration | undefined {
    if (!isNikaWorkflowPath(uri.path)) { return undefined; }
    if (!workspace.getConfiguration('nika').get<boolean>('explorerBadge', true)) {
      return undefined;
    }
    const d = new FileDecoration('🦋', 'Nika workflow');
    d.propagate = false;
    return d;
  }
}

export function registerNikaBadge(): Disposable {
  return window.registerFileDecorationProvider(new NikaBadgeProvider());
}
