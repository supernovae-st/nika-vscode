import { describe, expect, it } from 'vitest';
import { SCHEMA_SHAPES, schemaInsert, verbHasSchema, verbTakesSchema } from '../core/schemaEdit';

const WF = `nika: v1
workflow: w
tasks:
  - id: gather
    infer:
      prompt: "collect"
  - id: judge
    agent:
      prompt: "rule"
      tools: ["nika:read"]
      schema:
        type: object
  - id: build
    exec:
      command: "make"
`;

const lines = WF.split('\n');
const fields = SCHEMA_SHAPES[0];

describe('schemaEdit (« type its output »)', () => {
  it('only infer and agent carry a schema', () => {
    expect(verbTakesSchema('infer')).toBe(true);
    expect(verbTakesSchema('agent')).toBe(true);
    expect(verbTakesSchema('exec')).toBe(false);
    expect(verbTakesSchema('invoke')).toBe(false);
  });

  it('sees the schema an agent already carries — and the infer that lacks one', () => {
    expect(verbHasSchema(lines, 4, 4)).toBe(false);  // gather's infer:
    expect(verbHasSchema(lines, 8, 4)).toBe(true);   // judge's agent:
  });

  it('appends the shape at the end of the verb block, child-indented', () => {
    const ins = schemaInsert(WF, 4, 'infer', fields);
    expect(ins).toBeDefined();
    expect(ins!.atLine).toBe(6); // right after prompt:, before `- id: judge`
    expect(ins!.text.startsWith('      schema:')).toBe(true);
    expect(ins!.text).toContain('        type: object');
    expect(ins!.text.endsWith('\n')).toBe(true);
  });

  it('every proven shape is a top-level object (the portable form)', () => {
    for (const shape of SCHEMA_SHAPES) {
      expect(shape.body.startsWith('schema:')).toBe(true);
      expect(shape.body).toContain('type: object');
    }
  });

  it('refuses a second schema, a schema-less verb, and a moved anchor', () => {
    expect(schemaInsert(WF, 8, 'agent', fields)).toBeUndefined();  // already typed
    expect(schemaInsert(WF, 13, 'exec', fields)).toBeUndefined();  // exec never
    expect(schemaInsert(WF, 5, 'infer', fields)).toBeUndefined();  // anchor moved
    expect(schemaInsert(WF, 4, 'agent', fields)).toBeUndefined();  // wrong verb
  });
});
