# Prove it ran

Every run writes a journal, and every journal line carries a **hash
chain**: the SHA-256 of the previous line's exact bytes. Change one byte
anywhere and every line after it stops adding up.

The run's last line prints the head:

```
── 2/2 done · $0.00 · elapsed 0.9s ─────────────────
  trace: .nika/traces/…ndjson · 8 events · chain 941a7616…
```

**One head everywhere.** The verdict banner, the Runs-view tooltip and
the run report all carry the same head: if a journal fails the walk,
the tooltip shows a shield and the report says its claims are
unverified. **Verify Journal** (right-click a run) asks the engine
itself: `nika trace verify` names the first broken link, or says
*unchained* for pre-0.96 journals: nothing to verify, nothing to
distrust.

**Reproduce Run** compares two recorded runs of the same workflow and
classifies every task: `reproduced` · `NONDETERMINISTIC` (same
definition, same inputs, different output: the flaky one, named) ·
`authored` (you edited between runs) · `environment`. No re-run, no
spend: it reads two files.

**Export to OpenTelemetry** ships the journal, chain head included,
as a local OTLP file for Jaeger, Grafana or Langfuse. No collector, no
vendor.

The journal was already your flight recorder. Now it can testify.
