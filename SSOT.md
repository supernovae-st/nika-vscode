# SSOT ledger · every piece of language knowledge, one source

The law: **all language knowledge has exactly one source; every surface
is either a live read of the user's binary, a build-time projection
with a byte-exact drift gate, or declared prose limited to
locked-forever invariants.** Anything else is silent drift waiting to
happen · `src/test/ssotLedger.test.ts` fails the suite when a
knowledge artifact is missing from this ledger (or points nowhere).

## Lane A · runtime binary (zero copies · the user's engine speaks)

| surface | source |
|---|---|
| validation · diagnostics · quickfixes | `nika check -` (stdin · keystroke-fresh) |
| key/enum completions · hover docs | `nika spec --schema` + `nika spec --canon` + `nika lsp` |
| model catalog (pickers · missing-brain door) | `nika catalog --json` |
| builtin tools register (invoke door · agent tools door · palette) | `nika catalog --tools --json` |
| error-code pedagogy | `nika explain` |
| graph facts (cost interval · when · fan-out inlays) | `nika inspect --format json` (graph_format 2) · over the LSP, `nika/semanticDocument` serves the SAME document + spans |
| new-workflow templates | `nika new` (embedded engine templates) |
| permits boundary (declare · tighten) | `nika check --infer-permits` |

## Lane B · build-time projection (spec YAML → generated · CI byte-gate)

| artifact | SSOT | projector | gate |
|---|---|---|---|
| `src/core/verbStarters.generated.ts` | nika-spec `stdlib/verb-starters-v0.1.yaml` | `starters-projector.py` (oracle-proven) | CI `--check` (spec clone) |
| `src/core/authoringShapes.generated.ts` (schema + armor registers) | nika-spec `stdlib/authoring-shapes-v0.1.yaml` | `authoring-projector.py` (oracle-proven) | CI `--check` (spec clone) |
| `src/design-tokens.generated.ts` (verb hues · glyphs · status · brand · providers order) | nika-spec `design/tokens.yaml` | `design-projector.py` | CI `--check` + `tokens-parity.mjs` (internal coherence) |

Derived in code from Lane B (no third copy): add-a-task skeletons =
the verb's FIRST starter (`structuralFixes.skeletonFor`) · lens door
titles compose generated glyphs (`lensVocab`).

## Lane C · declared prose (locked invariants only · humans own it)

| artifact | why it may exist | guard |
|---|---|---|
| `README.md` · `CHANGELOG.md` · walkthrough | teaching narrative | `parity.mjs` scans teaching surfaces for volatile counts |
| `syntaxes/nika.tmLanguage.json` | TextMate grammar · built on the 4 verbs, locked forever (D-2026-05-22-N18) | the 4-verb set never moves; new KEYS come from Lane A schema, not the grammar |
| `FALLBACK_TOOL_BLURBS` + `VERB_ITEMS` blurbs (`verbPalette.ts`) | offline courtesy cache · the binary's own descriptions WIN whenever it is wired | `toolVocabReal.e2e.test.ts` diffs the fallback NAMES against the real catalog (self-skips without a binary) |
| gate/collection expression shapes (`flowEdit.gateShapes`) | derived from THIS file's vars/tasks at click time · parameterized code, not data | `flowDoorsReal.e2e` proves the writes against the binary |

## The server-convergence map (nika#557 · engine ≥ 0.102)

The engine's LSP now carries authoring lanes the extension also
speaks. Two kinds · only one converges:

| extension surface | server lane | verdict |
|---|---|---|
| lens **doors** (pickers · surgical edits) | · | never retire: doors are GESTURES (compose `after:` entries, hoist `with:` bindings, rewrite blocks); the LSP informs, a door acts |
| `flowEdit.gateShapes` (when-gate register) | `when:` islands (engine ≥ 0.103) | **CONVERGED**: when a server with completion runs, the gate door's FIRST row hands the empty `when: ` value to the native suggest (the engine's islands speak); shapes stay as the offline fallback + the gesture rows (`after:` · the hoist) the server cannot make. `islandsReal.e2e` belt-checks the shared LOCAL names (client ⊆ server) |
| collection candidates (`flowDoors`) | `for_each:` islands (engine ≥ 0.103) | **CONVERGED**: same lane, same belt |
| graph projection (`inspect --format json` spawn per refresh) | `nika/semanticDocument` (advertised since 0.102 · adopted at `graphFormat` 2) | **CONVERGED**: the oracle is the projection VERBATIM plus per-task spans; the CLI is the no-server fallback, the client sketch the last rung. `semanticDocReal.e2e` proves both floors |
| `FALLBACK_TOOL_BLURBS` | catalog (Lane A) | never retire: the offline courtesy cache · but names stay belt-checked |

The rule: a KNOWLEDGE register duplicated across the seam converges
on the server as binaries reach it; a GESTURE stays editor-side
forever. A new picker must say which it is before it ships.

## What is FORBIDDEN

- A new `*.generated.ts` without a projector + CI gate + a row here.
- Editor snippets duplicating starters/catalog (the 25-snippet file
  died in this consolidation · its model list had already drifted).
- Any hardcoded model/provider/tool list outside Lane B (`providers
  order` lives in `design/tokens.yaml`; models live in the catalog).
- Fixing a generated file consumer-side (values change SPEC-FIRST).
- A knowledge register duplicated across the LSP seam without a
  convergence row above (gesture vs knowledge, named at ship time).
