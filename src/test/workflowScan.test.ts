// workflowScan.test.ts · the one scan's invalidation grammar.
//
// The cache that consolidated eight findFiles sites must be provably
// LAZY (one scan serves every consumer cap), provably FRESH (a create
// or delete drops membership; a change drops only the stamps), and
// provably HONEST (a rejected scan is never pinned; a consumer
// truncating its result never shears the shared list).

import { describe, expect, it } from 'vitest';
import { ScanCache, WORKFLOW_GLOB, WORKFLOW_SCAN_CAP, type ScanIO } from '../core/workflowScan';

/** A counting IO — every list/stat is on the record. */
function fakeIO(paths: () => string[], mtimes: () => Record<string, number>): ScanIO<string> & { lists: number; stats: number } {
  const io = {
    lists: 0,
    stats: 0,
    list: async (): Promise<string[]> => {
      io.lists += 1;
      return paths();
    },
    mtimeOf: async (p: string): Promise<number | undefined> => {
      io.stats += 1;
      return mtimes()[p];
    },
  };
  return io;
}

describe('the provider constants', () => {
  it('the glob is the one literal and the cap dominates every consumer', () => {
    expect(WORKFLOW_GLOB).toBe('**/*.nika.yaml');
    // 500 fork lookup · 301 lint probe · 300 baseline · 200 explorer ·
    // 100 tree · 50 symbols · 30 welcome — the provider must see at
    // least as far as the widest consumer asks.
    for (const consumerCap of [500, 301, 300, 200, 100, 50, 30]) {
      expect(WORKFLOW_SCAN_CAP).toBeGreaterThanOrEqual(consumerCap);
    }
  });
});

describe('one scan serves every cap', () => {
  it('N reads, one list; the cap slices the head', async () => {
    const io = fakeIO(() => ['/a', '/b', '/c'], () => ({}));
    const cache = new ScanCache(io);
    expect(await cache.files()).toEqual(['/a', '/b', '/c']);
    expect(await cache.files(2)).toEqual(['/a', '/b']);
    expect(await cache.files(99)).toEqual(['/a', '/b', '/c']);
    expect(io.lists).toBe(1);
  });

  it('a consumer truncating its result never shears the shared cache (the lint idiom)', async () => {
    const io = fakeIO(() => ['/a', '/b', '/c'], () => ({}));
    const cache = new ScanCache(io);
    const mine = await cache.files();
    mine.length = 1; // workspace lint's `files.length = MAX_FILES`
    expect(await cache.files()).toEqual(['/a', '/b', '/c']);
  });
});

describe('the invalidation grammar', () => {
  it('create/delete drop membership: the next read re-lists', async () => {
    let paths = ['/a'];
    const io = fakeIO(() => paths, () => ({}));
    const cache = new ScanCache(io);
    expect(await cache.files()).toEqual(['/a']);
    paths = ['/a', '/new'];
    expect(await cache.files()).toEqual(['/a']); // cached — no event yet
    cache.invalidate();
    expect(await cache.files()).toEqual(['/a', '/new']);
    expect(io.lists).toBe(2);
  });

  it('a change drops ONLY the stamps: recents re-stat, membership holds', async () => {
    let mtimes: Record<string, number> = { '/a': 10, '/b': 20 };
    const io = fakeIO(() => ['/a', '/b'], () => mtimes);
    const cache = new ScanCache(io);
    expect((await cache.recent(2)).map((s) => s.item)).toEqual(['/b', '/a']);
    // The file changed on disk — the watcher touches, the list survives.
    mtimes = { '/a': 30, '/b': 20 };
    expect((await cache.recent(2)).map((s) => s.item)).toEqual(['/b', '/a']); // stale until touch
    cache.touch();
    expect((await cache.recent(2)).map((s) => s.item)).toEqual(['/a', '/b']);
    expect(io.lists).toBe(1); // membership never re-scanned
  });

  it('recents sort newest-first, drop the unstatable, slice to n', async () => {
    const io = fakeIO(() => ['/a', '/gone', '/b'], () => ({ '/a': 5, '/b': 50 }));
    const cache = new ScanCache(io);
    expect(await cache.recent(9)).toEqual([
      { item: '/b', mtimeMs: 50 },
      { item: '/a', mtimeMs: 5 },
    ]);
    expect((await cache.recent(1)).map((s) => s.item)).toEqual(['/b']);
  });
});

describe('the honest failure', () => {
  it('a rejected scan is never pinned: the next read retries and can heal', async () => {
    let broken = true;
    const io = fakeIO(() => {
      if (broken) { throw new Error('fs exploded'); }
      return ['/a'];
    }, () => ({}));
    const cache = new ScanCache(io);
    await expect(cache.files()).rejects.toThrow('fs exploded');
    broken = false;
    expect(await cache.files()).toEqual(['/a']);
    expect(io.lists).toBe(2);
  });
});
