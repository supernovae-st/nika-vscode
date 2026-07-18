#!/usr/bin/env node
// tokens-parity.mjs — the design-tokens drift alarm.
//
// The 4 verb hues are language identity, pinned cross-repo by the shared
// visual vocabulary SSOT (nika-spec design/tokens.yaml, projected here as
// src/design-tokens.generated.ts). This repo holds them in THREE more
// places that cannot import TS: the dag.css :root token block, the
// phosphor WAKE rules (which out-specify the resting desaturation back to
// full canon chroma), and the unicode glyph maps. dag.css stays
// hand-authored on purpose (its comment voice is load-bearing) — so drift
// is GATED, not generated away. Exit 1 on any finding — CI-able, runs in
// `npm test` beside parity.mjs.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf-8');

const VERBS = ['infer', 'exec', 'invoke', 'agent'];
const findings = [];

// 1 · the SSOT projection (the truth this repo consumes)
const gen = read('src/design-tokens.generated.ts');
const ssot = {};
for (const v of VERBS) {
  const m = gen.match(new RegExp(`${v}: '(#[0-9a-f]{6})'`));
  if (!m) { findings.push(`generated: NIKA_VERB_HEX.${v} missing`); continue; }
  ssot[v] = m[1];
}

const css = read('src/webview/dag.css');

// 2 · the :root canon block (--nk-verb-*)
for (const v of VERBS) {
  const m = css.match(new RegExp(`--nk-verb-${v}: (#[0-9a-f]{6});`));
  if (!m) { findings.push(`dag.css: --nk-verb-${v} missing`); continue; }
  if (m[1] !== ssot[v]) {
    findings.push(`dag.css --nk-verb-${v} = ${m[1]} but SSOT says ${ssot[v]}`);
  }
}

// 3 · the phosphor WAKE rules — asleep desaturates, waking MUST return to
// full canon chroma (the wake-rule contract, LOCK-005 adjacent).
const wakeBlock = css.slice(css.indexOf("data-nk-theme='phosphor'"));
for (const v of VERBS) {
  const rules = [...wakeBlock.matchAll(
    new RegExp(`\\.verb-${v}(?:[^{]*status-(?:running|retrying))[^{]*\\{[^}]*--dv-hue:\\s*(#[0-9a-f]{6})`, 'g'),
  )];
  for (const m of rules) {
    if (m[1] !== ssot[v]) {
      findings.push(`phosphor wake .verb-${v} = ${m[1]} but SSOT says ${ssot[v]}`);
    }
  }
}

// 4 · the unicode glyph language (◇▷◆✦) — three sites, one vocabulary
const glyphs = {};
for (const v of VERBS) {
  const m = gen.match(new RegExp(`NIKA_VERB_GLYPH = \\{[^}]*${v}: '(.)'`, 's'));
  if (m) { glyphs[v] = m[1]; }
}
for (const file of ['src/webview/dag.ts', 'src/core/verbPalette.ts']) {
  const text = read(file);
  for (const v of VERBS) {
    const m = text.match(new RegExp(`${v}: '(.)'`, 'u'));
    if (m && glyphs[v] && m[1] !== glyphs[v]) {
      findings.push(`${file} glyph ${v} = ${m[1]} but SSOT says ${glyphs[v]}`);
    }
  }
}

// 4 · the per-verb MOTION identities (design/motion.yaml v1) — the
// canvas implements the canonical keyframes names (the same names the
// website's CSS and the terminal's braille families carry). A rename
// here would silently fork the motion vocabulary across surfaces.
{
  const css = read('src/webview/dag.css');
  const identity = read('src/core/cardIdentity.ts');
  for (const v of VERBS) {
    const name = `nika-motion-${v}`;
    if (!css.includes(`@keyframes ${name}`)) {
      findings.push(`dag.css: @keyframes ${name} missing (motion.yaml canonical name)`);
    }
    if (!identity.includes(`'${name}'`)) {
      findings.push(`cardIdentity.ts: motion id ${name} missing`);
    }
  }
}

if (findings.length) {
  console.error(`tokens-parity: ${findings.length} finding(s)`);
  for (const f of findings) { console.error(`  ✗ ${f}`); }
  process.exit(1);
}
console.log(`tokens-parity: OK — 4 verb hues + glyphs + motion identities pinned to the SSOT across dag.css (:root + phosphor wake + keyframes), dag.ts, verbPalette.ts, cardIdentity.ts`);
