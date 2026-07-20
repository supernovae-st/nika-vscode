import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NIKA_VERB_HEX, NIKA_STATUS, NIKA_BRAND } from '../design-tokens.generated'

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
  it('the 4 verb hues match NIKA_VERB_HEX — canon holds the hex once, the plain name aliases it', () => {
    for (const [verb, hex] of Object.entries(NIKA_VERB_HEX)) {
      expect(css, `--nk-verb-${verb}-canon`).toContain(`--nk-verb-${verb}-canon: ${hex};`)
      expect(css, `--nk-verb-${verb} alias`).toContain(`--nk-verb-${verb}: var(--nk-verb-${verb}-canon);`)
    }
  })

  it('the phosphor wake reads the canon var — the desaturation can never shadow it', () => {
    for (const verb of Object.keys(NIKA_VERB_HEX)) {
      expect(css, `wake ${verb}`).toContain(`--dv-hue: var(--nk-verb-${verb}-canon);`)
    }
  })

  it('the verb TEXT ramps carry the APCA interim pins (swap to NIKA_VERB_TEXT at the pin-bump)', () => {
    /* interim literal pins — the spec companion PR (design-tokens-v3) adds
       verbs.<v>.text + severity.fail_text rows; the moment the SPEC_PIN
       bumps and NIKA_VERB_TEXT / NIKA_SEVERITY_TEXT land in the projection,
       swap these literals for the imports (tokens-parity step 7 already
       compares both directions once the rows exist). */
    const interim: Record<string, string> = {
      infer: '#90b4ff',
      exec: '#ff9a6f',
      invoke: '#22d3ee',
      agent: '#c5a4ff',
    }
    for (const [verb, hex] of Object.entries(interim)) {
      expect(css, `--nk-verb-${verb}-text`).toContain(`--nk-verb-${verb}-text: ${hex};`)
    }
    expect(css, '--nk-st-failed-text').toContain('--nk-st-failed-text: #ff9791;')
  })

  it('the nika skin bright accent IS NIKA_BRAND.accentBright (typed import, both directions)', () => {
    expect(css).toContain(`--nk-accent-bright: ${NIKA_BRAND.accentBright};`)
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

describe('package.json contributes.colors · the nika.verb.* theme colors ARE the SSOT', () => {
  /* the tree's verb ThemeIcons ride ThemeColor('nika.verb.<verb>') — the
     contributed defaults are hand-typed JSON, so they get the same pin as
     the hand-typed CSS above (every default slot, every verb) */
  type ColorContribution = {
    id: string
    defaults: { dark: string; light: string; highContrast: string }
  }
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as {
    contributes: { colors: ColorContribution[] }
  }

  it('every verb contributes its canonical hue in every default slot', () => {
    for (const [verb, hex] of Object.entries(NIKA_VERB_HEX)) {
      const entry = pkg.contributes.colors.find((c) => c.id === `nika.verb.${verb}`)
      expect(entry, `nika.verb.${verb} contributed`).toBeDefined()
      expect(entry?.defaults.dark, `${verb} dark`).toBe(hex)
      expect(entry?.defaults.light, `${verb} light`).toBe(hex)
      expect(entry?.defaults.highContrast, `${verb} highContrast`).toBe(hex)
    }
  })
})
