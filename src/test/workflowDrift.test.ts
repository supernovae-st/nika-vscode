import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { lfNormalForm, workflowDrifted } from '../core/workflowDrift';

const sha = (s: Buffer | string): string =>
  createHash('sha256').update(s).digest('hex');

const LF = 'nika: v1\nworkflow:\n  id: proof\ntasks:\n  alpha:\n';
const CRLF = LF.replace(/\n/g, '\r\n');
const BOM_LF = '\uFEFF' + LF;

describe('lfNormalForm', () => {
  it('strips BOM and CRLF only — a lone \\r is content', () => {
    expect(lfNormalForm(Buffer.from(CRLF)).toString()).toBe(LF);
    expect(lfNormalForm(Buffer.from(BOM_LF)).toString()).toBe(LF);
    expect(lfNormalForm(Buffer.from('a\rb')).toString()).toBe('a\rb');
  });

  it('is byte-faithful on non-UTF-8 content (latin1 round-trip)', () => {
    const weird = Buffer.from([0x61, 0xff, 0x0d, 0x0a, 0x62]);
    expect([...lfNormalForm(weird)]).toEqual([0x61, 0xff, 0x0a, 0x62]);
  });
});

describe('workflowDrifted — the four encoding quadrants (engine #247 twin)', () => {
  it('a re-encode is not drift', () => {
    // LF-recorded · file saved as CRLF → LF form matches recorded raw.
    expect(workflowDrifted(Buffer.from(CRLF), sha(LF))).toBe(false);
    // CRLF-recorded (journal carries _lf) · file saved as LF.
    expect(workflowDrifted(Buffer.from(LF), sha(CRLF), sha(LF))).toBe(false);
    // BOM added by an editor.
    expect(workflowDrifted(Buffer.from(BOM_LF), sha(LF))).toBe(false);
    // Byte-identical (control).
    expect(workflowDrifted(Buffer.from(LF), sha(LF))).toBe(false);
  });

  it('a content edit drifts, whatever the encoding', () => {
    const edited = LF.replace('alpha', 'omega');
    expect(workflowDrifted(Buffer.from(edited), sha(LF))).toBe(true);
    expect(
      workflowDrifted(Buffer.from(edited.replace(/\n/g, '\r\n')), sha(CRLF), sha(LF)),
    ).toBe(true);
  });

  it('CRLF-recorded on a pre-#247 engine (no _lf recorded) stays honestly conservative', () => {
    // Without the sibling we cannot know the CRLF-recorded content's LF
    // form — a re-encode to LF still warns. The field closes this the
    // moment the run is re-recorded on a 0.97+ engine.
    expect(workflowDrifted(Buffer.from(LF), sha(CRLF))).toBe(true);
  });
});
