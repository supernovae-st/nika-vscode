// The `nika try` showroom listing, parsed rich (V5 · 0.107). One pure
// function over the rail text — anchored on the `<file>.nika.yaml`
// token so headings and rails never parse as slugs (the wave-3 live
// defect: a permissive prefix regex swallowed `◆ the path — 13 steps`).

export interface ShowroomRow {
  /** The slug you type (`01-hello` — the extension the resolver tolerates). */
  slug: string;
  /** The full filename as listed (what you see is what you type). */
  file: string;
  /** Verb glyphs as printed (◇ infer · ▷ exec · ◆ invoke · ✦ agent). */
  glyphs: string;
  /** The title tail (clipped by the renderer — display-only). */
  title: string;
  /** The group heading this row sits under (`the path` · `the jobs`). */
  group: string;
}

const ROW = /^\s*(?:[│┃|]\s*)?([a-z0-9][a-z0-9_./-]*)\.nika\.yaml\s+(.*)$/;
const HEAD = /^\s*[◆✦◇▷]?\s*(the [a-z]+)\s[—·-]/;

export function parseTryShowroom(stdout: string): ShowroomRow[] {
  const rows: ShowroomRow[] = [];
  let group = '';
  for (const raw of stdout.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const h = line.match(HEAD);
    if (h && !line.includes('.nika.yaml')) { group = h[1]; continue; }
    const m = line.match(ROW);
    if (!m) { continue; }
    const tail = m[2].trim();
    const g = tail.match(/^((?:[◇▷◆✦]\s*)+)/);
    rows.push({
      slug: m[1],
      file: `${m[1]}.nika.yaml`,
      glyphs: g ? g[1].replace(/\s+/g, ' ').trim() : '',
      title: (g ? tail.slice(g[1].length) : tail).trim(),
      group,
    });
  }
  return rows;
}
