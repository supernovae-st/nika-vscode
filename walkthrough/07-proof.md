# Prove it ran

The engine owns journal creation and verification. A consistent hash chain
does not by itself prove who wrote the journal: a whole chain can be
rewritten. A signature, an external anchor and replay are different proof
questions, and each can have a gap.

**Verify Journal** (right-click a run · `⌘K ⌘.` reaches the same action)
asks `nika trace verify <trace> --json`. The editor opens the complete machine
result, including the attained tier, exit class, proof legs and refusal
details. It does not collapse them to the first line or reimplement the
verifier. A timeout or unsupported response gives no integrity verdict.

The Runs view, detail page and exported report show **recorded observations**,
not an integrity certificate. They say so explicitly. The verification
document describes the engine's request-time observation; it is not cached
as proof of a file that might change later.

**Reproduce Run** compares two recorded runs of the same workflow and
classifies every task: `reproduced` · `NONDETERMINISTIC` (same
definition, same inputs, different output: the flaky one, named) ·
`authored` (you edited between runs) · `environment`. No re-run, no
spend: it reads two files.

**Export to OpenTelemetry** ships the journal, chain head included,
as a local OTLP file for Jaeger, Grafana or Langfuse. No collector, no
vendor.

The journal is the flight recorder. The engine states what its evidence proves.
