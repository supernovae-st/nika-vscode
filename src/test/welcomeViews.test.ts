// welcomeViews.test.ts — the viewsWelcome state MATRIX, provable
// (annexe A #6 · V1.2).
//
// The law: every journey state has a welcome with a discriminated
// cause; the no-workspace and folder-without-workflows states are told
// apart by `workspaceFolderCount`; the Create-Workflow state carries
// exactly ONE button (a command link alone on its line); no welcome
// carries color emoji (the glyph registry V0.e — DESIGN.md §2b law 1).

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface WelcomeEntry { view: string; when?: string; contents: string }

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf-8'),
) as { contributes: { viewsWelcome: WelcomeEntry[] } };

const welcomes = pkg.contributes.viewsWelcome;
const forView = (view: string): WelcomeEntry[] => welcomes.filter((w) => w.view === view);

/** Lines that are a single command link — VS Code renders these as buttons. */
const buttonLines = (contents: string): string[] =>
  contents.split('\n').filter((line) => /^\[[^\]]+\]\(command:[^)]+\)$/.test(line.trim()));

describe('viewsWelcome — the state matrix', () => {
  it('nikaWorkflows covers all five discriminated states', () => {
    const whens = forView('nikaWorkflows').map((w) => w.when);
    expect(whens).toContain("nika.journey == 'noBinary'");
    expect(whens).toContain("nika.journey == 'unequipped'");
    expect(whens).toContain("nika.journey == 'empty' && workspaceFolderCount == 0");
    expect(whens).toContain("nika.journey == 'empty' && workspaceFolderCount != 0");
    expect(whens).toContain("nika.journey == 'working'");
    // The old catch-all is gone — every state is deliberate.
    expect(whens.some((w) => w?.includes('!='), )).toBe(true);
    expect(whens).not.toContain("nika.journey != 'noBinary' && nika.journey != 'unequipped'");
  });

  it('no-workspace: names the cause, ONE primary button (Open Folder)', () => {
    const entry = forView('nikaWorkflows')
      .find((w) => w.when === "nika.journey == 'empty' && workspaceFolderCount == 0");
    expect(entry).toBeDefined();
    expect(entry?.contents).toContain('No folder is open');
    const buttons = buttonLines(entry?.contents ?? '');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toContain('workbench.action.files.openFolder');
  });

  it('folder without workflows: names the cause, Create Workflow is THE one button', () => {
    const entry = forView('nikaWorkflows')
      .find((w) => w.when === "nika.journey == 'empty' && workspaceFolderCount != 0");
    expect(entry).toBeDefined();
    expect(entry?.contents).toContain('No workflows here yet');
    const buttons = buttonLines(entry?.contents ?? '');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toContain('[Create Workflow](command:nika.newWorkflow)');
  });

  it('engine absent: install button + sovereign install docs (brew · source)', () => {
    const entry = forView('nikaWorkflows').find((w) => w.when === "nika.journey == 'noBinary'");
    expect(entry?.contents).toContain('not on this machine yet');
    expect(buttonLines(entry?.contents ?? '')[0]).toContain('nika.finishSetup');
    expect(entry?.contents).toContain('https://github.com/supernovae-st/homebrew-tap');
    expect(entry?.contents).toContain('https://github.com/supernovae-st/nika#installation');
  });

  it('no welcome state carries color emoji (the glyph registry is mono)', () => {
    // Every viewsWelcome, every view — the legacy CTA emoji died with the
    // glyph registry (DESIGN.md §2b law 1: zero color emoji in the mono
    // registry); this pins the whole surface, not just the V1.2 states.
    for (const entry of welcomes) {
      expect(entry.contents).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });

  it('every nikaWorkflows welcome names a CTA (no dead-end state)', () => {
    for (const entry of forView('nikaWorkflows')) {
      expect(buttonLines(entry.contents).length).toBeGreaterThanOrEqual(1);
    }
  });
});
