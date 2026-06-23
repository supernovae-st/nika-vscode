#!/usr/bin/env node
// parity.mjs — the manifest ↔ implementation drift alarm.
//
// A VS Code extension lies in TWO places: package.json (what it DECLARES)
// and src/ (what it DOES). Every class of silent drift we have hit gets a
// check here: commands declared-but-never-registered (dead palette
// entries), registered-but-undeclared (invisible to keybindings/menus),
// settings read-but-undeclared (silently default-only), declared-but-
// never-read (dead UI), webview protocol kinds emitted on one side and
// unhandled on the other, LM tools declared vs registered, menu/keybinding
// references to unknown commands. Exit 1 on any finding — CI-able.
//
// Heuristic greps, tuned to THIS codebase's idioms; if an idiom changes,
// change the regex — a parity checker that silently misses is worse than
// none (the gate-qui-ment lesson).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { yield* walk(full); continue; }
    if (entry.name.endsWith('.ts')) { yield full; }
  }
}

const sources = new Map();
for (const file of walk(path.join(root, 'src'))) {
  sources.set(path.relative(root, file), fs.readFileSync(file, 'utf-8'));
}
const allSrc = [...sources.values()].join('\n');
const extSrc = [...sources.entries()]
  .filter(([p]) => !p.startsWith('src/webview/') && !p.startsWith('src/test/'))
  .map(([, s]) => s)
  .join('\n');
const webviewSrc = sources.get('src/webview/dag.ts') ?? '';

const findings = [];
const ok = [];

