// pauseAnswer.ts — the pure decision seams of the human-gate answer flow.
//
// Extracted after the 0.97.0/0.97.1 review cycle: this exact seam bit
// twice (typed answers JSON-coerced by the engine · unknown modes
// degraded to a boolean picker a choice gate always rejects). The
// decisions live here, vscode-free, pinned by tests.

/** Which control collects the answer for a paused `nika:prompt`. */
export type AnswerControl = 'confirm' | 'choice' | 'input';

/**
 * Mode → control. `confirm` gets the Yes/No picker; `choice` gets the
 * workflow's own options — but ONLY when they actually parsed off the
 * wire; everything else (unknown future modes · a choice pause whose
 * options the fold could not read) degrades to the INPUT BOX: a string
 * answer is engine-validated against the gate's own contract, while a
 * boolean from the Yes/No picker would fail a choice gate every time.
 */
export function answerControlFor(mode: string | undefined, choiceCount: number): AnswerControl {
  if (mode === 'confirm' || mode === undefined) { return 'confirm'; }
  if (mode === 'choice' && choiceCount > 0) { return 'choice'; }
  if (mode === 'input') { return 'input'; }
  // choice-without-options · any unknown future mode
  return 'input';
}

/**
 * Encode one answer value for `--answer task=<value>`. The engine
 * JSON-parses the value: a bare `123`/`true`/`null` arrives TYPED and
 * fails an input gate's string contract (PROMPT-001), and a
 * numeric-looking choice (`"1"`) could never match its option. Text
 * stays text via JSON encoding; confirm rides the engine-native bare
 * `true`/`false`.
 */
export function encodeAnswer(control: AnswerControl, raw: string): string {
  return control === 'confirm' ? raw : JSON.stringify(raw);
}
