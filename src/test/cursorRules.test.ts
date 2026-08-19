// cursorRules.test.ts — the AI-assistant rules teach the nine keys.
//
// This text is written into every user workspace and read by every
// model before it writes a workflow: a dead form here is repeated at
// scale. The test pins the live vocabulary, bans the dead one, and
// proves the refresh law (a stale copy WE wrote is rewritten · a user's
// own file never is).

import { describe, expect, it } from 'vitest';
import { RULES_STAMP, RULES_TEACHES, buildCursorRules, shouldRewriteRules } from '../core/cursorRules';

const RULES = buildCursorRules({ cloud: ['mistral', 'openai'], local: ['ollama'], test: ['mock'] });

describe('cursor rules · the nine-key envelope', () => {
  it('teaches the identity line and the nine keys, dated to the engine it ships with', () => {
    expect(RULES).toContain(RULES_STAMP);
    expect(RULES_TEACHES).toBe('nika 0.109');
    expect(RULES).toContain('`nika` · `model` · `inputs` · `const` · `secrets` · `permits` · `run` · `tasks` · `outputs`');
    expect(RULES).toContain('nika: <kebab-id>');
  });

  it('names exactly three value authorities and puts config where it went', () => {
    expect(RULES).toContain('THREE value authorities');
    expect(RULES).toMatch(/\$\{\{ inputs\.x \}\}.*\$\{\{ const\.x \}\}.*\$\{\{ secrets\.x \}\}/);
    expect(RULES).toContain('required: false and a default:');
    // config appears ONLY as a dead form being taught away.
    for (const line of RULES.split('\n')) {
      if (line.includes('config')) { expect(line, line).toMatch(/DEAD|died|dead/); }
    }
  });

  it('carries no dead form as a live teaching', () => {
    expect(RULES).not.toMatch(/Envelope: `nika: v1`/);
    expect(RULES).not.toMatch(/frozen forever/);
    expect(RULES).not.toMatch(/FOUR value authorities|four authorities|6 namespaces/);
    expect(RULES).not.toMatch(/on_finally\/|\/on_finally/); // the boundary list no longer names it
    expect(RULES).not.toMatch(/^- output:/m);
    expect(RULES).toContain('extract:');
    expect(RULES).toContain('unwind');
    expect(RULES).toContain('there is no fail_workflow');
  });

  it('every dead envelope key it names is named as dead (teach the refusal, never the form)', () => {
    for (const dead of ['config:', 'vars:', 'env:', 'on_finally:', 'policy:', 'types:', 'assert:', 'workflow:', 'depends_on']) {
      const lines = RULES.split('\n').filter((l) => l.includes(dead));
      expect(lines.length, `${dead} must be taught as dead`).toBeGreaterThan(0);
      for (const l of lines) { expect(l, l).toMatch(/dead|DEAD|died|Never|never|no `/i); }
    }
  });

  it('points at the canon when no provider intel is available', () => {
    expect(buildCursorRules()).toContain('nika spec --canon');
  });
});

describe('cursor rules · the refresh law', () => {
  it('rewrites a file this extension generated at an older language', () => {
    const stale = [
      '---', 'description: Nika workflow language rules for AI assistance', '---', '',
      '# Nika Workflow Language', '',
      'Envelope: `nika: v1` (always · frozen forever). Extension: .nika.yaml.',
    ].join('\n');
    expect(shouldRewriteRules(stale)).toBe(true);
  });

  it('leaves the current generation alone', () => {
    expect(shouldRewriteRules(RULES)).toBe(false);
  });

  it('never touches a file the user wrote (no generated header)', () => {
    expect(shouldRewriteRules('# My team rules\n- always run nika check\n')).toBe(false);
  });
});
