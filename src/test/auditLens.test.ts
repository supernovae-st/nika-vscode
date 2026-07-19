// auditLens.test.ts — the moat lens's pure derive (L3 slice 1).
//
// Laws: grants group into the four audit domains (unknown prefixes
// ignored, never guessed) · a task lands ONCE per domain however many
// grants it holds · egress hosts and programs are named · the banner
// reads egress-first and stays honest about UNBOUNDED cost · the hull
// is a correct convex hull (the canvas pads it).

import { describe, it, expect } from 'vitest';
import { convexHull, deriveAuditFacts, domainOf } from '../core/auditLens';

describe('domainOf — the grant grammar, engine-owned', () => {
  it('maps the four families and refuses to guess the rest', () => {
    expect(domainOf('exec: git')).toBe('exec');
    expect(domainOf('fs.write: RELEASE_NOTES.md')).toBe('fs');
    expect(domainOf('fs.read: ./data')).toBe('fs');
    expect(domainOf('net.http: example.com')).toBe('net');
    expect(domainOf('tool: nika:write')).toBe('tool');
    expect(domainOf('quantum: flux')).toBeUndefined();
  });
});

describe('deriveAuditFacts', () => {
  const nodes = [
    { id: 'history', permits: ['exec: git'] },
    { id: 'stats', permits: ['exec: git', 'exec: sh'] },
    { id: 'fetch', permits: ['net.http: example.com', 'tool: nika:fetch'] },
    { id: 'notes', permits: ['fs.write: RELEASE_NOTES.md', 'tool: nika:write'] },
    { id: 'pure', permits: [] },
  ];

  it('groups tasks per domain — once each, insertion order', () => {
    const facts = deriveAuditFacts(nodes);
    expect(facts.domains.get('exec')).toEqual(['history', 'stats']);
    expect(facts.domains.get('net')).toEqual(['fetch']);
    expect(facts.domains.get('fs')).toEqual(['notes']);
    expect(facts.domains.get('tool')).toEqual(['fetch', 'notes']);
  });

  it('names egress hosts and programs; the banner reads egress-first', () => {
    const facts = deriveAuditFacts(nodes, { min: 0.001, max: 0.006, unbounded: false });
    expect(facts.hosts).toEqual(['example.com']);
    expect(facts.programs).toEqual(['git', 'sh']);
    expect(facts.banner.startsWith('reaches example.com')).toBe(true);
    expect(facts.banner).toContain('est $0.0010–$0.0060');
  });

  it('a capability-free file says so, and UNBOUNDED stays a floor', () => {
    const facts = deriveAuditFacts([{ id: 'a', permits: [] }], { min: 0, max: 0, unbounded: true });
    expect(facts.banner).toContain('no declared capabilities');
    expect(facts.banner).toContain('est ≥$0.0000 (UNBOUNDED');
  });
});

describe('convexHull — monotone chain', () => {
  it('drops interior points and keeps the ring', () => {
    const hull = convexHull([[0, 0], [4, 0], [4, 4], [0, 4], [2, 2], [1, 3]]);
    expect(hull).toHaveLength(4);
    expect(hull).toEqual(expect.arrayContaining([[0, 0], [4, 0], [4, 4], [0, 4]]));
  });

  it('degenerates pass through untouched (the caller paints them)', () => {
    expect(convexHull([[1, 1]])).toEqual([[1, 1]]);
    expect(convexHull([[1, 1], [2, 2]])).toEqual([[1, 1], [2, 2]]);
  });
});
