import { describe, expect, it } from 'vitest';
import { ARMOR_SHAPES, armorWrite, wornArmor } from '../core/armorEdit';
import { findTaskKey, type TaskRange } from '../core/flowEdit';

const WF = `nika: v1
workflow:
  id: w
tasks:
  fetch_data:
    after: { gather: succeeded }
    when: \${{ vars.live }}
    invoke:
      tool: "nika:fetch"
      args:
        url: "https://api.example.com"
  armored:
    retry:
      max_attempts: 5
      backoff_ms: 200
    on_error:
      skip: true
    timeout: "30s"
    exec:
      command: ["true"]
  gather:
    infer:
      prompt: "a"
`;

const FETCH: TaskRange = { id: 'fetch_data', line: 4, endLine: 10, after: { gather: 'succeeded' }, producers: ['gather'] };
const ARMORED: TaskRange = { id: 'armored', line: 11, endLine: 19, after: {}, producers: [] };

describe('armorEdit (« make it resilient »)', () => {
  it('the register carries the spec\'s three walls (four shapes)', () => {
    expect(ARMOR_SHAPES.map((s) => `${s.id}→${s.key}`)).toEqual([
      'retry→retry', 'recover→on_error', 'skip→on_error', 'timeout→timeout',
    ]);
  });

  it('wornArmor sees block-map keys — findTaskKey covers map children', () => {
    const lines = WF.split('\n');
    expect(wornArmor(lines, FETCH)).toEqual(new Set());
    expect(wornArmor(lines, ARMORED)).toEqual(new Set(['retry', 'on_error', 'timeout']));
    // The block-map extent: retry: spans its two fields.
    expect(findTaskKey(lines, ARMORED, 'retry')).toMatchObject({ line: 12, end: 14 });
  });

  it('retry inserts after when: — the canonical order, spec-exact fields', () => {
    const next = armorWrite(WF, FETCH, 'retry')!;
    const lines = next.split('\n');
    expect(lines[7]).toBe('    retry:');
    expect(lines[8]).toContain('max_attempts: 3');
    expect(lines[9]).toContain('backoff_ms: 1000');
    expect(lines[6]).toContain('when:');
  });

  it('recover writes the ref it was given — or the literal SLOT', () => {
    const withRef = armorWrite(WF, FETCH, 'recover', '${{ tasks.gather.output }}')!;
    expect(withRef).toContain('      recover: ${{ tasks.gather.output }}');
    const literal = armorWrite(WF, FETCH, 'recover')!;
    expect(literal).toContain('recover: ""   # SLOT: a literal');
  });

  it('skip and timeout write their spec forms', () => {
    expect(armorWrite(WF, FETCH, 'skip')).toContain('      skip: true');
    expect(armorWrite(WF, FETCH, 'timeout')).toContain('    timeout: "60s"');
  });

  it('refuses to re-armor a worn wall — tuned by hand, never blind-rewritten', () => {
    expect(armorWrite(WF, ARMORED, 'retry')).toBeUndefined();
    expect(armorWrite(WF, ARMORED, 'recover')).toBeUndefined();
    expect(armorWrite(WF, ARMORED, 'skip')).toBeUndefined();
  });

  it('timeout on the armored task replaces in place (taskKeyRewrite path)', () => {
    // timeout is inline — the rewrite path replaces rather than refusing.
    const next = armorWrite(WF, ARMORED, 'timeout')!;
    expect(next).toContain('    timeout: "60s"');
    expect(next).not.toContain('"30s"');
  });
});
