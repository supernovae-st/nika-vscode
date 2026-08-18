// The grammar's KEYWORD ALTERNATIONS, asserted.
//
// The only grammar assertion this repo ever had (verbColors.test.ts) checked
// four verb SCOPES — the two alternations that decide which words the editor
// colours (top-level keys · task fields) were asserted by nothing. A grammar
// is a teaching surface: a word it paints reads to an author as a word the
// language has. So the dead-form nuke of 2026-08-12 could have left `workflow:`
// and `on_finally:` coloured forever and every gate would have stayed green.
//
// These assertions are EXACT SET equality against the spec at SPEC_PIN, plus a
// tombstone sweep over the whole file. Adding a dead word back — anywhere —
// reds this suite.
import fs from 'fs';
import { describe, expect, it } from 'vitest';

const GRAMMAR_PATH = 'syntaxes/nika.tmLanguage.json';
const raw = fs.readFileSync(GRAMMAR_PATH, 'utf8');

type Rule = {
  match?: string;
  patterns?: Rule[];
  captures?: Record<string, { patterns?: Rule[] }>;
};
const grammar = JSON.parse(raw) as { repository: Record<string, Rule> };

/** The alternatives of the FIRST `(a|b|c)` group in a rule's match. */
function alternation(match: string | undefined): string[] {
  const group = (match ?? '').match(/\(([a-z_|]+)\)/);
  return group ? group[1]!.split('|') : [];
}

function ruleAlternation(id: string): string[] {
  return alternation(grammar.repository[id]?.match);
}

function nestedAlternation(id: string, index: number): string[] {
  return alternation(grammar.repository[id]?.patterns?.[index]?.match);
}

describe('the grammar paints the living language, and only it', () => {
  // spec/01-envelope.md §Full envelope · the 9 keys.
  it('the top-level keys are exactly the 9 of the envelope', () => {
    const required = nestedAlternation('top-level-keys', 0);
    const optional = nestedAlternation('top-level-keys', 1);
    expect([...required, ...optional].sort()).toEqual(
      ['const', 'inputs', 'model', 'nika', 'outputs', 'permits', 'run', 'secrets', 'tasks'].sort(),
    );
    // `nika:` and `tasks:` are the required pair — they read as keywords.
    expect(required.sort()).toEqual(['nika', 'tasks']);
  });

  // spec/03-dag.md §Task shape · full + §v1 ships with these task fields.
  it('the task fields are exactly the ones v1 ships', () => {
    expect(ruleAlternation('task-fields').sort()).toEqual(
      [
        'after',
        'for_each',
        'group',
        'lift',
        'on_error',
        'output',
        'retry',
        'returns',
        'timeout',
        'when',
        'with',
      ].sort(),
    );
  });

  // spec/03-dag.md — the predicate set, `unwind` included: cleanup is a task
  // on an edge now, so the predicate that carries it must colour like one.
  it('the after: predicates are the closed set of 5, unwind included', () => {
    const predicates = alternation(
      grammar.repository['after-line']?.captures?.['4']?.patterns?.[0]?.match,
    );
    expect(predicates.sort()).toEqual(
      ['failure', 'skipped', 'success', 'terminal', 'unwind'].sort(),
    );
  });

  // `max_parallel` / `fail_fast` are sub-fields of `for_each` now, never task
  // fields — the grammar must place them where the language does.
  it('the fan-out knobs are sub-fields, never task fields', () => {
    const subFields = ruleAlternation('block-sub-fields');
    expect(subFields).toContain('max_parallel');
    expect(subFields).toContain('fail_fast');
    expect(subFields).toContain('items');
    const taskFields = ruleAlternation('task-fields');
    expect(taskFields).not.toContain('max_parallel');
    expect(taskFields).not.toContain('fail_fast');
  });

  // The lift door is the ONE construct that opens a named law — an author who
  // never sees it coloured never learns it exists.
  it('the lift door and its parameters are painted', () => {
    expect(ruleAlternation('task-fields')).toContain('lift');
    const subFields = ruleAlternation('block-sub-fields');
    expect(subFields).toContain('law');
    expect(subFields).toContain('because');
    expect(subFields).toContain('from');
  });

  // on_error is 2 modes, not 3 — `fail_workflow` was removed 2026-08-11.
  it('on_error carries its two modes and no third', () => {
    const subFields = ruleAlternation('block-sub-fields');
    expect(subFields).toContain('recover');
    expect(subFields).toContain('skip');
  });
});

describe('the tombstones stay buried', () => {
  // Every form the envelope nuke killed. A grammar that still matches one of
  // these paints it as language — the exact way an extension teaches a form
  // that no engine accepts. Read over the WHOLE file: a dead word smuggled
  // into any rule, alternation or not, reds here.
  const TOMBSTONES = [
    'workflow', // the envelope key · `invoke: {workflow:}` is another key, task-level
    'on_finally',
    'fail_workflow',
    'declassify',
    'inert',
    'vars',
    'config',
    'types',
    'policy',
    'prefer',
    'optimize',
    'description',
    'provider',
    'schema',
    'trust',
    'structured',
    'guardrails',
    'decompose',
    'routing',
    'preset',
    'concurrency',
    'context_budget',
    'artifact',
    'orchestrate',
    'agents',
    'artifacts',
    'skills',
    'include',
    'pkg',
    'goal',
  ];

  // Some lines name something OTHER than the language, and a word landing
  // there paints nothing. Four classes, each with its reason:
  //   `"$schema"`            the file's own JSON-Schema URL
  //   `workflow-name.nika`   a capture SCOPE name, not a painted key
  //   `provider-name.nika`   same class — it scopes the vendor half of a
  //                          model id (`anthropic` in `anthropic/claude-x`),
  //                          which is a live value, not the dead `provider:`
  //                          envelope key
  //   `"include":`           TextMate's OWN structural key (a rule pointing
  //                          at another rule). It is in every grammar ever
  //                          written and has nothing to do with nika's dead
  //                          `include:`.
  // Everything else is fair game — a dead word smuggled into any match,
  // alternation or not, reds here.
  const body = raw
    .split('\n')
    .filter(
      (line) =>
        !line.includes('"$schema"') &&
        !line.includes('workflow-name.nika') &&
        !line.includes('provider-name.nika') &&
        !line.trimStart().startsWith('"include":'),
    )
    .join('\n');

  it.each(TOMBSTONES)('never paints `%s`', (word) => {
    expect(new RegExp(`\\b${word}\\b`).test(body)).toBe(false);
  });
});
