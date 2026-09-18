#!/usr/bin/env node
// file-identity-ratchet.mjs — live surfaces must not teach or ship
// retired .nika.yaml / .nika.yml program names.
//
// Exceptions are exact files only. Frozen evidence pins the whole-file
// digest. Teaching and negative files pin hit-count and the sha256 of
// matching lines, so a new `nika run foo.nika.yaml` in an allowlisted
// changelog fails. Escaped regex and brace-glob aliases count as hits.
//
//   node scripts/file-identity-ratchet.mjs
//   node scripts/file-identity-ratchet.mjs --selftest
//   node scripts/file-identity-ratchet.mjs --dump-pins

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const RETIRED = ['.nika.yaml', '.nika.yml'];
const CATEGORIES = new Set(['historical', 'frozen', 'negative', 'ratchet']);
const CONTENT_NEEDLES = [
  '.nika.yaml',
  '.nika.yml',
  String.raw`\.nika\.ya?ml`,
  String.raw`\.nika\.yaml`,
  String.raw`\.nika\.yml`,
  '*.nika.yaml',
  '*.nika.yml',
  '*.nika.ya?ml',
  '.nika.{yaml,yml}',
  '.nika.{yml,yaml}',
];

function sha256Bytes(raw) {
  return `sha256:${createHash('sha256').update(raw).digest('hex')}`;
}

function linesSha256(lines) {
  return sha256Bytes(Buffer.from(`${lines.join('\n')}\n`, 'utf8'));
}

function gitFiles() {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root });
  const extra = execFileSync('git', ['ls-files', '-z', '--others', '--exclude-standard'], { cwd: root });
  return Buffer.concat([tracked, extra]).toString('utf8').split('\0').filter(Boolean);
}

function loadExceptions() {
  const rows = JSON.parse(readFileSync(join(here, 'file-identity-allowlist.json'), 'utf8'));
  const seen = new Set();
  for (const row of rows) {
    for (const key of ['path', 'category', 'reason', 'owner']) {
      if (!row[key]) { throw new Error(`old-suffix exception missing ${key}: ${JSON.stringify(row)}`); }
    }
    if (row.path.endsWith('/') || row.path.includes('*')) {
      throw new Error(`exception path must be an exact file, not a prefix/glob: ${row.path}`);
    }
    if (!CATEGORIES.has(row.category)) {
      throw new Error(`unknown exception category: ${row.category}`);
    }
    if (seen.has(row.path)) { throw new Error(`duplicate exception path: ${row.path}`); }
    seen.add(row.path);
    if (row.category === 'frozen') {
      if (!row.digest) { throw new Error(`frozen exception missing digest: ${row.path}`); }
    } else if (row.count === undefined || !row.lines_sha256) {
      throw new Error(`content exception missing count/lines_sha256: ${row.path}`);
    }
  }
  return rows;
}

function contentHitLines(text) {
  return text.split(/\r?\n/).filter((line) => CONTENT_NEEDLES.some((n) => line.includes(n)));
}

function readRel(rel, overlay) {
  if (overlay && Object.prototype.hasOwnProperty.call(overlay, rel)) {
    const text = overlay[rel];
    return { raw: Buffer.from(text, 'utf8'), text };
  }
  try {
    const raw = readFileSync(join(root, rel));
    return { raw, text: raw.toString('utf8') };
  } catch {
    return undefined;
  }
}

function scan(exceptions, { overlay = undefined, extraPaths = [] } = {}) {
  const byPath = new Map(exceptions.map((row) => [row.path, row]));
  const files = [...new Set([...gitFiles(), ...extraPaths])];
  const failures = [];
  const used = new Set();
  for (const rel of files) {
    const row = byPath.get(rel);
    const loaded = readRel(rel, overlay);
    const retiredPath = RETIRED.some((suffix) => rel.endsWith(suffix));
    if (loaded === undefined) {
      if (retiredPath && row === undefined) {
        failures.push(`path ${rel} · retired program suffix`);
      }
      continue;
    }
    const hits = contentHitLines(loaded.text);
    if (retiredPath) {
      if (row === undefined || row.category !== 'frozen') {
        failures.push(`path ${rel} · retired program suffix`);
      } else if (sha256Bytes(loaded.raw) !== row.digest) {
        failures.push(`${rel} · frozen digest mismatch`);
      } else {
        used.add(rel);
      }
      continue;
    }
    if (hits.length === 0) { continue; }
    if (row === undefined) {
      loaded.text.split(/\r?\n/).forEach((line, i) => {
        if (CONTENT_NEEDLES.some((n) => line.includes(n))) {
          failures.push(`${rel}:${i + 1} · ${line.trim().slice(0, 160)}`);
        }
      });
      continue;
    }
    used.add(rel);
    const digest = sha256Bytes(loaded.raw);
    if (row.category === 'frozen') {
      if (digest !== row.digest) { failures.push(`${rel} · frozen digest mismatch`); }
      continue;
    }
    if (hits.length !== row.count) {
      failures.push(`${rel} · hit count ${hits.length} != pinned ${row.count}`);
    }
    const actual = linesSha256(hits);
    if (actual !== row.lines_sha256) {
      failures.push(`${rel} · matching-lines hash mismatch`);
    }
  }
  for (const row of exceptions) {
    if (!used.has(row.path)) { failures.push(`stale exception · ${row.path}`); }
  }
  return failures;
}

