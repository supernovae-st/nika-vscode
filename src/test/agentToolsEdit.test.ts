import { describe, expect, it } from 'vitest';
import { findAgentTools, ownedRef, toolsRewrite } from '../core/agentToolsEdit';

const CATALOG = new Set(['fetch', 'read', 'write', 'jq']);

const FLOW = `nika: v1
workflow: w
tasks:
  - id: judge
    agent:
      prompt: "rule"
      tools: ["nika:fetch", "mcp:browser/navigate", "nika:fs_*", "nika:doesnotexist"]
      max_turns: 10
`;

const BLOCK = `nika: v1
tasks:
  - id: judge
    agent:
      prompt: "rule"
      tools:
        - "nika:fetch"
        - 'nika:read'
      max_turns: 10
`;

describe('agentToolsEdit (« choose its tools »)', () => {
  it('reads flow and block forms, refs in file order', () => {
    expect(findAgentTools(FLOW.split('\n'), 4, 4)?.refs).toEqual([
      'nika:fetch', 'mcp:browser/navigate', 'nika:fs_*', 'nika:doesnotexist',
    ]);
    const block = findAgentTools(BLOCK.split('\n'), 3, 4);
    expect(block?.refs).toEqual(['nika:fetch', 'nika:read']);
    expect(block).toMatchObject({ line: 5, end: 7 });
  });

  it('an empty list reads as the meaningful default-deny choice', () => {
    const wf = 'tasks:\n  - id: a\n    agent:\n      prompt: "p"\n      tools: []\n';
    expect(findAgentTools(wf.split('\n'), 2, 4)?.refs).toEqual([]);
  });

  it('ownership: catalog nika refs only — globs · MCP · strangers stay the author\'s', () => {
    expect(ownedRef('nika:fetch', CATALOG)).toBe(true);
    expect(ownedRef('nika:fs_*', CATALOG)).toBe(false);
    expect(ownedRef('mcp:browser/navigate', CATALOG)).toBe(false);
    expect(ownedRef('nika:doesnotexist', CATALOG)).toBe(false);
  });

  it('rewrites: keeps author sentences verbatim, appends new picks, drops unpicked owned', () => {
    const next = toolsRewrite(FLOW, 4, 4, ['read', 'jq'], CATALOG)!;
    // fetch (owned · unpicked) drops; mcp + glob + stranger survive; read/jq append.
    expect(next).toContain('      tools: ["mcp:browser/navigate", "nika:fs_*", "nika:doesnotexist", "nika:read", "nika:jq"]');
    expect(next).toContain('max_turns: 10');
  });

  it('a re-picked owned ref keeps its place (minimal diff)', () => {
    const next = toolsRewrite(FLOW, 4, 4, ['fetch'], CATALOG)!;
    expect(next).toContain('      tools: ["nika:fetch", "mcp:browser/navigate", "nika:fs_*", "nika:doesnotexist"]');
  });

  it('block lists collapse to the flow form — one line, one undo', () => {
    const next = toolsRewrite(BLOCK, 3, 4, ['fetch'], CATALOG)!;
    expect(next).toContain('      tools: ["nika:fetch"]');
    expect(next).not.toContain("- 'nika:read'");
  });

  it('an empty pick with no author refs writes tools: [] — least privilege, never removal', () => {
    const wf = 'tasks:\n  - id: a\n    agent:\n      prompt: "p"\n      tools: ["nika:fetch"]\n';
    const next = toolsRewrite(wf, 2, 4, [], CATALOG)!;
    expect(next).toContain('      tools: []');
  });

  it('refuses a moved anchor and exotic forms', () => {
    expect(toolsRewrite(FLOW, 5, 4, ['read'], CATALOG)).toBeUndefined();
    const exotic = 'tasks:\n  - id: a\n    agent:\n      prompt: "p"\n      tools: something\n';
    expect(toolsRewrite(exotic, 2, 4, ['read'], CATALOG)).toBeUndefined();
  });
});
