// capabilityYield.ts — the one-voice reconciler (pure): the client
// yields capability-wise when the server speaks (#103). Every client
// language provider registers here KEYED by the LSP server-capability
// that replaces it; `reconcile(serverCaps)` disposes the twins the
// server advertises and (re)registers the ones it does not — so an
// older binary keeps full client intelligence, a newer one silences
// the duplicate voice automatically (including capabilities the server
// GAINS in future releases, zero extension change), and a server crash
// or downgrade RESTORES the client voice (the « client-side
// intelligence stays active » toast, made mechanically true). Never
// version-gated: capability-honest, the house law.

/** The vscode.Disposable shape — local so this module tests pure. */
export interface Yieldable {
  dispose(): void;
}

export interface YieldEntry {
  /** The `ServerCapabilities` key that replaces this provider
   * (`hoverProvider` · `completionProvider` · …). */
  cap: string;
  /** Stable label — logs and tests speak it. */
  label: string;
  /** (Re)registration factory — called when the client must speak. */
  make: () => Yieldable;
}

export interface ReconcileReport {
  /** Client twins disposed this pass (the server owns them now). */
  silenced: string[];
  /** Client voices (re)registered this pass (the server is quiet there). */
  restored: string[];
  /** Every currently-live client provider, post-pass. */
  active: string[];
}

/**
 * The registry: `reconcile(undefined)` at activation registers every
 * client provider (no server yet — full client intelligence);
 * `reconcile(initializeResult.capabilities)` on every (re)start flips
 * ownership per capability; `reconcile(undefined)` again on a server
 * crash restores the client. Idempotent: a repeated pass with the same
 * capabilities is a no-op.
 */
export class YieldRegistry implements Yieldable {
  private readonly live = new Map<string, Yieldable>();

  constructor(private readonly entries: readonly YieldEntry[]) {}

  reconcile(caps: Readonly<Record<string, unknown>> | undefined): ReconcileReport {
    const silenced: string[] = [];
    const restored: string[] = [];
    for (const entry of this.entries) {
      const serverSpeaks = Boolean(caps?.[entry.cap]);
      const current = this.live.get(entry.label);
      if (serverSpeaks && current) {
        current.dispose();
        this.live.delete(entry.label);
        silenced.push(entry.label);
      } else if (!serverSpeaks && !current) {
        this.live.set(entry.label, entry.make());
        restored.push(entry.label);
      }
    }
    return { silenced, restored, active: [...this.live.keys()] };
  }

  dispose(): void {
    for (const d of this.live.values()) {
      d.dispose();
    }
    this.live.clear();
  }
}
