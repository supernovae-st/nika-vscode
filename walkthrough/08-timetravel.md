# Time-travel a recorded run

Every `nika run` writes a trace. The debugger replays it with **no model
calls, no cost, the exact recorded bytes**:

1. open a workflow that has run at least once
2. set a breakpoint on any task line
3. press **F5** (or `Nika: Debug · replay latest trace`)

Execution pauses ON your task with the recorded inputs/outputs in the
Variables pane. Step through the run as it actually happened.

Related: `Nika: Diff two traces` compares runs · `Nika: Verify trace`
recomputes the hash chain and names the first broken link.
