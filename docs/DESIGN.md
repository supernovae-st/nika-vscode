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
│ ⬚ task_id            ● ⚠2 ×5  │  head · verb TILE + id + status DOT + chips
│ ─────────────────────────────  │  hairline divider (full bleed)
│ infer · mistral   →  ✓ 2.3s    │  sub · mechanism at rest → run line settled
│ Rank these stories by…         │  body · prompt / $ command / args (≤3 lines)
│ [mistral/large] $0.004–0.03 ⌀2s│  params · chips (edit) + facts (read)
└────────────────────────────────┘
  248px wide · min 72px · height from content (the layout knows the truth)
```

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

## 2 · Wires

- **Dependency edges — dotted** (the Well signature): round dots
  (`stroke-linecap: round · dasharray 0.1 7`), muted.
- **Data edges — solid** thin accent bezier/orthogonal, the binding
  alias riding the midpoint as a label.
- Ghost edges (undeclared reads · NIKA-DAG-003): red dashed, animated
  march — a repair affordance, click declares the dep.
- Critical path: amber; flow (source settled): traveling dashes.

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

- **Heatmap (H)** — cards tint by measured duration (else static cost
  ceiling), normalized to the graph max: the red IS the hotspot
  (the LangSmith/Insights read). Recomputed live as durations land.
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

## 7 · Rules that keep it SOTA

1. Tokens or nothing — a rule reading a raw color is a bug.
2. One DOM, two skins. A skin is a CSS scope, never a TS branch.
3. Hover always RAISES contrast; selected outreads dimmed.
4. Chips are buttons (edit) or facts (read) — a fact never looks
   pressable.
5. Wave captions speak the plan grammar — `[ 01 ]  start ·
   run together ×N · then` — always on; the band fills are the W toggle.
6. Every visual claim is proven by the screenshot harness
   (scratchpad `harness/` · `node shot.mjs <dir>`) — before/after,
   both skins, light+dark, wide/narrow.
