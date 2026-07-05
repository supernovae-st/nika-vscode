# Changelog · nika-vscode

All notable changes to the extension. Versions track the engine's
announce line (forever-v0.x).

## [Unreleased]

### The canvas design system — two registers, one grammar
- **`docs/DESIGN.md`** is now the visual contract: one two-zone card
  anatomy, two skins, a locked status grammar, one motion language —
  studied against ElevenLabs Flows (floating chrome · canvas craft),
  Well-class workflow boards (two-zone cards · dotted wires) and n8n
  (icon-tile identity), with nika.sh contributing the ambiance.
- **The two-zone card**: a verb TILE (tinted rounded square — identity
  at every zoom) + task id + a STATUS DOT pinned right (resting gray ·
  running verb-pulse · success green · failed red · cached hollow),
  a full-bleed hairline, then the fact zone (mechanism line · preview ·
  params). Settled tasks swap the mechanism for the run line —
  `✓ 2.3s` green, `✗ 4.1s` red — after a run the fact IS the outcome.
- **Pending is calm.** Cards at rest look normal; running lights a
  verb-hued ring, failed screams, success is a quiet green fact — the
  canvas is no longer a field of ghosts before the first run.
- **Dependency wires are dotted bead chains** (round caps), data wires
  stay solid with their alias label — order vs data readable at a
  glance. Ports became resting endpoint dots that grow on approach.
- **Chrome floats**: the toolbar dissolved into floating pills over an
  edge-to-edge canvas (title pill · action groups · status pill);
  fit-to-view clears both the top rail and the bottom dock.
- **Wave captions speak the plan grammar** — `[ 01 ]  start ·
  run together ×N · then` (always on; the W toggle now governs only
  the band fills). Region fills died — territory reads at the border
  + label, never as a colored floor.
- **Light themes are first-class**: white cards, layered soft shadows,
  raised-contrast hovers, amber critical path — the editor skin's
  light mode finally matches its dark mode in craft. High-contrast
  overrides retargeted to the new card surface.
- Semantic-zoom thresholds recalibrated (the default fit always shows
  full cards; far is a deliberate map read: big tile + id + dot).

### The canvas breathes — gestures, motion, speed
- **Modern trackpad gestures**: plain scroll/two-finger PANS the canvas,
  pinch (or ⌘/Ctrl+scroll) ZOOMS — the Figma/n8n gesture set replaces
  wheel-always-zooms.
- **The fact row went two-column** (the Well key→value read): mechanism
  left (`invoke · nika:fetch`), live verdict right-aligned — `✓ 640ms`
  green · `✗ 4.1s` red · `running…` verb-hued · `↻ cached`. The verdict
  pops in with a soft rise when a task settles.
- **The plan breathes while it runs**: dependency bead-chains march
  during a live run only (30 marching wires at rest would be noise);
  wires answer hover; cards rise in on load, staggered by wave; hover
  lifts the card 1px. Every loop honors reduced-motion.
- **The survey grid**: faint `+` marks at 40px intersections replace the
  dot grid (the blueprint read) — retuned per skin (white/black/blue ink).
- **Drag got faster**: pointer moves are rAF-coalesced and wire re-routes
  write through an id→element cache — O(touched wires) per frame, no
  edge-list scans mid-drag.
- **Research-grounded motion** (n8n source · React Flow · tldraw ·
  Vercel motion notes): running cards wear the n8n dual-arc ring
  (1.5s), retrying the same ring at 4.5s (backoff made visible), the
  settle ripple breathes once on live ✓, a faint lamp follows the
  pointer (nika), data edges animate on the live frontier ONLY (settled
  edges rest as a quiet success tint), and the selection halo is
  zoom-compensated so it reads at every zoom. Focus dim recalibrated
  to keep context readable (25%).
- **The material register** — the canvas answers « what is it made
  of? »: a modular synth rack. Status dots became LEDs (glass-dome
  specular · lit states bloom), verb tiles became keycaps (light
  catch · seated lip · hue backlight), ports became patch-bay jacks
  (dark bore · machined collar that lights on hover), Run/Stop became
  machine keys that physically PRESS (1.5px travel · lip compression),
  nika cards became module faces (grain + faint convexity) and the
  floating pills sit on extruded lips. Semantics untouched; light skin
  keeps it at a whisper; high contrast strips every material.
- **Follow the run (G)** — a camera mode no workflow tool ships: the
  viewport tracks the frontier, gliding only when a starting task
  leaves the comfort band, and any human pan instantly yields the
  camera for the rest of the run. Watch a 40-task workflow execute
  without touching the trackpad.
- **The failure shockwave** — when a task fails LIVE, its blast cone
  ripples: every downstream card takes a transient red breath,
  staggered by graph distance — you see what the failure doomed
  before the engine reports the skips.
- **K focuses the command bar** (⌘K muscle memory); the verdict banner
  moved below the floating rail (it used to overlap the pills).
- **The smooth pass** — arrivals ride a real `linear()` SPRING (~4%
  overshoot: entrances · verdict pops · the output line; safe fallback
  via `@supports`), every camera move speaks ease-out (fit/center/
  wave/minimap), the hover inspector GLIDES between cards while open
  instead of re-popping, the heatmap tint MORPHS (0.4s) as durations
  land, wave bands fade in, alignment guides fade out, and the two
  entrance stagger clocks (SVG 80ms vs CSS 70ms) became one.
- **Run from here** — the hover card grew a `▶ run` action: ONE task
  and its upstream cone through the same `nika run --task` flow the
  CodeLens uses — the n8n partial-execution move without leaving the
  canvas. Upstream cache-hits stay cache-hits.
- **The heatmap (H)** — one keystroke tints every card by where the
  run actually spends (measured durations; the static cost ceiling
  before any run), normalized to the graph's max. The hotspot is
  simply red. Live: the tint follows durations as they land.
- **Drag magnetism** — cards snap to other cards' edges and centers
  (6px), accent guide-lines draw the agreement, Alt bypasses — the
  helper-lines grammar of Figma/React Flow.
- **The whole language, visible** (the Socratic pass): `when:` gates
  wear a dashed amber chip on the card (conditional execution was a
  near-invisible glyph), fan-out tasks wear a stacked DECK (map ×N
  reads as the parallel copies it is), builtin tools carry their
  category glyph (◦ ▤ ⧉ ⇄ ⌕ ▣), and a settled task's recorded output
  lands ON the card (`→ 5 stories selected…`) where its prompt was —
  the run shows its data on the canvas; re-runs restore the prompt.
  The `?` explainer teaches all three new marks.
- **The plan rail** — wide panels' empty left flank now carries the
  execution plan itself: every wave as a clickable pill row
  (`[ 01 ] ×2 · [ 02 ] then…`), the viewport's wave highlighted live,
  click glides the canvas to that wave; in-canvas captions yield to it
  and fit-to-view reserves the column. Composition over void.
- **Every editor, every theme, every panel**: the adaptive skin now
  adopts YOUR theme's voice (`focusBorder` → accent, `textLink` → data
  wires, `button-*` → the Run CTA — a purple theme purples the canvas);
  `nika.dag.theme: "auto"` picks the brand skin on dark themes and the
  adaptive one on light, re-resolving live on theme switch; VS Code's
  own high-contrast themes get the hard-border zero-decoration
  treatment (on top of OS forced-colors); and two dock tiers keep the
  canvas first-class at sidebar widths (≤380px) and bottom-dock
  heights (≤460px) — proven by 320w/420h/purple-theme screenshots.
