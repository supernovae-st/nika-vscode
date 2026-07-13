import { describe, expect, it } from 'vitest';
import { YieldRegistry, type YieldEntry } from '../core/capabilityYield';

interface Probe {
  registered: number;
  disposed: number;
}

function entry(cap: string, label: string, probes: Map<string, Probe>): YieldEntry {
  probes.set(label, { registered: 0, disposed: 0 });
  return {
    cap,
    label,
    make: () => {
      const p = probes.get(label)!;
      p.registered += 1;
      return { dispose: () => { p.disposed += 1; } };
    },
  };
}

describe('YieldRegistry (one voice — the client yields capability-wise)', () => {
  it('boot with no server registers every client voice', () => {
    const probes = new Map<string, Probe>();
    const reg = new YieldRegistry([
      entry('hoverProvider', 'hover', probes),
      entry('completionProvider', 'completion', probes),
    ]);
    const r = reg.reconcile(undefined);
    expect(r.restored.sort()).toEqual(['completion', 'hover']);
    expect(r.silenced).toEqual([]);
    expect(probes.get('hover')!.registered).toBe(1);
  });

  it('a speaking server silences exactly its twins — the rest stay client', () => {
    const probes = new Map<string, Probe>();
    const reg = new YieldRegistry([
      entry('hoverProvider', 'hover', probes),
      entry('completionProvider', 'completion', probes),
      entry('renameProvider', 'rename', probes),
    ]);
    reg.reconcile(undefined);
    const r = reg.reconcile({ hoverProvider: true, completionProvider: { triggerCharacters: ['.'] } });
    expect(r.silenced.sort()).toEqual(['completion', 'hover']);
    expect(r.active).toEqual(['rename']);
    expect(probes.get('hover')!.disposed).toBe(1);
    expect(probes.get('rename')!.disposed).toBe(0);
  });

  it('a server crash restores the silenced voices — the toast law', () => {
    const probes = new Map<string, Probe>();
    const reg = new YieldRegistry([entry('hoverProvider', 'hover', probes)]);
    reg.reconcile(undefined);
    reg.reconcile({ hoverProvider: true });
    const r = reg.reconcile(undefined);
    expect(r.restored).toEqual(['hover']);
    expect(probes.get('hover')!.registered).toBe(2);
  });

  it('reconcile is idempotent — a repeated pass moves nothing', () => {
    const probes = new Map<string, Probe>();
    const reg = new YieldRegistry([
      entry('hoverProvider', 'hover', probes),
      entry('renameProvider', 'rename', probes),
    ]);
    reg.reconcile({ hoverProvider: true });
    const again = reg.reconcile({ hoverProvider: true });
    expect(again.silenced).toEqual([]);
    expect(again.restored).toEqual([]);
    expect(probes.get('rename')!.registered).toBe(1);
  });

  it('a future server capability silences its twin with zero change', () => {
    // The entry is keyed today; the server starts advertising tomorrow.
    const probes = new Map<string, Probe>();
    const reg = new YieldRegistry([entry('callHierarchyProvider', 'callHierarchy', probes)]);
    reg.reconcile({});
    expect(probes.get('callHierarchy')!.registered).toBe(1);
    const r = reg.reconcile({ callHierarchyProvider: true });
    expect(r.silenced).toEqual(['callHierarchy']);
  });

  it('dispose ends every live voice', () => {
    const probes = new Map<string, Probe>();
    const reg = new YieldRegistry([
      entry('hoverProvider', 'hover', probes),
      entry('renameProvider', 'rename', probes),
    ]);
    reg.reconcile(undefined);
    reg.dispose();
    expect(probes.get('hover')!.disposed).toBe(1);
    expect(probes.get('rename')!.disposed).toBe(1);
    // A reconcile after dispose can re-register (restart-after-teardown
    // never happens in the host, but the registry stays coherent).
    expect(reg.reconcile(undefined).restored.sort()).toEqual(['hover', 'rename']);
  });
});
