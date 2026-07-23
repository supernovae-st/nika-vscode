// schemaDoor.test.ts — the 0.105 fold: `schema` died, `spec --schema` rules.
//
// The regression this pins: gating schema intel on the retired `schema`
// verb alone left every 0.105 binary without completions/hover intel and
// a dark `Open Embedded JSON Schema` — the correct fallback chain existed
// but sat behind a dead outer gate.
import { describe, expect, it } from 'vitest';
import { hasSchemaDoor, parseHelpCommands } from '../core/capabilities';

const HELP_0105 = [
  'Commands:',
  '  check        Audit a workflow BEFORE it runs',
  '  spec         The embedded spec identity (`--canon` prints the SSOT)',
  '  catalog      The embedded provider/model catalog',
  '',
  'Options:',
].join('\n');

const HELP_LEGACY = [
  'Commands:',
  '  check        Audit a workflow',
  '  schema       Print the JSON Schema',
  '',
  'Options:',
].join('\n');

describe('hasSchemaDoor (the consolidated-binary gate)', () => {
  it('a 0.105-shaped help (spec · no schema verb) opens the door', () => {
    const commands = parseHelpCommands(HELP_0105);
    expect(commands.has('schema')).toBe(false);
    expect(hasSchemaDoor({ spec: commands.has('spec'), schema: commands.has('schema') })).toBe(true);
  });

  it('a legacy help (schema verb · no spec) keeps the door open', () => {
    const commands = parseHelpCommands(HELP_LEGACY);
    expect(hasSchemaDoor({ spec: commands.has('spec'), schema: commands.has('schema') })).toBe(true);
  });

  it('neither verb — the door stays shut', () => {
    expect(hasSchemaDoor({ spec: false, schema: false })).toBe(false);
  });
});
