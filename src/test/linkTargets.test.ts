import { describe, expect, it } from 'vitest';
import { PERMITS_LINE_RE, TOOL_RE } from '../core/linkTargets';

describe('the doc-link matchers', () => {
  it('tools match quoted nika:* strings, envelope key never', () => {
    const hits = [...'tool: "nika:read" · "nika:json_merge_patch"'.matchAll(TOOL_RE)].map((m) => m[1]);
    expect(hits).toEqual(['nika:read', 'nika:json_merge_patch']);
    expect([...'nika: v1'.matchAll(TOOL_RE)]).toHaveLength(0);
  });
  it('permits matches the top-level key only', () => {
    expect(PERMITS_LINE_RE.test('permits:')).toBe(true);
    expect(PERMITS_LINE_RE.test('  permits:')).toBe(false);
  });
});
