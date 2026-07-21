# The canvas design system · nika-vscode

The visual contract of the DAG webview. One anatomy, a family of skin
registers (the `nika.dag.theme` enum in `package.json` is the living
roster — never count skins here), one status grammar. Every rule lives
in `src/webview/dag.css` behind the `--nk-*` token seam — rules
consume tokens, never raw colors.

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
│ ▛ recorded artifact ▟ 1/3      │  preview 124 img full-bleed / 30 audio·check (+6)
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

**The grand ENSEMBLE (W-D11 · the ElevenLabs read).** An expanded card
re-composes into three zones under ONE layout footprint:

```
  ⬚ task_id      [engine] ● │  floating header 18 (+6 air = 24) · OUT of the frame:
┌────────────────────────────┐  verb tile + id LEFT · engine identity RIGHT
│  the card = the WORK       │  (model chip door · ⎘ sub-workflow door · declared
│  (full height for content) │  media provider) · the head/divider left the frame
└────────────────────────────┘
   ( 16:9 ×3 $0.01–0.04 │ ⋯ )   the detached PILL 36 (+8 air) · the KNOBS:
                                declared key params · cost · ⌀ · the action cluster
```

- `nodeHeightOf(grand) = 24 + card + 8 + 36` · ELK, drag, culling and
  export all see the ensemble as one box; the transparent `node-bg`
  spans it, so dragging the floating title moves the whole object.
- The pill carries permanent ink only: `⤓` (recorded artifact) · `⑂`
  (fork from failure) · `⋯` (the K panel · every action + shortcut).
  Run/what-if/duplicate live there and on their keys.
- min keeps the dense in-frame anatomy above, unchanged. far swallows
  the ensemble (head returns in-frame for the map tile · pill dies);
  mid hides the pill with the other secondary rows.
- A grand card trades `contain: strict` for `layout style size` (the
  float must paint outside the box) · min cards keep the full armor.

- **The preview is engine truth only**: the artifact comes from the
  RECORDED trace (`artifacts.ts` — a file a run actually wrote, that
  still exists on disk); webview URIs mint at post time over
  workspace-rooted `localResourceRoots`. Image = the full-bleed body
  slot (the artifact IS the card between its head and its facts; click
  opens the real file), audio = a playable row (ONE player canvas-wide,
  ▶ only — nothing autoplays). Every card `<img>` rides
  `loading=lazy decoding=async` (a culled/LOD-hidden card must not
  decode its pixels — culling gates BYTES, not just paint). Exports
  shed the bytes (webview URIs die outside the panel) and keep the box.
