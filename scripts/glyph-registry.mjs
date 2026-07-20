#!/usr/bin/env node
// glyph-registry.mjs — the one-glyph-one-sense law as an executable gate
// (DESIGN.md §2b · the voice-gate idiom).
//
// HONEST LIMIT, up front: this belt gates the VOCABULARY (which characters
// may paint, and under which form) — never the SENSE. A future `⚡ Setup`
// would pass every check below while still violating law 1; reviewers hold
// the sense line by hand. What the belt CAN prove, it proves:
//
//   (a) REGISTRY-SYNC — every registry-class character painted on a
//       surface is declared in src/core/glyphRegistry.ts (or comes from
//       the two re-exported SSOTs: NIKA_VERB_GLYPH · CATEGORY_GLYPH), or
//       sits in the documented idiom allowlist below. A new mark cannot
//       ship undeclared.
//   (b) BANNED VOCABULARY — the marks this registry killed never return:
//       color-emoji ranges (the 🦋 brand signature excepted) · the dead
//       singles · the dead pairings (lightning-as-cached · the rotation
//       glyph next to cache/changed/replay words).
//   (c) WORDED-ONLY — the marks whose word is part of the mark
//       (wordedOnly entries: the two rotations · circled-times · the
//       bypass hook) never paint bare.
//
// Escape hatch: `glyph-ok` on the hit line or the line above.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf-8');

// ── The declared alphabet (parsed from the registry + the two SSOTs) ───────
const registrySrc = read('src/core/glyphRegistry.ts');
const declared = new Set();
for (const m of registrySrc.matchAll(/glyph: '([^']+)'/g)) {
  for (const ch of m[1]) declared.add(ch);
}
// Re-exported, never forked — read the chars at their source:
const gen = read('src/design-tokens.generated.ts');
const verbBlock = gen.match(/NIKA_VERB_GLYPH = \{([^}]*)\}/s);
for (const m of (verbBlock?.[1] ?? '').matchAll(/'(.)'/g)) declared.add(m[1]);
const card = read('src/core/cardIdentity.ts');
const catBlock = card.match(/CATEGORY_GLYPH[^{]*\{([^}]*)\}/s);
for (const m of (catBlock?.[1] ?? '').matchAll(/'(.)'/g)) declared.add(m[1]);

const wordedOnly = new Set();
for (const m of registrySrc.matchAll(/glyph: '([^']+)', sense: '[^']*', wordedOnly: true/g)) {
  for (const ch of m[1]) wordedOnly.add(ch);
}

// ── Idiom allowlist — notation, not sense-marks. Every entry is a debt
//    with a reason; a sense-bearing mark belongs in the registry instead.
const IDIOMS = new Map([
  ...'≥≤≈≠∪∈√∧≺≫∉⇒≙−'.split('').map((c) => [c, 'math/logic notation']),
  ...'→←↔↑↓'.split('').map((c) => [c, 'directional prose (alias ← producer · Describe → generate · hints)']),
  ...'⇧⌥⏎'.split('').map((c) => [c, 'keyboard-notation register (chords · keycaps)']),
  ...'∙●'.split('').map((c) => [c, 'filmstrip spinner frames (#199) — motion, never vocabulary']),
  ['▸', 'OWED (annexe G): 3 senses ride it today — legislated in a future pass'],
  ['✖', "the engine's own drift grammar, quoted verbatim (goldenDrift pin)"],
]);

// The registry-class blocks: arrows · math · misc technical · geometric ·
// misc symbols · dingbats · supplemental arrows A/B · misc math B ·
// Greek Δ. Braille spinner frames (U+2800) are motion, not vocabulary,
// and stay outside on purpose.
const CLASS_RANGES = [
  [0x2190, 0x21ff], [0x2200, 0x23ff], [0x25a0, 0x25ff], [0x2600, 0x27bf],
  [0x27f0, 0x27ff], [0x2900, 0x297f], [0x29c0, 0x29ff], [0x2a00, 0x2bff],
];
const inClass = (ch) => {
  const o = ch.codePointAt(0);
  return CLASS_RANGES.some(([a, b]) => o >= a && o <= b) || o === 0x0394; // Δ
};

