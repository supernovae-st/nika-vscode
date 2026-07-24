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
// The CONTENT lane holds the prose surfaces a USER reads to the house
// writing law: no em dash (U+2014 exactly — en-dash ranges and
// box-drawing lines stay free; the separator is « · », a colon for
// consequences), no dev-marketing vocabulary. Empirically necessary:
// the README stood at zero em dashes after the #107 sweep and carried
// 35 one week later. Scope: README · walkthrough/*.md · CHANGELOG
// [Unreleased] only (the released history is frozen, never re-scanned)
// · package.json copy strings. NEVER src/**/*.ts — code comments
// em-dash freely, gating them is churn. Fenced blocks and inline
// `code` spans quote engine and UI output verbatim and keep their
// voice. Every contributor surface graduated to FAIL-tier with the
// 2026-07-24 sweeps (SSOT · SECURITY · AGENTS · PUBLISHING · contrib ·
// icons · scripts/media · docs/ALGORITHMS · docs/DESIGN); a NEW
// docs/*.md arrives WARN by glob and graduates with its own sweep.
//
// Escape hatch: a `voice-ok` comment on the hit line or the line above.
// package.json carries no comments, so its escape lives in the allowlist
// below. `invalid` is a manual-review word, NOT gated (rule 7): too many
// legitimate code-level uses (validation identifiers, schema errors) for
// a grep gate — reviewers hold that line by hand.
//
// Self-test first: every content pattern proves itself against its own
// probe (caught · voice-ok escaped · fence-skipped) before any real
// scan. A gate that cannot catch its probes exits 2 and judges nothing.

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

// Content-lane bans. Each entry carries its own canary probe; the probe
// sentence must trip ONLY its own pattern.
const CONTENT_BANNED = [
  { re: /—/u, why: 'em dash (U+2014) · separator is « · », colon for consequences', probe: 'the audit — in the editor' },
  { re: /\bgame-chang/i, why: 'dev-marketing', probe: 'a game-changing canvas' },
  { re: /\bcutting-edge\b/i, why: 'dev-marketing', probe: 'cutting-edge tooling' },
  { re: /\bnext-generation\b/i, why: 'dev-marketing', probe: 'a next-generation engine' },
  { re: /\bnext-level\b/i, why: 'dev-marketing', probe: 'next-level graphs' },
  { re: /\bblazing/i, why: 'dev-marketing', probe: 'blazingly quick checks' },
  { re: /\blightning-fast\b/i, why: 'dev-marketing', probe: 'lightning-fast replay' },
  { re: /\bproduction-ready\b/i, why: 'dev-marketing', probe: 'production-ready runs' },
  { re: /\benterprise-grade\b/i, why: 'dev-marketing', probe: 'an enterprise-grade audit' },
  { re: /\bbattle-tested\b/i, why: 'dev-marketing', probe: 'a battle-tested parser' },
  { re: /\bmission-critical\b/i, why: 'dev-marketing', probe: 'mission-critical flows' },
  { re: /\bbulletproof\b/i, why: 'dev-marketing', probe: 'bulletproof chains' },
  { re: /\bbest-in-class\b/i, why: 'dev-marketing', probe: 'best-in-class ergonomics' },
  { re: /\bworld-class\b/i, why: 'dev-marketing', probe: 'a world-class canvas' },
  { re: /\bfuture-proof\b/i, why: 'dev-marketing', probe: 'a future-proof schema' },
  { re: /\beffortless/i, why: 'dev-marketing', probe: 'effortless setup' },
  { re: /\bpowerful\b/i, why: 'dev-marketing', probe: 'a powerful engine' },
  { re: /\bfeature-rich\b/i, why: 'dev-marketing', probe: 'a feature-rich panel' },
  { re: /\bseamless/i, why: 'dev-marketing', probe: 'seamless integration' },
  { re: /\bcomprehensive/i, why: 'dev-marketing', probe: 'a comprehensive report' },
  { re: /\brobust/i, why: 'dev-marketing', probe: 'robust against drift' },
  { re: /\bleverag/i, why: 'dev-marketing', probe: 'leverage the oracle' },
];

