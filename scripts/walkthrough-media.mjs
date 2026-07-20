#!/usr/bin/env node
// walkthrough-media.mjs — the walkthrough's media contract, executable.
//
// The Cline trap (cline#11333): walkthrough media that lives outside the
// packaged tree — or under a .vscodeignore'd dir like media/** (kept for
// the GitHub-raw README) — renders fine in the dev host and ships BROKEN
// in the VSIX. This gate makes the trap un-reintroducible:
//   1 · every steps[*].media file (markdown · svg · image, theme variants
//       included) exists on disk;
//   2 · no media path matches a .vscodeignore pattern (it must ship);
//   3 · every image a walkthrough .md references is a relative path that
//       resolves UNDER walkthrough/ and exists (media/** refs are exactly
//       the trap);
//   4 · no orphan .md/.svg sits in walkthrough/ unreferenced (dead bytes
//       never ride the VSIX).
// A self-canary asserts the ignore matcher still catches `media/x.gif` —
// a matcher that rots fails LOUD (exit 2), never silently green.
//
// Honest limit: the matcher speaks the glob dialect THIS .vscodeignore
// uses (`dir/**` · `**/*.ext` · plain paths). A new pattern shape should
// extend it — the canary keeps the core class honest.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const findings = [];

// ── .vscodeignore → matcher ─────────────────────────────────────────────────
const ignoreLines = fs.readFileSync(path.join(root, '.vscodeignore'), 'utf-8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('!'));

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i += 1;
        if (glob[i + 1] === '/') { i += 1; } // `**/` swallows the slash
      } else {
        re += '[^/]*';
      }
    } else if ('.+?^${}()|[]\\'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}(/|$)`);
}

const ignoreRes = ignoreLines.map((l) => ({ line: l, re: globToRegExp(l) }));
const isIgnored = (rel) => ignoreRes.find(({ re }) => re.test(rel))?.line;

// Self-canary: media/** IS in .vscodeignore and MUST match — a matcher
// that stops catching the known-ignored class is broken, not green.
if (isIgnored('media/canary.gif') === undefined || isIgnored('walkthrough/assets/canary.svg') !== undefined) {
  console.error('✗ walkthrough-media: the ignore matcher failed its canary (media/** must match · walkthrough/ must not)');
  process.exit(2);
}

// ── 1+2 · declared step media exist and ship ────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const walkthroughs = pkg.contributes?.walkthroughs ?? [];
const declared = new Set();

function checkMediaPath(rel, stepId) {
  declared.add(rel);
  if (!fs.existsSync(path.join(root, rel))) {
    findings.push(`step '${stepId}' — media missing on disk: ${rel}`);
  }
  const hit = isIgnored(rel);
  if (hit !== undefined) {
    findings.push(`step '${stepId}' — media is .vscodeignore'd by \`${hit}\` and will not ship: ${rel}`);
  }
}

for (const wt of walkthroughs) {
  for (const step of wt.steps ?? []) {
    const media = step.media ?? {};
    if (typeof media.markdown === 'string') { checkMediaPath(media.markdown, step.id); }
    if (typeof media.svg === 'string') { checkMediaPath(media.svg, step.id); }
    if (typeof media.image === 'string') { checkMediaPath(media.image, step.id); }
    if (typeof media.image === 'object' && media.image !== null) {
      for (const variant of ['dark', 'light', 'hc', 'hcLight']) {
        if (typeof media.image[variant] === 'string') { checkMediaPath(media.image[variant], step.id); }
      }
    }
  }
}

// ── 3 · images referenced from walkthrough .md resolve under walkthrough/ ───
const wtDir = path.join(root, 'walkthrough');
const IMG_RE = /!\[[^\]]*\]\(([^)\s]+)\)|<img[^>]+src="([^"]+)"/g;
for (const entry of fs.readdirSync(wtDir)) {
  if (!entry.endsWith('.md')) { continue; }
  const rel = path.join('walkthrough', entry);
  const text = fs.readFileSync(path.join(root, rel), 'utf-8');
  for (const m of text.matchAll(IMG_RE)) {
    const ref = m[1] ?? m[2];
    if (/^[a-z]+:/i.test(ref)) {
      findings.push(`${rel} — external image (the VSIX must be self-contained): ${ref}`);
      continue;
    }
    const resolved = path.resolve(wtDir, ref);
    const relResolved = path.relative(root, resolved);
    declared.add(relResolved.split(path.sep).join('/'));
    if (!relResolved.startsWith(`walkthrough${path.sep}`)) {
      findings.push(`${rel} — image resolves OUTSIDE walkthrough/ (the Cline trap): ${ref} → ${relResolved}`);
    } else if (!fs.existsSync(resolved)) {
      findings.push(`${rel} — image missing on disk: ${ref}`);
    }
  }
}

// ── 4 · no orphan .md/.svg in walkthrough/ (dead bytes never ship) ──────────
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { yield* walk(full); continue; }
    yield full;
  }
}
for (const file of walk(wtDir)) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  if (!/\.(md|svg)$/.test(rel)) { continue; } // posters/GIFs may pre-land for a later step
  if (!declared.has(rel)) {
    findings.push(`orphan in the packaged walkthrough tree (unreferenced by any step or .md): ${rel}`);
  }
}

// ── verdict ─────────────────────────────────────────────────────────────────
if (findings.length > 0) {
  console.error(`✗ walkthrough-media: ${findings.length} finding${findings.length === 1 ? '' : 's'}`);
  for (const f of findings) { console.error(`  · ${f}`); }
  process.exit(1);
}
console.log(`✓ walkthrough-media: ${declared.size} media paths exist, ship, and stay under walkthrough/`);
