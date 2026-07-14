// graphIntel.ts — reference intelligence over the DAG (pure).
//
// Damerau-Levenshtein (Damerau 1964 · Levenshtein 1966), bounded ≤2,
// powers did-you-mean on task/var/alias references — same UX contract as
// the engine's tool suggestions, applied client-side where the engine
// has no suggestion field yet.
//
// (The pre-W2 transitive-reduction pass [Aho-Garey-Ullman 1972] left
// with the gate algebra v2: pass-sets compose per edge, so an edge
// « redundant » for reachability is NOT redundant for admission — the
// engine's one-obvious-way/010 owns the one narrow class that remains.)

// ─── Damerau-Levenshtein (optimal string alignment · bounded) ───────────────

/** OSA distance with early-exit band; returns Infinity past `max`. */
export function damerau(a: string, b: string, max = 2): number {
  if (a === b) { return 0; }
  if (Math.abs(a.length - b.length) > max) { return Infinity; }
  const al = a.length;
  const bl = b.length;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: bl + 1 }, (_, j) => j);
  for (let i = 1; i <= al; i++) {
    const row: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(
        prev[j] + 1,        // deletion
        row[j - 1] + 1,     // insertion
        prev[j - 1] + cost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1); // transposition
      }
      row.push(v);
      if (v < rowMin) { rowMin = v; }
    }
    if (rowMin > max) { return Infinity; }
    prev2 = prev;
    prev = row;
  }
  return prev[bl] <= max ? prev[bl] : Infinity;
}

/** Closest candidate within distance ≤2 (ties → shortest, then lexical). */
export function didYouMean(input: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    if (candidate === input) { continue; }
    const d = damerau(input, candidate, 2);
    if (d < bestDist || (d === bestDist && best !== undefined && candidate < best)) {
      best = candidate;
      bestDist = d;
    }
  }
  return bestDist <= 2 ? best : undefined;
}