// The USER surfaces the content lane fails on. CHANGELOG is sliced: only
// the head through the second `## [` heading (i.e. [Unreleased]) is
// scanned — shipped release notes are historical record.
const CONTENT_FAIL_MD = [
  { rel: 'README.md' },
  { rel: 'CHANGELOG.md', opts: { unreleasedOnly: true } },
  // Contributor surfaces · swept 2026-07-24 (63 findings) and graduated
  // WARN → FAIL: a clean surface stays clean or the belt says so.
  { rel: 'SSOT.md' },
  { rel: 'SECURITY.md' },
  { rel: 'AGENTS.md' },
  { rel: 'PUBLISHING.md' },
  { rel: 'contrib/README.md' },
  { rel: 'icons/README.md' },
  { rel: 'scripts/media/README.md' },
  { rel: 'docs/ALGORITHMS.md' },
  { rel: 'docs/DESIGN.md' },
];

// The nursery: a NEW doc arrives here by the docs/*.md glob below,
// scanned and reported but non-fatal, until its own sweep graduates it
// into CONTENT_FAIL_MD. Every existing surface graduated 2026-07-24
// (DESIGN.md closed the arc · 196 findings in the final pass).
const CONTENT_WARN_MD = [];

// package.json keys whose string values are copy a user reads. Values
// under any other key (commands, whens, paths, defaults, snippet
// bodies) are mechanical and stay out of the content lane.
const CONTENT_COPY_KEYS = new Set([
  'title', 'shortTitle', 'description', 'markdownDescription',
  'enumDescriptions', 'markdownEnumDescriptions', 'enumItemLabels',
  'contents', 'detail', 'label', 'placeholder', 'modelDescription',
  'userDescription', 'altText', 'displayName',
]);

// package.json values allowed verbatim (JSON has no comments). Keep it
// EMPTY unless a string legitimately quotes a ban — e.g. settings prose
// documenting the ban itself. Every entry is a debt with a reason.
//
// Debt: the tryDemo button keeps its em dash because
// welcomeViews.test.ts:61 pins the exact string, and that test lives
// outside the content sweep's file scope. Flip both in one PR, then
// delete this entry.
const PACKAGE_JSON_ALLOWLIST = [
  'No workflows here yet: this folder carries no `.nika.yaml` file.\n[▶ Try the demo — offline, zero keys](command:nika.tryDemo)\nA four-wave sandbox on mock/echo: press ▶ to watch it light up. Or [create your own](command:nika.newWorkflow): the wizard walks name · starter · model, offline with mock/echo.',
];

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

// The content-lane scanner: fence state-toggle (``` or ~~~), inline
// `code` spans blanked (they quote UI and engine strings verbatim),
// the same voice-ok escape, optional [Unreleased] slice.
function scanContent(rel, text, { unreleasedOnly = false } = {}) {
  let lines = text.split('\n');
  if (unreleasedOnly) {
    let releases = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/^## \[/.test(lines[i]) && ++releases === 2) {
        lines = lines.slice(0, i);
        break;
      }
    }
  }
  const out = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*(```|~~~)/.test(raw)) { inFence = !inFence; continue; }
    if (inFence) { continue; }
    if (raw.includes('voice-ok')) { continue; }
    if (i > 0 && lines[i - 1].includes('voice-ok')) { continue; }
    const line = raw.replace(/`[^`]*`/g, '``');
    for (const { re, why } of CONTENT_BANNED) {
      if (re.test(line)) {
        out.push(`${rel}:${i + 1} · ${why} · ${raw.trim().slice(0, 100)}`);
      }
    }
  }
  return out;
}

