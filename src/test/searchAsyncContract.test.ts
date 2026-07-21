// searchAsyncContract.test.ts · the async gate's structural laws, as
// source belts (the yieldMapping idiom — the keys are the contract).
//
// Three laws a runtime test cannot hold cheaply:
//   1 · ONE SCAN — the workflow findFiles literal lives in exactly one
//       file (features/workflowIndex): the consolidation can never
//       silently un-consolidate.
//   2 · NEVER AT THE KEYSTROKE — the door's onDidChangeValue handler
//       is `render` alone; the async families are fetched ONCE per
//       open (annexe-AA risk ④: a scan tied to typing).
//   3 · THE CURRENT Q — each landing re-renders with qp.value (what
//       the hand typed while the scan ran), never the seed.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKFLOW_GLOB } from '../core/workflowScan';

const SRC = join(__dirname, '..');

/** Every production source — the test trees are quoting surfaces. */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'test' || name === 'test-integration') { continue; }
      walk(p, out);
    } else if (p.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

describe('law 1 · one scan (the consolidation ratchet)', () => {
  const needle = `findFiles(${JSON.stringify(WORKFLOW_GLOB).replace(/"/g, "'")}`;

  it('the workflow findFiles literal survives in exactly ONE file', () => {
    const holders = walk(SRC)
      .filter((p) => readFileSync(p, 'utf-8').includes(needle))
      .map((p) => p.slice(SRC.length + 1));
    expect(holders).toEqual(['features/workflowIndex.ts']);
  });

  it('and that one file scans it exactly once, with the model constant as the literal', () => {
    const text = readFileSync(join(SRC, 'features', 'workflowIndex.ts'), 'utf-8');
    expect(text.match(/findFiles\(/g)).toHaveLength(1);
    // The door-ids idiom: the literal IS the constant — grep-able AND
    // pinned, so neither can drift alone.
    expect(text).toContain(needle);
    expect(WORKFLOW_GLOB).toBe('**/*.nika.yaml');
  });
});

describe('law 2 · never at the keystroke', () => {
  const door = readFileSync(join(SRC, 'features', 'searchGate.ts'), 'utf-8');

  it('onDidChangeValue is wired to render alone — typing re-renders, never re-scans', () => {
    // Call sites, not prose: the header comment may NAME the law.
    expect(door.match(/\.onDidChangeValue\(/g)).toHaveLength(1);
    expect(door).toContain('qp.onDidChangeValue(render);');
  });

  it('each async family is fetched exactly once per open', () => {
    expect(door.match(/families\.workflows\(\)/g)).toHaveLength(1);
    expect(door.match(/families\.runs\(\)/g)).toHaveLength(1);
  });

  it('busy rides the QuickPick while the families load', () => {
    expect(door).toContain('qp.busy = true;');
    expect(door).toContain('qp.busy = false;');
  });
});

describe('law 3 · the landing re-ranks with the CURRENT query', () => {
  it('the append path renders qp.value, never the seed', () => {
    const door = readFileSync(join(SRC, 'features', 'searchGate.ts'), 'utf-8');
    expect(door).toContain('render(qp.value);');
  });
});
