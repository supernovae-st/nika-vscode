# Nika Workflow Language · VS Code · Cursor · Windsurf · VSCodium

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

## Features

### The audit moat, in the editor
- **Check-as-you-type** · `nika check --json` painted as diagnostics
  (conformance · secret leaks/egresses · permits escapes · schema findings ·
  unknown tools · hints), with `NIKA-XXXX` codes linking to explanations
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
  `depends_on`), and a **verb palette + omnibar** sits at the bottom:
  `+ infer after gather` inserts deterministically, `/text` filters,
  a sentence routes to oracle-checked generation. Semantic zoom keeps
  100-task graphs readable as a map
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
- **Validate / Inspect** from the editor, tasks + problem matcher
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
  (binary · config · provider keys) — prints exact fixes, never mutates
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

model: mock/echo          # deterministic · swap for ollama/llama3.1 or any provider

tasks:
  - id: greet
    infer:
      prompt: "Say hello in French, in one short sentence."
```

`infer` (LLM) · `exec` (subprocess) · `invoke` (builtin/tool · HTTP fetch is the
`nika:fetch` builtin here) · `agent` (agent loop · default-deny tools).

## Links

- Language spec (Apache-2.0) · https://github.com/supernovae-st/nika-spec
- Engine (AGPL-3.0-or-later) · https://github.com/supernovae-st/nika
- Docs · https://docs.nika.sh

---
🦋 SuperNovae Studio · Paris
