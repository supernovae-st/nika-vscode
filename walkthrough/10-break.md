# Break it on purpose

The fastest way to trust a tool is to watch it fail **well**. The
blank starter ships a commented curriculum failure:

```yaml
  # break_me:
  #   with:
  #     got: ${{ tasks.start.output }}
  #   invoke:
  #     tool: nika:assert
  #     args:
  #       condition: ${{ with.got == "impossible" }}
  #       message: "the scripted failure — read the red, then click the code"
```

Uncomment it (strip the `# ` prefixes) and run again: offline, zero
keys, deterministic.

Created your file from an engine template instead? Run
[Nika: New Workflow](command:nika.newWorkflow) once more and pick
**blank starter** · it carries the curriculum.

**What to watch:**

- The card turns red and carries its story where the prompt was:
  `✗ NIKA-BUILTIN-ASSERT-001 · the scripted failure…`. **Click it**:
  the explain doc opens (cause · category · fix-form).
- A failed card promotes itself to the full story, actions included:
  **⑂ fork** re-runs from the failure with everything upstream
  rehydrated from the recording. **⚡ what if** previews the blast
  radius without spending anything.
- The Runs view keeps the autopsy: the trace line names the exact
  `nika trace peek` command, and **F5** time-travels the recorded
  run under the debugger.

A failure here is a recorded, explained, forkable object, not a
wall of terminal text. That is the whole pedagogy of the engine.