- **The reference background**: the nika skin's page went warm
  near-black (blue now lives only in accents, wires, verbs and the
  aurora), the activity feed became the nika.sh terminal card (chrome
  dots · mono), the status pill leads with an aggregate state dot, the
  zoom group is the canonical `− % +` pill, and the harness gained real
  interaction proofs (click-focus · pointer-hover · empty state) that
  caught and fixed two nits (wrapping hover-card labels · a ghost
  minimap on the empty canvas).

## [0.94.0] · 2026-07-05

### The canvas becomes yours — drag & drop
- **Drag any task card** — a 4px threshold keeps clicks as clicks; the
  card lifts under the pointer and **every wire follows live** as a
  direct curve (binding labels ride along). Positions **persist per
  workflow** (presentation only — the YAML stays the single truth) and
  survive panel reloads. `⌗` in the toolbar (or `A`) drops the pins and
  returns to the auto-layout. The `?` explainer teaches both gestures.
- Dragging a card never pans the canvas (the zoom gesture refuses card
  mousedowns), tooltips hold their tongue mid-drag, and nothing on the
  canvas is text-selectable during the move.

### The visual refit the screenshots demanded
- **Fixed: the entire card styling could vanish** — a stray brace in the
  high-contrast CSS block swallowed every rule after it (cards rendered
  as raw unstyled text spilling past their frames, hidden run bar).
  Found by a headless-browser screenshot harness; a double render on
  every graph load (two ELK layouts racing) died in the same pass.
- **Fit-to-view respects the bottom dock** — the last wave no longer
  hides under the run pill; fit reads the live card boxes, so dragged
  layouts fit correctly too.
- **Semantic zoom recalibrated** — the default fit shows full cards
  (id · fact · body); far out reads like a map: id + glyph centered
  large, never a big empty box with a whisper in a corner.
- Quieter furniture: wave bands and regions at a whisper, slimmer
  arrowheads, the progress bar hides until a run starts, and the dock
  un-stacks into two floors on narrow panels — zero overlap down to
  420px. Focus rings on every control; connect ports grew to a
  comfortable hit size.

### ↻ Re-run what changed (engine `run --resume` · ADR-099)
- **↻ changed** joins the run pill — visible when the resolved binary
  ships the 0.93 resume line. It re-runs only the dirty slice: the
  ENGINE decides by `def_hash`/`input_hash` (never an editor guess);
  unchanged tasks cache-hit their recorded output from the newest
  persisted trace. No trace yet → an honest notice and a whole run.
- **Live runs persist their stream** to `.nika/traces/` (newest 10 per
  workflow, exact-stamp filenames so sibling workflows never collide) —
  the Runs view lights up for canvas runs and the resume substrate is
  always at hand. Failed runs are kept on purpose: resuming after a
  crash skips the part that succeeded.
- **Cache hits are legible everywhere** — a rehydrated success must
  never read as a fresh execution: dashed card stroke + no success
  flash, `verb · ↻ cached` subtitle, `resume`/`output` rows on the
  hover card, ` ✓ cached` end-of-line editor badge, feed narrates
  "cached · recorded output reused", run verdicts and Runs-view cards
  count `↻ N cached`, and the replay platine scrubs the ↻ honestly.
- **Recorded outputs land on the canvas** — terminal events' `output`
  (v0.93 wire) folds into a one-line preview surfaced on the hover
  card, decoded as text (never its JSON encoding).
- The stale chip's tooltip now tells the per-binary truth: whole-graph
  below 0.93, cache-hit slice with `--resume` at 0.93+.
- **`Nika: Resume Last Run`** joins the command palette — the ↻ button's
  twin (one shared flow · the same honest notices on an older binary or
  a first run).

### The run lifecycle, made visible
- **Verdict banner** — the run's close lands top-center on the canvas
  (`✓ run completed · 3 tasks · 2.3s · $0.04 · ↻ 2 cached`), one status
  tint, slides in, self-dismisses, click opens the full story in the
  feed. The aurora says *something ended*; the banner says **what** —
  no more opening the activity feed to learn the verdict.
- **Heartbeat on ■** — the Stop button counts settled tasks live
  (`■ 3/7`) while the run flows; resets honestly on every new run.
- **Run keys** — `R` run · `M` mock preview · `S` stop, on the canvas
  (modifier-free only; the `?` explainer teaches them). The whole run
  loop is now keyboard-drivable.

### Cost delta on the run pill (the Infracost lesson)
- The cost chip now shows the **change vs the last commit** beside the
  ceiling (`$0.07 · Δ +$0.02`, amber when it grew) — at review time the
  delta is the signal, the total is trivia. Honest by construction: it
  only speaks when both sides are bounded (a floor vs a ceiling is not a
  delta), the file is tracked, and the movement clears rounding dust.
  One baseline check per commit (cached per HEAD sha) — keystrokes never
  re-price history.

### Dry-run from the palette
- **`Nika: Dry-Run (show the plan · zero effects)`** — the engine's
  static plan (spec §10) in a terminal. The pre-flight ladder is now
  complete in the editor: audit → **plan** → mock → run → resume.

### Explain Workflow (deterministic · offline)
- **`Nika: Explain Workflow`** renders the workflow as a readable story —
  wave-by-wave narration (parallelism · when-gates · fan-outs), the cost
  ceiling before a token is spent (honest about FLOOR when unbounded),
  what it touches (models · tools · secret flow), and the structural
  risks (pinch points · blast radius · ghost edges · cycles). Composed
  strictly from the engine's `graph` + `check` projections: zero LLM,
  zero invention, works offline — the floor of truth an agent-enriched
  explanation can build on, never replace.

## [0.93.1] · 2026-07-05

Release-infra only — no code change vs 0.93.0. The v0.93.0 tag's CI run
failed at `npm ci` (a lockfile out of sync with a transitive esbuild
bump from the run-in-editor merge); the lockfile is resynced and the
identical content ships as 0.93.1.

## [0.93.0] · 2026-07-05

The canvas becomes an operating surface: run it, watch it, replay it,
group it — the node stays the content, the YAML stays the truth.

### Run from the canvas
- **Run pill** (bottom-center · the 2026 canvas placement) · **▶ Run**
  rides the full capability-gated run · **▶ mock** streams
  `run --model mock/echo` (deterministic · zero keys · zero network —
  the onboarding wow) · **■ Stop** appears only while running (graceful
  cancel). The lifecycle is truthful: the toolbar flips ▶/■ from the
  actual spawn/close, replayed on panel reload so a backgrounded run
  keeps its honest ■. The click shimmers pending cards before the first
  engine event (optimistic latency masking).
- **Port-drop create** · drag a node's out-port onto empty canvas to
  create the next task pre-wired (`depends_on` declared) — the Flows
  gesture, discoverable.

### Time-travel replay
- **Replay scrubber** · a recorded run's whole timeline goes to the
  webview; the handle position IS the truth and the DAG state at any
  instant is computed locally (60fps · no round-trips). Play/pause
  (Space), scrub the track, read the elapsed time; scrubbing back and
  forth never spams the activity feed. `nika.replay.speed` feeds the
  playback budget.

### Edited-since-run awareness
- **Dirty-nodes** · a `△ stale` badge marks every task whose substance
  changed since its last successful run, and its downstream cone.
  Fingerprints are reformat-stable (indent · blanks · comments · key
  order never dirty) and record at spawn time (an edit mid-run is not
  "successfully ran"); the last-success state lives in a
  `.nika/canvas-state.json` sidecar, never in the workflow YAML.

