import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NIKA_VERB_HEX, NIKA_STATUS } from '../design-tokens.generated'

/* ── the dag.css ↔ SSOT structural gate ───────────────────────────────────────
   The webview stylesheet hand-authors two vocabulary surfaces that must BE
   the spec SSOT (design/tokens.yaml → design-tokens.generated.ts):

     1 · the 4 verb hues (:root) — semantic canon, identical in every skin
     2 · the NIKA skin's run-state palette — that skin PROMISES the nika.sh
         register, so its status block is pinned to NIKA_STATUS verbatim
         (the #71e08a green that drifted one hue off-canon is why this
         gate exists)

   Deliberately NOT pinned: the EDITOR skin's status palette (theme-driven
   by LOCK-005 — it speaks the user's theme) and the PHOSPHOR skin's
   retuned-for-#000 voices (its skin identity). */

const css = readFileSync(join(__dirname, '../webview/dag.css'), 'utf8')

describe('dag.css · the hand-typed vocabulary IS the generated SSOT', () => {
  it('the 4 verb hues match NIKA_VERB_HEX (every skin shares them)', () => {
    for (const [verb, hex] of Object.entries(NIKA_VERB_HEX)) {
      expect(css, `--nk-verb-${verb}`).toContain(`--nk-verb-${verb}: ${hex};`)
    }
  })

  it('the NIKA skin status block is NIKA_STATUS, verbatim and contiguous', () => {
    const block = [
      `  --nk-st-running: ${NIKA_STATUS.running};`,
      `  --nk-st-success: ${NIKA_STATUS.done};`,
      `  --nk-st-failed: ${NIKA_STATUS.failed};`,
      `  --nk-st-retrying: ${NIKA_STATUS.retrying};`,
      `  --nk-st-muted: ${NIKA_STATUS.muted};`,
    ].join('\n')
    expect(css).toContain(block)
  })

  it('the off-canon green cannot return to the nika skin', () => {
    /* the phosphor skin keeps its deliberate retune — this asserts the
       drifted value never rides WITH the register's running blue again */
    expect(css).not.toMatch(/--nk-st-running: #5b8cff;\n\s*--nk-st-success: (?!#34d399)/)
  })
})
