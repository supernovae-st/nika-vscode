import { describe, it, expect } from 'vitest';
import { damerau, didYouMean } from '../core/graphIntel';
import { collectShapes, fieldsAt, renderShape, shapeAt } from '../core/schemaShape';

// ─── damerau did-you-mean ────────────────────────────────────────────────────

describe('damerau + didYouMean', () => {
  it('computes OSA distances incl. transposition', () => {
    expect(damerau('fetch', 'fetch')).toBe(0);
    expect(damerau('fethc', 'fetch')).toBe(1);  // transposition
    expect(damerau('fetc', 'fetch')).toBe(1);   // deletion
    expect(damerau('feetch', 'fetch')).toBe(1); // insertion
    expect(damerau('fatch', 'fetch')).toBe(1);  // substitution
  });

  it('early-exits past the band', () => {
    expect(damerau('completely', 'different', 2)).toBe(Infinity);
    expect(damerau('ab', 'abcdef', 2)).toBe(Infinity); // length gap > max
  });

  it('suggests the nearest task id, none past distance 2', () => {
    const ids = ['fetch_page', 'summarize', 'gate', 'ship'];
    expect(didYouMean('fetch_pgae', ids)).toBe('fetch_page'); // transposition
    expect(didYouMean('sumarize', ids)).toBe('summarize');
    expect(didYouMean('totally_else', ids)).toBeUndefined();
    expect(didYouMean('gate', ids)).toBeUndefined(); // exact match = no suggestion
  });
});

// ─── schema shape propagation ────────────────────────────────────────────────

const DOC = [
  'nika: v1',
  'workflow:',
  '  id: shapes',
  'model: mock/echo',
  '',
  'tasks:',
  '  extract:',
  '    infer:',
  '      prompt: "extract the article"',
  '      schema:',
  '        type: object',
  '        properties:',
  '          title:',
  '            type: string',
  '          tags:',
  '            type: array',
  '            items: { type: string }',
  '          meta:',
  '            type: object',
  '            properties:',
  '              author:',
  '                type: string',
  '        required: [title]',
  '',
  '  use:',
  '    with:',
  '      title: ${{ tasks.extract.output.title }}',
  '    infer:',
  '      prompt: "use ${{ with.title }}"',
].join('\n');

describe('schemaShape', () => {
  it('parses the declared schema into a shape tree', () => {
    const shapes = collectShapes(DOC);
    const extract = shapes.get('extract')!;
    expect(extract.type).toBe('object');
    expect([...extract.properties!.keys()]).toEqual(['title', 'tags', 'meta']);
    expect(extract.properties!.get('tags')!.items!.type).toBe('string');
    expect(extract.required?.has('title')).toBe(true);
    expect(shapes.has('use')).toBe(false); // no schema declared
  });

  it('walks dotted paths incl. array indices', () => {
    const extract = collectShapes(DOC).get('extract')!;
    expect(shapeAt(extract, ['title'])?.type).toBe('string');
    expect(shapeAt(extract, ['meta', 'author'])?.type).toBe('string');
    expect(shapeAt(extract, ['tags', '0'])?.type).toBe('string');
    expect(shapeAt(extract, ['nope'])).toBeUndefined();
  });

  it('lists typed completion fields at a path', () => {
    const extract = collectShapes(DOC).get('extract')!;
    const top = fieldsAt(extract, []);
    expect(top.map((f) => f.name)).toEqual(['title', 'tags', 'meta']);
    expect(top.find((f) => f.name === 'title')).toMatchObject({ type: 'string', required: true });
    expect(fieldsAt(extract, ['meta']).map((f) => f.name)).toEqual(['author']);
  });

  it('renders a hover-grade one-liner', () => {
    const extract = collectShapes(DOC).get('extract')!;
    expect(renderShape(extract)).toBe('{ title: string, tags?: string[], meta?: { author?: string } }');
  });

  it('never throws on half-written schemas (the user is typing)', () => {
    const broken = DOC.replace('type: object', 'type:').replace('required: [title]', 'required: [');
    expect(() => collectShapes(broken)).not.toThrow();
  });
});
