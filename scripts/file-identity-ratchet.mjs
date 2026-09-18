#!/usr/bin/env node
// file-identity-ratchet.mjs — live surfaces must not teach or ship
// retired .nika.yaml / .nika.yml program names. Historical changelog
// prose and negative tests stay on an explicit allowlist.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const FORBIDDEN = /\.nika\.ya?ml/;
const allow = JSON.parse(readFileSync(join(here, 'file-identity-allowlist.json'), 'utf8'));
const allowByPath = new Map(allow.map((entry) => [entry.path, entry]));

function gitFiles() {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root });
  const extra = execFileSync('git', ['ls-files', '-z', '--others', '--exclude-standard'], { cwd: root });
  return Buffer.concat([tracked, extra]).toString('utf8').split('\0').filter(Boolean);
}

const seen = new Set();
const failures = [];

for (const rel of gitFiles()) {
  if (rel.endsWith('.nika.yaml') || rel.endsWith('.nika.yml')) {
    if (!allowByPath.has(rel)) {
      failures.push(`live path ${rel}`);
    } else {
      seen.add(rel);
    }
  }
  let text;
  try {
    text = readFileSync(join(root, rel), 'utf8');
  } catch {
    continue;
  }
  if (!FORBIDDEN.test(text)) { continue; }
  const entry = allowByPath.get(rel);
  if (!entry) {
    failures.push(`unreviewed old-suffix text in ${rel}`);
    continue;
  }
  seen.add(rel);
}

for (const entry of allow) {
  if (!seen.has(entry.path)) {
    failures.push(`stale allowlist ${entry.path}`);
  }
}

if (failures.length > 0) {
  for (const line of failures) { console.error(`file-identity-ratchet · ${line}`); }
  process.exit(1);
}
console.log(`file-identity-ratchet: OK — ${allow.length} bounded exceptions`);
