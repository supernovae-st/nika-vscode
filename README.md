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
- **Outline / breadcrumbs** · tasks with verb detail + the permits boundary
- **Full LSP** (the day the binary ships `nika lsp`, it takes over
  automatically · the client declares which layers it keeps via
  initializationOptions, no double-reporting)
- **Syntax + snippets + semantic scopes** for the 4-verb surface · every
  snippet is own-corpus tested against `nika check`

### See the run
- **DAG visualization** · the engine's canonical graph projection (verb ·
  model · when-gates ⌁ · fan-out ×N · cost badges) · click-to-jump ·
  mermaid/dot export
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

### Agent-native
- **LM tools** · `nika_check` / `nika_explain` / `nika_graph` registered as
  Language Model Tools · in-editor AI agents validate the workflows they
  write through the REAL oracle instead of guessing
- **MCP + rules setup** · one command wires editor MCP config and Cursor rules;
  `nika init` scaffolds the repo-local `AGENTS.md`
- **Works with your CLI agents too** · `nika wire cursor` / `claude` /
  `windsurf` / `codex` patches each client's MCP config (idempotent ·
  preserves your other servers) so Claude Code, Codex CLI and friends
  call the same oracle from the terminal
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
