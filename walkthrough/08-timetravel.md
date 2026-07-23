# Time-travel a recorded run

Every `nika run` writes a trace. The debugger replays it with **no model
calls, no cost, the exact recorded bytes**:

1. open a workflow that has run at least once
2. set a breakpoint on any task line
3. press **F5** (or `Nika: Debug This Run (replay · time travel)`)

Execution pauses ON your task with the recorded inputs/outputs in the
Variables pane. Step through the run as it actually happened.

Related: `Nika: Diff Two Runs on the DAG` compares runs · `Nika: Verify
Journal (tamper-evidence chain)` recomputes the hash chain and names
the first broken link.