- **The media grammar (declare · develop · deliver)**: a media builtin's
  card speaks three honest states. BEFORE any run the frame DECLARES
  the nature only — `image_generate` letterboxes a dashed ghost at the
  literally-declared `aspect_ratio`/`size` (an interpolated `${{ … }}`
  value is a STATED gap: the generic frame, never a guess) with the
  `n:` count as an `×N` corner and the provider as caption;
  `image_fx` splits A|B (source name + the `ops:` chain as chips · a
  ghost where the AFTER lands — the real input thumbnail is a host-side
  v2, never faked); `chart` sketches the declared `chart.type` (the
  engine's closed set: bar · line · area_band · scatter · heatmap) and
  captions `basename(out)`; `tts_generate` lays a FLAT bar strip (no
  audio level exists on the wire — a shaped wave would be a fake VU
  meter) with an inert ▶, `voice · format`, and `--:--`. DURING the run
  every frame develops the same way: ONE sweep (`nc-dev-sweep`,
  running-gated, reduced-motion opted out) — no fake proxies, no fake
  levels. AT SETTLE the recorded artifact replaces the frame in the
  SAME box (constant heights — a status flip never relayouts): images
  land edge-to-edge, the fx split keeps its recipe beside the AFTER,
  audio becomes the playable row. No pre-run pixel can be confused
  with generated content: ghosts are dashed, bars are flat, the ▶ is
  inert. Frames are decorative declarations (`aria-hidden`).
- **compose is a check, never a run**: `nika:compose` statically checks
  a DRAFTED workflow and never executes it — its card wears the
  introspection check-receipt row (`⎙ draft → check`, joined by
  `→ verdict` at settle). Do not confuse it with `invoke workflow:`
  (composition through a door): THAT construct runs a child workflow
  and already owns its own surface — the sub-manifest peek and the ⎘
  door. Two constructs, two card grammars, by design.
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
  green · `✗ 4.1s` red · `○ cached` — after a run the dominant fact
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
  catalog category (`catalog --tools`), never guessed. A media builtin
  owns its **declared frame** before any artifact exists (the media
  grammar above: declare → develop → deliver, same box throughout); a
  file writer (`write` · `edit` — catalog truth, no phantom names)
  lands its **receipt row** (`▤ name` · click opens · existence proven
  by artifacts.ts); the network category **pulses** its glyph on the
  running tool chip. Per-verb RUNNING identities
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
  (`✚ recover` amber · `⤼ skip` dim · `✗ fail` red) · `⤳ N outs`
  named output bindings · `▦ N` permits (engine-projected, #367).
  Facts only — an undeclared policy renders NOTHING.
- **Card modes (card-first)** — every task fact lives ON the card;
  no tooltip popup rides the pointer. `min` = head · verdict · one
  essence line. `grand` = the full story: the dial rows PLUS the
  why-lines (paused · gate false · blocked by), the run-story facts
  (spent · resume proof · repaired · agent loop · inside · secret ·
  gate · live spend/stream · wave · blast · pinch), the child peek,
  needs/unlocks jump chips, and the actions row (▸ run · ⚡ what if ·
  ⧉ dup · a failed card adds ✎ explain + ⑂ fork · K opens the panel).
  Double-click or E toggles one card (the mix is retained per
  workflow); Shift+V row 0 sets the global cran (min / grand / mix);
  Space peeks the focused card to grand IN PLACE (transient — the
  layout never churns) and arrows walk it; a failure PROMOTES its
  card to grand (the red teaches on the face). Facts hide, they are
  never dropped.

## 1c · The four voices — each verb speaks its anatomy (W-D8)

One DOM, one anatomy contract (§1) — but the verb inflects HOW the
card speaks. The group already wears `verb-<v>`; the voices scope on
it. `nodeHeightOf` is an order-independent sum, so a verb reordering
its sections is height-safe by construction.

| verb | voice | anatomy |
|---|---|---|
| infer | **prose** — the ask is a quotation | the prompt leads under the mechanism line, wrapped in dim « » marks + a 2px quote-rail (`--nk-verb-infer-canon` 30%). The rail and quotes leave together when the recorded output swaps in — data is not a quotation. The senses ∴ thinking / ▣ vision chip in the infer text voice. |
| exec | **terminal** — the machine window | `$ cmd` in a framed strip: 2px rail (`--nk-verb-exec-canon` 30%) + ink-wash ground (5%) + strict mono. The frame HOLDS through the settle — `→ stdout` keeps talking in the same window (a place, not a speech-act; the swap only ADDS `.nc-body-live`). |
| invoke | **hero** — the tool IS the card | the ONE reorder: the essence (the tool's soul, §1's essence grammar) appends BEFORE the sub — `invoke · ⚒ nika:jq` becomes the second line, the caption under the work. The essence reads half a point larger (10.5px). |
| agent | **loop** — the inner life, structured | the LOOP BAND under the goal: `turn 3 · saw 5/12 tools` + the budget meter. HONEST meter: a declared budget fills a ratio bar (`--nk-verb-agent-text`); totals without a ceiling stay a bare counter — a bar would invent the denominator. nudged / stalled / compose stay prose facts below; the band survives mid-LOD (it is anatomy, not a fact), far-LOD drops it with the story. |

The min anatomy stays fixed for every verb (head · verdict · one
essence line) — the voices inflect the grand story, never the tile.

## 1d · The 28 identities — every builtin speaks its nature (W-D8 CI-3)

The engine's catalog carries 28 builtins in 6 categories, and the
CATEGORY is the engine's word, never ours (`catalog --tools`). Each
category owns ONE tint token (`--nk-cat-*` · aliases/mixes of voices
the seam already speaks, zero new hex) consumed at exactly THREE
sites: the mechanism line's category icon, the declared-frame borders
(28%), and the network pulse. Never a card border, head, tile or fill
— status and verb own those. Each builtin leads with its SOUL: the
one arg that names its work (the essence grammar of §1), pinned
against the real catalog in a fixture — an invented soul arg fails in
CI, not on the canvas.

| category (tint) | builtin → essence · frame |
|---|---|
| core (muted) | `log` message · `emit` ⚑ event_type · `assert` ⊨ condition · `prompt` message · `wait` duration + the running countdown `12s / 30s` (declared literal only) · `done` plain |
| file (path green) | `read`/`write`/`edit` path (writers land the file receipt) · `glob`/`grep` pattern in mono |
| data (data blue) | `jq` expression · `convert` composes `from → to` · `validate` states `⊨ schema` · `uuid` version · `date` op · `hash` content · `decide` bundle · `json_diff`/`json_merge_patch` keep the plain line BY LAW (unknown keeps the plain line, never a guess) |
| network (accent) | `fetch` method-tag + url, the icon pulses while running · `notify` target |
| introspection (audit amber) | `inspect` view · `compose` workflow_yaml + the check-receipt row (statically checks a draft — never executes; `invoke workflow:` doors are composition, a different construct) |
| media (between infer and agent) | `image_generate` prompt + the declared ghost frame · `tts_generate` text + the flat strip (no fake VU) · `image_fx` the recipe split · `chart` the shape sketch (from the declared `chart.type`) |

The jacks speak the same language (W11.4): an IN collar wears the hue
of the flow that arrives (media wires the generation tint · named
data wires the data blue), the OUT collar what the card produces;
text stays the muted machined collar. `after:` labels tint by the
outcome class they admit — success-family green, failure-family in
the failure text voice at 70% (§2's predicate column, readable from
afar).

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

## 2b · The glyph registry (one glyph, one sense)

The unicode marks are a vocabulary, not a decoration — and a vocabulary
tolerates no homonyms. The living roster is `src/core/glyphRegistry.ts`
(`{glyph · sense · wordedOnly?}` entries — count it there, never here);
the belt is `scripts/glyph-registry.mjs` (npm test). Three laws:

1. **One glyph = one sense**, on every surface (webview · empty state ·
   native views · package.json · harness) — and one sense = one glyph:
   a second mark for a sense that already owns one is a bug, whichever
   direction the duplication runs.
2. **Worded-only marks never paint alone**: `⟳` `⟲` `⊗` `⤼` carry their
   word as part of the mark (`⟲ Replay a trace` · `⊗ fail-fast` ·
   `⤼ skip`). The rotation family is legislated: `↻` retry alone has
   glyph-only rights; `⟳` restart and `⟲` replay are always worded.
3. **Admission by neighborhood**: a new mark enters only if a neighbor
   of its unicode block already ships — rendering proven by adjacency,
   never by @font-face (the webview inherits VS Code's font stacks).

The status vocabulary (the quartet + live states + overlays):

| sense | glyph | note |
|---|---|---|
| pending | `·` | blank cell = not in that run |
| running | `▶` | the one run family (Run · mock · play) |
| retrying | `↻` | the attempt failing, not the task |
| success | `✓` | check-clean rides the same family |
| failed | `✗` | the `✗ fail` on_error route too |
| skipped | `↷` | a decision, never a failure |
| cancelled | `⊘` | a decision, never red |
| paused | `⏸` | waiting on a human |
| cached | `○` | rehydrated — nothing executed |

Sanctioned outside the registry: 🦋 is the brand signature, never a UI
sense; `$(...)` codicons are VS Code's own vocabulary, a separate
register. Color emoji never enter the mono registry (law 1's floor —
the belt bans the ranges).

## 2c · The connected grammar — every flow construct has its surface

The language's flow words each own ONE canvas surface — no construct
reads as another, none hides:

| construct | surface |
|---|---|
| `with:` | the io row — `alias ← from`, clickable, lights the wire (§1) |
| `after:` | the wire itself + its predicate label (§2's kind vocabulary) |
| `when:` | the ⌁ gate chip leading the params row; statically-false gates wear the dead-gate weave + « never runs » |
| `for_each:` | the SOURCE row `∥ items ← x` (io grammar, non-clickable — the collection is an expression, not always a producer) + the ×N head badge counting iterations + the deck frame |
| `max_parallel:` / `fail_fast:` | policy chips `∥ max N` · `⤼ per-item` / `⊗ fail-fast` (worded marks) |
| `retry:` / `timeout:` / `on_error:` | policy chips `↻×N` · `⏱ 30s` · the on_error route (§1) |
| `output:` | `⤳ N outs` policy chip; named bindings feed the io rows downstream |
| `on_finally:` | `◈ N` policy chip — cleanup always runs on a started task |
| `permits:` | `▦ N` chip + the audit lens hulls (engine-projected) |
| `workflow:` call | the ⎘ door chip + the child peek + the promoted contract (§1) |

A sole wrapping `${{ … }}` unwraps in the for_each row label (io
grammar reads refs bare); compound expressions stay as written — the
title always keeps the source verbatim.

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
start* (a describe→generate bar — type a sentence, the house sparkle
hands it to `nika.generateWorkflow` — then New / Examples / Replay /
All commands), *what can this do* (recent `*.nika.yaml` from the
workspace by mtime, then the capability map: the one-line commands
— every button a real `nika.*` command; the living roster is the
`es-caps` block in `dagPanel.ts`, gated by `WELCOME_COMMANDS` in
`extension.ts` — count it there, never here).

Rules: the canvas chrome RETRACTS (`body.welcome` hides toolbar,
omnibar, minimap, legend, activity — no dead controls over the door;
grid + aurora stay). The webview never names a command the extension
didn't whitelist (`WELCOME_COMMANDS`). Recent rows come from the
extension (`welcome:data`), never from webview fs access. Both skins,
scrollable card, single-column ≤460px. The sidebar tree mirrors the
same door natively via `viewsWelcome` — logo-less, three verbs and
the palette hint — so the first click can happen in either surface.

## 4 · The skin registers

### `nika` (default · the brand ambiance · always dark)

THE reference background (operator lock · deepened 2026-07-06): true
near-black page `#0d0d0e` with white `+` survey crosses @40px, raised
NEUTRAL cards (`#1c1d21` · white hairlines 0.09) — the cards keep
their level while the pool falls away, so the raise WIDENS. **Blue
lives only in accents**: data wires, verb tiles, selection, the
pointer lamp, the aurora — and it is ONE blue: the Run CTA derives
from the accent (`color-mix`), never a second unrelated blue. Since
tokens v3 the one blue is STRUCTURAL: every bright tint and hairline
in the skin derives from `--nk-accent-bright` (the brand's
`accentBright`, belt-pinned to the generated SSOT) — tints via
`color-mix` at the site's alpha, 14% border hairlines via
`--nk-hairline-accent`; the deck chrome under ports and the omnibar is
`--nk-chrome`; the aurora speaks through `--nk-aurora-sweep` /
`--nk-aurora-danger` (its vivid stops ARE `--nk-st-failed`). A raw
`rgb()`/hex outside the token seam fails the parity belt's negative
scan. Martian Mono everywhere. Quiet by default — glow is spent on
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

### `phosphor` (OLED · `nika.dag.theme: "phosphor"`)

The contract, repatriated from the setting's `enumDescription` (the
enum in `package.json` stays the living roster — this section mirrors
it): true-black OLED register, phosphor-green ink, hairlines; verb
chroma sleeps at rest and wakes only on LIVE tasks. An explicit
choice — `auto` never picks it.

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
| cached | dashed border, no flash | hollow green | `○ cached` |
| skipped/cancelled | faded | gray | fact |

## 6 · Motion

One signature ease `cubic-bezier(0.22, 1, 0.36, 1)`. Tokens v3 names the
full duration scale — every timing a multiple of the run quantum:
`--nk-dur-fast` 80ms (the ONE clock; spinner strips advance on it via
`--nk-frame-interval`) · `--nk-dur-base` 160ms (the standard hover /
focus / state change) · `--nk-dur-slow` 240ms (panels · reveals) ·
`--nk-dur-deliberate` 400ms (ceremonies). V0.d migrated every consumer
onto that scale — the legacy `--nk-dur` (140ms) now ALIASES `--nk-dur-base`,
so the name survives for stray readers while the scale does the speaking.
Two easing VOICES carry every transition and animation, split by what
moves: `--nk-ease-effects` (opacity · colour · glow · geometry = the flat
signature ease, NEVER overshoots) and `--nk-ease-spatial` (translate ·
scale · arrivals = the spring). ARRIVALS ride the SPRING — a canonical
`linear()` curve with ~4% overshoot (`--nk-spring` · falls back to the
ease via `@supports`): card entrances, verdict pops, the output line.
Overshoot on colour is forbidden (out-of-gamut flash) — the split is the
guardrail. Show/hide panels (e.g. the verb cmdk palette) get a modern
entrance — `@starting-style` + `transition-behavior: allow-discrete` fade
+ 4px drop from `display:none`, never a snap. `prefers-reduced-motion`
disables every loop AND collapses `--nk-ease-spatial` back to the flat
ease (spatial moves stay, the bounce goes) · modern entrances become
instant. Verb-tinted PROSE (the verb palette glyphs · policy chips ·
active breadcrumb · essence line · the running sub-line via `--dv-hue-text`)
reads an APCA ≥Lc60 text ramp (`--nk-verb-<v>-text`), NOT the full-chroma
node hue — chroma stays for glows · keycaps · spinners, but a verb's colour
as INK must clear Lc60 on both the elevated card (#1c1d21) and the phosphor
OLED black to be legible; the ramp is that readable voice, never re-canonised
by the wake. The CAMERA speaks ease-out (every d3 zoom transition: fit 460ms ·
center 420ms · wave 360ms · minimap 240ms — the canvas-tool standard, never
symmetric in/out). Compositor props only.

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

`body.lod-{far,mid,near}` IS the structural LOD channel (no `data-lod`
attribute doubles it): the hysteresis above is applyLod's — far enter
<0.30 / leave ≥0.34 · mid enter <0.42 / leave ≥0.46 — and the viewport
culling pass (>150 nodes · `.nk-offscreen` · ENTER 200px / EXIT 500px
screen) composes with it, never replaces it.

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
- **Run from here (▸ on the card's actions row)** — ONE task + its upstream
  cone through the extension's `rerunTask` flow (engine `run --task`);
  upstream cache-hits stay cache-hits. The n8n partial-execution move,
  reachable without leaving the canvas.
- **Duplicate (⌘D · `⧉ dup` on the card's actions row)** — the copy lands
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
| what-if | X (· ⚡ on the card) | why does `on_error` exist? | pure admission replay (gate algebra) — `sim-failed` ring · `sim-dead` dim · `sim-lit` amber; LIT is reserved for paths that admit non-success AND refuse success |
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
verdicts) · the card PEEK renders the child's real shape in
miniature (grand mode) · the dive trail (`parent ▸ child`) grows on ⎘, truncates
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
   budget (why-failed 0 — the failed card wears its ✗ line on the
   face, min or grand · what-feeds 1 · peek-walk 3-for-two-stories ·
   what-if 2 · each lens 1 · detail-in-place 1 — one double-click
   expands a min card to grand, zero when already grand). A change
   that silently adds a gesture to a journey fails the suite. Run it
   with the harness flags toolchain
   (`NIKA_PLAYWRIGHT=… node scripts/media/journeys.cjs`).
8. The canvas SPEAKS — `role="application"` scoped to the container
   alone (browse mode survives on every sibling surface), the svg a
   named `graphics-document`, every card a `graphics-symbol` whose
   accessible name (label · mechanism · status · degree) refreshes
   silently on status change. ONE roving tab stop follows the
   logical focus (the DOM twin never replaces the key handlers; a
   keyboard move always centers its card, so focus is never
   obscured). ONE narrator per canvas, two channels: polite
   coalesced milestones (`core/runNarrator` owns the throttle
   contract), assertive reserved for run starts and failures.
   `alt+F1` / `?` opens the keymap dialog focused;
   `core/canvasKeymap` is the single source it shares with the
   `nika.canvasAccessibilityHelp` QuickPick. Proven end-to-end by
   `scripts/media/a11y-probes.cjs` (same toolchain as the journeys).

## 7b · The editor chord family (contributes.keybindings)

Every editor-side gesture lives on the `⌘K` chord prefix (`Ctrl+K` on
Windows/Linux), second stroke modified — the native VS Code pattern
for secondary chords — and every binding is when-scoped to
`editorLangId == 'nika'` (the menu also answers from the canvas via
`activeWebviewPanelId == 'nika.dagView'`):

| gesture | chord | mnemonic |
|---|---|---|
| Check workflow | `⌘K ⌘K` | the anchor doubled — checK |
| Run workflow | `⌘K ⌘E` | Execute |
| Show DAG | `⌘K ⌘G` | Graph |
| Add task | `⌘K ⌘N` | New task |
| Menu | `⌘K ⌘M` | Menu |
| Diff two runs | `⌘K ⌘A` | A/B — one run against another |
| Replay a recorded run | `⌘K ⌘P` | rePlay |
| Fork from task | `⌘K ⌘B` | Branch |
| Verify journal | `⌘K ⌘V` | Verify |

The flight-recorder tier (A · P · B · V) answers from a nika file OR
the canvas (`activeWebviewPanelId == 'nika.dagView'`) — every one of
the four commands carries its own no-argument path (a trace picker, or
an honest pointer at the Runs view), so a bare chord always lands.

Why a chord family: plain `ctrl+alt+<letter>` IS AltGr on EU layouts
(typing `€` or `@` fired commands), `ctrl+alt+t` is the GNOME
terminal chord, and `cmd+shift+r` shadowed macOS Refactor inside nika
files. The second strokes (E · G · K · M · N · A · P · B · V) are free
in the default keymap, so nothing native is shadowed — the default
`⌘K ⌘<x>` chords occupy C · D · F · I · J · L · O · Q · R · S · T ·
U · W · X and the digits (held by `keybindings.test.ts`, proven
against the live editor's default-keybindings dump in the integration
suite). Single keys on the canvas (the lens deck — `?` teaches them)
are webview-focus scoped and unchanged.

## 8 · Voice — the twelve rules

Every string the extension itself emits (toasts · status bar · tree ·
walkthrough · settings prose). Engine output relayed verbatim keeps the
engine's voice — we never rewrite it.

1. One voice; the tone flexes with the stakes — calm in success,
   direct in failure, never chirpy.
2. Sentence case everywhere; Title Case only in command titles.
3. Labels are Verb + Noun, no article — `Install Engine`, never
   `Get started!`
4. What → why → fix, no preamble — `Nika: check failed: engine not on
   PATH → Install: brew install nika`, never `Oops! Something…`.
5. `couldn't` = user-state · `failed` = system/engine · `unable to`
   banned — `Nika: couldn't find a .nika.yaml here` vs
   `Nika: doctor failed`.
6. Name the thing that failed — `Nika: language server stopped`, never
   `Something went wrong`.
7. Rules stated in the positive, never blame — `'fetch' is not a verb —
   tools run under invoke`, never `Invalid verb!`. (`invalid` is a
   manual-review word, not gated: too many legitimate code-level uses
   for the v1 gate.)
8. Success = noun + past participle — `Workflow formatted`, never
   `Successfully formatted the workflow!`
9. One word per concept; the toast verb IS the button verb — the
   lexical twin of one-glyph-one-meaning.
10. Every error ends in ONE executable step when a fix exists —
    `→ Run: nika doctor --fix`.
11. The surface follows the severity — pill < hover < toast < modal ·
    notify at the terminal step only · recurring toasts carry
    `Don't show again`.
12. Never cute, never « we », never humor in a failure.

Anatomy: `Nika: <WHAT — named resource + failed/couldn't> <WHY — one
clause> → <FIX — exact command>`. Doctor rows carry all four parts and
the fix line IS the executable string. Toasts are two sentences max —
the second is the recovery; detail lives in the panel/Output. Hovers
show WHAT+WHY inline with FIX as a code block, and never re-toast what
the hover already shows.

The law is a gate, not a discipline — `scripts/voice-gate.mjs` (wired
into `npm test`) fails the build on the banned patterns (`successfully`
· `unable to` · `something went wrong` · `oops` · `an error occurred` ·
`please try again later`) across `src/**/*.ts` (tests excluded), the
walkthrough pages, and package.json's user-facing strings. Escape
hatch for a legitimate use: a `voice-ok` comment on the same line or
the line above (package.json goes through the allowlist at the top of
the script).
