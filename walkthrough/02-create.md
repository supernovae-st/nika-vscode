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
