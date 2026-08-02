// projection-shadow.mjs — the host may EXTEND the spec's projection, never
// silently re-state it.
//
// node.generated.css is projected from the spec with `:where(...)`, i.e.
// zero specificity, precisely so the host can layer on top. The host
// (dag.css) also declares many of the same properties on the same
// selectors. Two kinds, and only one is a problem:
//
//   OVERRIDE  the host sets a DIFFERENT value · deliberate, and the
//             point of the zero-specificity design. Reported for the
//             eye, never failed.
//   SHADOW    the host repeats the spec's value byte for byte · it adds
//             nothing today and pins the OLD value the day the spec
//             moves. That is the drift this gate exists to bound.
//
// It fails on GROWTH, not on the standing debt: a baseline is pinned so
// the number can only go down. Removing shadows is delicate — an
// attempt to strip them automatically corrupted the sheet and moved 282
// computed values, which is why this reports rather than rewrites.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(here, '..', p), 'utf8');

const BASELINE = 66; // shadows on 2026-08-02 · this may only shrink

function decls(css) {
  const out = new Map();
  for (const m of css.matchAll(/([^{}@][^{}]*?)\{([^{}]*)\}/g)) {
    const selLine = m[1].trim().split('\n').pop().trim();
    for (const one of selLine.split(',')) {
      const key = one.trim().replace(/:where\(([^)]*)\)/g, '$1').trim();
      if (key === '') { continue; }
      if (!out.has(key)) { out.set(key, new Map()); }
      for (const d of m[2].split(';')) {
        const i = d.indexOf(':');
        if (i < 0 || d.trim().startsWith('/*')) { continue; }
        out.get(key).set(d.slice(0, i).trim(), d.slice(i + 1).trim());
      }
    }
  }
  return out;
}

const spec = decls(read('src/webview/node.generated.css'));
const host = decls(read('src/webview/dag.css'));
const norm = (v) => v.replace(/\s+/g, '');

const shadows = [];
const overrides = [];
for (const [sel, props] of spec) {
  const hp = host.get(sel);
  if (hp === undefined) { continue; }
  for (const [prop, sv] of props) {
    const hv = hp.get(prop);
    if (hv === undefined) { continue; }
    (norm(hv) === norm(sv) ? shadows : overrides).push(`${sel} · ${prop}`);
  }
}

console.log(`projection-shadow: ${shadows.length} shadow(s) · ${overrides.length} deliberate override(s)`);
if (shadows.length > BASELINE) {
  console.error(`\nThe host now re-states ${shadows.length - BASELINE} MORE of the spec's own values than the pinned baseline (${BASELINE}).`);
  console.error('A byte-identical copy adds nothing today and pins the old value the day the spec moves.');
  for (const s of shadows.slice(BASELINE)) { console.error(`   ${s}`); }
  process.exit(1);
}
if (shadows.length < BASELINE) {
  console.log(`   ${BASELINE - shadows.length} fewer than the baseline — lower BASELINE to ${shadows.length} to hold the ground.`);
}
process.exit(0);
