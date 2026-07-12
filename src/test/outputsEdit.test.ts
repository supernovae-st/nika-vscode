import { describe, expect, it } from 'vitest';
import { findOutputsBlock, outputsRewrite, parseOutputs } from '../core/outputsEdit';

const WITH_BLOCK = `nika: v1
workflow: w
tasks:
  - id: gather
    infer:
      prompt: "a"

outputs:
  gather: "\${{ tasks.gather.output }}"
  # the operator's note
  report:
    type: string
    value: "\${{ tasks.gather.output.title }}"
`;

describe('outputsEdit (« choose what it publishes »)', () => {
  it('finds the block and separates owned rows from author sentences', () => {
    const lines = WITH_BLOCK.split('\n');
    const block = findOutputsBlock(lines)!;
    expect(block.line).toBe(7);
    const view = parseOutputs(lines, block);
    expect(view.published).toEqual(['gather']);
    expect(view.customLines).toEqual([
      '  # the operator\'s note',
      '  report:',
      '    type: string',
      '    value: "${{ tasks.gather.output.title }}"',
    ]);
  });

  it('rewrites owned rows to the picked set — customs survive verbatim', () => {
    const next = outputsRewrite(WITH_BLOCK, ['gather', 'judge'])!;
    expect(next).toContain('  gather: "${{ tasks.gather.output }}"');
    expect(next).toContain('  judge: "${{ tasks.judge.output }}"');
    expect(next).toContain('    value: "${{ tasks.gather.output.title }}"');
    expect(next).toContain("  # the operator's note");
  });

  it('unpicking removes an owned row but never a custom one', () => {
    const next = outputsRewrite(WITH_BLOCK, [])!;
    expect(next).not.toContain('  gather: "${{ tasks.gather.output }}"');
    expect(next).toContain('  report:');
  });

  it('publishes .output — never the bare tasks.X trap', () => {
    const next = outputsRewrite('nika: v1\nworkflow: w\n', ['a'])!;
    expect(next).toContain('outputs:\n  a: "${{ tasks.a.output }}"');
    expect(next).not.toMatch(/\$\{\{ tasks\.a \}\}/);
  });

  it('appends at EOF when the block is absent — trailing blanks trimmed', () => {
    const next = outputsRewrite('nika: v1\nworkflow: w\n\n\n', ['a'])!;
    expect(next.endsWith('workflow: w\n\noutputs:\n  a: "${{ tasks.a.output }}"\n')).toBe(true);
  });

  it('an empty pick with no customs removes the whole block', () => {
    const next = outputsRewrite('nika: v1\n\noutputs:\n  a: "${{ tasks.a.output }}"\n', [])!;
    expect(next).not.toContain('outputs:');
  });

  it('refuses the flow-form block — never a blind write', () => {
    expect(outputsRewrite('outputs: { a: 1 }\n', ['a'])).toBeUndefined();
  });

  it('a commented owned-looking row stays the author\'s (custom)', () => {
    const wf = 'outputs:\n  a: "${{ tasks.a.output }}"  # keep my words\n';
    const view = parseOutputs(wf.split('\n'), findOutputsBlock(wf.split('\n'))!);
    expect(view.published).toEqual([]);
    expect(view.customLines[0]).toContain('# keep my words');
  });
});
