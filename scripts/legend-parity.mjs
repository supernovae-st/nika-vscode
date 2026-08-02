// legend-parity.mjs — the key must wear the code.
//
// The spec projects ONE GEOMETRY PER STATUS into node.generated.css,
// and says why in its own words: « a hue dies under forced-colors and
// under a colour-blind eye ». The canvas cards get that geometry for
// free (the projection ships with them). The LEGEND is that code's key
// and is hand-written in dag.css, so it drifted: four identical round
// dots teaching a mapping the canvas does not use.
//
// This gate reads the geometry out of the projection and requires the
// legend chip for the same status to declare the same shape. Values
// change SPEC-FIRST (design/tokens.yaml → design-projector.py), then
// here.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(here, '..', p), 'utf8');

const projection = read('src/webview/node.generated.css');
const dag = read('src/webview/dag.css');

// The shape properties: what makes a geometry distinguishable without
// colour. Fill is NOT here — the fill is the status hue's job, and in
// forced-colors the system palette takes it over.
const SHAPE = ['width', 'height', 'border-radius', 'transform'];

const decls = (block) => {
  const out = {};
  for (const m of block.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1].trim()] = m[2].trim();
  }
  return out;
};

// status → geometry, from the projection
const spec = new Map();
for (const m of projection.matchAll(/\.dag-node\.status-([a-z]+)\s+:where\(\.nc-dot\)\s*\{([^}]*)\}/g)) {
  spec.set(m[1], decls(m[2]));
}
if (spec.size === 0) {
  console.error('legend-parity: no status geometry found in node.generated.css — did the projection move?');
  process.exit(1);
}

// status → geometry, from the legend's hand-written rules
const legend = new Map();
for (const m of dag.matchAll(/\.legend-chip\.st-([a-z]+)\s+\.legend-dot\s*\{([^}]*)\}/g)) {
  const prev = legend.get(m[1]) ?? {};
  legend.set(m[1], { ...prev, ...decls(m[2]) });
}

// Two legend keys are not statuses and have no projected geometry:
// `critical` is a path marker, and `recovered` is a MODIFIER on success
// (.is-recovered.status-success) that wears success's shape and tells
// its story in the retry hue.
const EXEMPT = new Set(['critical', 'recovered']);

const findings = [];
for (const [status, want] of spec) {
  const got = legend.get(status);
  if (got === undefined) { continue; } // the legend need not show every status
  for (const prop of SHAPE) {
    const w = want[prop];
    if (w === undefined) { continue; }
    const g = got[prop] ?? (prop === 'transform' ? 'none' : undefined);
    if (g === undefined) {
      findings.push(`${status} · legend never declares ${prop} · the projection says ${w}`);
    } else if (g !== w) {
      findings.push(`${status} · legend ${prop}: ${g} · the projection says ${w}`);
    }
  }
}
for (const status of legend.keys()) {
  if (!spec.has(status) && !EXEMPT.has(status)) {
    findings.push(`${status} · the legend teaches a key the projection has no geometry for`);
  }
}

if (findings.length === 0) {
  const shown = [...spec.keys()].filter((s) => legend.has(s));
  console.log(`legend-parity: OK — ${shown.length} legend keys wear the projected geometry (${shown.join(' · ')})`);
  process.exit(0);
}
for (const f of findings) { console.error(`legend drift · ${f}`); }
console.error(`\nlegend-parity: ${findings.length} findings — the key must wear the code the cards wear. Values change SPEC-FIRST (design/tokens.yaml), then dag.css.`);
process.exit(1);
