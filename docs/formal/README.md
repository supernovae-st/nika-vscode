# Live-run ownership model

This finite TLA+ model covers the editor adapter's process ownership,
not workflow execution semantics. The engine remains the authority for
settlement, outputs and effects. Read it beside
[`runLive.ts`](../../src/features/runLive.ts) and
[`runLiveOwnership.test.ts`](../../src/test/runLiveOwnership.test.ts).

| Model action | Implementation correspondence |
|---|---|
| `Request` | keep only the latest pending call; fence the superseded handle |
| `Start` | spawn when no process owner remains |
| `Stop` | discard pending work; request a signal once |
| `Escalate` | send SIGKILL once after the stop delay; retain ownership |
| `Close` | the child `close` callback releases ownership in `finally` |
| `Paint` | an output/callback may arrive late; only the current, non-superseded owner may publish |

The positive configuration explores four request identities, arbitrary
stop/close ordering, repeated stops and late publication. It checks one
live process, ownership retained until close, no ghost owner, one latest
pending intent and no stale publication. Start is separated from close
to admit additional interleavings; this is an over-approximation of the
synchronous close-to-start handoff, not a generated refinement proof.

Two negative configurations deliberately release ownership on a stop
signal or accept stale publication. They must fail their named invariants;
a parser error, missing Java or timeout is not an accepted negative proof.

## Bounds and exclusions

No fairness assumption forces the OS to close a process. This is a safety
check, not a termination or latency guarantee; deadlock checking is off
because quiescence and a process that never closes are allowed. The model
does not cover host crashes, extension-host shutdown, descendant process
trees, filesystem/stream size bounds, trace authenticity, billing, or
exactly-once external effects. Signals do not undo previously completed work.
Four identities are a finite exploration bound, not a proof for all runs.

The separate runtime tests execute the TypeScript handlers against an
adversarial child-process emitter. Those tests establish implementation
examples, not a machine-checked refinement between TypeScript and TLA+.

## Tool and research sources

Use the official [TLA+ tools release](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4)
with Java. The tested `tla2tools.jar` SHA-256 is
`936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`.
This is a recorded download digest, not a release attestation.
Keep downloaded runtimes, jars and TLC state files outside this repository.

```sh
TLC_JAR=/absolute/path/tla2tools.jar JAVA_BIN=/absolute/path/java \
  node scripts/check-run-ownership-model.mjs
```

The runner pins that digest, bounds heap, workers, output and execution time,
checks the positive model and both named negative outcomes, and removes only
its own temporary state directory. This explicit Java-based gate is separate
from `npm test`; neither substitutes for the other or native-host testing.
The `ownership-model` CI job downloads that pinned tool and runs the same
positive exploration plus both negative controls on every pull request.
Its green covers only the finite adapter model described above.

Lamport's [safety-proof notes](https://lamport.azurewebsites.net/tla/proving-safety.pdf)
motivate explicit invariants; his [liveness tutorial](https://lamport.azurewebsites.net/tla/tutorial/session9.html)
explains why termination is a different claim. Here that distinction keeps
an unclosed process from being silently declared stopped.