function dumpPins() {
  const exceptions = loadExceptions();
  const files = new Set(gitFiles());
  for (const row of exceptions) {
    const loaded = readRel(row.path, undefined);
    if (loaded === undefined) {
      console.error(`# missing ${row.path}`);
      continue;
    }
    const hits = contentHitLines(loaded.text);
    console.log(row.path);
    console.log(`  digest: ${sha256Bytes(loaded.raw)}`);
    console.log(`  count: ${hits.length}`);
    console.log(`  lines_sha256: ${hits.length ? linesSha256(hits) : '-'}`);
    if (!files.has(row.path)) { console.error('  # not in git ls-files'); }
  }
}

function selftest() {
  let bad = 0;
  const exceptions = loadExceptions();
  const clean = scan(exceptions);
  if (clean.length) {
    console.error('selftest: live tree should be clean, got:');
    for (const item of clean) { console.error(`  ${item}`); }
    bad += 1;
  } else {
    console.log('selftest: live tree clean');
  }

  const chapter = 'CHANGELOG.md';
  const orig = readFileSync(join(root, chapter), 'utf8');
  const injected = `${orig.replace(/\s+$/, '')}\n\n\`nika run foo.nika.yaml\`\n`;
  const chapterFail = scan(exceptions, { overlay: { [chapter]: injected } });
  if (!chapterFail.some((item) => item.includes(chapter))) {
    console.error('selftest: missed injection into allowlisted changelog', chapterFail);
    bad += 1;
  } else {
    console.log('selftest: injection into CHANGELOG.md detected');
  }

  const escaped = 'src/_ratchet-escaped.ts';
  const escapedFail = scan(exceptions, {
    extraPaths: [escaped],
    overlay: { [escaped]: String.raw`const re = /\.nika\.yaml$/;` + '\n' },
  });
  if (!escapedFail.some((item) => item.includes(escaped))) {
    console.error('selftest: missed escaped-regex alias', escapedFail);
    bad += 1;
  } else {
    console.log('selftest: escaped regex \\.nika\\.yaml detected');
  }

  const brace = 'src/_ratchet-brace.ts';
  const braceFail = scan(exceptions, {
    extraPaths: [brace],
    overlay: { [brace]: "const glob = '**/*.nika.{yaml,yml}';\n" },
  });
  if (!braceFail.some((item) => item.includes(brace))) {
    console.error('selftest: missed brace-glob alias', braceFail);
    bad += 1;
  } else {
    console.log('selftest: brace glob .nika.{yaml,yml} detected');
  }

  const proof = 'tmp/_ratchet-injection.nika.yaml';
  const proofFail = scan(exceptions, {
    extraPaths: [proof],
    overlay: { [proof]: 'nika: inject\ntasks: { t: { infer: { prompt: x } } }\n' },
  });
  if (!proofFail.some((item) => item.includes(proof))) {
    console.error('selftest: missed new retired path', proofFail);
    bad += 1;
  } else {
    console.log('selftest: new retired path detected');
  }

  const again = scan(exceptions);
  if (again.length) {
    console.error('selftest: overlay leaked into live scan', again);
    bad += 1;
  } else {
    console.log('selftest: legitimate history and negative tests still pass');
  }
  return bad;
}

const args = new Set(process.argv.slice(2));
if (args.has('--dump-pins')) {
  dumpPins();
  process.exit(0);
}
if (args.has('--selftest')) {
  const bad = selftest();
  process.exit(bad === 0 ? 0 : 1);
}
const failures = scan(loadExceptions());
for (const line of failures) { console.error(`file-identity-ratchet · ${line}`); }
if (failures.length > 0) { process.exit(1); }
console.log('file-identity-ratchet: OK');