// ─── 1 · Commands: declared ↔ registered ────────────────────────────────────
{
  // Programmatic-only commands (invoked by tree items / webview callbacks ·
  // never meant for the palette) — undeclared ON PURPOSE.
  const INTERNAL = new Set(['nika.openTaskLocation']);
  const declared = new Set((pkg.contributes?.commands ?? []).map((c) => c.command));
  const registered = new Set(
    [...extSrc.matchAll(/registerCommand\(\s*'([^']+)'/g)].map((m) => m[1]),
  );
  for (const cmd of declared) {
    if (!registered.has(cmd)) {
      findings.push(`command DECLARED but never registered: ${cmd} (dead palette entry)`);
    }
  }
  for (const cmd of registered) {
    if (!declared.has(cmd) && !INTERNAL.has(cmd)) {
      findings.push(`command REGISTERED but undeclared: ${cmd} (invisible to palette/keybindings)`);
    }
  }
  if (declared.size > 0) { ok.push(`commands · ${declared.size} declared ↔ ${registered.size} registered (${INTERNAL.size} internal)`); }
}

// ─── 2 · Menus + keybindings reference known commands ──────────────────────
{
  const declared = new Set((pkg.contributes?.commands ?? []).map((c) => c.command));
  const refs = [];
  for (const group of Object.values(pkg.contributes?.menus ?? {})) {
    for (const item of group) { refs.push(item.command); }
  }
  for (const kb of pkg.contributes?.keybindings ?? []) { refs.push(kb.command); }
  for (const ref of refs) {
    if (ref && !declared.has(ref)) {
      findings.push(`menu/keybinding references unknown command: ${ref}`);
    }
  }
  ok.push(`menus+keybindings · ${refs.length} refs resolve`);
}

// ─── 3 · Settings: declared ↔ read ──────────────────────────────────────────
{
  const declared = new Set(Object.keys(pkg.contributes?.configuration?.properties ?? {}));
  // Idiom: getConfiguration('nika').get<T>('x.y', …)
  const read = new Set(
    [...extSrc.matchAll(/getConfiguration\('nika'\)\s*\.get<[^>]*>\(\s*'([^']+)'/g)]
      .map((m) => `nika.${m[1]}`),
  );
  for (const key of read) {
    if (!declared.has(key)) {
      findings.push(`setting READ but undeclared: ${key} (works, but invisible in Settings UI)`);
    }
  }
  for (const key of declared) {
    // server.path/extraArgs/trace.server are read via different idioms or by the LSP client itself.
    const exempt = new Set(['nika.trace.server', 'nika.server.path', 'nika.server.extraArgs', 'nika.server.autoDownload']);
    if (!read.has(key) && !exempt.has(key)) {
      const bare = key.replace(/^nika\./, '');
      if (!extSrc.includes(`'${bare}'`)) {
        findings.push(`setting DECLARED but never read: ${key} (dead UI)`);
      }
    }
  }
  ok.push(`settings · ${declared.size} declared · ${read.size} read via standard idiom`);
}

// ─── 4 · Webview protocol: kinds handled on both sides ─────────────────────
// ONLY actual postMessage call sites count as emissions — type-definition
// literals share the same `kind: 'x'` shape and must not be read as sends
// (the first version of this check produced 10 false positives that way).
{
  const panelSrc = sources.get('src/dagPanel.ts') ?? '';
  const postKinds = (src) => new Set(
    [...src.matchAll(/postMessage\(\s*\{[^}]*?kind:\s*'([^']+)'/gs)].map((m) => m[1]),
  );
  const caseKinds = (src) => new Set(
    [...src.matchAll(/case\s+'([a-zA-Z:]+)'/g)].map((m) => m[1]),
  );

  const extSends = postKinds(panelSrc);
  const webHandles = caseKinds(webviewSrc);
  const webSends = postKinds(webviewSrc);
  const panelHandles = caseKinds(panelSrc);
  // Callback-routed kinds (panel forwards via onNodeClicked/onEditRequest…).
  for (const kind of ['dag:viewportChanged', 'dag:ready']) { panelHandles.add(kind); }

  for (const kind of extSends) {
    if (!webHandles.has(kind)) {
      findings.push(`ext→webview message UNHANDLED by webview: ${kind}`);
    }
  }
  for (const kind of webSends) {
    if (!panelHandles.has(kind)) {
      findings.push(`webview→ext message UNHANDLED by panel: ${kind}`);
    }
  }
  ok.push(`webview protocol · ext sends ${extSends.size} · web sends ${webSends.size} · all routed`);
}

// ─── 5 · LM tools: declared ↔ registered ────────────────────────────────────
{
  const declared = new Set((pkg.contributes?.languageModelTools ?? []).map((t) => t.name));
  const registered = new Set(
    [...extSrc.matchAll(/registerTool\(\s*'([^']+)'/g)].map((m) => m[1]),
  );
  for (const t of declared) {
    if (!registered.has(t)) { findings.push(`LM tool DECLARED but never registered: ${t}`); }
  }
  for (const t of registered) {
    if (!declared.has(t)) { findings.push(`LM tool REGISTERED but undeclared: ${t}`); }
  }
  ok.push(`LM tools · ${declared.size} ↔ ${registered.size}`);
}

// ─── 6 · Views + problemMatchers + taskDefinitions wired ───────────────────
{
  for (const group of Object.values(pkg.contributes?.views ?? {})) {
    for (const view of group) {
      if (!extSrc.includes(`'${view.id}'`)) {
        findings.push(`view DECLARED but never registered: ${view.id}`);
      }
    }
  }
  for (const def of pkg.contributes?.taskDefinitions ?? []) {
    if (!extSrc.includes(`registerTaskProvider('${def.type}'`)) {
      findings.push(`taskDefinition '${def.type}' has NO registered TaskProvider (tasks.json errors)`);
    }
  }
  ok.push('views + taskDefinitions wired');
}

// ─── 7 · Volatile counts in teaching surfaces (projection law) ──────────────
{
  const teaching = ['snippets/nika.code-snippets', 'README.md', 'walkthrough'];
  const volatile = /\b(the\s+)?(13|14|22|26|27|42)\s+(stdlib\s+)?(builtins?|providers?|extract modes?)\b|(builtins?|providers?|extract modes?)\s*\(\s*\d+\s*\)/i;
  for (const rel of teaching) {
    const full = path.join(root, rel);
    const files = fs.statSync(full).isDirectory()
      ? fs.readdirSync(full).map((f) => path.join(full, f))
      : [full];
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        if (volatile.test(line)) {
          findings.push(`volatile count in teaching surface: ${path.relative(root, file)}:${i + 1} → ${line.trim().slice(0, 80)}`);
        }
      });
    }
  }
  // mcpConfig writes .cursor/rules content — same law applies to generated rules.
  const mcp = sources.get('src/mcpConfig.ts') ?? '';
  mcp.split('\n').forEach((line, i) => {
    if (volatile.test(line)) {
      findings.push(`volatile count in GENERATED rules: src/mcpConfig.ts:${i + 1} → ${line.trim().slice(0, 80)}`);
    }
  });
  ok.push('teaching surfaces scanned for volatile counts');
}

// ─── 8 · Activation entry exists after build ────────────────────────────────
{
  const main = pkg.main?.replace(/^\.\//, '');
  if (main && !fs.existsSync(path.join(root, main))) {
    findings.push(`package.json main → ${main} missing (run the build before packaging)`);
  } else {
    ok.push(`main entry present · ${main}`);
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────
for (const line of ok) { console.log(`  ✓ ${line}`); }
if (findings.length === 0) {
  console.log('\nPARITY ✓ — manifest and implementation agree');
  process.exit(0);
}
console.log('');
for (const f of findings) { console.log(`  ✗ ${f}`); }
console.log(`\nPARITY ✗ — ${findings.length} finding${findings.length === 1 ? '' : 's'}`);
process.exit(1);
