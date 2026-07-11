# Create your first workflow

Every Nika file starts with the frozen envelope:

```yaml
nika: v1
workflow: hello

model: mock/echo   # deterministic · no API key needed

tasks:
  - id: greet
    infer:
      prompt: "Say hello in French, in one short sentence."
```

**4 verbs, locked forever** · `infer` · `exec` · `invoke` · `agent`.
HTTP fetch is the `nika:fetch` builtin under `invoke:` · a tool, not a verb.

**Add tasks fast** — [Nika: Add Task](command:nika.addTask) (`⌘⌥T`)
offers the 4 verbs *and* every builtin as a pre-wired `invoke:` — type
`jq` or `fetch` and the skeleton lands after the task under your
cursor. On the canvas, the same vocabulary lives in the `+` palette.