### Grouping
- **Regions** · a `# nika:region <name>` comment (ignored by the engine)
  groups the tasks that follow it into a labeled background box on the
  canvas — n8n-style logic grouping, zero-cost on the YAML.

### Audit before you run (the moat, on the canvas)
- **Cost forecast** on the run pill · `nika check` prices the workflow
  statically when tasks declare `max_tokens`; the pill shows `$min–$max`
  (a true ceiling, green) or — honestly — `≥ $X` (amber) when an
  uncapped task makes it a floor, never implying a ceiling the engine
  didn't prove. Audited before a token is spent.
- **Audit chips** on the cards · a `⚠N` chip surfaces the task-attributed
  `nika check` findings (conformance · secret-flow · permits · schema ·
  unknown-tools), tinted by worst severity, click-through to the full
  pre-flight report.
- **Stale count** on the run pill · a `△N` chip summarises what a run
  will re-execute (edited tasks + their downstream cone), with an honest
  note that a run re-executes them whole-graph today (partial when the
  engine ships `--from`).

### Move without the mouse
- **Drop-a-port cmdk** · dragging a node's out-port onto empty canvas
  opens a small verb palette AT the cursor (type-to-filter · ↑↓ · Enter);
  pick a verb → a pre-wired task lands in the YAML.
- **Keyboard navigation** · Tab / Shift-Tab cycle the topological node
  order, ↑ walks to a dependency, ↓ to a dependent, Enter opens the YAML
  — the canvas is fully keyboard-drivable.

### The first pixel
- **Onboarding empty-state** · with no workflow open the panel pitches
  itself: what the canvas does, Show-active / ＋New-workflow buttons, a
  3-gesture crib, and a link into the getting-started walkthrough.

### Generation, staged
- **Ghost-stage generate** · a generated workflow opens as an untitled
  draft (nothing on disk) with an explicit **Save workflow / Refine /
  Discard** loop; Refine re-runs the same oracle-checked pipeline with
  an added instruction; Discard is explicit-only (a dismissed prompt
  loses nothing). The pipeline (best-of-N · scoring · repair) is
  untouched.

### Proof
- The live-run wire is pinned against the REAL engine (fan-out folds to
  the exact terminal state · chunk-boundary-independent on the real
  stream · failure verdict · mock override of a cloud model).
- A **real-host smoke suite** (`@vscode/test-electron`) launches an
  actual VS Code and asserts activation · command registration · the
  language binding · the CSP webview load — the layer the unit + pixel
  harnesses can't reach (`npm run test:integration`). It found a real
  teardown bug: the LSP client's `stop()` rejects when called while
  starting; `safeStopClient` now guards a window closed mid-LSP-start.
- Every canvas change is proven on a Playwright/Chrome harness in BOTH
  skins. Suite: 304 tests across 26 files, parity gate green.

## [0.92.0] · 2026-07-05

The SOTA night: the linter grows Ruff-grade controls, the language
surface gains the navigation providers reference extensions ship, and
the DAG panel becomes a content-first canvas in the nika.sh design
language.

### Canvas 2.0 — the node IS the content
- **Content-first cards** · variable-height nodes show the task's
  SUBSTANCE: infer cards carry their prompt (3-line clamp), exec cards
  their `$ command`, invoke cards their `tool + args` — read from the
  YAML client-side, no run needed (the resting state already tells the
  story, ElevenLabs-Flows style).
- **The model chip edits** · click the model on any card → provider
  picker (local/open-weight first · then mistral · then the rest) →
  `provider/model` input → the YAML updates as one undoable edit.
- **Honest averages** · `⌀ 2.1s` per task — the mean success duration
  across the recorded flight-recorder runs of THIS graph (majority-
  overlap gated, newest 12 traces).
- **Ports** · in/out dots appear on hover; drag the out-port onto any
  card to declare `depends_on` (the hidden ⌥drag, now discoverable).
- **Verb palette + omnibar** · a floating bottom bar: ◇▷◆✦ one-click
  task add; type `+ infer after gather` for a deterministic insert,
  `/text` to filter, or describe a workflow — that routes into the
  oracle-checked generate pipeline.
- **Semantic zoom** · zoomed out, cards collapse to id + status so big
  graphs read like a map; a zoom % chip sits in the toolbar.

### The DAG speaks nika.sh (default skin `nika` · `nika.dag.theme`)
- **The brand register** · engineered-black surfaces (`#08090b`/`#0a0d12`),
  blue-tinted hairlines, 4px radii, Bayer print-grain, the seam/elevation
  shadow kit, Martian Mono (variable · OFL · bundled) — the same product
  frame the site pins dark everywhere. `editor` mode follows your theme;
  forced-colors always wins over both.
- **Verb identity everywhere** · the canon hues (infer `#5b8cff` ◇ ·
  exec `#ff7a3c` ▷ · invoke `#22d3ee` ◆ · agent `#b07bff` ✦) drive node
  LED spines, icon chips, hover pills AND the editor gutter dots — one
  `--dv-hue` custom property, one vocabulary across every Nika surface.
- **Run states, the site's way** · running = verb-tinted ring + spinner,
  data circulation = sparse round dashes travelling completed wires,
  cancelled stays a decision (dim, never red).
- **Edge aurora verdict** · a full-spectrum ring hugs the viewport at
  near-zero rest intensity; ONE bright hue-travel on a clean live close,
  a red flash on failure. Never fires for graphs that arrive complete.
- **`/` filter** · fades everything but matches (id · verb · model ·
  tool · provider), Enter cycles them, Esc ladders out. Filter and
  focus-lineage compose into one dimming truth.
- **SVG/PNG export** · one click serializes the WHOLE graph with the
  stylesheet + font embedded (PNG at 2×, falls back to SVG); the file
  keeps whichever skin is active.
- **Live minimap** · run statuses now mirror onto the minimap per
  transition; the card re-measures on panel resize (it is responsive).

### Linter depth (the Ruff/Biome bar)
- **Per-code severity remap** · `nika.diagnostics.severity` maps exact
  codes or glob families (`NIKA-SEC-*`) to error/warning/info/hint/off —
  `off` hides the squiggle while quick fixes stay reachable.
- **Workspace-wide lint** · closed `*.nika.yaml` files ride
  `nika check --json` into the Problems panel (300-file cap · logged ·
  ownership hands to the live controller on open and back on close ·
  `nika.diagnostics.workspace` opts out).
- **Related information** · NIKA-DAG-003 lights the producer's
  declaration (both ends of the missing wire); redundant depends_on
  points at its transitive source.
- **Language status items** · the `{}` flyout carries engine
  version/path, the active file's verdict (busy while a pass runs,
  severity mirrors the worst finding), and LSP lifecycle with restart.

### Language intelligence
- **Linked editing** · task ids edit as one across all 4 syntactic homes.
- **Selection ranges** · word → line → task block → tasks section →
  document smart-expand.
- **Task dependency hierarchy** · the native Call Hierarchy UI mapped
  onto the DAG (incoming = dependents unlocked · outgoing = depends_on).
- **Interactive inlay facts** · the cost part click-opens the pre-flight
  report; when-gate and fan-out carry their own tooltips.
- **Hover actions** · task cards gain Focus-in-DAG and Peek-references
  command links.

