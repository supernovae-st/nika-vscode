/** The editor owns workspace trust; the adapter never grants it itself. */
export interface TrustHost {
  readonly isTrusted: boolean;
  onDidGrantWorkspaceTrust(listener: () => void): { dispose(): void };
}

/**
 * Register the active extension exactly once, after explicit host trust.
 * Before then only manifest-provided syntax/snippets are available: no
 * command handlers, probes, LSP, file writers or first-contact state writes.
 * VS Code reloads the extension host when trust is revoked. Disposal also
 * closes a still-pending activation; a queued grant cannot resurrect it.
 */
export function activateOnceTrusted(host: TrustHost, activate: () => void): { dispose(): void } {
  let closed = false;
  let started = false;
  const listener: { subscription?: { dispose(): void } } = {};
  const tryActivate = (): void => {
    if (closed || started || host.isTrusted !== true) { return; }
    started = true;
    listener.subscription?.dispose();
    activate();
  };
  // Subscribe before checking so a grant cannot be lost between the two.
  listener.subscription = host.onDidGrantWorkspaceTrust(tryActivate);
  tryActivate();
  // A synchronously delivered grant can precede assignment above.
  if (started) { listener.subscription.dispose(); }
  return { dispose: () => { closed = true; listener.subscription?.dispose(); } };
}
