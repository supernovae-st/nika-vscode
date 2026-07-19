#!/usr/bin/env node
// voice-gate.mjs — the one-voice law as an executable gate (DESIGN.md §8).
//
// The twelve rules live in docs/DESIGN.md §8; this gate greps the
// mechanically checkable bans across every surface WE write: src/**/*.ts
// (test trees excluded — fixtures may quote anything), walkthrough/*.md,
// and the user-facing strings of package.json (command titles ·
// configuration prose · walkthrough copy). Engine output relayed verbatim
// is not ours to rewrite and is not scanned — the engine speaks its own
// voice.
//
// Escape hatch: a `voice-ok` comment on the hit line or the line above.
// package.json carries no comments, so its escape lives in the allowlist
// below. `invalid` is a manual-review word, NOT gated (rule 7): too many
// legitimate code-level uses (validation identifiers, schema errors) for
// a grep gate — reviewers hold that line by hand.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Banned patterns (DESIGN.md §8 · rules 4/5/6/8). `oops` carries BOTH
// word boundaries — this is a DAG codebase, « loops » is everywhere.
const BANNED = [
  /[Ss]uccessfully/,
  /[Uu]nable to/,
  /[Ss]omething went wrong/,
  /\b[Oo]ops\b/,
  /[Aa]n error occurred/,
  /[Pp]lease try again later/,
];

// package.json values allowed verbatim (JSON has no comments). Keep it
// EMPTY unless a string legitimately quotes a ban — e.g. settings prose
// documenting the ban itself. Every entry is a debt with a reason.
const PACKAGE_JSON_ALLOWLIST = [];

const findings = [];

function scanLines(rel, text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('voice-ok')) { continue; }
    if (i > 0 && lines[i - 1].includes('voice-ok')) { continue; }
    for (const re of BANNED) {
      if (re.test(line)) {
        findings.push(`${rel}:${i + 1} · ${re} · ${line.trim()}`);
      }
    }
  }
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { yield* walk(full); continue; }
    yield full;
  }
}

// ── src/**/*.ts (src/test*/ excluded — fixtures may quote anything) ────────
for (const file of walk(path.join(root, 'src'))) {
  const rel = path.relative(root, file);
  if (!rel.endsWith('.ts')) { continue; }
  if (rel.startsWith(`src${path.sep}test`)) { continue; }
  scanLines(rel, fs.readFileSync(file, 'utf-8'));
}

// ── walkthrough/*.md ────────────────────────────────────────────────────────
const wtDir = path.join(root, 'walkthrough');
if (fs.existsSync(wtDir)) {
  for (const entry of fs.readdirSync(wtDir)) {
    if (!entry.endsWith('.md')) { continue; }
    scanLines(path.join('walkthrough', entry), fs.readFileSync(path.join(wtDir, entry), 'utf-8'));
  }
}

// ── package.json user-facing fields ─────────────────────────────────────────
const pkgRaw = fs.readFileSync(path.join(root, 'package.json'), 'utf-8');
const pkg = JSON.parse(pkgRaw);

function lineOf(value) {
  // Locate the JSON-escaped value in the raw text for a real file:line.
  const idx = pkgRaw.indexOf(JSON.stringify(value));
  return idx === -1 ? 0 : pkgRaw.slice(0, idx).split('\n').length;
}

function checkField(fieldPath, value) {
  if (typeof value !== 'string') { return; }
  if (PACKAGE_JSON_ALLOWLIST.includes(value)) { return; }
  for (const re of BANNED) {
    if (re.test(value)) {
      findings.push(`package.json:${lineOf(value)} · ${re} · ${fieldPath}: ${value}`);
    }
  }
}

const contributes = pkg.contributes ?? {};
for (const cmd of contributes.commands ?? []) {
  checkField(`commands[${cmd.command}].title`, cmd.title);
}
const configs = Array.isArray(contributes.configuration)
  ? contributes.configuration
  : [contributes.configuration].filter(Boolean);
for (const cfg of configs) {
  checkField('configuration.title', cfg.title);
  for (const [key, prop] of Object.entries(cfg.properties ?? {})) {
    checkField(`configuration.${key}.description`, prop.description);
    checkField(`configuration.${key}.markdownDescription`, prop.markdownDescription);
    (prop.enumDescriptions ?? []).forEach((d, i) =>
      checkField(`configuration.${key}.enumDescriptions[${i}]`, d));
    (prop.markdownEnumDescriptions ?? []).forEach((d, i) =>
      checkField(`configuration.${key}.markdownEnumDescriptions[${i}]`, d));
  }
}
for (const w of contributes.walkthroughs ?? []) {
  checkField(`walkthroughs[${w.id}].title`, w.title);
  checkField(`walkthroughs[${w.id}].description`, w.description);
  for (const s of w.steps ?? []) {
    checkField(`walkthroughs[${w.id}].steps[${s.id}].title`, s.title);
    checkField(`walkthroughs[${w.id}].steps[${s.id}].description`, s.description);
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
if (findings.length === 0) {
  console.log('voice-gate: clean');
  process.exit(0);
}
for (const f of findings) { console.log(f); }
console.log(`\nvoice-gate: ${findings.length} finding${findings.length === 1 ? '' : 's'} — the voice rules live in docs/DESIGN.md §8`);
process.exit(1);
