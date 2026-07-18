// agentToolsReal.e2e.test.ts — the register the door writes, the REAL
// binary must accept; the stranger it PRESERVES, the binary must judge.
// Positive: a catalog-fed rewrite checks clean. Design proof: a
// preserved unknown ref (`nika:doesnotexist`) is the ENGINE's finding,
// not the picker's guess — the ownership law in one assertion.
// Self-skips without a binary (CELLAR-first).

import { describe, expect, it } from 'vitest';
import { speaksGen1 } from './lspHarness';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { toolsRewrite } from '../core/agentToolsEdit';

const CELLAR = (() => {
  try {
    const base = '/opt/homebrew/Cellar/nika';
    const versions = fs.readdirSync(base).sort();
    return versions.length ? `${base}/${versions[versions.length - 1]}/bin/nika` : undefined;
  } catch { return undefined; }
})();

const BIN = [process.env.NIKA_BIN, CELLAR, 'nika']
  .filter((p): p is string => typeof p === 'string' && p.length > 0)
  .find((bin) => {
    try {
      execFileSync(bin, ['--version'], { timeout: 5000 });
      return true;
    } catch { return false; }
  });

const BASE = [
  'nika: v1',
  'workflow:',
  '  id: agent-register-proof',
  'model: mock/echo',
  'tasks:',
  '  judge:',
  '    agent:',
  '      prompt: "rule on the evidence"',
  '      tools: ["nika:doesnotexist"]',
  '      max_turns: 5',
  '',
].join('\n');

interface Report { clean?: boolean; findings?: Array<{ code?: string }> }

function check(bin: string, text: string): Report {
  try {
    const out = execFileSync(bin, ['check', '-', '--json', '--color', 'never'], {
      input: text,
      timeout: 20000,
    }).toString();
    return JSON.parse(out) as Report;
  } catch (e) {
    const stdout = (e as { stdout?: Buffer }).stdout?.toString() ?? '';
    return stdout.startsWith('{') ? JSON.parse(stdout) as Report : { clean: false };
  }
}

function catalogBares(bin: string): Set<string> {
  const out = execFileSync(bin, ['catalog', '--tools', '--json', '--color', 'never'], {
    timeout: 20000,
  }).toString();
  const doc = JSON.parse(out) as { tools?: Array<{ name?: string; tool?: string }> };
  const bares = (doc.tools ?? [])
    .map((t) => (t.name ?? t.tool ?? '').replace(/^nika:/, ''))
    .filter((s) => s.length > 0);
  return new Set(bares);
}

describe.skipIf(!BIN || !speaksGen1(BIN))('agent register × the real binary', () => {
  it('a catalog-fed rewrite checks clean — and the register reads back', () => {
    const bares = catalogBares(BIN!);
    expect(bares.size).toBeGreaterThan(0);
    expect(bares.has('fetch')).toBe(true);
    // The picker keeps nothing (the stranger is owned? no — unknown
    // refs are NOT owned; drop it by hand here to model the author
    // deleting their typo, then pick two catalog tools).
    const cleaned = BASE.replace('"nika:doesnotexist"', '');
    const next = toolsRewrite(cleaned, 6, 4, ['fetch', 'read'], bares)!;
    expect(next).toContain('      tools: ["nika:fetch", "nika:read"]');
    expect(check(BIN!, next).clean).toBe(true);
  });

  it('the preserved stranger is the ENGINE\'s finding — the ownership law', () => {
    const bares = catalogBares(BIN!);
    // The picker re-picks fetch; the stranger survives verbatim…
    const next = toolsRewrite(BASE, 6, 4, ['fetch'], bares)!;
    expect(next).toContain('"nika:doesnotexist"');
    // …and the engine, not the extension, names the problem.
    const report = check(BIN!, next);
    expect(report.clean).not.toBe(true);
  });
});
