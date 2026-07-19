# The canvas design system · nika-vscode

The visual contract of the DAG webview. One anatomy, two registers
(skins), one status grammar. Every rule lives in `src/webview/dag.css`
behind the `--nk-*` token seam — rules consume tokens, never raw colors.

References studied (2026-07-05): **ElevenLabs Flows** (floating-chrome
canvas · satellite meta rows · port chips · the detail bar), **Well
Workflows** (the two-zone card · dotted wires with endpoint dots ·
status-dot grammar), **n8n** (icon-tile identity · + affordance on
ports), and nika.sh (ambiance only — blue-black, ONE blue accent,
aurora; the site's heavy slab register is deliberately NOT the canvas).

---

## 1 · The one anatomy — the two-zone card

The SVG layer owns geometry and interaction (layout box · hit area ·
ports · spinner · drag). The HTML layer (`foreignObject > .nc`) owns
every visible pixel.

```
┌────────────────────────────────┐
│ ⬚ task_id            ● ⚠2 ×5  │  head 22 · verb TILE + id + status DOT + chips
│ ─────────────────────────────  │  hairline divider (12 incl. margins)
│ ▛ recorded artifact ▟ 1/3      │  preview 92 img / 30 audio (+6) · THE generation
│ infer · mistral → ✓ 2.3s·$0.004│  sub 15 · mechanism → verdict (+ recorded $ ·
│                                │           live tasks count OBSERVED elapsed `12s ⋯`)
│ Rank these stories by…         │  body 15/line · prompt / $ cmd / args (≤3)
│ items ← fetch  brief ← rank +1 │  io 15 · inbound wires (≤2 + overflow, jump)
│ [mistral/large] $0.004–0.03 ⌀2s│  params 24 · chips (edit) + facts (read)
│ [↻×3][⏱ 45s][✚ recover][⤳ 2][▦1]│ policy 20 · retry·timeout·on_error·outs·permits
└────────────────────────────────┘
  248px wide · min 72px · height from content (the layout knows the truth ·
  the TS `Card anatomy metrics` block in dag.ts MIRRORS these numbers — law 2)
```

- **The preview is engine truth only**: the artifact comes from the
  RECORDED trace (`artifacts.ts` — a file a run actually wrote, that
  still exists on disk); webview URIs mint at post time over
  workspace-rooted `localResourceRoots`. Image = thumb (click opens the
  real file), audio = a playable row (ONE player canvas-wide, ▶ only —
  nothing autoplays). Exports shed the bytes (webview URIs die outside
  the panel) and keep the box.
- **The elapsed is observed, never invented**: a live task counts OUR
  clock from the observed start event (`12.4s ⋯` — the ⋯ marks it
  live); the engine's measured duration takes the cell at settle. No
  observed start (restored panel · scrub) → no number.

- **Verb tile** (the n8n read): 22×22, radius 6, verb hue at 14% fill +
  30% border, the verb glyph inside. THE identity mark at every zoom.
  Verb hues are locked language: `infer #5b8cff · exec #ff7a3c ·
  invoke #22d3ee · agent #b07bff`. Run state never recolors the tile.
- **Status dot** (the Well read): one 7px dot in the head, right side —
  resting gray · running verb-pulse · success green · failed red ·
  cached hollow. Readable at 40% zoom where text is not.
- **The sub line is honest**: at rest it names the mechanism
  (`infer · mistral`); settled it becomes the run line — `✓ 2.3s`
  green · `✗ 4.1s` red · `↻ cached` — after a run the dominant fact
  IS the outcome.
- **Pending is calm.** A card at rest looks normal (Well). Running
  lights up, failed screams, success is a quiet green fact. Never a
  canvas of ghosts before the first run.
- Ports: always-visible 3.5px dots on the top/bottom edge midpoints
  (the Well endpoint dots), growing to 6.5px on approach; drag out =
  new wired task.
- **Every language feature is visible** (the Socratic rule — if the
  language knows it, the canvas shows it): a `when:` gate wears a
  dashed amber chip (`⌁ vars.publish` — dashed = maybe, the cached
  vocabulary); a fan-out task wears a DECK (two ghost sheets — the
  parallel copies) plus the ×N badge; builtin tools carry their
  category glyph (core ◦ · file ▤ · data ⧉ · network ⇄ ·
  introspection ⌕ · media ▣ — a presentation fallback until the
  extension feeds categories from `nika tools --json`); and a settled
  task's RECORDED OUTPUT lands on the card (`→ …`, green-tinted) where
  its prompt was — the run shows its data, a re-run restores the rest.
- **The card knows itself** (MV8 · `core/cardIdentity`): identity
  resolves from the graph SSOT — verb × builtin × the engine's own
  catalog category (`catalog --tools`), never guessed. An image-making
  builtin owns a **developing frame** before any artifact exists (calm
  dashed slot at rest — « this task produces an image » · a develop
  sweep in the verb's hue while running · the recorded artifact
  replaces it in the SAME box, so a status flip never relayouts); a
  file writer lands its **receipt row** (`▤ name` · click opens ·
  existence proven by artifacts.ts); the network category **pulses**
  its glyph on the running tool chip. Per-verb RUNNING identities
  carry the canonical `design/motion.yaml` names (`nika-motion-*` —
  one motion vocabulary across site · terminal · canvas; the
  tokens-parity belt guards the names).
- **The connection is one object** (MV10): hovering a wire lights
  BOTH endpoint cards (`edge-touch` — a touch, not a claim); the
  focused card claims its incident wires (`edge-adjacent`, calmer
  than hover · the lineage lens outranks); hovering an io-row chip
  lights the wire it names.
- **The io row** (dense-card 2026-07-11): the inbound wires, named ON
  the card — `alias ← producer`, data-hue alias, click jumps to the
  producer; ≤2 wires + a `+N` counter (title lists the rest). The
  in-port wears the data hue when wires actually plug in.
- **The policy row**: declared execution policy as footer chips —
  `↻×N` retry.max_attempts · `⏱ 30s` timeout · on_error route
  (`✚ recover` amber · `⤼ skip` dim · `⛔ fail` red) · `⤳ N outs`
  named output bindings · `▦ N` permits (engine-projected, #367).
  Facts only — an undeclared policy renders NOTHING.
- **The hover card is the run story, never a card mirror**: actions
  (▸ run · ⧉ dup) + output/spent/cached/recovered + wave/blast/pinch +
  needs/unlocks jumps. Mechanism facts live on the card. It anchors to
  the NODE box (right flank, flips left) — a steady inspector with a
  predictable pointer path, not a cursor-chaser.

## 2 · Wires — the kind vocabulary (graph_format 2 · one channel per question)

Channel allocation (the Bertin discipline): **dash = ontology** (solid
carries a value · long-dash carries a RECORD read · dotted carries
control), **hue = outcome class** (data blue · failure hue on the
failure read · amber on recovery), **the WAIST glyph = the kind** (end
arrowheads drown under target cards — the n8n 1.70 read — so the form
rides the wire's midpoint), **motion = liveness only**.

| kind | stroke | waist form | hue |
|---|---|---|---|
| value (`with:` binding) | solid 1.6px | chevron ⌃ | data accent |
| control (`after:` predicate) | dotted bead-chain | slim chevron | muted (predicate label rides the wire) |
| terminal-observation | long-dash `7 4` | **hollow dot** (reads every outcome) | data accent |
| failure-observation | long-dash `7 4` | **diamond** (admits on failure/skipped) | mixed toward `--nk-st-failed` |
| recovery (`on_error.recover`) | dotted `2 6` thin | **open hook** (loops back) | amber · parked (never flows · never critical) |
| `finally` (reserved · never emitted in W2) | — | none (parked until the engine speaks it) | — |

- Every hover title states the edge's **pass-set verbatim** (gate
  algebra v2 — `admits {failure · skipped}` on a failure read): the
  hover is where the algebra teaches itself.
- Critical path: amber; flow (source settled → target running):
  SMIL particles on the LIVE FRONTIER only — never a dash march on
  the whole graph.
- **Layout law** (MV9): production ELK set — straight value wires ·
  `considerModelOrder` (the author's YAML order IS the layout order ·
  diff-stable) · recovery routes as feedback loops · typed kinds
  never merge · post-layout every card snaps to the 8px survey grid.
  Far zoom recedes wires toward the page so TOPOLOGY carries; the
  failure hue demixes LAST, critical keeps its ink.

## 3 · Chrome floats (the ElevenLabs read)

The canvas is edge-to-edge; every control is a floating pill OVER it:
title pill top-left, action pill-groups top rail, the omnibar
bottom-center (run · cost Δ · verb palette · command input), minimap
bottom-right, legend chips bottom-left. Fit-to-view accounts for the
top rail AND the bottom dock — the graph never hides under chrome.
On narrow panels the dock un-stacks into two floors; nothing overlaps.
On WIDE panels the left flank carries the **plan rail** — every wave as
a clickable row (`[ 01 ] ×2 · [ 02 ] then …`), the viewport's wave
tracked live, click glides to it; the in-canvas captions yield to it
(≥1000×461 · ≥3 waves; fit reserves the column). The void becomes the
plan.
Sidebar-dock tiers: ≤380px keeps run + command line + zoom (every
optional chip yields, F still fits); ≤460px height gives the floor
back to the canvas (minimap/legend/hint yield). The status pill
ellipsizes — chrome never clips.

## 3b · The welcome home (first open · no workflow)

The empty canvas is not an error — it's the front door. One card on
the grid answers the three first-minute questions in order: *where am
I* (hero: the mark, the wordmark, one honest tagline), *how do I
start* (a describe→generate bar — type a sentence, ✨ hands it to
`nika.generateWorkflow` — then New / Examples / Replay / All
commands), *what can this do* (recent `*.nika.yaml` from the
workspace by mtime, then the capability map: eight one-line commands
— check · report · inspect · permits · explain · spec · AI prompt ·
MCP setup — every button a real `nika.*` command).

Rules: the canvas chrome RETRACTS (`body.welcome` hides toolbar,
omnibar, minimap, legend, activity — no dead controls over the door;
grid + aurora stay). The webview never names a command the extension
didn't whitelist (`WELCOME_COMMANDS`). Recent rows come from the
extension (`welcome:data`), never from webview fs access. Both skins,
scrollable card, single-column ≤460px. The sidebar tree mirrors the
same door natively via `viewsWelcome` — logo-less, three verbs and
the palette hint — so the first click can happen in either surface.

## 4 · The two registers

### `nika` (default · the brand ambiance · always dark)

THE reference background (operator lock · deepened 2026-07-06): true
near-black page `#0d0d0e` with white `+` survey crosses @40px, raised
NEUTRAL cards (`#1c1d21` · white hairlines 0.09) — the cards keep
their level while the pool falls away, so the raise WIDENS. **Blue
lives only in accents**: data wires, verb tiles, selection, the
pointer lamp, the aurora — and it is ONE blue: the Run CTA derives
from the accent (`color-mix`), never a second unrelated blue. Martian
Mono everywhere. Quiet by default — glow is spent on
running/selected/failed only.

**The background is a four-layer instrument, each layer with a job:**
1. **The survey grid follows the CAMERA** — near reads the fine 40px
   crosses; `lod-far` swaps a calmer 96px major graticule (a map gets
   a map's grid; deep zoom-out never becomes cross-noise). Pure CSS
   off the LOD classes.
2. **The vignette KNOWS the run** — at rest the pool edges fall to
   0.38 black; while tasks execute the falloff tightens (0.5, closer
   in), pulling the eye to the lit work; a finished canvas relaxes.
3. **The pointer lamp** — a faint accent glow trailing the cursor
   (two custom props per frame, paint-only).
4. **The aurora** — speaks once, at a live run's close.

### `editor` (adaptive · `nika.dag.theme: "editor"`)

Everything derives from `--vscode-*` tokens (any theme works) — and
the ACCENT is the theme's own voice: `focusBorder` drives selection/
accent, `textLink-foreground` drives data wires, `button-*` drives the
Run CTA. A purple theme means a purple canvas. Two refinement scopes
sharpen the craft:

- **Light — the ElevenLabs read**: white page, near-invisible dot grid,
  white cards (radius 10 · `rgb(0 0 0 / 0.1)` hairline · layered soft
  shadow), hover raises border+shadow, black ink, one blue accent,
  floating pills with real elevation.
- **Dark — the Well read**: near-black page, visible dot grid,
  `editorWidget` cards, white hairlines (0.09 → 0.14 hover), inset top
  light catch, tight shadows.

`nika.dag.theme: "auto"` resolves live: the brand skin on dark
themes, the adaptive skin on light — re-resolved on every theme
switch, no reload.

High contrast wins over both skins TWICE: the OS `forced-colors`
media query AND VS Code's own hc themes (`.vscode-high-contrast`
body class — hard 2px borders, zero shadows/grain/loops).

## 4b · The material register (skeuomorphism 2040)

The Socratic question: **what is this canvas MADE of?** Answer: a
modular synth rack — a DAG of signal flow is literally what a modular
synthesizer is. Material honesty, never 2010 leather:

- **Cards are MODULES** — machined faces (grain print + a barely-there
  vertical convexity, nika skin); the deck pills carry an extruded
  bottom lip (they sit ON the surface).
- **Ports are patch-bay JACKS** — dark bore + machined collar; hover
  lights the collar. The wire plugs INTO the module.
- **Status dots are LEDs** — glass-dome specular up-left, color core,
  dark rim seat; LIT states bloom (running/failed 6px halo, success
  5px). Cached = an unlit dome behind a green ring.
- **Verb tiles are KEYCAPS** — top light catch, seated bottom lip, the
  verb hue as backlight glow through the glyph.
- **Run/Stop are MACHINE KEYS** — extruded (2px lip + drop), and they
  PRESS: 1.5px travel with lip compression at 90ms.

Rules: semantics are never material-swapped (LOCK-005 hues untouched);
the editor-light skin keeps materials at a whisper; high contrast
strips every material (flat system colors).

## 5 · Status grammar (LOCK-005 · never brand-swapped)

| state | card | dot | sub line |
|---|---|---|---|
| pending | base (calm) | muted | static fact |
| running | verb ring + pulse + spinner | verb, pulsing | `verb …` |
| success | base | green | `✓ 2.3s` green |
| failed | red border + ring | red | `✗ 4.1s` red |
| retrying | amber pulse | amber | `verb …` |
| cached | dashed border, no flash | hollow green | `↻ cached` |
| skipped/cancelled | faded | gray | fact |

## 6 · Motion

One signature ease `cubic-bezier(0.22, 1, 0.36, 1)` @140ms for every
hover/focus/state. ARRIVALS ride the SPRING — a canonical `linear()`
curve with ~4% overshoot (`--nk-spring` · falls back to the ease via
`@supports`): card entrances, verdict pops, the output line. The
CAMERA speaks ease-out (every d3 zoom transition: fit 460ms · center
420ms · wave 360ms · minimap 240ms — the canvas-tool standard, never
symmetric in/out). The hover inspector GLIDES between anchors while
open (left/top transition 190ms) instead of re-popping. Compositor
props only. `prefers-reduced-motion` disables every loop.

The orchestrated moments (each spent exactly once, where it means):
- **Entrance** — cards rise in staggered by wave (70ms/wave · 0.32s),
  wires fade in just after their source card's wave: the DAG performs
  its own execution order on load.
- **« AI is working »** — running cards wear the n8n ring (verbatim
  spec from their canvas source): two bright verb-hued arcs bridged at
  20% alpha, orbiting on an animated `@property` angle at **1.5s**;
  RETRYING wears the same ring at **4.5s** — slower reads as holding,
  the backoff made visible. Failed keeps the static red ring.
- **Settle** — the moment a task lands ✓ in a LIVE run, one soft green
  ring breathes out of the card (0.7s, once); the verdict value pops in.
  A loaded finished graph stays still — motion narrates change, never
  state.
- **The plan breathes** — dependency bead-chains march only while a run
  is live; the progress fill carries a light sweep. Data edges animate
  on the LIVE FRONTIER only (source settled → target running); a
  both-settled edge rests as a quiet success tint — never the whole
  graph (the React Flow discipline).
- **Selection is zoom-compensated** — the halo keeps one optical weight
  at every zoom (`calc(2.5px * var(--zoom-comp))`, clamped ×3).
- **Depth** — a faint blue lamp follows the pointer over the pool (nika
  skin · two custom props per frame, paint-only).
- **Follow the run (G · ⌖)** — the camera tracks the frontier: when a
  task starts OUTSIDE the middle-60% comfort band, one 560ms ease-out
  glide recenters it (throttled to 1/400ms). Any HUMAN pan/zoom while
  following yields the camera for the rest of the run — the hand
  always outranks the director. Off by default, persisted.
- **Failure shockwave** — a LIVE failure ripples its blast cone: every
  downstream card takes one transient hit (red ring breath + dip,
  0.6s), staggered 70ms per graph hop — causality made physical,
  before the engine even reports the skips. Live runs only; a loaded
  failed graph stays still.
- **Close** — the aurora speaks once at a live run's end (nika skin).

## 6c · Semantic zoom — readable at every distance

The Socratic rule: **if the map isn't readable, it isn't a map.** The
canvas has three LOD tiers driven by zoom (hysteresis bands — enter
low, leave high — so a pinch resting on a boundary never flaps):
- **near** (≳0.42) — the whole two-zone anatomy.
- **mid** (0.30–0.42) — the params row yields.
- **far** (≲0.30) — the card becomes a MAP TILE: verb tile + id +
  status dot, dead-center, **zoom-compensated** (the Figma read — the
  pieces ride `--zoom-comp` so the id holds one optical size on screen
  instead of shrinking into lint). The id clips at the START
  (ellipsis-start via RTL): fan-out ids differ at the TAIL, so
  `shard_1…shard_8` read `…ard_1`/`…ard_8`, never eight identical
  `shard…`. Ports, edge labels, badges and region labels yield; the
  geometry never moves — wires stay pinned.

## 6b · Projections & drag intelligence (research-ranked, 2026)

- **Heatmap (H)** — a READING MODE, not an overlay: cards tint by
  measured duration (else static cost ceiling) on a √ perceptual ramp
  (long-tail metrics would crush a linear one into a one-card show),
  while everything that isn't the gradient steps back — wires quiet,
  verb tiles desaturate, chips dim, the critical-path chip yields. A
  legend key names the metric in play (`measured time` / `static
  cost`) beside a gradient bar. Recomputed live as durations land.
- **Alignment magnetism** — dragging snaps to other cards' edges and
  centers within 6px; accent guides draw the agreement; Alt bypasses
  (the Figma/helper-lines convention).
- **Run from here (▶ on the hover card)** — ONE task + its upstream
  cone through the extension's `rerunTask` flow (engine `run --task`);
  upstream cache-hits stay cache-hits. The n8n partial-execution move,
  reachable without leaving the canvas.
- **Duplicate (⌘D · `⧉ dup` on the hover card)** — the copy lands
  under the original with a fresh `_copy` id; inbound wiring kept,
  downstream refs stay on the original.
- **Insert on edge (+)** — hovering a DEPENDENCY wire mounts one
  floating machine button at its midpoint (zoom-compensated, a real
  finger target riding an invisible 16px hit twin — a 2px stroke is
  not a target). Click → verb pick → the task SPLICES in: skeleton
  after the upstream end, the wire reroutes through it. Dep wires
  only — a data edge's binding is a ref, never rewritten.
- Researched next: pin node outputs (n8n's most-loved dev feature).

## 6d · The lens deck — one graph, N projections (One-DOM law)

The doctrine steal (« 1 graph · N lenses ») made canvas: every lens
is a projection over the SAME typed graph — a CSS scope or an
alternate layout pass of the ONE panel, never a second DOM. Each
answers one question, on one key:

| Lens | Key | Question | Mechanism |
|---|---|---|---|
| what-if | X (· ⚡ hover) | why does `on_error` exist? | pure admission replay (gate algebra) — `sim-failed` ring · `sim-dead` dim · `sim-lit` amber; LIT is reserved for paths that admit non-success AND refuse success |
| timeline | T | where did the time go? | alternate layout pass — wave-ordered rows, REAL clocks only, retry sub-segments, hollow cached, ghost ceiling (recorded mean) UNDER the bar, the replay cursor rides the lens |
| audit | P | what can this file DO? | capability hulls (convex, padded, dashed) under the wires + the banner; state hues used semantically — egress red FIRST · exec amber · fs green · tool blue; ⚿ secret ring on pasted literals |
| dataflow | D | where does the data go? | answer by subtraction — control/recovery sleep (0.07), prose rests (0.18), bindings + ports carry the story; direction heads wake at every LOD on purpose |
| heatmap | H | what was hot? | §6b — a reading mode, never ambient |
| gallery | — | what's in this workspace? | the welcome's recent rows lead with their file's shape (miniDag — the peek grammar at row scale) |

**Stacking law** (empirically settled 2026-07-19): the timeline is
the deck's ONLY non-map projection — everything map-anchored (plan
rail · audit hulls · banner) SLEEPS under `body.timeline` and comes
straight back (sleep, never clear). Map-space lenses compose freely
(dataflow × audit is a coherent read; simulate works inside both).

**Composition grammar** (spec 14, engine-honest): the ⎘ chip is a
DOOR (opens the child) · the card face is the child's API (manifest
+ promoted contract rows — facts from both files, `nika check` owns
verdicts) · the hover PEEK renders the child's real shape in
miniature · the dive trail (`parent ▸ child`) grows on ⎘, truncates
on crumb jumps, clears off-trail — the crumb IS the return
affordance. Never an invented rollup: each file's manifest is ITS
engine projection.

## 7 · Rules that keep it SOTA

1. Tokens or nothing — a rule reading a raw color is a bug.
2. One DOM, two skins. A skin is a CSS scope, never a TS branch.
3. Hover always RAISES contrast; selected outreads dimmed.
4. Chips are buttons (edit) or facts (read) — a fact never looks
   pressable.
5. Wave captions speak the plan grammar — `[ 01 ]  start ·
   run together ×N · then` — always on; the band fills are the W toggle.
6. Every visual claim is proven by the screenshot harness —
   `scripts/media/harness.html`, opened headed under Playwright with
   REAL gestures (trusted clicks · key presses · hovers; the page
   boots the actual `out/webview/dag.js` bundle). Its judge flags:
   - `?still` — the graph loads, the scripted demo run stays QUIET
     (a judge driving its own statuses must not wrestle the sim);
   - `?empty` — no graph at all: the welcome + hero ghost state;
   - `?n=300` — the deterministic perf fixture (implies `?still`);
   - `?skin=nika|editor|phosphor` — stamps the skin the way
     dagPanel does (without it three « proofs » once shot ONE skin).
   The page carries its own fixture-side canary strip (a canary must
   never depend on the bundle it guards) — a boot exception paints
   red instead of leaving handler-less corpse cards. Before/after,
   all three skins, and never trust a 0-findings run without a
   deliberate broken frame.
7. Interaction cost is BUDGETED — `scripts/media/journeys.cjs` runs
   the common journeys as real gestures and asserts each one's
   budget (why-failed 1 · what-feeds 1 · peek-walk 3-for-two-stories
   · what-if 2 · each lens 1). A change that silently adds a gesture
   to a journey fails the suite. Run it with the harness flags
   toolchain (`NIKA_PLAYWRIGHT=… node scripts/media/journeys.cjs`).
