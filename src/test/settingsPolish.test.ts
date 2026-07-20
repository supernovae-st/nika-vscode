// settingsPolish.test.ts — the settings surface ratchet (annexe A #15).
//
// The law: every setting carries an `order` (the page reads as grouped
// ranks, not registration order) · every enum teaches per-value
// (`enumDescriptions` — the Error Lens bar) · every description names a
// CONSEQUENCE, not just the switch (mechanical floor: prose length).

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Prop {
  type?: string;
  enum?: string[];
  enumDescriptions?: string[];
  order?: number;
  description?: string;
  markdownDescription?: string;
  additionalProperties?: { enum?: string[] };
}

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf-8'),
) as { contributes: { configuration: { properties: Record<string, Prop> } } };

const props = pkg.contributes.configuration.properties;
const entries = Object.entries(props);

describe('contributes.configuration — the polish ratchet', () => {
  it('has the full surface under test (drift guard)', () => {
    expect(entries.length).toBeGreaterThanOrEqual(27);
  });

  it('every setting carries an order rank', () => {
    for (const [key, prop] of entries) {
      expect(typeof prop.order, `${key} misses order`).toBe('number');
    }
  });

  it('order ranks are unique — two settings never fight for a slot', () => {
    const orders = entries.map(([, p]) => p.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('every top-level enum carries per-value enumDescriptions', () => {
    for (const [key, prop] of entries) {
      if (!Array.isArray(prop.enum)) { continue; }
      expect(Array.isArray(prop.enumDescriptions), `${key} misses enumDescriptions`).toBe(true);
      expect(prop.enumDescriptions).toHaveLength(prop.enum.length);
      for (const d of prop.enumDescriptions ?? []) {
        expect(d.length).toBeGreaterThan(10);
      }
    }
  });

  it('every setting explains itself — a description or markdownDescription with substance', () => {
    for (const [key, prop] of entries) {
      const text = prop.markdownDescription ?? prop.description ?? '';
      expect(text.length, `${key} description too thin to name a consequence`).toBeGreaterThan(40);
    }
  });

  it('cross-links resolve: every #nika.x# names a real sibling setting', () => {
    const keys = new Set(Object.keys(props));
    for (const [key, prop] of entries) {
      const text = prop.markdownDescription ?? '';
      for (const m of text.matchAll(/#(nika\.[a-zA-Z.]+)#/g)) {
        expect(keys.has(m[1]), `${key} links to phantom ${m[1]}`).toBe(true);
      }
    }
  });
});
