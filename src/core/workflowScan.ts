// workflowScan.ts · the one workflow scan's brain (pure · zero vscode).
//
// Eight surfaces used to run their own findFiles over the workflow
// glob (welcome recents · fork-from-step ×2 · lint baseline ·
// workspace symbols · workspace lint · test explorer · workflows
// tree). One cache now feeds every consumer — same facts, zero
// duplicate scans (the annexe-AA consolidation; a source belt pins
// the findFiles literal to ONE site, features/workflowIndex). The
// brain is generic and IO-injected so the invalidation grammar is
// provable without an extension host; the feature wrapper owns the
// watcher and the real findFiles.
//
// The grammar: create/delete change MEMBERSHIP — the list and the
// stamps both drop; change touches CONTENT — membership holds, only
// the stamps (mtimes) drop. A rejected scan is never pinned: the
// next read retries. Every read returns a fresh slice — a consumer
// truncating its result (the lint cap idiom) must never shear the
// shared cache.

export const WORKFLOW_GLOB = '**/*.nika.yaml';

/** Provider-side ceiling — dominates every consumer cap (500 fork
 *  lookup · 301 lint truncation probe · 300 baseline · 200 explorer ·
 *  100 tree · 50 symbols · 30 welcome). */
export const WORKFLOW_SCAN_CAP = 500;

export interface ScanIO<T> {
  /** The one real scan (findFiles twin) · deduped · provider-capped. */
  list(): Promise<T[]>;
  /** stat twin · `undefined` = unstatable (dropped from recents). */
  mtimeOf(item: T): Promise<number | undefined>;
}

export interface Stamped<T> {
  item: T;
  mtimeMs: number;
}

export class ScanCache<T> {
  private listP: Promise<T[]> | undefined;
  private stampsP: Promise<Array<Stamped<T>>> | undefined;

  constructor(private readonly io: ScanIO<T>) {}

  /** create/delete · membership unknown — everything drops. */
  invalidate(): void {
    this.listP = undefined;
    this.stampsP = undefined;
  }

  /** change · membership intact — only the stamps drop. */
  touch(): void {
    this.stampsP = undefined;
  }

  /** The cached list, head-sliced to `cap` (the consumer's historical
   *  budget) — one scan serves every cap. Always a copy. */
  files(cap?: number): Promise<T[]> {
    if (this.listP === undefined) {
      const p = this.io.list();
      this.listP = p;
      // Un-pin a rejection so the next read retries — but never clobber
      // a NEWER scan started after an invalidation raced this one.
      void p.catch(() => {
        if (this.listP === p) { this.listP = undefined; }
      });
    }
    return this.listP.then((list) => list.slice(0, cap ?? list.length));
  }

  /** mtime-newest-first head — the stamps ride their own cache so a
   *  change event re-stats without re-scanning membership. */
  recent(n: number): Promise<Array<Stamped<T>>> {
    if (this.stampsP === undefined) {
      const p = this.files().then(async (list) => {
        const stamped = await Promise.all(list.map(async (item) => {
          const mtimeMs = await this.io.mtimeOf(item);
          return mtimeMs === undefined ? undefined : { item, mtimeMs };
        }));
        return stamped
          .filter((s): s is Stamped<T> => s !== undefined)
          .sort((a, b) => b.mtimeMs - a.mtimeMs);
      });
      this.stampsP = p;
      void p.catch(() => {
        if (this.stampsP === p) { this.stampsP = undefined; }
      });
    }
    return this.stampsP.then((list) => list.slice(0, n));
  }
}
