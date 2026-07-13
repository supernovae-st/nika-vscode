# SSOT ledger — every piece of language knowledge, one source

The law: **all language knowledge has exactly one source; every surface
is either a live read of the user's binary, a build-time projection
with a byte-exact drift gate, or declared prose limited to
locked-forever invariants.** Anything else is silent drift waiting to
happen — `src/test/ssotLedger.test.ts` fails the suite when a
knowledge artifact is missing from this ledger (or points nowhere).

## Lane A — runtime binary (zero copies · the user's engine speaks)

| surface | source |
|---|---|
| validation · diagnostics · quickfixes | `nika check -` (stdin · keystroke-fresh) |
| key/enum completions · hover docs | `nika schema` + `nika spec --canon` + `nika lsp` |
| model catalog (pickers · missing-brain door) | `nika catalog --json` |
| builtin tools register (invoke door · agent tools door · palette) | `nika catalog --tools --json` |
| error-code pedagogy | `nika explain` |
| graph facts (cost interval · when · fan-out inlays) | `nika graph --format json` |
| new-workflow templates | `nika new` (embedded engine templates) |
| permits boundary (declare · tighten) | `nika check --infer-permits` |

## Lane B — build-time projection (spec YAML → generated · CI byte-gate)

| artifact | SSOT | projector | gate |
|---|---|---|---|
| `src/core/verbStarters.generated.ts` | nika-spec `stdlib/verb-starters-v0.1.yaml` | `starters-projector.py` (oracle-proven) | CI `--check` (spec clone) |
| `src/core/authoringShapes.generated.ts` (schema + armor registers) | nika-spec `stdlib/authoring-shapes-v0.1.yaml` | `authoring-projector.py` (oracle-proven) | CI `--check` (spec clone) |
| `src/design-tokens.generated.ts` (verb hues · glyphs · status · brand · providers order) | nika-spec `design/tokens.yaml` | `design-projector.py` | CI `--check` + `tokens-parity.mjs` (internal coherence) |

Derived in code from Lane B (no third copy): add-a-task skeletons =
the verb's FIRST starter (`structuralFixes.skeletonFor`) · lens door
titles compose generated glyphs (`lensVocab`).

## Lane C — declared prose (locked invariants only · humans own it)

| artifact | why it may exist | guard |
|---|---|---|
| `README.md` · `CHANGELOG.md` · walkthrough | teaching narrative | `parity.mjs` scans teaching surfaces for volatile counts |
| `syntaxes/nika.tmLanguage.json` | TextMate grammar — built on the 4 verbs, locked forever (D-2026-05-22-N18) | the 4-verb set never moves; new KEYS come from Lane A schema, not the grammar |
| `FALLBACK_TOOL_BLURBS` + `VERB_ITEMS` blurbs (`verbPalette.ts`) | offline courtesy cache — the binary's own descriptions WIN whenever it is wired | `toolVocabReal.e2e.test.ts` diffs the fallback NAMES against the real catalog (self-skips without a binary) |
| gate/collection expression shapes (`flowEdit.gateShapes`) | derived from THIS file's vars/tasks at click time — parameterized code, not data | `flowDoorsReal.e2e` proves the writes against the binary |

## What is FORBIDDEN

- A new `*.generated.ts` without a projector + CI gate + a row here.
- Editor snippets duplicating starters/catalog (the 25-snippet file
  died in this consolidation — its model list had already drifted).
- Any hardcoded model/provider/tool list outside Lane B (`providers
  order` lives in `design/tokens.yaml`; models live in the catalog).
- Fixing a generated file consumer-side (values change SPEC-FIRST).