### Agent-native
- **Engine-canonical wiring** · `Nika: Setup MCP + Agent Rules` delegates
  to `nika wire <client>` when the binary ships it (idempotent · registry
  SSOT) with a one-tap follow-up to also wire codex or claude; the
  extension writers remain the older-binary fallback.
- **Native MCP discovery** · on VS Code 1.101+ the extension registers a
  server-definition provider, so `nika mcp` appears in agent mode with
  zero config files (feature-detected; Cursor keeps the file path).
- **`Nika: Doctor`** · the engine's diagnose-only environment check from
  the palette/status menu.

### Zero-bug ground pass
- batchUpdateStatus recomputes critical-path/flow once per batch (was
  once per task — O(n²) churn on live fan-outs).
- The tar extractor now resolves only after the OS flushed the bytes —
  the caller chmods and EXECUTES that file next (real race), and stops
  decompressing once the target entry is written.
- The hand-rolled TAR/ZIP extractors moved to pure `core/archive.ts`
  with 10 adversarial tests (byte-exact extraction · unaligned sizes ·
  directory decoys named like the target · stored+deflated members ·
  unsupported methods · corrupt containers).
- eslint 9 (typescript-eslint) rides `npm test`; 8 latent findings fixed.
- fit/zoom transitions respect reduced-motion; the fix-all dead loop is
  now the documented single pass; Windows stopped advertising a phantom
  release artifact; `fmt` phantom dropped from task docs; the starter
  comment is vendor-neutral.

## [0.90.2] · 2026-07-03

Docs-only: the plugin install pointer moves to the lean
`supernovae-st/nika-agents` marketplace (kilobytes, not the 5.5GiB
engine clone · verified 0.6s cold add on both ecosystems), and the
agent-native section covers Claude Code beside Codex.

## [0.90.1] · 2026-07-02

Docs-only release: the marketplace page finally shows the product.

- **README hero GIF** · `check-as-you-type` — real `nika check --json`
  diagnostics animated in an editor frame (NIKA-DAG-003 ×2 +
  NIKA-VAR-001 with the did-you-mean, the fix, the clean bar).
  Provenance stated under the gif; editor chrome illustrative, every
  code/message/position is the engine's own output.
- **See-the-run GIF** · `dag-execution` — the real `pr-review-fanout`
  topology executing wave by wave.
- **Agent-native section** · the `nika wire` row (cursor · claude ·
  windsurf · codex) — CLI agents call the same oracle.

No code change; 0.90.0 functionality untouched.

## [0.81.0] · unreleased (announce line)

### Pass 18 · the gate fires — run streams live (2026-06-13)

`nika run` shipped (nika-runtime reached L3); the capability probe lit
it with zero extension release, exactly the gate's promise.

- **`nika run` streams live into the DAG**: `nika.runWorkflow` now
  spawns `nika run --json` and paints its event stream onto the graph
  in real time — the live overlay the panel was built for, finally
  with a real source. Statuses light per the §3.1 machine, terminal
  transitions narrate in the feed, verdict + cost on close. Reuses the
  tested `foldTrace` verbatim (re-fold the whole buffer per chunk —
  chunk-boundary-independent), no second parser. Cancelled on new
  run / panel dispose / deactivate; `nika.run.liveDag` (default on)
  falls back to a terminal run
- **Capability-probe contract made generation-independent**: each
  flag must equal whether `--help` lists its command (not a fixed
  feature set) — the self-deleting `caps.run === false` reminder fired
  and was replaced by the durable probe-agrees-with-itself contract
- **Run-fallback message** points at the binary update (run is no
  longer "the future" — it shipped; this branch is the stale-binary
  path)

### Pass 17 · intent routing descends into the binary (2026-06-13)

- **Engine**: `nika new --from "<free-form intent>"` now BM25-routes to
  the best embedded template (the admitted `nika-bm25` crate + the
  query-side alias bridge the extension proved client-side in pass 14 —
  client-proves-then-binary-owns, again). Deterministic, zero-LLM, the
  routing said out loud; the `embedded set:` probe line is documented
  as a wire contract. Verified e2e: a scrape-summarize-save intent
  routes to `chain` and the instantiated file passes `nika check` clean
- **Engine**: `nika inspect` renders the engineering read (width with
  witness · pinch points · widest blast radii) — the last surface where
  the report's facts stayed invisible to a human
- **Extension**: bi-generation contract test pins the routing seam
  (new binaries route + own-corpus re-check; old binaries decline with
  the wire-contract error — a third behavior is drift)
- **Review fold (pass-16 self-review)**: terminal verdicts freeze —
  duplicate terminal lines in corrupted/re-appended traces no longer
  double-count cost or flip verdicts; minimap gains the §3.1 statuses

### Pass 16 · runtime-v2 wire parity — the §3.1 state machine (2026-06-12)

The engine's runtime v2 landed today and emits REAL traces; the fold
was built against synthetic fixtures. Verifying it against the actual
wire (every shape read from the serde derives + emit sites) found
three real bugs and one semantic drift — all fixed, all pinned by a
new battery:

- **Nanosecond timestamps misread ×10⁶**: the wire's `timestamp` is a
  bare i64 of UNIX NANOSECONDS (serde-transparent); the old
  `>10¹² ⇒ millis` heuristic read a 2-second task as ~23 days. New
  magnitude ladder (ns/µs/ms/s — present-era epochs sit ×1000 apart,
  midpoint thresholds are unambiguous)
- **Run cost was invisible**: the fold only read a `usd` field from
  `cost_incurred` lines; runtime v2 carries per-task `cost_usd` (and
  `tokens`) on terminal events. Both fold now; the run card gains a
  token count
- **ts-derived durations lie**: settlement stamps terminal events late
  — the wire's clock-derived `duration_ms` is authoritative and now
  preferred (span math stays as the no-field fallback)