// ── Banned vocabulary (never returns) ──────────────────────────────────────
const BANNED = [
  { re: /(?!\u{1F98B})[\u{1F000}-\u{1FAFF}]|[⭐⭕⬛⬜]/u,
    why: 'color emoji never enter the mono registry (🦋 = brand signature, sanctioned)' },
  { re: /[✨⛔◼]/u, why: 'dead marks: sparkles→house SVG · no-entry→✗ fail · black-square→⊘' },
  { re: /️/u, why: 'emoji presentation selector — the registry is text-presentation only' },
  { re: /⚡\s?(cach|cache)/iu, why: 'cached is ○ — the lightning/cached duality is dead' },
  { re: /↻\s?(cach|changed|replay|re-run)/iu, why: 'retry owns ↻ — cached ○ · resume Δ · replay ⟲' },
];

// ── Surfaces ───────────────────────────────────────────────────────────────
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { yield* walk(full); continue; }
    yield full;
  }
}

/** The painted surfaces — (a) + (b) + (c) run here. */
const painted = [];
for (const file of walk(path.join(root, 'src'))) {
  const rel = path.relative(root, file);
  if (!rel.endsWith('.ts')) continue;
  if (rel.startsWith(`src${path.sep}test`)) continue; // fixtures quote anything
  if (rel.endsWith('.generated.ts')) continue; // SSOT — projected, not authored
  if (rel.endsWith(`core${path.sep}glyphRegistry.ts`)) continue; // the source of truth
  painted.push(rel);
}
painted.push('package.json', path.join('scripts', 'media', 'harness.html'));
const wtDir = path.join(root, 'walkthrough');
if (fs.existsSync(wtDir)) {
  for (const entry of fs.readdirSync(wtDir)) {
    if (entry.endsWith('.md')) painted.push(path.join('walkthrough', entry));
  }
}

/** Ban-only surfaces — prose + styles + tests (a pinned expectation IS the
 *  surface contract; the dead vocabulary must not survive as a pin). */
const banOnly = ['README.md', path.join('docs', 'DESIGN.md'), path.join('src', 'webview', 'dag.css')];
for (const file of walk(path.join(root, 'src'))) {
  const rel = path.relative(root, file);
  if (rel.startsWith(`src${path.sep}test`) && rel.endsWith('.ts')) banOnly.push(rel);
}

// ── Scan ───────────────────────────────────────────────────────────────────
const findings = [];

function scan(rel, checks) {
  const lines = read(rel).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('glyph-ok')) continue;
    if (i > 0 && lines[i - 1].includes('glyph-ok')) continue;
    checks(rel, i + 1, line);
  }
}

for (const rel of painted) {
  scan(rel, (file, n, line) => {
    // (a) registry-sync
    for (const ch of new Set(line)) {
      if (!inClass(ch)) continue;
      if (declared.has(ch) || IDIOMS.has(ch)) continue;
      findings.push(`${file}:${n} · undeclared mark ${ch} (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}) — declare it in glyphRegistry.ts or allowlist it with a reason`);
    }
    // (b) bans
    for (const ban of BANNED) {
      if (ban.re.test(line)) findings.push(`${file}:${n} · banned · ${ban.why} · ${line.trim().slice(0, 120)}`);
    }
    // (c) worded-only: the mark must be followed by a word
    for (const ch of wordedOnly) {
      let idx = line.indexOf(ch);
      while (idx !== -1) {
        const after = line.slice(idx + ch.length, idx + ch.length + 3);
        // A word, or a template interpolation carrying one (`⟲ ${label}`).
        if (!/^ ?([A-Za-z]|\$\{)/.test(after)) {
          findings.push(`${file}:${n} · worded-only mark ${ch} paints bare — the word is part of the mark`);
        }
        idx = line.indexOf(ch, idx + 1);
      }
    }
  });
}

for (const rel of banOnly) {
  if (!fs.existsSync(path.join(root, rel))) continue;
  scan(rel, (file, n, line) => {
    for (const ban of BANNED) {
      if (ban.re.test(line)) findings.push(`${file}:${n} · banned · ${ban.why} · ${line.trim().slice(0, 120)}`);
    }
  });
}

// ── Verdict ────────────────────────────────────────────────────────────────
if (findings.length > 0) {
  console.error(`glyph-registry: ${findings.length} finding${findings.length === 1 ? '' : 's'}\n`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`glyph-registry: OK — ${declared.size} declared marks · ${painted.length} painted surfaces in sync · bans hold · worded-only holds`);
