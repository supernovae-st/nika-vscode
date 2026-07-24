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

// 2 · the :root canon block (tokens v3 · canon + alias): the -canon name
// holds the hex ONCE (== SSOT) and the plain name aliases it, so skins
// retune the plain voice while the canon stays un-shadowable.
for (const v of VERBS) {
  const canon = css.match(new RegExp(`--nk-verb-${v}-canon: (#[0-9a-f]{6});`));
  if (!canon) { findings.push(`dag.css: --nk-verb-${v}-canon missing`); }
  else if (canon[1] !== ssot[v]) {
    findings.push(`dag.css --nk-verb-${v}-canon = ${canon[1]} but SSOT says ${ssot[v]}`);
  }
  if (!css.includes(`--nk-verb-${v}: var(--nk-verb-${v}-canon);`)) {
    findings.push(`dag.css: --nk-verb-${v} must alias var(--nk-verb-${v}-canon)`);
  }
}

// 3 · the phosphor WAKE rules — asleep desaturates, waking MUST return to
// full canon chroma (the wake-rule contract, LOCK-005 adjacent). tokens v3:
// the wake reads the -canon var — a literal hex here would re-open the
// shadowing seam, so the belt demands the var() read per verb × status.
const wakeBlock = css.slice(css.indexOf("data-nk-theme='phosphor'"));
for (const v of VERBS) {
  for (const status of ['running', 'retrying']) {
    const rule = new RegExp(
      `\\.verb-${v}\\.status-${status}[^{]*\\{\\s*--dv-hue:\\s*var\\(--nk-verb-${v}-canon\\)`,
    );
    if (!rule.test(wakeBlock)) {
      findings.push(`phosphor wake .verb-${v}.status-${status} must read var(--nk-verb-${v}-canon)`);
    }
  }
  const literal = [...wakeBlock.matchAll(
    new RegExp(`\\.verb-${v}(?:[^{]*status-(?:running|retrying))[^{]*\\{[^}]*--dv-hue:\\s*(#[0-9a-f]{6})`, 'g'),
  )];
  for (const m of literal) {
    findings.push(`phosphor wake .verb-${v} carries literal ${m[1]} — the canon var is the only voice`);
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

// 5 · the per-verb MOTION identities (design/motion.yaml v1) — the
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

// 6 · the NEGATIVE SCAN (tokens v3) — the seam speaks, raw colors die.
// The forbidden set = the 4 verb hexes (read from the generated SSOT, so
// a spec recolor keeps the ban current) + the literals the v3 migration
// retired. Any line that CARRIES one without BEING an --nk-* definition
// is a new hardcode outside the seam → finding. Migrate it, never
// allowlist it. (data-URIs are %23-encoded — immune by construction.)
{
  const forbidden = [
    ...Object.values(ssot),
    'rgb(141 180 255', 'rgb(140 170 255', '#8caaff', '#0a0d12',
    '#7a1622', '#f4f5f7', '#ffffff', '#8db4ff',
  ];
  const definition = /^\s*--nk-[a-z0-9-]+:/;
  css.split('\n').forEach((line, i) => {
    if (definition.test(line)) { return; }
    for (const f of forbidden) {
      if (line.includes(f)) {
        findings.push(`dag.css:${i + 1} raw color outside the token seam (${f}) — mint or consume an --nk-* token`);
      }
    }
  });
}

// 7 · the DYNAMIC TWINS — hand-typed CSS values that twin a generated row.
// accentBright is generated TODAY (hard pin both directions); the verb
// TEXT ramps + severity fail_text ride interim pins until the spec pin
// bumps — the moment NIKA_VERB_TEXT / NIKA_SEVERITY_TEXT rows land in the
// projection, this step compares them (the alarm works in BOTH senses:
// a spec retune fires here until the CSS follows).
{
  const bright = gen.match(/accentBright: '(#[0-9a-f]{6})'/);
  if (!bright) { findings.push(`generated: NIKA_BRAND.accentBright missing`); }
  else if (!css.includes(`--nk-accent-bright: ${bright[1]};`)) {
    findings.push(`dag.css --nk-accent-bright must be NIKA_BRAND.accentBright (${bright[1]})`);
  }
  const textBlock = gen.match(/NIKA_VERB_TEXT[^}]*\}/s);
  if (textBlock) {
    for (const v of VERBS) {
      const row = textBlock[0].match(new RegExp(`${v}: '(#[0-9a-f]{6})'`));
      if (row && !css.includes(`--nk-verb-${v}-text: ${row[1]};`)) {
        findings.push(`dag.css --nk-verb-${v}-text must be NIKA_VERB_TEXT.${v} (${row[1]})`);
      }
    }
  }
  const sevBlock = gen.match(/NIKA_SEVERITY_TEXT[^}]*\}/s);
  if (sevBlock) {
    const fail = sevBlock[0].match(/fail: '(#[0-9a-f]{6})'/);
    if (fail && !css.includes(`--nk-st-failed-text: ${fail[1]};`)) {
      findings.push(`dag.css --nk-st-failed-text must be NIKA_SEVERITY_TEXT.fail (${fail[1]})`);
    }
  }
}