function scanPackageContent(node, jsonPath, key, out) {
  if (typeof node === 'string') {
    if (!CONTENT_COPY_KEYS.has(key)) { return; }
    if (PACKAGE_JSON_ALLOWLIST.includes(node)) { return; }
    const text = node.replace(/`[^`]*`/g, '``');
    for (const { re, why } of CONTENT_BANNED) {
      if (re.test(text)) {
        out.push(`package.json:${lineOf(node)} · ${why} · ${jsonPath}`);
      }
    }
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => scanPackageContent(v, `${jsonPath}[${i}]`, key, out));
  } else if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      scanPackageContent(v, `${jsonPath}.${k}`, k, out);
    }
  }
}

// ── Self-test: the canaries ─────────────────────────────────────────────────
function canary() {
  const bad = [];
  const hits = (text, opts) => scanContent('canary', text, opts).length;
  for (const { re, probe } of CONTENT_BANNED) {
    if (hits(probe) === 0) { bad.push(`probe not caught · ${re}`); }
    if (hits(`${probe} voice-ok`) !== 0) { bad.push(`voice-ok same-line leaks · ${re}`); }
    if (hits(`<!-- voice-ok -->\n${probe}`) !== 0) { bad.push(`voice-ok line-above leaks · ${re}`); }
    if (hits('```\n' + probe + '\n```') !== 0) { bad.push(`fence-skip leaks · ${re}`); }
  }
  if (hits('pages 3–4 carry an en dash and stay free') !== 0) { bad.push('en dash (U+2013) wrongly caught'); }
  if (hits('── a box-drawing rule stays free ──') !== 0) { bad.push('box-drawing (U+2500) wrongly caught'); }
  if (hits('the `Flaky — N` section label, quoted from the UI') !== 0) { bad.push('inline code span not blanked'); }
  const sliced = '## [Unreleased]\nthe audit — fresh\n## [1.0.0]\nthe audit — frozen\n';
  if (hits(sliced, { unreleasedOnly: true }) !== 1) { bad.push('CHANGELOG [Unreleased] slice broken'); }
  return bad;
}

const canaryFails = canary();
if (canaryFails.length > 0) {
  for (const f of canaryFails) { console.log(`canary · ${f}`); }
  console.log(`\nvoice-gate: ${canaryFails.length} canary failure${canaryFails.length === 1 ? '' : 's'} — the gate cannot trust itself`);
  process.exit(2);
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
    const rel = path.join('walkthrough', entry);
    const text = fs.readFileSync(path.join(wtDir, entry), 'utf-8');
    scanLines(rel, text);
    findings.push(...scanContent(rel, text));
  }
}

// ── content lane · user markdown surfaces ──────────────────────────────────
for (const { rel, opts } of CONTENT_FAIL_MD) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) { continue; }
  findings.push(...scanContent(rel, fs.readFileSync(full, 'utf-8'), opts));
}

// ── content lane · contributor surfaces (WARN · sweep owed) ────────────────
const warnFindings = [];
const warnTargets = [...CONTENT_WARN_MD];
const failRels = new Set(CONTENT_FAIL_MD.map((f) => f.rel));
const docsDir = path.join(root, 'docs');
if (fs.existsSync(docsDir)) {
  for (const entry of fs.readdirSync(docsDir)) {
    const rel = path.join('docs', entry);
    // A doc graduated into the FAIL lane is judged there — never twice.
    if (entry.endsWith('.md') && !failRels.has(rel)) { warnTargets.push(rel); }
  }
}
for (const rel of warnTargets) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) { continue; }
  warnFindings.push(...scanContent(rel, fs.readFileSync(full, 'utf-8')));
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

// content lane · every copy string in the manifest
scanPackageContent({ description: pkg.description, contributes }, 'package', '', findings);

// ── Report ──────────────────────────────────────────────────────────────────
if (warnFindings.length > 0) {
  const perFile = new Map();
  for (const f of warnFindings) {
    const rel = f.slice(0, f.indexOf(':'));
    perFile.set(rel, (perFile.get(rel) ?? 0) + 1);
  }
  for (const [rel, n] of perFile) {
    console.log(`WARN ${rel} · ${n} content finding${n === 1 ? '' : 's'} (contributor surface · sweep owed)`);
  }
}
if (findings.length === 0) {
  console.log(warnFindings.length === 0
    ? 'voice-gate: clean'
    : `voice-gate: clean · ${warnFindings.length} contributor-surface warnings (non-fatal until their sweep)`);
  process.exit(0);
}
for (const f of findings) { console.log(f); }
console.log(`\nvoice-gate: ${findings.length} finding${findings.length === 1 ? '' : 's'} — the voice rules live in docs/DESIGN.md §8`);
process.exit(1);
