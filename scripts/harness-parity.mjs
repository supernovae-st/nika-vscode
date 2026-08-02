// harness-parity.mjs — the judge may not drift from what it judges.
//
// scripts/media/harness.html drives the REAL webview bundle, and every
// visual claim in DESIGN.md is proven by shooting it. That only holds
// while its chrome markup IS the panel's chrome markup. It drifted
// once, silently: the four verb tiles kept text glyphs (◇ ▷ ◆ ✦) long
// after dagPanel.ts moved them to SVG marks, so every probe and every
// screenshot judged a bottom bar no user has ever seen — and a font
// coverage sweep blamed the sans for glyphs the panel had already
// dropped.
//
// The panel writes its markup with template holes (${HI.play},
// ${OI['feature/check']}); the harness carries them resolved. This gate
// resolves the holes from the two generated icon modules, then compares
// the inner markup of every button class the two files share.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(here, '..', p), 'utf8');

const panel = read('src/dagPanel.ts');
const harness = read('scripts/media/harness.html');

// name → svg, from the two vendored registries.
const registry = new Map();
for (const [file, prefix] of [['src/house-icons.generated.ts', 'HI'], ['src/icons.generated.ts', 'OI']]) {
  let src;
  try { src = read(file); } catch { continue; }
  for (const m of src.matchAll(/^\s{2}'?([\w/-]+)'?:\s*'(.*)',$/gm)) {
    registry.set(`${prefix}:${m[1]}`, m[2].replace(/\\'/g, "'"));
  }
}

const norm = (s) => s.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();

function resolveHoles(s) {
  return s
    .replace(/\$\{HI\.(\w+)\}/g, (_, n) => registry.get(`HI:${n}`) ?? `«HI.${n}»`)
    .replace(/\$\{OI\['([^']+)'\]\}/g, (_, n) => registry.get(`OI:${n}`) ?? `«OI.${n}»`);
}

// Several buttons share a class (three .es-button es-cmd in the door
// alone), so the key carries the occurrence index — a first-wins map
// would compare one of them and call the rest agreed.
function buttons(src) {
  const out = new Map();
  const seen = new Map();
  for (const m of src.matchAll(/<button[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)) {
    const cls = m[1].trim();
    const n = (seen.get(cls) ?? 0) + 1;
    seen.set(cls, n);
    out.set(n === 1 ? cls : `${cls} #${n}`, m[2]);
  }
  return out;
}

const P = buttons(panel);
const H = buttons(harness);
const shared = [...P.keys()].filter((c) => H.has(c));
const drift = [];
for (const cls of shared) {
  const p = norm(resolveHoles(P.get(cls)));
  const h = norm(H.get(cls));
  if (p !== h) { drift.push({ cls, p, h }); }
}

// A hole we could not resolve means the registry moved under us — that
// is drift too, and it must not read as a pass.
const unresolved = shared.filter((c) => /«(HI|OI)\./.test(resolveHoles(P.get(c))));

if (drift.length === 0 && unresolved.length === 0) {
  console.log(`harness-parity: OK — ${shared.length} shared chrome buttons agree with dagPanel.ts`);
  process.exit(0);
}
for (const d of drift) {
  console.error(`\nharness drift · .${d.cls}`);
  console.error(`  panel   ${d.p.slice(0, 140)}`);
  console.error(`  harness ${d.h.slice(0, 140)}`);
}
for (const c of unresolved) {
  console.error(`\nharness-parity · .${c} · an icon hole no registry resolves (regenerate the sync scripts?)`);
}
console.error(`\nharness-parity: ${drift.length + unresolved.length} findings — the harness is the judge; align it with src/dagPanel.ts`);
process.exit(1);