- **`cancelled` painted red**: §3.1 says a cancelled task is a
  decision, not a defect (dim · never red) and `retrying` means the
  ATTEMPT failed, not the task. Both are now first-class statuses
  across the whole surface — fold, webview nodes (amber pulse ·
  dimmed), legend, activity feed (↻ · ◼ — the CLI's own glyphs),
  progress counting (cancelled is terminal), runs view icons —
  instead of being folded into running/failed

### Pass 15b · the error-code audit + the registry ratchet (2026-06-12)

The deep-review round on pass 15 (two adversarial reviewers + an
exhaustive emitted-vs-registered audit), everything folded:

- **The audit found the registry hole**: the checker statically emits
  the ENTIRE `NIKA-PARSE` namespace (18 codes — the failures a beginner
  meets first) plus the generic `NIKA-BUILTIN-001`, none of which the
  spec's normative floor listed. A second engine could not match
  parse-time behavior from the spec alone; `explain` had nothing to
  teach. Spec registry now 30 → 49 rows (PARSE-016 documented retired),
  prose/canon/catalog/docs re-projected in parity
- **The ratchet** (spec-side gaps now structurally impossible): an
  engine test enumerates every emittable error variant at runtime and
  asserts each spec code has a canon registry row — both sides derived,
  zero hand-enumerated lists; a new variant without a row fails the
  introducing crate's tests before any release
- **Review fold (engine)**: Hopcroft-Karp regained its O(E√V) bound
  (free-layer truncation + gated DFS — the citation is true again);
  the exact read gained a 2 000-task honest-skip cap (the materialized
  closure was a ~400 MB DoS surface at the parser's 10k limit); the
  example renderer mirrors the PLAN width note (two renderers, one
  voice, golden-tested); hint-kind docs list all 8 classes; the canon
  row scan is section-anchored and the escape-free assumption is now a
  tested invariant at the projector seam

### Pass 15 · the intelligence descends into the binary (2026-06-12)

The Socratic round: everything pass 14 proved client-side that belongs
in the oracle moved engine-side (binary = SSOT), with the extension
agreeing by contract.

**Engine-side (the nika repo · three commits)**
- `nika check` now ships the scheduler-independent DAG read in the
  report (`analysis`: exact Dilworth width + witness antichain · pinch
  points · per-task blast radius) and the PLAN line names the width
  when it exceeds the wave peak
- First static write-write race detection for a workflow DSL:
  `parallel-writers` hints (two incomparable tasks writing the same
  literal path · `for_each` over a constant path)
- `retry-effects` hints: retry on `exec`/`mcp:` tools = at-least-once
  replay of uncontracted side effects (first-of-kind per the survey)
- `nika explain` teaches the spec conformance codes (NIKA-DAG-003 …)
  from the embedded canon · the extension's pass-14 fallback goes
  dormant on new binaries, exactly as designed

**Extension-side**
- `CheckReport.analysis` typed (additive · absent on older binaries)
- New oracle-agreement contract test: client `analyzeDag` width /
  witness size / pinch set / blast radius must EQUAL the engine's read
  on the same workflow · proven against the freshly built binary, and
  the explain test is capability-honest across both binary generations

### Pass 14 · the engineering space + intent generation (2026-06-12)

Two research sweeps (48 more verified arXiv IDs · `docs/ALGORITHMS.md`
is the registry), then the implementations, every piece proven against
the real binary (201 tests, contract suite live).

**Added · the DAG engineering read (`core/dagAnalysis.ts`)**
- Exact max parallelism: Dilworth max-antichain via Hopcroft-Karp on the
  transitive closure, with a König witness (« these 4 CAN run together »)
- Pinch points · tasks the whole DAG serializes through (dominators
  evaluated and rejected: wrong semantics under AND-join, see registry)
- Blast radius per task (a failure blocks every descendant) · in the
  hover card
- Work-span (Brent) speedup ceiling + k-worker wall-clock estimates
  (list scheduling by upward rank · property-tested against the Graham
  bracket) · in the explainer's new « engineering read » card, measured
  milliseconds when a run's durations exist, unit steps otherwise
- `nika.unused-schema` lint: a non-sink task declaring a `schema:`
  nothing consumes is a broken promise (conservative · sinks exempt)

**Added · intent → workflow generation (`nika.generateWorkflow`)**
- BM25-routed grounding over the binary's embedded corpus (templates +
  examples + schema spec-slice) with a curated intent→vocabulary alias
  bridge; parallel-shaped intents always carry a fan-out exemplar
- Best-of-N candidates (structurally deduped) scored by the REAL
  `nika check` oracle, early-stop on first all-green, ≤2 repair rounds
  re-grounded per failing code, best-so-far wins · the full
  research-validated loop, seam-tested + contract-pinned
- Two rungs: native `vscode.lm` when the host ships it; grounded-prompt
  to clipboard + routed template opened when it doesn't (Cursor)

**Fixed · verification round against the fresh engine**
- Snippet corpus drift: the engine now statically requires `url:` on
  `nika:fetch` (NIKA-BUILTIN-001) · the Invoke snippet teaches the real
  contract (own-corpus law caught it)
- `Explain` was dead e2e for every SPEC conformance code (NIKA-DAG-003
  · NIKA-VAR-001 · …): `nika explain` only knows the numeric registry
  (exit 2 · typed signal). The extension now projects the canon's
  `error_codes` table as the fallback teach; engine-side unification
  filed upstream

### Intelligence wave (2026-06-12)

The capability-aware build: the extension now probes what the resolved
binary ACTUALLY ships (`--help`) and lights features up per rung · the
static suite today, `run`/`lsp`/`mcp` automatically the day the engine
climbs there.

**Added**
- Check-as-you-type diagnostics from `nika check --json` (conformance ·
  secret leaks/egresses · capability escapes · schema findings · unknown
  tools · hints), byte-span precise, `NIKA-XXXX` codes linked to
  `nika.sh/errors/`
- Quick fixes: the locked fix grammar (`add "X" to permits.<path>`)
  applied as a WorkspaceEdit · did-you-mean tool replacement · literal
  secret → `${{ env.VAR }}` rewrite · explain-this-code
- `Nika: Insert Inferred Permits Boundary` (`check --infer-permits` →
  one-keystroke default-deny)
- Client-side `${{ ... }}` expression intelligence: completions / hover /
  go-to-definition for `tasks.` `with.` `env.` `secrets.` `vars.` refs
- Static-audit surfaces: per-task cost/when/fan-out inlay hints + a
  workflow header lens (check state · tasks/waves · cost ceiling)
- Runs view (flight recorder): folds `.nika/traces/*.ndjson` into run
  cards (status · duration · cost · per-task detail)
- Animated trace replay through the DAG webview (time-compressed ·
  re-render never re-execute) + `Nika: Watch Demo Replay`
- DAG webview upgrades: engine `graph --format json` projection with
  when-gate ⌁ and fan-out ×N badges, tool/cost subtitles, unknown-verb
  tolerance; mermaid/dot export commands
- Embedded-surface tabs (binary = SSOT): `Nika: Open Embedded Spec` /
  `JSON Schema` / `Browse Embedded Examples` / explain pages
- Language Model Tools: `nika_check` · `nika_explain` · `nika_graph`
  (in-editor AI agents call the real oracle) + `Nika: Copy AI Authoring
  Prompt` (deterministic template→check→repair protocol)
- Capability-aware status bar with a full command quick-pick menu
- Secrets lint (pure local scan · zero network · vendor-prefix anchored)
- `nika new` template integration in `Nika: New Workflow File`
- Settings: `nika.intel.enabled` · `nika.diagnostics.runOn` ·
  `nika.secretsLint.enabled` · `nika.traces.glob` · `nika.replay.speed` ·
  `nika.ai.toolsEnabled`

### Pass 13b · the arXiv survey lands (2026-06-12)

- `docs/ALGORITHMS.md`: every non-trivial algorithm with its canonical
  citation + what 2023-2026 literature says (29 papers screened, all
  arXiv IDs hard-verified). Headline validations: the engine's one-form
  fix grammar matches the RustAssistant result (machine-applicable edit
  lists are WHY repair loops converge · arXiv:2308.05177); repair value
  plateaus at ~2 rounds (arXiv:2306.09896 · arXiv:2510.13575); never
  grammar-constrain block YAML directly (not context-free) · constrain
  JSON, transcode; XGrammar is the constrained-decoding default when we
  control the decoder later (arXiv:2411.15100)
- Authoring prompt upgraded to the validated loop shape: think
  free-form FIRST then emit (arXiv:2408.02442) · never repair without
  the fresh report in hand (arXiv:2310.01798) · TWO repair rounds max,
  then regenerate from a different template instead of patching deeper
- Ranked next steps recorded: witness-bearing edge diagnostics ·
  Monte-Carlo p(critical) once run telemetry exists · CPCT+ (grmtools)
  for the Rust LSP parser

### Pass 13 · algorithmic language intelligence (2026-06-12)

**Added · typed dataflow (shape propagation)**
- A task's declared `schema:` is a static contract · so
  `${{ tasks.x.output.<field> }}` now completes WITH the declared
  fields (type + required-ness shown), nested paths included, arrays
  walkable; hover on a deep ref shows the inferred shape one-liner
  (`{ title: string, tags?: string[] }`) and flags paths NOT in the
  schema before the oracle even runs. **Oracle-agreement is contract-
  tested**: client verdict == engine `schema_findings` on both valid
  and invalid paths against the real binary
- `output` completion shows the full declared shape as its detail

**Added · graph-theoretic hints**
- **Redundant dependency detection** (transitive reduction · Aho,
  Garey & Ullman 1972): an order-only `depends_on` already guaranteed
  through a longer path narrows parallelism for nothing · flagged as
  an Information hint (rendered faded · `Unnecessary` tag) with a
  one-click removal. Data-carrying edges are exempt (a wire the task
  reads stays). Contract-tested as ADDITIVE: the oracle stays clean,
  we still teach the tighter graph
- **Did-you-mean on task refs** (bounded Damerau-Levenshtein ≤2):
  `unresolved reference tasks.sumarize` gets a one-click
  `tasks.summarize` rewrite · the engine's tool-suggestion UX applied
  client-side where the report has no suggestion field

**Added · the convergence loop as an editor action**
- `source.fixAll.nika` + `Nika: Fix All Auto-Fixable Issues`: permits
  fixes (locked grammar) + DAG-003 declares + VAR-001 declarations +
  redundant-dep removals applied in one edit · wire it into
  `editor.codeActionsOnSave` and saving repairs the file the same way
  agents converge in CI

### Pass 12 · verification made durable · publish-ready (2026-06-12)

**Added · the drift alarm**
- `scripts/parity.mjs` (wired into `npm test`): manifest ↔
  implementation parity across 8 sections · commands declared↔registered
  · menu/keybinding refs · settings declared↔read · webview protocol
  (postMessage call sites only · type literals produced 10 false
  positives in v1) · LM tools · views/taskDefinitions · volatile counts
  in teaching surfaces · main entry. Exit 1 on any finding, CI-able
- `PUBLISHING.md`: the source-verified Marketplace + OpenVSX runbook
  (accounts/PAT/Eclipse-agreement blockers · manifest gates with our
  live state · Dec-2026 PAT retirement · platform-VSIX plan · lifecycle
  traps) + an inert-until-repo-split `release.yml` (tag-gated dual
  publish · Linux runner on purpose: Windows builds drop the exec bit)

**Fixed · data alignment + policy compliance**
- Generated `.cursor/rules` hardcoded a provider list · now DERIVES the
  cloud/local-sovereign/test groups from the embedded canon at
  generation time (fallback points at `nika spec --canon`)
- Snippet description hardcoded the builtin count
- Check-verdict feed note double-fired per edit (deduped on verdict)
- Binary auto-download now asks **first-run consent** (modal · HTTPS ·
  SHA-256 noted · remembered) · registry policy for extensions that
  download executables, and sovereignty: nothing arrives without a yes
- Workspace trust + virtual workspaces declared (`limited` · a
  malicious workspace can no longer pick which binary we spawn —
  `server.path`/`extraArgs` are restricted configurations)
- `onLanguage` activation removed (implicit since 1.74) · Visualization
  category added · walkthrough run-step now states the capability gate
  honestly · scripts/ · .github/ · PUBLISHING.md excluded from the VSIX

### Pass 11 · the Socratic punch list, executed (2026-06-12)

**Added · the missing wire becomes the fix (THE win)**
- **Ghost edges**: a task that READS another (`${{ tasks.x }}` · bare
  CEL) without declaring `depends_on` · the #1 beginner error
  (NIKA-DAG-003) · now shows as a red marching-dash edge where before
  there was NOTHING. The tooltip explains the law (« data refs do NOT
  imply ordering »), **one click declares the dependency**. Ghosts
  participate in waves (intended order) but never flow green and never
  define the critical path · a missing wire carries nothing
- Empty state ACTS: a real « Show DAG for the active file » button
  (the CTA was previously pointer-events-dead)
- **Session narration**: the activity feed now tells the day-to-day
  story, not just runs · check verdicts (✓ clean / ✗ N findings),
  graph edits (task added · connected · disconnected · deleted),
  follow-mode retargets
- First-contact hint: « Press ? to learn this graph » · one discreet
  line, once ever, auto-fades

**Polish (the rest of the punch list)**
- Per-task code lens fused into ONE (`⌖ graph · 3 refs`) · two lens
  lines per task on a 20-task file was noise; references stay on ⇧F12
- Minimap **drag-to-pan** (mousedown + move = continuous navigation)
- Panel column remembered per-workspace (no more forced Beside on
  every reopen)
- `＋ Task` picker details derive from the embedded schema (verb fields
  projection · a new engine field shows up with zero release)

### Pass 10 · data made visible · the narrated run · responsive (2026-06-12)

**Added · see the data travel (« voir les bindings »)**
- **Data-flow derivation**: the engine projects ORDER; the data story
  derives from the text · `with:` bindings, inline `${{ tasks.X.* }}`
  refs AND bare CEL (`when:`) are scanned per task. Edges that actually
  CARRY a binding turn solid blue **with the alias riding the midpoint**
  (`page` · `status` · `output.title`); gray dashed edges are honestly
  « ordering only · no binding crosses this edge » (the tooltip says
  exactly that, both ways)
- Hover card gains the **inputs wires**: `page ← fetch_page.output`
  rows, source clickable (glide-center)
- The data-skips-a-hop case stays honest: `ship` reading
  `summarize.output` through `gate` does NOT paint gate→ship blue

**Added · the narrated run**
- **Activity feed** (`≣` / `L`): every status transition appends a
  timestamped line (`14:02:11 ✓ summarize success · 2.3s`) · click an
  entry to glide-center that node; capped at 120 entries; when the feed
  is closed, the toggle pulses so events don't go unseen; state
  persisted
- **Enter** on the focused node opens its YAML · the graph hands you
  back to text

**Polish**
- Responsive as a first-class case: 640px (status/kbd/sep fold) ·
  520px (compact feed/minimap/legend) · 420px (minimap+title fold ·
  cards clamp to viewport) · 420px height (legend folds); explainer
  teaches the new gestures; reduced-motion covers the new animations

### Pass 9 · graph editing (the n8n loop) · minimap · brand (2026-06-12)

**Added · edit the DAG, the YAML stays the source**
- **⌥ drag node → node**: creates the dependency (rubber edge follows
  the cursor · Esc cancels) · lands as a `depends_on` text edit, plain
  ⌘Z undoes it
- **⌥ click an edge**: removes the dependency (edge tooltip says so)
- **＋ Task** (toolbar): verb picker (infer · exec · invoke · agent) →
  inserts a check-clean skeleton after the focused task, dependency
  pre-wired, new node focused+centered; skeletons are own-corpus tested
  against the real `nika check` (the n8n loop cannot teach broken YAML)
- **Delete/Backspace** on the focused node: removes the task · REFUSED
  with the referencing task names while anything still points at it
  (a graph edit must never silently break the DAG) · modal confirm
- All edits go through one `applyDagEdit` seam: WorkspaceEdit →
  invalidate → re-project → reload graph

**Added · navigation & brand**
- **Minimap card** (bottom-right · glass): the whole graph at a glance,
  nodes tinted by live status, viewport rectangle tracks zoom/pan,
  click-to-navigate; hides itself when no graph
- The real Nika logo everywhere it belongs: toolbar mark + empty state
  (theme-adaptive · VS Code light/dark body class swaps the variant),
  panel tab icon already had it
- Explainer gains the editing gestures (⌥drag · ⌥click · ＋ Task ·
  Delete)

**Added · LSP completions/hover**
- `depends_on:` value completion · other task ids with verb + line
  detail (the most-typed value in any DAG)
- Hover on a `model:` value names the provider's sovereignty group from
  the canon: local · sovereign (zero-cloud · Rule 1) · cloud · test

### Pass 8 · the living panel (2026-06-12)

**Added**
- **Cursor sync (editor → graph)**: the task under your caret gets a
  soft marching-ants halo in the DAG · « you are here », distinct from
  selection, never dims anything (throttled · same-workflow-gated ·
  `nika.dag.cursorSync`)
- **Follow mode**: the open DAG re-targets when you switch to another
  `.nika.yaml` (debounced 350ms so tab-flipping doesn't spawn a graph
  per stop · `nika.dag.followActiveEditor`)
- **Go-to-definition completes the island grammar**: `${{ with.alias }}`
  jumps to the alias binding in the enclosing task's `with:` block,
  `${{ vars.x }}` / `${{ secrets.x }}` jump to their declaration entries
  (tasks already jumped; `env.` has no in-file home by design)

**Fixed**
- `dag:focus` racing the async ELK layout lost the centering · the
  request now replays once boxes exist
- Follow-mode retarget with a focus carried from the previous workflow
  dimmed the ENTIRE new graph (stale id matched nothing) · stale focus
  drops on graph swap
- A pending delayed-hide from the previous node could kill a freshly
  shown hover card; a focus queued for a disposed panel no longer
  replays a stale zoom on the next one

### Pass 7 · Linear/Raycast polish · interaction depth (2026-06-12)

**Design language (SuperNovae spirit · one tasteful skeuomorphic point)**
- Design tokens: glass surfaces (backdrop blur + saturate), an
  ultra-subtle SVG grain, a single 1px top-edge light catch
  (`--nk-bevel`), layered shadows · texture without noise
- Toolbar → glass rail: 🦋 mark · grouped segmented buttons · real
  keycap chips (`F` · `W` · `?`) · THE skeuomorphism point, gradient +
  2px bottom border like a physical key
- Canvas → dot-grid board (the Linear feel) · nodes get verb-tinted
  icon chips (Raycast-style tinted squares) · Linear-style focus ring
  (ring + gap, not a fat border) · tabular numerals everywhere
- Empty state: branded card with the exact command to type (`⇧⌘P →
  nika dag`) · the first pixel is no longer a blank void

**Interaction & explanation**
- **Explainer overlay (`?`)**: « Reading this graph » · wave bands ·
  critical path · flowing edges · focus mode · hover card, each with a
  visual glyph + the keyboard map; Esc/click closes
- **Hover card is now interactive**: `needs:` / `unlocks:` neighbors are
  clickable chips · click to glide-center that node with its lineage
  lit; the card persists while the pointer travels to it (delayed hide,
  cleared when a new node shows)
- **Editor ⇄ graph**: per-task code lens `⌖ graph` focuses + centers the
  node in the DAG panel (`dag:focus` protocol · queued across webview
  boot · cleared on panel dispose); `N refs` lens peeks every reference
  (depends_on · islands · CEL) inline
- Verb-tinted gutter dots on task lines (toggle
  `nika.decorations.verbDots`)
- Rich markdown tooltips: workflow tree (verb census + check verdict +
  path) and runs view (success/fail/retry counts · unparsed-line
  warning · replay hint)

### Pass 6 · the WOW DAG + deeper LSP surfaces (2026-06-12)

**Added · the DAG explains itself**
- **Wave bands**: topological execution levels rendered as background
  bands (`wave 1 · 2 · …`) · the parallelism visible at a glance;
  toggle ≋ / W, persisted
- **Focus mode**: click a node → its full lineage stays lit (everything
  it needs upstream + everything it unlocks downstream), the rest fades;
  Esc or background click clears
- **Rich hover card**: verb chip · status · model/tool · when-gate ·
  fan-out · static cost interval · duration · wave position · `needs:` /
  `unlocks:` neighbor lists · the node narrates its own role (safe DOM
  construction, no markup injection)
- **Edge flow**: once a source task completes, its outgoing edges carry
  an animated current · data visibly travels through the graph
- **Critical path**: the longest chain (durations when known, else hops)
  highlighted in yellow with a legend chip · the wall-clock explained
- **Entrance choreography**: nodes fade in staggered BY WAVE · the DAG
  performs its own execution order on load
- **Legend + progress bar**: live status chips + completion bar
  (green=complete · red=has failure)
- Everything animation-gated on `prefers-reduced-motion`
- Webview now typechecked (`npm run typecheck` covers it · it was
  excluded from tsconfig and silently unverified)

**Added · LSP surfaces**
- Semantic tokens: `${{ }}` island roots/paths, task-id declarations,
  builtin tool literals · islands read as code, not strings
- Document highlights: cursor on a task id lights every reference home
- Folding: per-task + top-level blocks (vars · secrets · permits ·
  outputs · env · tasks)
- Workspace symbols (⌘T): jump to any task in any workflow
- Quick fixes for the two most common conformance classes:
  **NIKA-DAG-003** (`tasks.X` referenced without depends_on → declare
  it: extends inline lists, appends block items, or inserts fresh) and
  **NIKA-VAR-001** (unresolved `vars.x` → declare it in the vars block)

**Fixed**
- `language-configuration.json` indentation rules still listed the
  5-verb-era `fetch` verb and phantom keys · replaced with the real
  envelope keys

### Pass 5 · LSP-grade intelligence + every-editor branding (2026-06-12)

**Added · schema-derived intelligence (vocabulary FROM the binary)**
- Completions everywhere, derived at activation from `nika schema` +
  `nika spec --canon`: top-level keys, task fields, per-verb bodies (all
  with the schema's own doc strings), closed enums (`capture` ·
  `backoff_strategy` · secrets `source`), the closed builtin tool set +
  `mcp:server/tool`, provider-prefixed `model:` values (cloud · local
  sovereign · test groups from the canon), `nika:fetch` `mode:` extract
  modes · zero hardcoded vocabulary, a new engine field lights up with
  zero extension release
- Hover for field keys (schema descriptions + value sets) and for
  `nika:*` tool ids (flags non-existent builtins inline)
- **Task rename (F2)** hitting all 4 syntactic homes · declaration ·
  `depends_on` (inline + block) · `${{ tasks.X }}` islands · bare CEL in
  `when:` · and enforcing the engine id grammar (snake_case · CEL-safe);
  **find-references** over the same scanner
- LSP client hardened for the `nika lsp` handover: initializationOptions
  declare the host editor + which layers the client keeps (expression
  intel · enum completions · secrets lint), configuration sync,
  untitled-doc selector, trusted markdown

**Changed**
- Editor-inclusive branding: this is the extension for EVERY VS
  Code-compatible editor (VS Code · Cursor · Windsurf · VSCodium via
  OpenVSX) · README explains the `nika-vscode` platform name, Marketplace
  description + keywords updated

### Pass 4 · contract suite + snippet own-corpus (2026-06-12)

**Added**
- Engine contract test suite (`contract.test.ts` · skips without a local
  binary): capability probe · check clean/findings adapters · graph →
  DagGraph · infer-permits → insert/apply round-trip re-checked through
  the oracle (never corrupts) · schema enum pins (capture ·
  backoff_strategy · the closed builtin tool set) · every embedded
  template passes its own check · explain real/garbage
- Snippet OWN-CORPUS law: every shippable snippet, materialized, must
  pass `nika check` conformance · the extension must not teach syntax
  its own oracle rejects
- Hard-parse fallback diagnostic: `check --json` emits non-JSON
  (`PARSE ✗ …`) on grammar-level failures · the worst error class now
  paints a document-top squiggle instead of nothing

**Fixed (snippets vs the embedded schema · 9 drifts)**
- task ids taught kebab-case (`first-task`) · the engine grammar is
  `^[a-z][a-z0-9_]*$` (snake_case · CEL-safe): instant PARSE error
- `capture: text` does not exist → `stdout|stderr|combined|structured`
- retry field is `backoff_strategy` (not `backoff`) · `backoff_ms` added
- `nika:transform` is not a builtin → real tools (`nika:jq` ·
  `nika:validate`)
- fetch extraction: the parameter is `mode:` (not `extract:`) and the 9
  canonical modes are `markdown·article·text·selector·metadata·links·
  jq·feed·sitemap` (the old list had 5 phantom modes)
- `on_finally` takes step objects (verb mappings), not task-id strings
- Pipeline snippet referenced `tasks.first` without `depends_on` —
  NIKA-DAG-003: data refs do NOT imply ordering; the snippet now teaches
  the explicit dependency
- ref-bearing placeholder defaults (`${{ vars.x }}` in prompts) made
  materialized snippets unresolvable · moved to descriptions

### Pass 3 · publish-readiness + live surfaces (2026-06-12)

**Fixed (3rd reviewer · binaryInstaller/mcpConfig/new-code lenses)**
- Workspace-committed MCP configs (`.cursor/mcp.json` · `.vscode/mcp.json`)
  baked an absolute per-machine binary path · broken for every teammate
  cloning the repo; they now always reference the PATH-portable `nika`
  (only the per-machine Windsurf global config keeps the resolved path)
- Binary download: socket leak on non-200 responses (body never drained)
  and an uncaught synchronous throw on a non-https redirect (protocol
  downgrade now refused explicitly)
- Service cache integrity: `invalidate()`/`setBinary()` now detach
  in-flight check/graph runs, and a detached flight can no longer
  re-stamp a deliberately cleared cache with stale or wrong-binary
  results (guarded stamps)
- Flow-list editing: a `]` inside single-quoted YAML values no longer
  truncates the bracket scan

**Fixed**
- Packaged VSIX could not activate: `.vscodeignore` excludes
  `node_modules/**` while the tsc output required
  `vscode-languageclient` at runtime · the extension host bundle is now
  esbuild-built (single 432KB file · only `vscode` external · tsc is
  typecheck-only). `vsce package` smoke-verified: 22 files, no
  node_modules
- `taskDefinitions` declared the `nika` task type with NO registered
  TaskProvider · every tasks.json entry of that type errored; provider
  now auto-offers `check` per workflow (and `run` once the engine ships
  it) and resolves user definitions with proper arg quoting

**Added**
- LIVE trace overlay: while an engine writes `.nika/traces/*.ndjson`,
  the open DAG panel updates task statuses in real time (debounced ·
  majority-overlap gated · `nika.traces.live`)
- Check badges in the Workflows tree: ✓ clean / N findings per file,
  derived from the cached report (zero extra spawns, refreshes when the
  debounced check lands)

### Review pass (2026-06-12 · 2 adversarial reviewers · 18 findings folded)

**Fixed (review)**
- Per-keystroke binary spawns: inlay hints + code lenses re-fire on every
  edit and the caches are version-keyed · dirty buffers now read the last
  cached projection (`peek`) and refresh when the debounced check lands
  (`onDidUpdateDocument`); only saves/diagnostics spawn
- Flow-style permits corruption: `applyPermitsFix` on the
  `--infer-permits` shape (`net: { http: [...] }`) spliced malformed
  block YAML under a flow line · now edits the flow list in place, or
  REFUSES (never corrupts); covers empty lists, duplicates, `exec: false`
- Trace fold: a late/out-of-order `task_retrying`/`task_scheduled` line
  resurrected a terminal task; mixed traces (some lines without
  timestamps) polluted `startMs` with a synthetic counter → absurd spans
- Phantom tasks: nested `- id:` lines (e.g. invoke args lists) parsed as
  workflow tasks · task items now lock to the canonical dash column
- `depends_on` items separated by a blank line were silently dropped
- Concurrent checks on the same dirty doc raced on ONE tmp file (write /
  unlink overlap) · unique per-invocation tmp names + in-flight dedup
- Overlapping trace replays interleaved status updates forever —
  replays now cancel the previous timer set
- Restored DAG panels (after VS Code restart) had NO message handler:
  every node click died · the serializer now adopts the panel with full
  wiring, and node clicks carry `workflowUri` from the webview's own
  persisted state; webview message listener registered BEFORE html
- Report tabs (`nika-doc:`) were frozen snapshots · they re-render when
  a fresh check lands; spec/schema tabs re-render on binary swap
- clap `--help` wrapped description lines could become phantom
  capabilities (`\s{2,}` matched the wrapped column) · exact 2-space
  command column required
- Secrets lint boundary: `risk-…`/`lighp_…` no longer read as sk-/ghp_
  credentials (lookbehind on every vendor prefix)
- LM tools resolved relative paths against the extension-host cwd
  instead of the workspace root · wrong file silently targeted
- Commands invoked with a non-`.nika.yaml` URI are refused instead of
  running the binary against arbitrary files
- LSP lifecycle: the synchronize file watcher leaked per restart; the
  30s status poll survived host-driven deactivation; diagnostics
  debounce timers survived document close

**Added (review)**
- Document symbols (outline + breadcrumbs): tasks with verb detail +
  the permits boundary · the `nika` language id had an EMPTY outline,
  so `Nika: Show Tasks` focused a blank view

**Fixed**
- `graph` invocation drift: the CLI contract is `--format json` (the
  extension called `--json`) and the GraphDoc envelope is now adapted
  field-for-field (`graph_format: 1` · `edges[].from/to/kind`)
- 5-verb era remnant in the DAG webview (`fetch` verb icon) · the 4 verbs
  are locked (D-2026-05-22-N18); fetch is the `nika:fetch` builtin
- LSP no longer attempts to spawn when the binary does not ship `lsp`
  (capability-gated · no more startup error toast)
- DAG panel tab icons pointed at a non-existent `media/` directory

**Engine-honesty**
- Zero hardcoded vocabulary: providers/builtins/templates/examples are
  read from the binary at runtime; counts never inlined
- Exit-code contract pinned (0 ok · 1 workflow failed · 2 file findings ·
  3 environment) per spec §4

## [0.81.0-seed] · 2026-06-10

- Lifted from the brouillon `editors/vscode` draft (1.6k LOC TS) per
  brouillon-lift-pattern · 4-verb canon sweep · `nika lsp` stdio contract
  · schema v1 URL · TextMate grammar · snippets · DAG webview (ELK + D3)
  · workflow tree · MCP config (Cursor/VS Code/Windsurf) · binary
  auto-download with SHA256 verify · walkthrough (6 steps) · vitest
  harness (12 tests) · esbuild bundling
