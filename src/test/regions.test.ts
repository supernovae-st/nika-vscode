import { describe, expect, it } from 'vitest';
import { parseRegions } from '../core/regions';

const WF = `nika: v1
workflow:
  id: probe
model: mock/echo
tasks:
  setup:
    exec:
      command: "echo start"

  # nika:region Gather
  fetch_a:
    invoke:
      tool: "nika:fetch"
      args:
        url: https://a.example
  fetch_b:
    invoke:
      tool: "nika:fetch"
      args:
        url: https://b.example

  #   nika:region  Summarize
  summarize:
    after: { fetch_a: succeeded, fetch_b: succeeded }
    infer:
      prompt: "Merge."
`;

describe('parseRegions', () => {
  it('returns nothing when no markers exist', () => {
    expect(parseRegions(WF.replace(/# {0,3}nika:region.*\n/g, ''))).toEqual([]);
  });

  it('groups tasks under the last preceding marker; pre-marker tasks belong to none', () => {
    const regions = parseRegions(WF);
    expect(regions).toEqual([
      { name: 'Gather', taskIds: ['fetch_a', 'fetch_b'] },
      { name: 'Summarize', taskIds: ['summarize'] },
    ]);
    // `setup` precedes every marker → in no region.
    expect(regions.flatMap((r) => r.taskIds)).not.toContain('setup');
  });

  it('tolerates loose whitespace in the marker', () => {
    expect(parseRegions('#nika:region Tight\ntasks:\n  a:\n    exec: { command: x }\n')[0]?.name)
      .toBe('Tight');
    expect(parseRegions('   #  nika:region   Spaced Name  \ntasks:\n  a:\n    exec: { command: x }\n')[0]?.name)
      .toBe('Spaced Name');
  });

  it('drops an empty region (no task follows the marker)', () => {
    const trailing = `nika: v1
tasks:
  a:
    exec: { command: x }
  # nika:region Empty
`;
    expect(parseRegions(trailing)).toEqual([]);
  });

  it('keeps two regions with the same label distinct', () => {
    const dup = `nika: v1
tasks:
  # nika:region Loop
  a:
    exec: { command: x }
  # nika:region Loop
  b:
    exec: { command: y }
`;
    expect(parseRegions(dup)).toEqual([
      { name: 'Loop', taskIds: ['a'] },
      { name: 'Loop', taskIds: ['b'] },
    ]);
  });
});