// 8 · PRESENCE — the v3 vocabulary exists (a silent delete would strand
// consumers on the initial value; the belt keeps the roster whole).
{
  const roster = [
    '--nk-dur-fast:', '--nk-dur-base:', '--nk-dur-slow:', '--nk-dur-deliberate:',
    '--nk-frame-interval:', '--nk-ease-effects:', '--nk-ease-spatial:',
    '--nk-chrome:', '--nk-hairline-accent:', '--nk-accent-bright:',
    '--nk-aurora-sweep:', '--nk-aurora-danger-deep:', '--nk-aurora-danger:',
    '--nk-verb-infer-text:', '--nk-verb-exec-text:', '--nk-verb-invoke-text:',
    '--nk-verb-agent-text:', '--nk-st-failed-text:',
  ];
  for (const t of roster) {
    if (!css.includes(t)) { findings.push(`dag.css: ${t} missing (tokens v3 roster)`); }
  }
}

// 9 · the 6 CATEGORY TINTS (§S.3 · CI-3) — the engine's 6 builtin
// categories each own ONE token, defined as aliases/mixes of voices
// the seam already speaks: a hex literal in a definition would mint a
// 7th color source, so the belt refuses any. (The negative scan in
// step 6 covers the known-forbidden hexes; this is the stronger
// per-token law: NO hex at all inside a --nk-cat-* definition.)
{
  const CATS = ['core', 'file', 'data', 'network', 'introspection', 'media'];
  for (const c of CATS) {
    const def = css.match(new RegExp(`--nk-cat-${c}:\\s*([^;]+);`));
    if (!def) { findings.push(`dag.css: --nk-cat-${c} missing (§S.3 category tint)`); continue; }
    if (/#[0-9a-fA-F]{3,8}\b/.test(def[1])) {
      findings.push(`dag.css --nk-cat-${c} carries a hex literal — category tints alias or mix existing tokens only`);
    }
    if (!/var\(--nk-/.test(def[1])) {
      findings.push(`dag.css --nk-cat-${c} must consume the seam (var(--nk-*) or a color-mix of it)`);
    }
  }
}

// 10 · the metric system (W-D18 · DESIGN.md §1e) — every font-size in
// dag.css reads a ladder voice; the ONLY raw px allowed are the
// documented one-offs (glyph controls 13 · the es-title half-step
// 13.5 · the palette touch target 14 · the display trio 18/22/26).
// Card-scope border-radius reads a named step; the acquitted one-offs
// stay raw. A new raw value fails HERE with the law in the message —
// the ladder is structural, not aspirational.
{
  const FS_ONEOFFS = new Set(['13', '13.5', '14', '18', '22', '26']);
  for (const m of css.matchAll(/font-size:\s*([\d.]+)px/g)) {
    const v = m[1].replace(/\.0$/, '');
    if (!FS_ONEOFFS.has(v)) {
      findings.push(`dag.css: raw font-size ${v}px — pick a ladder voice (--nk-fs-*) or argue a new one in DESIGN.md §1e`);
    }
  }
  // Card scope and chrome each keep their acquitted raw list — the
  // card trio (18 pill · 10 action pill · 9 agent ring) and the chrome
  // one-offs (16 hint pills · 12 welcome card · 18 aurora · 1.5
  // confetti · 999 full pills; 50% never matches the px scan).
  const R_CARD_ONEOFFS = new Set(['9', '10', '18']);
  const R_CHROME_ONEOFFS = new Set(['16', '12', '18', '1.5', '999']);
  const CARD = /(nc-|dag-node|node-fo)/;
  let sel = '';
  for (const part of css.split(/(\{[^{}]*\})/)) {
    if (part.startsWith('{')) {
      const allow = CARD.test(sel) ? R_CARD_ONEOFFS : R_CHROME_ONEOFFS;
      const where = CARD.test(sel) ? 'card' : 'chrome';
      for (const m of part.matchAll(/border-radius:\s*([\d.]+)px\s*;/g)) {
        const v = m[1].replace(/\.0$/, '');
        if (!allow.has(v)) {
          findings.push(`dag.css: raw ${where} border-radius ${v}px — pick a radius step (--nk-r-* · --nk-radius calc family) or argue it in DESIGN.md §1e`);
        }
      }
    } else if (part.trim()) {
      sel = part.trim().split('\n').pop();
    }
  }
  // Self-probe: the gate must catch a planted raw value.
  const planted = 'x { font-size: 7.25px; }';
  const probeHits = [...planted.matchAll(/font-size:\s*([\d.]+)px/g)]
    .filter((m) => !FS_ONEOFFS.has(m[1])).length;
  if (probeHits !== 1) {
    console.error('tokens-parity: metric-gate self-probe failed — judging nothing');
    process.exit(2);
  }
}

if (findings.length) {
  console.error(`tokens-parity: ${findings.length} finding(s)`);
  for (const f of findings) { console.error(`  ✗ ${f}`); }
  process.exit(1);
}
console.log(`tokens-parity: OK — verb canon+alias + wake vars + glyphs + motion identities + negative scan + dynamic twins + v3 roster + 6 category tints + the metric ladders pinned across dag.css, dag.ts, verbPalette.ts, cardIdentity.ts`);
