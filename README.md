# Nika Workflow Language · VS Code · Cursor · Windsurf · VSCodium

[![VS Marketplace](https://img.shields.io/badge/VS%20Marketplace-install-2b62ea)](https://marketplace.visualstudio.com/items?itemName=supernovae.nika-lang)
[![Open VSX](https://img.shields.io/open-vsx/v/supernovae/nika-lang?label=Open%20VSX&color=2b62ea)](https://open-vsx.org/extension/supernovae/nika-lang)
[![Open VSX downloads](https://img.shields.io/open-vsx/dt/supernovae/nika-lang?label=downloads&color=555)](https://open-vsx.org/extension/supernovae/nika-lang)

> One extension, every VS Code-compatible editor. `nika-vscode` is the
> repo name because that's the extension *platform* (like `vscode-eslint`)
> · it ships to the **VS Code Marketplace** AND **OpenVSX**, so Cursor,
> Windsurf, VSCodium and friends install it natively. JetBrains/Zed/Neovim
> get the same brain via `nika lsp` + the published JSON Schema.

Language support for [Nika](https://nika.sh) (`.nika.yaml`) · **Intent as
Code**, the workflow language for AI (one file, 4 verbs, one binary) that
turns repeatable AI work into files you can run, review, diff and share.
And **the only one auditable BEFORE it runs**: cost ceiling, permits
boundary, secret flows and schema parity are all static facts the editor
paints in the margin. Apache-2.0 spec · AGPL engine.

![The static audit painted as you type: real nika check diagnostics (NIKA-DAG-003, NIKA-VAR-001 with did-you-mean), the three-line fix, then a clean verdict](media/check-as-you-type.gif)

*The diagnostics above are the real `nika check --json` output — codes,
messages and positions come from the engine, not the extension.*

## Install

- **VS Code** · search **“Nika”** in Extensions, or
  [Marketplace → supernovae.nika-lang](https://marketplace.visualstudio.com/items?itemName=supernovae.nika-lang)
- **Cursor · Windsurf · VSCodium** · same search — they install from
  [OpenVSX → supernovae/nika-lang](https://open-vsx.org/extension/supernovae/nika-lang)
- **The engine** (optional but where the magic lives) ·
  `brew install supernovae-st/tap/nika` — or let the extension offer a
  verified download on first open (HTTPS + SHA-256 · explicit consent ·
  [policy](https://github.com/supernovae-st/nika-vscode/blob/main/README.md)).
  Without the binary you still get syntax, snippets, schema completions
  and the client-side DAG.

## 30 seconds to the wow

1. Open any folder → **`Nika: New Workflow`** (or open a `.nika.yaml`).
2. **`Nika: Show Workflow DAG`** — the file becomes a content-first
   canvas: prompts on infer cards, `$ commands` on exec cards.
3. Press **▶ mock** on the run pill — the DAG lights up wave by wave with
   `mock/echo`: **deterministic, zero API keys, zero network.**

That's the whole loop: the same file then runs on any of the engine's
providers (local Ollama/llama.cpp/vLLM first-class) by swapping `model:`.

## Features

### The audit moat, in the editor
- **Check-as-you-type** · `nika check --json` painted as diagnostics
  (conformance · secret leaks/egresses · permits escapes · schema findings ·
  unknown tools · **typo'd or missing tool args with did-you-mean** ·
  **provably dead `when:` gates** · hints), with `NIKA-XXXX` codes linking
  to explanations — the full `is_clean` family list, so the editor's
  verdict IS the binary's exit code
- **No tmp-file dance** · dirty and untitled buffers pipe straight into
  the binary over stdin (`nika check -` · 0.94+) — keystroke-fresh audits
  without ever touching your disk; older engines keep the tmp fallback
- **One-keystroke permits repair** · the engine's machine-applicable fix
  grammar (`add "X" to permits.<path>`) applied as a quick fix · the same
  convergence loop agents run in CI
- **Inferred boundary** · one command inserts the whole `permits:` block
  derived by `check --infer-permits` (default-deny from then on)
- **Static cost audit** · per-task `$min–max` inlay hints + the workflow
  ceiling on a code lens · audited before a single token is spent
- **Secrets lint** · literal credentials flagged locally (pure scan · zero
  network) with a `${{ env.VAR }}` rewrite quick fix

### Language intelligence (LSP-grade · live today)
- **Schema-derived completions & hover** · every key, enum and doc comes
  FROM the binary (`nika schema` + `nika spec --canon`): top-level keys,
  task fields, per-verb bodies, `capture`/`backoff_strategy` enums, the
  closed builtin tool set, provider-prefixed `model:` values, `nika:fetch`
  extract modes · a new field in the engine lights up here with zero
  extension update
- **`${{ ... }}` expression intel** · completions, hover and
  go-to-definition for `tasks.` / `with.` / `env.` / `secrets.` / `vars.`
  references
- **Task rename & find-references** · hits all 4 syntactic homes
  (declaration · `depends_on` · `${{ tasks.X }}` islands · bare CEL in
  `when:`) and enforces the engine id grammar (snake_case · CEL-safe)
- **Linked editing** · type in ANY home of a task id and every reference
  follows live · **selection ranges** (word → line → task → tasks →
  document smart-expand) · **task dependency hierarchy** in the native
  Call Hierarchy UI (incoming = what it unlocks · outgoing = what it needs)
- **Workspace-wide lint** · CLOSED `.nika.yaml` files ride `nika check`
  into the Problems panel too (open files stay live) · per-code severity
  remap (`nika.diagnostics.severity` · exact or `NIKA-SEC-*` globs · `off`
  hides a code) · related-information walks you to both ends of a
  missing wire
- **Language status** · the `{}` flyout carries the engine version, the
  ACTIVE file's check verdict (busy while a pass runs) and the LSP state
- **Outline / breadcrumbs** · tasks with verb detail + the permits boundary
- **Full LSP** (the day the binary ships `nika lsp`, it takes over
  automatically · the client declares which layers it keeps via
  initializationOptions, no double-reporting)
- **Syntax + snippets + semantic scopes** for the 4-verb surface · every
  snippet is own-corpus tested against `nika check`

### See the run

![The plan executes in the editor: the DAG lights task by task as the run streams, verb-hued, with the verdict landing on close](media/dag-execution.gif)

- **DAG visualization** · the engine's canonical graph projection (verb ·
  model · when-gates ⌁ · fan-out ×N · cost badges) · click-to-jump ·
  mermaid/dot export · **SVG/PNG image export** (styles + font embedded)
- **Content-first canvas** · the node IS the content: infer cards show
  their prompt, exec cards their `$ command`, invoke cards their tool +
  args — before any run. The **model chip edits** (provider picker →
  one undoable YAML edit), `⌀` badges carry the mean duration across
  your recorded runs, ports appear on hover (drag out-port → card =
  `depends_on`, or drop on empty canvas → a new pre-wired task), and a
  **verb palette + omnibar** sits at the bottom: `+ infer after gather`
  inserts deterministically, `/text` filters, a sentence routes to
  oracle-checked generation. Semantic zoom keeps 100-task graphs
  readable as a map
- **Run from the canvas** · a **▶ Run / ▶ mock / ■ Stop** pill drives the
  run without leaving the panel; **▶ mock** streams
  `run --model mock/echo` (deterministic · zero keys · zero network).
  The DAG lights live; the pill flips ▶/■ from the real spawn/close.
  On a 0.93+ engine an **↻ changed** button joins the pill — engine
  `--resume`: unchanged tasks cache-hit their recorded output (dashed
  `↻ cached` cards, never a fake fresh-green), edited tasks re-run
- **Time-travel replay** · click a recorded run and **scrub its whole
  timeline** — play/pause (Space), drag the handle, the DAG state at any
  instant computed locally. Replay re-renders, never re-executes
- **Dirty-nodes** · a `△ stale` badge marks every task edited since its
  last successful run (and its downstream cone) — you see what a run
  will re-execute. The last-success state lives in a
  `.nika/canvas-state.json` sidecar, never in your workflow YAML
- **Regions** · a `# nika:region <name>` comment (ignored by the engine)
  groups the tasks that follow it into a labeled box on the canvas —
  logic grouping at zero cost to the YAML
- **Audit before you run** · the moat, on the canvas. A **cost forecast**
  rides the run pill — `$min–$max` when `nika check` can price it (a
  ceiling), an honest amber `≥ $X` when an uncapped task makes it a
  floor; **`⚠N` audit chips** on the cards surface the task's
  `nika check` findings (secret-flow · permits · schema · unknown-tools),
  click-through to the report; a **`△N` stale count** shows what a run
  will re-execute; a **`Δ ±$` cost delta** beside the ceiling shows what
  your edits changed vs the last commit (the delta is the review signal —
  amber only when it grew). Every number is static — read before a token
  is spent
- **Keyboard-drivable** · `Tab` / `⇧Tab` cycle the topological order, `↑`
  walks to a dependency, `↓` to a dependent, `Enter` opens the YAML — the
  whole canvas without the mouse
- **The nika.sh skin** · the panel ships the landing page's design
  language by default — engineered-black register, one blue accent, the
  4 verb hues as node LED spines (infer ◇ · exec ▷ · invoke ◆ · agent ✦),
  Martian Mono, a full-spectrum edge aurora that sweeps once on a clean
  run close and flashes red on failure · `nika.dag.theme: editor` follows
  your theme instead · high contrast always wins
- **`/` filter** · type to fade everything but matching tasks
  (id · verb · model · tool · provider) · Enter cycles the matches
- **The engineering read** · exact max parallelism (Dilworth antichain,
  with a witness set), speedup ceiling (work-span), k-worker wall-clock
  estimates (Graham-bounded list scheduling · measured milliseconds after
  a run), pinch points, and per-task failure blast radius · in the DAG
  explainer (`?`) and hover card. Algorithms + citations:
  `docs/ALGORITHMS.md`
- **Live run** · `nika run` streams its event stream straight onto the
  DAG · statuses light per the §3.1 run-state machine (running · retrying
  · success · failed · cancelled · skipped), terminal transitions narrate
  in the activity feed, the verdict + cost land on close. The same canonical
  NDJSON the flight recorder writes, painted in real time
- **Flight recorder** · a Runs view over `.nika/traces/*.ndjson` (status ·
  duration · cost per run) and **animated trace replay** through the DAG;
  replay re-renders, never re-executes
- **Golden test, one command** · `Nika: Golden Test` runs
  `nika test <file>` (mock provider · offline · deterministic) against
  `<file>.golden.json`, and `Update the Golden` re-pins it — the offline
  CI gate without leaving the editor
- **Validate / Inspect / Explain / Dry-run** from the editor —
  `nika check` diagnostics, `nika inspect` anatomy, a **deterministic
  Explain Workflow** (the story wave-by-wave · cost ceiling · what it
  touches · structural risks — zero LLM, works offline), and the
  engine's `--dry-run` plan; tasks + problem matcher
- **The 0.93 loop rides the integrated terminal** · launch inputs with
  `nika run --var key=value` · pin the output contract with
  `nika test <file> --update` and keep `nika test` as the offline CI gate
  (the mock synthesizes schema-conformant output) · a run you killed —
  or a durable `nika:prompt` pause (exit 4, journaled as
  `workflow_paused`) — resumes with `nika run --resume <trace>`
  (`--answer approve=true` re-arms the gate · cache hits stay visible) ·
  every recorded run in the flight recorder doubles as that checkpoint ·
  `nika trace show <run>` re-renders any of them in the terminal ·
  scaffold from the same embedded corpus the snippets are tested against
  (`nika examples` · `nika new --from <template>`) · any code explained:
  `nika explain NIKA-XXXX`

### Agent-native
- **LM tools** · `nika_check` / `nika_explain` / `nika_graph` registered as
  Language Model Tools · in-editor AI agents validate the workflows they
  write through the REAL oracle instead of guessing
- **MCP + rules setup** · one command wires editor MCP config and Cursor
  rules — engine-canonical through `nika wire` when the binary ships it,
  with a one-tap follow-up for codex/claude; `nika init` scaffolds the
  repo-local `AGENTS.md`. On VS Code 1.101+ agent mode discovers
  `nika mcp` natively (zero config files)
- **Doctor** · `Nika: Doctor` runs the engine's own environment diagnosis
  (binary · config · provider keys · image/tts planes) — prints exact
  fixes, never mutates; **`Doctor + Ping`** (0.94+) opt-in TCP-probes your
  LOCAL provider ports only (Ollama · LM Studio · llama.cpp · LocalAI ·
  vLLM — loopback, 300ms cap, nothing sent on the socket)
- **Works with your CLI agents too** · `nika wire cursor` / `claude` /
  `windsurf` / `codex` patches each client's MCP config (idempotent ·
  preserves your other servers) so Claude Code, Codex CLI and friends
  call the same oracle from the terminal
- **One plugin, both ecosystems** · `codex plugin marketplace add
  supernovae-st/nika-agents` + `codex plugin add nika@nika` (Codex) · `claude
  plugin marketplace add supernovae-st/nika-agents` + `claude plugin install
  nika@nika` (Claude Code) — the `nika-authoring` skill + the MCP oracle
  in one install
- **Deterministic authoring prompt** · copy the template→check→repair
  protocol for any chat agent

### Engine-honest by construction
- **Capability-gated UI** · the extension probes what the binary ACTUALLY
  ships (`--help`) · the static suite + `run` light up today (the gate lit
  `run` the day nika-runtime reached L3, zero extension update); `lsp` /
  `mcp` light up the same way the day they climb
- **Binary = vocabulary SSOT** · spec, JSON schema, examples and templates
  are read from the self-contained binary (`nika spec` · `nika schema` ·
  `nika examples` · `nika new`) · nothing duplicated, nothing drifts
- **Binary auto-download** · optional (`nika.server.autoDownload`) · SHA256
  verified · zero telemetry anywhere

## The language (4 verbs · locked forever)

```yaml
nika: v1
workflow: hello

model: mock/echo          # deterministic · swap for ollama/qwen3.5:4b or any provider

tasks:
  - id: greet
    infer:
      prompt: "Say hello in French, in one short sentence."
```

`infer` (LLM) · `exec` (subprocess) · `invoke` (builtin/tool · HTTP fetch is the
`nika:fetch` builtin here) · `agent` (agent loop · default-deny tools).

### Canvas regions (editor-only · engine ignores it)

A `# nika:region <name>` comment groups the tasks that follow it into a
labeled box on the DAG canvas. It's a plain YAML comment — the engine
never sees it, so it costs nothing at runtime:

```yaml
tasks:
  # nika:region Ingest
  - id: fetch_pr
    invoke: { tool: "nika:fetch", args: { url: "${{ env.PR_URL }}" } }
  - id: analyze_diff
    depends_on: [fetch_pr]
    infer: { prompt: "Plan the review of ${{ tasks.fetch_pr.output }}." }

  # nika:region Ship
  - id: post_comment
    depends_on: [analyze_diff]
    exec: { command: "gh pr comment $PR --body-file verdict.md" }
```

## Links

- Language spec (Apache-2.0) · https://github.com/supernovae-st/nika-spec
- Engine (AGPL-3.0-or-later) · https://github.com/supernovae-st/nika
- Docs · https://docs.nika.sh

---
🦋 SuperNovae Studio · Paris
