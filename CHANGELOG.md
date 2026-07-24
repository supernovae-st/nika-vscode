# Changelog · nika-vscode

All notable changes to the extension. Versions pace the engine's
release line (real semver toward 1.0 · lockstep on the engine's
major.minor from 0.97).

## [Unreleased]

### The engine's own repair loop reaches the editor

- **`Nika: Fix Workflow` (the engine's rename repairs)**: `check --fix` was the one released door the extension never pushed · the engine applies every typed did-you-mean rename (fields · tools · args), rewrites the one real file, re-audits, and narrates every skip · it rides the terminal like every mutating gesture, and the check-as-you-type sweep repaints from the rewritten disk. The door is everywhere the moment matters: the palette, the workflow row's `⌘K ⌘.` panel, and a quick fix that appears exactly when a `did you mean` squiggle is under the cursor (`fix every rename the engine can`). Capability-gated on the binary's own `check --help` (the stdinDash law: help text, never version numbers).

## [0.105.1] · 2026-07-24

The geometry wave: twenty-four browser-proven deliveries in one
overnight loop, all on the released 0.105 engine. The canvas earns
every panel shape (the toolbar sheds behind a ⋯ door instead of
clipping · fit stops paying for a hidden rail · zoom survives the
narrowest cut), local models get their whole lifecycle from the
Station (list · serve · pull · reclaim), a paused run keeps a beacon
that survives its toast, a failed run's banner carries its own doors,
and every dead end learned to name its real cause.

### One hint at a time

- **The breathe hint waits its turn**: on a true first open of a big graph in a narrow panel, both one-shot hints wanted the same spot at the same moment · the breathe hint painted OVER `Press ? to learn this graph` and ate the more important lesson · it now waits out the first hint's lifetime and speaks alone, one-shot unconsumed while it waits.

### The dim stays readable

- **Dim is a hierarchy, not an illegibility**: the two text surfaces that thinned the dim ink to 55% (the wave-band count · the plan-rail number) lift to 78% · the visual hierarchy survives, the contrast repasses the AA floor.

### Local models: the whole lifecycle from the Station

- **`Pull a model…`** joins the Providers section (and `Nika: Pull a Local Model` in the palette): type an `owner/repo[:QUANT]` Hub id and the pull runs in a terminal · the engine's own ceremony holds: size prints before a byte downloads, 2 GiB and over confirms, an interrupted pull resumes from its `.part`.
- **Reclaim rides the wrench**: every pulled-model row carries a remove repair behind a modal confirm (`owner/repo` removes every quant and the tokenizer beside it · the terminal shows exactly what the engine reclaims) · destruction is never a primary click.

### The agent's oracle calls breathe

- **An in-editor agent running `nika_check` is no longer invisible**: one quiet status breath (`agent checked <file> · N findings`) tells the human editing alongside that the oracle just ran · throttled to one breath per file per 10s, so a looping agent never spams.

### The names travel

- **Runs rows lead with the workflow name**: two runs in flight read as two workflows, not two opaque journal timestamps · the basename stays the fallback for nameless journals and rides the tooltip as the journal identity.
- **The run report states what travels**: the artifacts section says it plainly: the recorded paths travel with the report, the `file:` links and inline previews resolve on this machine only.
- **`/` finds tasks by their wires**: the filter matches the aliases a task consumes (`headline` finds the card reading `${{ with.headline }}`) alongside id · verb · model · tool · provider.

### The menu behaves: the ⋯ door earns the WAI-ARIA contract

- **The ⋯ menu owns its keyboard**: arrows walk the rows (the canvas focus behind it no longer moves) · Home/End jump · Esc closes AND returns focus to the ⋯ button (it used to drop to nowhere while the canvas Esc-ladder fired underneath) · Tab closes and moves on.
- **Live truth for screen readers**: the `/` filter's match count is a real live region now: `3 matches` speaks as you type, not only on focus.
- **The scrubber yields to the present**: starting a run on the already-shown graph closes any open replay scrubber · recorded chrome never sits over live-painting cards.
- **Quiet surfaces respect the system**: the breathe hint joins the reduced-motion opt-out (its sibling first-hint always had it) · the ⋯ menu, the breathe hint and the banner doors gain forced-colors treatment (opaque canvas · real borders · Highlight rows).

### The pause beacon: a state, not a moment

- **A dismissed pause notification no longer strands the run**: a quiet warning status item (`⏸ <task> asks`) appears the moment a run pauses and survives the toast · click it (or `Nika: Answer the Waiting Run`) to walk the same guarded answer flow · it clears when the answer launches and repaints if the resumed run pauses again.

### The settings meet you where the need is

- **`Nika: Pick the Canvas Theme`**: the four skins in one picker (engineered-black · follows-your-theme · OLED phosphor · auto), applied live: the config watcher re-skins the open canvas without a reload · the skin was pickable only from raw settings search, the one place you cannot see it change.
- **Quiet a finding from its own squiggle**: every non-error finding offers `quiet NIKA-XXX in this workspace (hint)` as a quick fix · it writes the `nika.diagnostics.severity` map (workspace scope) and the sweep re-paints · errors keep their voice: run-blocking findings never soften from a quick fix.

### The failure banner carries its own doors

- **A failed run's banner acts**: `¶ NIKA-XXXX` opens the code's explanation and `⑂ fork` re-runs from the failed task (upstream rehydrates from the trace) · right on the red banner, the one moment you are looking straight at the failure · the summary text ellipsizes so the doors stay visible at every panel width · clicking the banner body still opens the full run story.

### The detective pivot: diff against the previous run, in place

- **A History cell diffs against the run before it in one gesture**: spot the column where a task flipped, click `$(diff)` (or its `⌘K ⌘.` row) · the previous run rides as the base, the cell compares against it, the first divergence paints on the DAG · the old path (leave the grid, open Runs, hand-pick two traces through a double picker) survives as the general door.

### The answer door: a paused run is one gesture from its answer

- **The needs-you badge stops dead-ending**: a paused run's row in the Runs view now carries `Answer the Paused Run` inline and leads its `⌘K ⌘.` panel with it · the same guarded flow the toast starts (Yes/No · the workflow's own choices · a text box), the same one-shot ledger against accidental re-answers. The workflow file is found beside its journal (the stamped name wins exactly · ambiguity asks · never a silent guess) · the badge that says *a run is blocked on you* finally opens the door that unblocks it.

### The switch keeps its promises

- **The camera belongs to its workflow**: following a different file re-fits the canvas instead of framing the new graph under the previous file's zoom and pan (the off-screen-until-F class) · re-loading the SAME file keeps your camera, exactly as before.
- **Lenses answer one file's question**: audit and dataflow reset when the canvas switches to a different workflow · they answered a question about the previous file · the heatmap keeps its global dial by design.
- **The `?` dialog is honest again**: `L` (activity feed) and `+ −` (zoom) join the key list · the one dialog that promises every key now keeps that promise.

### The run detail names every mechanism

- **A healthy task's note is its mechanism**: the Tasks table now carries the wire's own verb·tool descriptor (`infer · mock/echo`) on succeeded rows · the column used to sit empty until something broke, while the terminal named every task's mechanism all along · failures keep their NIKA story in the same column.

### Local models become visible: the sovereign lane gets its rows

- **The Station lists your pulled GGUFs**: under Providers, one row per model (`owner/repo:QUANT` · size · file · the engine's own remark), read live from `nika model list` on a binary that carries the verb · the summary count stops being the whole story.
- **`Serve a model…` is one gesture away**: a Station row (and `Nika: Serve a Local Model` in the palette) picks among your pulled models and opens the OpenAI-compatible server in a terminal · foreground on purpose: the banner says how workflows reach it, Ctrl-C stops it where it started.

### The breathe hint: one quiet offer, once

- **A narrow panel holding a big graph offers the one gesture that helps**: `◫ this canvas breathes wider · tap to maximize the group` · an ephemeral line above the omnibar (the first-hint discipline: fades in 10s, fires once per workspace, never a toast) · tapping it toggles the editor-group maximize, and the same toggle brings your layout back.

### The browser-proven wave: no surface goes nude

- **The timeline lens speaks before its data arrives**: toggling `T` paints `reading the recorded truth… (T or Esc returns to the map)` in the same frame · a host that answers slowly (or a request that never lands) can no longer leave a wordless empty canvas.
- **Rest fades, never hard cuts**: the three teaching inputs (omnibar · describe · welcome) fade their overflowing placeholder at the right edge while at rest · typing lifts the fade so the caret never sits in a faded zone.
- **The welcome card owns its scroll**: in short panels a thin scrollbar appears (it was invisible: a scrollable card read as a cut-off one) · the welcome placeholder itself shortened to teach inside its box.

### The shield: tamper evidence is a positive fact

- **Run Detail leads with its attestation**: `✓ chain intact · N events sealed · head …` (compare it against the head the run printed) · a torn tail says *verified, not tampered* (a crash mid-write is honest) · a broken chain keeps outranking everything on the page · a pre-chain journal names its era. The proof story stops hiding until something breaks: an intact chain SAYS so, in one line, with the `nika trace verify` twin named inline.

### Run with inputs: the parameter form and the spend ceiling

- **`Nika: Run Workflow with Inputs`**: the check report's own `vars_required` becomes a short form (one box per required input · Esc anywhere cancels the whole run), then an optional **spend ceiling** rides `--max-cost-usd` · the copy-a-line-to-a-terminal dance for parameterized workflows is over, and bounding a run's spend is finally a UI gesture, not a flag you had to know.

### Two-way doors: the graph is one gesture from anywhere, the YAML one gesture back

- **Show DAG on every workflow row**: the Workflows tree carries the graph inline (run · check · DAG) and in its `⌘K ⌘.` action panel · a repo's graph is two gestures from cold, never three.
- **The canvas title is the reverse door**: click it to open the workflow YAML (column one, real tab) · **Esc at rest does the same**: once there is nothing left to clear, Esc hands you back to the text instead of swallowing the press · Enter on a card keeps jumping to its exact line.
- **A workflow repo greets once**: opening a workspace that already carries `.nika.yaml` files breathes one status line naming the count and the panel · once per workspace, a breath, never a toast.

### The canvas earns every geometry

- **The toolbar never clips off-screen again**: lenses yield one by one as the panel narrows (comfort lenses first, the teach door last) and everything shed stays one click away behind a `⋯` door · same titles, same shortcuts, hidden while nothing hides. The old rail kept all 18 buttons in one no-wrap row and silently clipped half of them past the edge in any panel under ~600px.
- **The phantom rail inset dies**: fit-to-view paid 132px of left margin for a plan rail the CSS hides under 1000px · narrow panels parked the graph right of a dead gutter at a smaller scale than the width allowed. The inset now counts only while the rail is painted, and fit breathing room scales with the panel.
- **Zoom stays reachable at sidebar widths**: the `%` readout (click = fit) and `Fit` survive the narrowest cut · the old rule hid the whole camera group at ≤380px.
- **The `?` explainer outranks the run pill**: it sits above the bottom dock and scrolls in short panels · its tail used to hide under the omnibar.
- **A shrunken panel never strands the graph**: when a resize leaves every card off-screen, the canvas re-fits itself · a camera you panned stays yours as long as any card is visible.
- **Teaching text stops hard-clipping**: the omnibar and describe placeholders switch to a short line under 560px (an input placeholder cannot ellipsize) · the feed and the centered omnibar no longer kiss in the 820-964px band · the legend clears the full-width omnibar instead of wrapping into it.

### Honest doors: every failure names its real cause

- **A missing engine never masquerades as an old one**: canvas ▶ (and the welcome card's demo run) on an engine-less machine now says so and offers `Finish setup` · the old copy claimed "this binary predates run" (a lie born of probing an absent binary).
- **A vanished binary is a setup problem, not a mystery**: a run that fails to spawn (the classic: a cached path deleted mid-session) offers `Finish setup` and clears the dead path, so every surface re-probes instead of replaying the failure.
- **A failed verdict holds the floor**: the red banner no longer fades after 8 seconds · it stays until you dismiss it or the next run replaces it (good news keeps the 8s calm).
- **The status item keeps its promise**: engine-less, its tooltip says "install options" and the click now lands exactly there, not on a search to read first.

### The canvas door never dead-ends

- **A bare `Show DAG` finds your workflow**: the door walks a calm ladder (the active editor · the workflow the canvas already holds · a single visible workflow editor · a single workspace workflow) and only an honestly ambiguous state lands on the welcome home. The reported class dies: clicking the door while a tree or the webview held focus no longer replaces a live graph with the onboarding pitch.

## [0.105.0] · 2026-07-24

The second ascension, whole: one hundred and thirty deliveries on one
surface since the 0.104 line. The card became the whole canvas, and
the search became the door: every command, task, workflow and recorded
run in one ranked gate (`⌘K ⌘M`), habits learned, aliases yours, no
query dead-ending. Every run opens its own detail page, the trees
carry their actions on `⌘K ⌘.`, deep links open guarded doors from
outside, and the canvas speaks: real roles on the real DOM, one
roving tab stop, one narrator. First contact is proven whole by an
end-to-end across two real launches: zero gestures to green.

The card becomes the whole surface: the hover tooltip is gone, every
fact lives on the card in two modes (min for scanning, grand for
depth), the header floats above the frame and the knobs settle into a
detached pill below it. All 28 builtins speak their nature: media
cards declare, develop and deliver their artifacts, and the four
verbs each wear their own anatomy. A running workflow is alive:
braille spinners phase-locked to one 80ms clock, a BuildKit-style
elapsed timer, a settle cascade when the run lands green. Layout
leaves the main thread (an ELK worker with a layout cache: a 2.9s
freeze becomes zero blocked frames), graphs past 150 nodes cull
offscreen cards without losing the DOM, and the hard wire elbows
soften into one rounded language, whoever moved the card. The whole
canvas now works from the keyboard: connect-mode wiring, chords, an
8px nudge. First contact is zero gestures: on a true first install
the offline demo opens and runs itself on the mock provider (no key,
no network) and the one-time confetti lands mid-demo. The webview
path surface is closed behind capability allowlists. One voice with
the em dashes swept out, one glyph per meaning, one token seam: all
three enforced by executable belts in npm test.

### The root search: one gate for everything

- **`⌘K ⌘M` now opens root search**: every command and task in one ranked list · match quality first, learned habit second (7-day half-life, never crossing a match tier), declaration order last · the journey menu lives on as the resting screen (your next step under `Now`, everything else habits-first) and `Nika: Command Menu` opens the same gate.
- **A query never dead-ends**: zero matches fall onto ranked fallbacks with the query as the argument (did-you-mean · generate · new workflow with the name prefilled · run history · the VS Code palette) · `Nika: Reset Search Ranking` forgets the learned order with a status-bar breath, never a toast.
- **The root search now reaches your workflows and runs**: both families append right after the gate paints (a keystroke never triggers a scan) · a workflow row opens the file and speaks its cached check state · a run row opens the run's detail, paused runs leading · the run-history fallback finally carries your query into the view as its initial task filter.
- **The omnibar bridges to the gate**: a mistyped `+` token's did-you-mean list now closes on `Open root search` with the token as the query (the `⌘K ⌘M` chord taught in place) · and the generated draft's confirm gains the same door with the whole intent prefilled, the staged draft left open: one launcher, no fail path dead-ends.
- **An empty Enter opens the gate**: Enter on the blank omnibar now opens root search at rest instead of doing nothing · the placeholder teaches it in place (`↵ everything`) · the blank bar is a doorway, not a dead end.
- **Your own two letters beat everything**: `nika.search.aliases` maps an alias to any row (`{ "rw": "nika.runWorkflow" }`) · the exact query ranks its row first, above every literal match and learned habit, and the row teaches it back as `· rw` · strict, never fuzzy (`r` does not reach `rw`) · a target the catalog lacks is skipped in silence and the query falls back on the normal ranking.

### Every run opens its detail

- **Enter on a run now opens its detail page**: one calm page per recorded run (verdict · per-task breakdown · artifacts · spend when the trace priced anything · the question when a run waits on you), read from the journal alone and re-rendered live while an engine writes it · Runs rows, History cells and the root search's run family all walk through the same door · replay keeps its chord (`⌘K ⌘P`), its `⌘K ⌘.` row and the palette.
- **Run rows wear the same three columns everywhere**: status glyph first, duration, age last · one pure composer serves Runs and History, so the two trees cannot drift apart.

### The trees earn their action panel

- **`⌘K ⌘.` on any nika tree opens the focused row's actions**: one curated list per row kind (Workflows · Runs · Run History · Station) · every hover-only inline verb now keyboard-reachable (the run report, the station wrench, the replay debugger) · chords printed in place · a missing capability greys its row with the reason, never hides it · picks feed the root-search habit store, so an action you keep taking rises.

### The Raycast quick wins: forgiveness, teaching, counts

- **A typo is forgiven, never routed to the LLM**: an omnibar `+` token that misses the vocabulary now looks for close neighbours (edit distance 2) among the four verbs and the engine's tools: one neighbour inserts outright (`+ ifner` lands an infer task), several are proposed, Esc cancels. Free prose still routes to generate: the model stays the fallback of the phrase, never of the typo.
- **The demo joins the chord family**: `⌘K ⌘H` opens the offline demo from any nika file or the canvas (H, not D: the default keymap owns `⌘K ⌘D`, and a new integration test proves every family stroke against the live editor's own keybindings dump). Every command is rebindable in Keyboard Shortcuts.
- **The `/` filter counts out loud**: a quiet pill under the search input says `N matches` while you type, and zero matches speaks the same teaching line as connect-mode: `no match — Backspace widens` (one voice, one shared constant).
- **The menu teaches its own keys**: every chorded row in the status-bar menu now prints its shortcut on the right, derived from the manifest by the same code as the accessibility help, so the two surfaces cannot drift.
- **The canvas K panel learns your hand**: type to filter the focused card's actions · `⌘⏎` runs the one honest secondary (`Run from here` becomes run all) · actions you keep taking rise inside their group, never across the greyed line · and the `⋯` toggle no longer eats an Esc.

### The canvas speaks: roles, one tab stop, one narrator

- **Roles on the real DOM**: the canvas is an `application` scoped to its own container (browse mode survives everywhere else), the svg a `graphics-document` that names its workflow and task count, every card a `graphics-symbol` whose accessible name reads label, mechanism, status and its degree (dependencies, dependents): refreshed silently on every status change, so the on-focus read stays true.
- **One roving tab stop**: the focused card carries the DOM twin of the visual focus (arrows, chords and gestures all keep their handlers). Keyboard focus hardens the ring past 3:1; forced colors get a real outline; a keyboard move always centers its card, so the focus is never off-viewport.
- **One narrator, two channels**: run start and per-task failures speak assertive; lifecycle lands as coalesced polite milestones ("3 of 7 tasks complete, 2 running" · throttled, deduplicated, never every tick); the close is the verdict banner's own line. Replay scrubs stay silent: recorded history is read on focus, not announced.
- **Accessibility help**: `Alt+F1` (or `?`) opens the canvas keymap as a real focused dialog; `Nika: Canvas Accessibility Help` serves the same single-source table as a QuickPick from anywhere, editor chords included · linked from the walkthrough.
- **The canvas cold path warms**: the first keyboard landing on a big graph paints ~4× sooner (measured ~211→~52ms at 300 tasks), the first layout no longer stutters the page mid-wait, and a keyboard jump onto an off-screen card keeps screen-reader focus.

### Deep links from outside

- **`vscode://supernovae.nika-lang/…` opens workflow surfaces from a runbook, a PR or a chat**: five guarded doors (`/run` · `/check` · `/dag` · `/search` · `/demo`) · `file` must be a workspace-relative workflow (absolute · `..` · anything outside the workspace is ignored) · `run`/`check` always ask with a native confirm before the engine touches the file · an unrecognized link breathes in the status bar and does nothing.

### The 28 identities: every builtin speaks its nature

- **Five invented soul args die in a fixture**: the essence register spoke five words the catalog never had (`jq.query`, `emit.event`, `wait.for`, `hash.input`, `chart.title`; chart's real args are data, semantics, chart, out). The register now reads the engine's words, the real `catalog --tools` output is pinned as a test fixture, and every soul arg must exist in its builtin's catalog args: the drift class cannot reproduce. The phantom essences (append, copy, move) died with their phantom writers.
- **Eight builtins gain their soul line**: `edit` and `grep` (path and pattern), `uuid` version, `date` op, `prompt` message, `notify` target, `inspect` view; `validate` states its constant `⊨ schema`. `convert` composes both ends into `json → csv` through the register's new composer hook. `json_diff` and `json_merge_patch` keep the plain line by law: unknown keeps the plain line, never a guess. The compose blurb stops lying: it statically checks a drafted workflow and never runs it.
- **Six category tints, three sites**: each engine category owns one token (aliases and mixes of voices the seam already speaks, zero new hex; media sits between the infer and agent canons). The mechanism line regains the category house icon, tinted (a prior refactor had orphaned the fetch pulse; it pulses again, in the network tint); the declared-frame borders speak their category at 28%; the palette tool rows tint their icons. The token belt gains a presence step for all six plus a no-hex law per definition.
- **The jacks type their flow**: an IN port collar wears the hue of what arrives (media or data), the OUT collar what the card produces; text keeps the muted machined collar. Port titles name the type.
- **after: labels tint by outcome**: a success-family predicate reads green, a failure-family one in the failure text voice at 70%, readable from afar; both dialect spellings are pre-wired for the engine's rename.
- **A waiting card counts against its promise**: `nika:wait` with a declared literal duration ticks `12s / 30s` while running (the existing 150ms text tick; an interpolated duration keeps the plain observed clock, never an invented denominator).
- **fetch tags its method**: the declared `GET`/`POST` leads the url essence as a quiet mono tag.
- **The Run button splits**: `▶ Run │ ⌄` opens one grouped menu (run, run mock, what-if, fork) with the chords printed and the unavailable rows greyed with their reason, never hidden. The card's `K` panel groups the same way: the run family above one separator. Same commands as before, zero new wiring.
- **The harness grid reaches all 28**: the `?media` scene grows to 38 nodes covering every catalog builtin, both predicate tints (the failed read points at a task the sim honestly lands as skipped), and the wait countdown; the fixture contract test now holds the grid against the pinned catalog.

### The header floats, the knobs detach: the pill

- **The header rises above the card** (expanded cards): the verb tile and task id float over the frame, with the engine identity at their right: the model chip (still the click-to-change door), the `⎘` sub-workflow door, or a media tool's declared provider. The card body keeps its full height for the work: prompt, media slot, wires, facts. Compact cards keep the dense in-frame head unchanged.
- **The knobs settle into a detached pill under the card**: the declared key params (`16:9 ×3` for images · `voice · format` for tts · the chart type · the HTTP method for fetch), the static cost interval, the recorded `⌀` mean, then the action cluster behind a divider: `⤓` opens the recorded artifact, `⑂` forks from a failure, `⋯` opens the actions panel (every action with its shortcut, `K`). Run, what-if, duplicate and explain live there and on their keys: the pill carries permanent ink only.
- **One footprint, one grab**: layout, drag, culling and export treat header + card + pill as a single object; dragging the floating title moves the whole ensemble. Fan-out ghost sheets track the card frame, never the pill. Zoomed to the map read, the header returns in-frame and the pill folds away; the mid tier hides the pill with the other secondary rows.
- The pill's entrance respects reduced motion, keeps a real border under forced colors, and exports with the theme it wore on screen.

### The media show themselves: declare, develop, deliver

- **Two catalog drifts fixed**: a `tts_generate` card developed an IMAGE frame (the audio set carried names the catalog never had: tts, speak, transcribe) and `edit` earned no write receipt while four phantom writers (append, copy, move, archive) did. The sets now speak catalog truth; a 28-builtin preview table pins every card's nature so a phantom name can never silently zero a frame again.
- **The image slot becomes the card's body**: the declared frame grows from a 92px inset box to the full card width (constant 124px, edge to edge); the recorded artifact settles into the same box, image as body, with name and count in a quiet bottom overlay. Before the run, `image_generate` letterboxes a dashed ghost at the literally declared `aspect_ratio` or `size` (an interpolated value keeps the generic frame, a stated gap), wears the `n:` count as a corner chip and the provider as caption.
- **tts speaks its nature**: a flat declarative bar strip (uniform by construction, since no audio level exists on the wire), an inert play mark, `voice · format` from the args, and `--:--`. The same develop sweep rides the run; the playable row replaces the strip at settle, same 30px box.
- **image_fx declares its recipe**: the frame splits A|B, source name plus the `ops:` chain as chips on the left, the ghost where the AFTER lands on the right; at settle the artifact fills the B half and the recipe stays readable. The real input thumbnail is a named host-side v2.
- **chart declares its form**: a house sketch of the declared `chart.type` (bar, line, area_band, scatter, heatmap) with `basename(out)` as caption; the deterministic SVG settles edge to edge.
- **compose wears the check receipt**: a 30px introspection row, `draft → check`, joined by `→ verdict` at settle. compose statically checks a drafted workflow and never executes it; `invoke workflow:` doors are a different construct with their own peek (documented in DESIGN.md).
- **Bytes gate with the culling**: every card image now rides `loading=lazy decoding=async`, so a hidden or culled card no longer decodes its pixels; declared frames are decorative and born `aria-hidden`; exports shed the new frames and freeze the sweep. One sweep class serves all three frame kinds, running-gated and reduced-motion opted out.
- **The harness gains the media scene**: `?media=1` seeds a 31-node brand-studio fixture (every frame kind, the stated-gap cards included) with a scripted declare, develop, deliver timeline; `?grand` seeds the card dial; `?n` with `media` sprinkles media tools over the perf DAG. The fixture is held by the same contract belt as the README scene.

### The wires soften: rounded rails, one curve language

- **The hard 90° elbows die**: every ELK corner now folds through one rounding pass (radius 14 · an `L` to the corner's approach, then a quadratic with its control AT the corner: the React Flow recipe). The bend clamps to half of each adjacent segment, so close consecutive corners degrade into an S-curve with zero overshoot and zero special cases. The lanes stay ELK's: aligned rails and ~90° crossings keep carrying the readability; only the hardness leaves.
- **One language, whatever moved**: a dragged card's wires used to re-route as soft direct cubics while the rest of the canvas stayed hard polylines: two dialects on one canvas. The direct-curve branch is gone: hand-pinned cards (and the provisional relayout frame) now re-route LOCALLY in the same rounded-orthogonal voice (a stub out of each port, one rail between, the same corners). The geometry picks the shape; who moved the card never does.
- **Lanes breathe for the corners**: the inter-layer track pitch rises 15 → 28 (≥ 2× the corner radius) so two adjacent rounded bends never kiss. Cached layouts re-derive once (the layout key carries the option-set revision).
- **Crossings read over/under**: every wire wears a quiet page-colored casing beneath it: where two wires cross, the upper one punches a ~2px gap in the lower, the established metro-map read. Dimmed wires recede with their casing; high-contrast drops casings entirely (Highlight wires stay continuous); heatmap sleeps them. Measured at n=300 fit-zoom pan: medians held (p50 66.6 → 33.4ms, p95 116.6 → 83.4ms across 3 runs · inside noise, no regression).
- **Flow speed stays uniform on curved wires**: the particle trains already scale their duration by the LIVE path length (arc-length through the new corners), and the dashed marches animate in user px: both uniform by construction, now stated at the source.

### The four voices: each verb speaks its anatomy

- **infer speaks prose**: the prompt wears a 2px quote-rail in the verb's canon hue next to its « » marks: the ask reads as a quotation; rail and quotes leave together when the recorded output swaps in (data is not a quotation).
- **exec speaks terminal**: `$ cmd` sits in a machine window (verb rail, ink-wash ground, strict mono · mono now holds in the editor skin too). The frame HOLDS through the settle: `→ stdout` keeps talking in the same window.
- **invoke makes the tool the hero**: the one anatomy reorder: the essence (the tool's soul) leads the card and reads half a point larger; the mechanism line (`invoke · ⚒ nika:jq`) becomes the caption. Heights are safe by construction (`nodeHeightOf` is an order-independent sum).
- **agent shows its loop, structured**: the loop/budget facts promote from prose into a LOOP BAND under the goal (`turn 3 · saw 5/12 tools`) plus an HONEST budget meter: a declared budget fills a ratio bar in the agent text voice; totals without a ceiling stay a bare counter (a bar would invent the denominator). nudged/stalled/compose stay prose facts; live folds refresh the band through the one card re-painter.
- **the fan-out names its collection**: `for_each:` now reads onto the card as an io-grammar row, `∥ items ← x` (a sole wrapping `${{ … }}` unwraps; the title keeps the source verbatim): the ×N badge counts the iterations, this row says what they map over. Client YAML lane, same discipline as every policy fact (a `with:` alias can never impersonate the construct).
- **DESIGN.md §1c + §2c**: the four voices table and the connected-grammar map (every flow construct → its one canvas surface).

### Run History becomes a native view

- **Run History is a native tree**: the cross-run grid's `command:` links were dead in the markdown preview at all three stages of the runtime (client allowlist · webview without command uris · link validation): a clickable-looking affordance that did nothing. `Nika: Run History` now loads a when-gated `Run History` view: tasks partitioned by attention (`Flaky — N` mixed outcomes · `Slowing — N` trend past the noise floor · `Steady — N`, folded · a lone healthy pile dissolves to flat, a lone alarm section keeps its name), every task row wearing the grid's own glyph strip and median, click focuses the task on the DAG (the view knows its workflow, never "whatever editor is active").
- **Every cell is a door**: a task row expands into its recorded runs, newest first: `run #k · ✓ success`, where `#k` is the exported grid's very column number (the cell↔child mapping stays explicit; a blank column has no child, a blank cell being the absence of a recorded fact). Click replays that run onto the canvas; an inline `$(output)` opens its provable report.
- **The document became the export**: `$(markdown)` in the view title renders the exact grid document (flaky + slowdown callouts included) · still local, shareable, diffable; `$(close)` puts the view away. A window reload lowers the gate by design (persistence is a known follow-up).
- **Report artifacts link to their files**: a resolved artifact row is now a `file:` link (the gallery's angle-bracket idiom · paths with spaces stay one URL); an unresolved path stays a code span, the gap stated rather than a dead link. Verdict, task table and failures are untouched.
- **Show Task in DAG, natively**: an inline `$(target)` on any task row of the Runs view replays its run onto the canvas and centers that task: the per-task navigation the report preview could never carry, over the existing replay + focus wires (zero new protocol kinds).

### Runs grouped by attention

- **Runs grouped by the one question**: the flight recorder now answers "is something on me?" before anything else: a `Now` section pins every running or paused run WHATEVER its mtime (paused leads: needs-you outranks working), then `Today` / `Yesterday` / `Earlier` on local calendar days. Empty sections hide; a lone calendar section dissolves back to the flat list; a non-empty `Now` always keeps its header. Row cards, chips, badges and click-to-replay are untouched.
- **The unreadable journals COUNT**: a trace the scan cannot read (truncated by a killed run · another engine generation · permissions) used to vanish silently · it now lands in a trailing `Unreadable — N` section, named per file with the toast's own vocabulary, click reveals the file. The scan itself waits on the view (in-view progress bar, never a toast).
- **The empty state reconciled**: zero readable and zero unreadable traces now render the rich Runs welcome (run a workflow · mock needs no key · embedded examples) · the old synthetic `No traces yet` item shadowed it since it shipped. Any unreadable journal keeps the tree: a welcome never papers over real files.
- **Workflows partitioned by attention, not by folder**: unparseable files lead outside any section (`couldn't parse` · the raw error in the tooltip · `→ Fix: open the file — the check squiggles mark the line` · run/check never target them), then `Findings — N` · `Clean — N` · `Unchecked — N`. The absence of a check never dresses up as clean: when the engine is off, the Unchecked section says `engine off`. A lone section dissolves to flat; files sort by path; colliding basenames show their folder; an empty file reads `no tasks yet` instead of `0 tasks`.
- **Actions live on the rows**: inline `▶ run` + `✓ check` on every workflow file, inline re-run + focus-in-DAG on every task: the primary click keeps navigating (open the YAML at the line), gestures ride the inline icons, palette-hidden and typeof-guarded like every tree command.

### Large graphs: viewport culling

- **Viewport culling (graphs >150 nodes)**: cards and wires far outside the viewport sleep under `.nk-offscreen { display: none }` · the DOM stays (no unmount, no re-entry cost), offscreen spinner/braille animations stop spending, and a hysteresis band (wake within 200 screen px of the edge · sleep only past 500 px, ÷zoom) means a camera resting on a boundary never flaps a card. The selected, hovered, simulated, dragged, connect-source, follow-target and pinned-grand cards are never culled; an edge quartet (wire · hit twin · chevron · label) sleeps only when BOTH its endpoints sleep and its span clears the view, so a long wire crossing the screen keeps painting. Exports wake every sleeping card in the clone: the file is always the whole graph. Measured at n=300, zoomed-in wheel pan: p95 16.9→10.9ms, p50 8.3→8.3 (see `measure.mjs pan-near`); at fit zoom every card is legitimately in view and the pass changes nothing by design.
- **`contain: strict` on the card**: the card's box is TS truth (explicit foreignObject size), so size containment joins layout/paint · cheaper invalidation, zero geometry change. `content-visibility: auto` was MEASURED and rejected (no frame-time effect at n=300: Chromium already skips offscreen raster here; the culling pass is what stops the style/layout spend).
- **Edge batching died by measurement**: hiding ALL edges moved fit-zoom pan p95 not at all (83.3 vs 83.6ms): the cost is the foreignObject card raster, so the planned far-LOD bulk-path batching is closed as unjustified (the multi-M single-marker tradeoff buys nothing). The fit-zoom pan ceiling belongs to the planned compositor pass, a known follow-up.
- **`#glow-running` died**: an SVG filter defined since the first canvas commit and never referenced by any paint rule.
- **`scripts/perf/measure.mjs` grew `pan-near`**: deterministic zoom-in (spaced instant steps: rapid presses interrupt each other's d3 transition) + wheel-driven camera pan (at near zoom the fit center sits ON a card, so a drag would measure a card drag), and both pan scenarios now report the culling judge seam (`window.__nkCull`).

### Layout moves off the main thread

- **ELK runs in a Worker**: the layered layout now chews OFF the main thread (a dedicated worker bundle, pool of one active + one pre-warmed spare, latest-wins protocol with >150ms cancel-and-promote) · at 300 nodes the canvas stays interactive through a multi-second layout instead of freezing (measured: zero >100ms main-thread tasks during the layout wait vs one 2.9s block before). A structural failure walks a ladder (direct Worker → blob Worker → the exact previous main-thread call, byte-identical results · proven: laid JSON byte-equal across rungs at n=40/120/300), so no environment ever loses a graph.
- **Layouts are remembered**: a workflow's laid geometry is cached (FNV-1a key over what ELK actually sees: structure, heights, labels, never positions or statuses · LRU 20) and persisted through `workspaceState`, so reopening a panel or switching back to a workflow repaints in milliseconds instead of re-laying (measured: 0.2ms + paint vs 2.6s cold at n=300). One workflow can never serve another's positions: the workflow identity is part of the key.
- **Stale-while-relayout**: editing a big workflow paints frame 0 immediately (survivors hold their positions, newcomers land at their neighbors' centroid, wires curve direct) while the worker converges the real layout with position hints · the settled cards then glide to their final places through the existing 300ms transition. The hinted re-layout runs on `BRANDES_KOEPF` placement with `INTERACTIVE` crossing minimization (measured at n=300: ~166ms vs 2.6s cold, 6%); the cold path keeps the production option set untouched.
- **The layout note knows when pixels beat prose**: `laying out N tasks…` only shows when the canvas would otherwise be blank: a cache hit or a provisional frame skips it.
- **Perf seam**: `nk:layout` / `nk:swr-frame` / `nk:paint-final` performance marks (always on) + `scripts/perf/measure.mjs` · an http-served Playwright probe (Workers are blocked on `file://`) measuring cold/switch/pan/equivalence with hard correctness assertions.

### Run-close moments: one confetti, a settle wave

- **One confetti, ever**: the FIRST completed run on a machine (the mock demo counts: the auto-demo's green IS the aha) rains ~48 verb-hued particles over the verdict, once, and never again. Reduced motion, forced colors or a hidden panel skip the show (the verdict banner stays the receipt), and the community ask now waits out the fall so the one celebration is never covered by a toast.
- **The settle cascade**: every LIVE green close pulses a quiet ✓ wave through the cards along the run's own execution waves (the entrance stagger's twin · 50ms a wave). Replay and scrubbing never trigger it, reduced motion skips it, and past 150 nodes the aurora alone carries the close.

### The marketplace listing, refreshed

- **README overhaul**: live version/installs/rating badges (Open VSX kept) · the value line under the title · a top-five relief table and a jump-to line before the feature prose · headline Commands/Settings tables pointing at the full Feature Contributions tab · a tip line under every capture · claims re-verified against the shipped surface: the one door is the `Nika status item` (not the butterfly; the 🦋 stays the signature), all FOUR Language Model tools listed with their capability gate, and the install policy link now points at SECURITY.md instead of itself.
- **Keywords**: six ecosystem terms join the listing (ollama · local llm · tracing · observability · deterministic · open-source).

### Onboarding: the demo runs itself

- **First contact runs the demo itself**: on a machine's first activation ever, once the engine is present (immediately, or the moment Finish Setup lands it), the hello-canvas demo opens AND runs on `mock/echo` (zero key, zero network, zero spend), with an on-canvas `offline demo — mock provider, no keys` banner while it streams. The DAG lights itself in under ten seconds; the walkthrough follows as optional depth instead of leading. A workspace that already carries `.nika.yaml` files is never auto-opened, and the flow fires once ever.
- **The walkthrough verifies itself**: steps now complete on the real thing happening, not just on palette commands: running from ▶ / ▶ mock / resume checks *Run it*, the first failed verdict checks *Break it on purpose*, a real nika replay session checks *Time-travel* (any-debugger false positive gone), painted findings check *Validate*, focusing the Runs view checks *Prove it ran*, and the demo checks *Create*.
- **No engine, no illusion**: a nika buffer with zero squiggles and no binary no longer reads as validated: the language-status check lane says `check: off — engine missing` (warning · one click to install) instead of `check: clean`; clean is only claimable when the oracle actually ran. Same honesty for a pre-`check` binary and for `diagnostics.runOn: off`.
- **The install step went theme-aware**: an SVG painted in `--vscode-*` theme tokens replaces the install markdown (its content lives in the step description), and a new `walkthrough-media` gate (npm test) proves every walkthrough media file exists, ships in the VSIX (never `.vscodeignore`'d: a known packaging failure class, now gated), and stays under `walkthrough/`.
- **Marketplace description front-loaded**: the search-result cut lands after a complete pitch ("See your workflow before it runs: the live DAG canvas for Nika…"), providers named local-first.

### Security: the canvas opens only what it surfaced

- **`welcome:open` validates the uri (no arbitrary read)**: the welcome canvas can only open workflows the extension itself surfaced · a compromised webview can no longer name an arbitrary local path (`file:///etc/passwd`) for the extension to read.
- **`dag:openSub` · `dag:openTrail` · `dag:openArtifact` gated the same way (no arbitrary open, reveal or write)**: the three sibling canvas doors now honor only paths the extension itself surfaced (sub-workflow refs from the shown graph · breadcrumb segments from the last trail push · artifact paths the panel pushed), and the sub-workflow create-on-miss writes only inside the workspace with the exact `.nika.yaml` extension.

### The welcome home opens without a workflow

- **The welcome home is reachable, and the sandbox is one gesture**: `Show Workflow DAG` with no workflow in focus opens the welcome home instead of a dead-end warning; the panel reveals immediately and breathes a `loading <name>…` ghost while the graph lands (no dead click on a slow first spawn); and `Nika: Try the Demo Workflow` writes a runnable four-wave `hello-canvas.nika.yaml` (mock/echo · zero key · zero network) beside the canvas: press ▶ to run it, offline.

### Motion tokens, applied across the canvas

- **Motion v3 consumed**: verb-tinted prose now reads its APCA ≥Lc60 text ramp (`--nk-verb-<v>-text` · the running sub-line via `--dv-hue-text`), the legacy `--nk-dur` aliases the named duration scale (every consumer remapped to `--nk-dur-base`), easing splits into `--nk-ease-effects` (no overshoot) vs `--nk-ease-spatial` (spring for arrivals), and the verb cmdk palette gains a `@starting-style` + `allow-discrete` soft entrance · reduced-motion collapses the overshoot and makes entrances instant.

### The glyph registry: one glyph, one sense

- **The glyph registry**: `src/core/glyphRegistry.ts` declares every
  sense-bearing mark once ({glyph · sense · wordedOnly}); the five
  status maps (history cells · editor badges · run report · activity
  feed · live feed) import THE quartet: the skipped/cancelled/cached
  dialects are unrepresentable by construction. The squatters moved
  out: timeline `▧` · dataflow `⇉` · examples `⧈` · run history `⊞` ·
  preflight `▩` · report `⎙` · copy-prompt `⇗` · MCP `⎓` · canvas
  `⊡` · duplicate `❏` · replay `⟲` · resume `Δ changed` · cached `○`
  · event `⚑` · fail-fast `⊗`. Retry keeps `↻`, what-if keeps `⚡`,
  files keep `▤`, data keeps `⧉`.
- **Emoji leave the mono registry**: the welcome CTAs speak in text;
  the describe bar's generate mark is the house sparkle SVG
  (currentColor: forced-colors for free); the shield and no-entry
  marks yield to `▩` and `✗ fail`.
- **The activity quartet unified**: the canvas feed and the live-run
  feed narrate skipped/cancelled with the recorded quartet ✓ ✗ ↷ ⊘:
  no dialect between surfaces, worded bypass (`⤼ skip` · `⤼ per-item`)
  stays a policy chip.
- **Legend swatches tell the truth**: the three rows that shared one
  blue swatch now carry their own (policy outline · data wire ·
  lineage fade); the card row reads `❏ duplicate`. Test gate:
  `scripts/glyph-registry.mjs` in `npm test` · registry-sync · banned
  vocabulary never returns · worded-only marks hold.

### Tokens v3: raw colors die at the seam

- **Verb canon + alias**: `--nk-verb-<v>-canon` holds each verb hex
  once; skins retune the plain `--nk-verb-<v>` alias only. The
  phosphor wake now reads the canon var: the resting desaturation
  can structurally never shadow the woken chroma.
- **The bright-accent seam**: every blue tint/hairline in the nika
  skin derives from `--nk-accent-bright` (the brand's `accentBright`,
  gate-pinned) via `color-mix`: the stray `rgb(140 170 255)` family
  converges on the canonical bright accent; borders at 14% ride
  `--nk-hairline-accent`; the deck chrome is `--nk-chrome`; the
  aurora's gradients are declared once (`--nk-aurora-sweep` /
  `--nk-aurora-danger`, vivid stops = the failed voice).
- **The named motion scale**: `--nk-dur-fast` 80 (the run quantum ·
  `--nk-frame-interval`) · `base` 160 · `slow` 240 · `deliberate`
  400, plus the two easing voices (`--nk-ease-effects` /
  `--nk-ease-spatial`). Verb TEXT ramps (APCA ≥Lc60) are defined and
  gated; the canvas consumes them next.
- **The test gates got teeth**: tokens-parity now proves canon+alias,
  the wake's var() reads, a NEGATIVE scan (any raw color outside the
  token seam fails), dynamic twins against the generated SSOT, and
  the v3 roster's presence.
- **Replay a Recorded Run** wears `$(debug-rerun)`: `$(history)` was
  the one icon reading as "view history" on a command that re-executes.

### Welcome states, one status voice, a notification diet

- **Welcome views tell every state apart**: five discriminated
  `viewsWelcome` states on the Workflows view: engine absent (install
  button + sovereign Homebrew/source links) · repo unequipped · no
  folder open (`Open Folder` leads) · folder without workflows
  (`Create Workflow` is the one button) · working. Each names its
  cause and carries one primary gesture; the old catch-all died.
- **One fused status item**: the pill reads `state · findings · cost`:
  doctor findings and the workspace cost ceiling ride the text once
  probed; `$(sync~spin)` while a live run or station sweep is in
  flight; the ERROR background now belongs to doctor red alone
  (run-blocking findings → "Open the Station" as the head move); a
  missing binary warns instead of screaming; the tooltip carries the
  full workspace truth (rollups · ceiling · busy).
- **Notification diet**: copy/wire/restart/setup successes flash in
  the status bar instead of toasting; surviving capability notes
  (`predates run/resume/init/lsp`, PATH repairs) carry "Don't show
  again" (per-toast memory); the engine download is cancellable
  mid-flight (Stop = a calm flash, partials removed) and its failure
  toast gained "Details" → the output channel. Error toasts that
  carry their fix stay untouched.
- **Settings polish**: every setting carries an `order` (grouped
  ranks: engine · authoring · checks · runs · canvas · AI · nudges),
  consequence-first `markdownDescription` prose with `#nika.x#`
  cross-links, and per-value `enumDescriptions` on every enum · all
  ratcheted by a unit test.
- **Testing API depth**: golden failures render a true
  expected/actual diff (the actual reconstructed from the engine's own
  drift report, never invented) anchored on the `outputs:` block;
  golden profiles are tag-gated to workflow items (the run-then-skip
  hack died); recorded runs from ANY terminal/CI/canvas land their
  verdicts through publish-only test runs · the flight recorder feeds
  the explorer. Continuous run waits on the engine: the 0.104
  capability surface exposes no watch door.
- **New Workflow wizard**: a three-step QuickInput (name → starter
  [the four verbs' spec starters · engine templates · blank] → model
  [mock/echo default · locals before cloud, exact catalog rows only])
  with Back at every step; engine templates honestly read 2 steps
  (their file is the engine's).
- **Runs rows narrate the present**: a LIVE row chips in-flight spend
  (`~$…`) and a MEASURED time-left (newest completed sibling run,
  majority-overlap gated: no prior, no chip); the Runs view badge
  counts paused runs only (needs-you, never activity) and the pause
  toast gained "Show node", a deep link to the waiting card.
- **Honest tab pulse**: the DAG tab title carries `▶ ` only while a
  live run drives it: immobile at rest, gone at the terminal write.

- **International keybindings + walkthrough truth** · the `⌘K` chord
  family replaces `ctrl+alt` (the AltGr trap on EU layouts) and
  `⌘⇧R` (macOS Refactor shadow), every binding when-scoped to nika
  surfaces; the walkthrough shows the DAG before breaking it; the
  break step names the blank starter honestly; DESIGN.md documents
  the third skin and the chord family, and stops hard-counting.

### Live runs: braille spinners, one clock, a BuildKit timer

- **Run spectacle**: live cards spin a braille strip in the head's
  fixed status slot (full-weight `dots2` while running, amber on
  retrying · `dotsCircle` for a thinking infer · the `point` pulse
  when tokens stream, wire `chunks` proof), all phase-locked to one
  80ms quantum (`--nk-dur-fast`), ignited wave by wave; the elapsed
  verdict ticks BuildKit-style decimals at 150ms while visible. More
  than 5 live strips in view → the crowd freezes and the status
  pill's dot carries the beat. Reduced-motion holds frame 1 (the
  timer text keeps walking); a hidden panel parks every animation; a
  settled card is a clean frozen log. The old SVG orbit ring died:
  one indicator per card.

### Card-first: the tooltip dies, the card carries everything

- **Two card modes**: `min` (head · verdict · one essence line · the
  calm default) and `grand` (the whole story). Double-click or `E`
  toggles one card; the Shift+V panel gains a global card density
  (min / grand / mix · the per-card mix is retained per workflow); a
  failed task auto-promotes its card so the red teaches on the face.
- **The hover tooltip is gone**: everything it carried lives ON the
  grand card now: the why-lines (paused question · gate false ·
  blocked by), the run-story facts (spent · cache-hit proof with both
  hashes · repaired · the agent loop's turns/budget/nudges/stall ·
  live spend and stream · wave · blast radius · pinch), the child
  workflow's miniature, needs/unlocks jump chips, and a visible
  actions row (`▸ run · ⚡ what if · ⧉ dup`, plus `✎ explain` +
  `⑂ fork` on a failure · same handlers, no popup between you and
  them). Edge and io-chip hovers keep their pass-set stories.
- **Space peeks in place**: the focused card expands to grand without
  touching the layout; arrows walk the peek across the DAG, Space or
  Esc releases. The interaction budgets moved with the furniture:
  why-failed is now a ZERO-gesture read, the full story costs one
  double-click (`scripts/media/journeys.cjs` asserts both).

### The station answers three questions

- **Now · next · recent**: the Station tree regroups around three
  questions: is it running? (engine · agents · providers
  · workspace) · what needs a repair? (doctor findings grouped by
  severity, broken probes first) · what just happened? (the runs
  rollup). Empty sections hide; the activity-bar badge stays fails-only
  and its law now lives in the pure model, unit-proven.
- **The wrench owns repairs**: fix-carrying rows (doctor findings ·
  unwired clients · a failed language server) repair through an inline
  wrench action (`nika …` fixes run in a visible terminal, `export …`
  lines go to the clipboard), and no Station row executes on its
  primary click anymore. The full doctor report rides an inline
  terminal action on the doctor head rows.
- **The wait lives on the view**: the doctor sweep paints the
  Station's own progress bar (in-view), never a notification.
- **Cost rollups read at a glance**: the workspace ceiling and the run
  spend dim into short descriptions (`≥ $0.42 · 4 permits` · `spent
  $0.12 · 2 unpriced`) with markdown breakdown tables on hover · the
  floor-honesty `≥` grammar unchanged.

### The lens deck: composition, live meters, every error a story

- **One graph · five lenses** · the canvas becomes a deck of
  projections over the SAME typed graph, each answering one question:
  - **X · what if?** (failure simulate): pick a task, press X · the
    client replays the run rules with that task failed (pure module,
    unit-proven). Dead paths dim to their cancelled read; the paths
    that exist ONLY because of failure LIGHT UP: why `on_error`
    exists, visible before any token is spent. Esc clears.
  - **T · timeline**: the recorded run as a Gantt · real clocks only,
    retries as sub-segments on one row, cache hits hollow, the $
    column blank-over-zero, wave rules from the plan grammar. The
    **ghost ceiling** (your recorded mean) paints behind every bar
    (est-vs-actual at a glance), and the replay scrubber's **time
    cursor rides the lens** (two time surfaces, one now). The map's
    plan rail sleeps inside the lens.
  - **P · audit**: "what can this file DO before a token is spent" ·
    capability hulls (egress · programs · files · tools) painted under
    the wires in state-family hues (egress red first), and the banner
    says it in one line, honest about UNBOUNDED floors and about
    having nothing to declare.
  - **D · dataflow**: answer by subtraction · control scaffolding
    sleeps, the typed data wires and their binding labels carry the
    whole story; direction heads stay awake at every zoom inside the
    lens.
  - The ? explainer teaches the deck (T · P · D next to H heatmap).
- **Composition, lived**: a workflow-call task is no longer
  a dead chip:
  - the ⎘ chip is a **door** (click opens the child · a missing child
    offers "Create it" with the canonical envelope);
  - the card carries the **child's manifest** (tasks · waves · est
    cost · permits · read from the CHILD's own engine projection,
    never an invented rollup) and the hover renders a **peek**: the
    child's real shape in miniature (verb-hued dots per wave, its
    real edges);
  - the **promoted contract**: the child's `vars:` join the parent's
    `args:` ON the card face: "topic ← parent · style = default ·
    depth ⚠ required" (facts from both files; check owns findings);
  - the **dive trail**: a breadcrumb (parent ▸ child ▸ …) grows on ⎘
    jumps, truncates on crumb jumps, clears when you wander off ·
    every crumb is a door back up.
- **The agent narrates its inner life**: the five agent_* trace kinds
  fold into card facts · the running value column reads the pulse
  ("t3 · 610tk · 1.7s ⋯"), the hover narrates tool routing
  ("turn 3 · saw 4/9 tools"), the budget curve, corrective nudges
  with their reason, stall evidence, compose check verdicts.
- **The live meters**: cost_incurred deltas fold into an in-flight
  ~$ curve on the running card ("1.0s ⋯ · ~$0.0042" · ~$ moves, $
  is the recorded verdict); infer_chunk counts prove the stream is
  talking.
- **Every degraded lane speaks**:
  - the status pill owns one degradation ladder (no binary → lsp
    down → healthy rung), every non-ok state names its exact next
    move and the menu opens with that move as "Fix first";
  - a generation gap reads as a quiet truth line, never a nag;
  - the Station tells "no such verb", "answered nothing" and
    "answered garbage" apart (honest rows, click retries) instead
    of collapsing them into one blank;
  - six dead-end error toasts learned their action (Reveal in
    Finder · Open check report · Finish setup · Retry / Set server
    path / Show log · the permits toast splits its two causes);
  - a canvas exception paints an in-canvas wall strip + one deduped
    toast: a render wall is a story, never a silence.
- **The red teaches**: NIKA-DAG-006 (statically-false `when:`) cards
  wear "never runs" (muted · dashed · hatched) with the full law in
  the hover; the session's first failed card teaches its affordances
  once ("click the code to explain · hover ⑂ forks"); the scaffold
  ships a commented `break_me` curriculum failure and the walkthrough
  earns "Break it on purpose" (completes when the red actually
  taught: on the explain command, not a button).
- **Cards know more of the language**: `on_finally` cleanup chips
  ("◈ finally ×N" with the always-runs law) · infer senses
  ("∴ thinking 4k" · "▣ vision ×N") · fan-out policy ("∥ max
  3" · "⤼ per-item" vs "⚡ fail-fast") · `mode:` completions
  teach each extract mode's output shape and use, spec-ordered.
- **The canvas never reads empty**: a faint verb-hued ghost DAG lives
  behind the welcome card (one dot pulsing · the run that wants to
  happen); check-clean names the next move in the activity feed; a
  created workflow narrates its next moves.
- README: a "One graph · five lenses" section + a 15-second deck tour
  GIF captured from the real renderer with real gestures.
- **The lens deck, completed after the tour**: the audit lens gains
  the **secret overlay** (pasted-literal credentials at graph scale:
  red dashed ring on the task, "⚿ N literal credentials" in the
  banner; the editor squiggle keeps the env-var rewrite) · the
  welcome's recent rows lead with their file's real shape in
  miniature (**the gallery** · small multiples, engine truth) · the
  map's plan rail sleeps inside the timeline lens.
- **The run story on every surface**: Runs-view task rows read the
  fold's inner life (agent pulse · tooltip narration · mid-run ~$)
  with the same vocabulary as the canvas hover, and the status menu
  teaches the lens keys.
- **The cache hit proves itself**: a cached task's hover carries its
  ADR-099 identity: "same definition (…) and inputs (…) as the
  recorded run" · the claim with its evidence inline.
- **Big graphs never sit silent**: past 100 tasks the canvas says
  "laying out N tasks…" while ELK thinks (300 nodes ≈ 3.6s,
  measured); the media harness earns a deterministic ?n perf fixture.
- **The coherence sweep** (teaching · proof):
  - the deck's stacking law settles empirically: the timeline is the
    only non-map projection, so map-anchored surfaces (plan rail ·
    audit hulls · banner) sleep under it and come straight back;
  - the ? explainer, the walkthrough's DAG step, DESIGN.md (§6d, the
    deck as constitution · rule 6, the real harness and its judge
    flags) and the status menu all teach the same deck;
  - the shareable run report carries the new proofs (cache
    identity · the agent loop), the timeline rows wear the agent
    gutter ("t3"), and the typed core reaches the card ("⊨ typed"
    with the rendered shape);
  - the judge's own fixture is held against the renderer contract in
    CI (mutation-proven against the historical dependsOn lie), and
    the shared miniature renderers defend themselves (the NaN-viewBox
    class).
- **Every task in the native Test Explorer** (engines ^1.85): every
  workflow is a test item and every task a CHILD at its YAML range ·
  the run/status gutter icon lands on the task's own line. The
  default "Run (engine)" profile executes the real engine
  (`run --task <id>` for one task) and reads verdicts from the
  RECORDED trace via the same fold every surface trusts (skipped and
  cancelled are decisions, never failures; the failure peek opens on
  the failing line speaking the one vocabulary). Golden lanes stay
  honest: "Golden test" refuses without a pin and names the gesture
  that records the first one.
- **The Vercel · Linear · Raycast polish**: policy chips fold past
  five into "+N" (facts layered, never dropped) · the ⚡ what-if
  button wears its X hint truth-gated (only when the keystroke would
  hit THIS card) · one 160ms entrance grammar for every lens surface,
  stilled under reduced-motion.
- **The file is alive**:
  - the run pill learns the RECORDED ETA ("Run (≤ $0.0090) · ~13s"):
    the weighted critical path over your flight-recorder means
    (measured beats recorded beats hops; one history-less task and
    the claim honestly stands down);
  - the end-of-line badge speaks the run vocabulary in one
    truncated line ("✓ 1.2s · $0.003 · ↻2 · t3" · "gated" ·
    "blocked by X") and gains its deep hover card (identity proof ·
    recovery · the full gate expression · the agent loop · the
    failure tail) · inline stays a summary, the hover carries the
    rest.


### Cards know themselves: identity, wires, layout craft

- **Card intelligence**: every card resolves its identity from the
  graph SSOT (`cardIdentity`: verb × builtin × the engine's own
  catalog categories · never guessed). An image-making builtin owns a
  developing frame BEFORE any artifact exists (calm dashed at rest ·
  develop sweep while running · the recorded artifact replaces it in
  the same box); a run that only wrote lands its file receipt row
  (click opens); nika:fetch pulses its round-trip on the tool chip.
  The per-verb running identities carry the canonical
  design/motion.yaml names (one motion vocabulary across site ·
  terminal · canvas, parity-gated).
- **The connection speaks**: hovering a wire lights BOTH endpoint
  cards; the focused card claims its incident wires; hovering a
  card's io-row chip lights the wire it names on the canvas.
- **Layout craft**: the production ELK set (straight value wires ·
  the author's YAML order IS the layout order, diff-stable ·
  recovery routes as feedback loops · typed kinds never merge) ·
  every card snaps to the 8px survey grid · far zoom recedes the
  wires so topology carries (the failure hue demixes last).
- **One predicate register** (`core/predicates`): spellings ·
  default · the per-predicate pass-sets in one table: the doors, the
  shapes and the hover pedagogy all read it (a future predicate
  respelling flips one line, when the engine's lane lands). SPEC_PIN
  carries a machine-readable HOLD: the daily heal parks instead of
  advancing past what shipped engines speak.
- **Voice + honesty**: one toast prefix · cancelled=⊘ / skipped=↷ on
  every surface · the download progress stops calling the engine a
  language server · ⌘⌥K validates (⌘⇧K stays Delete Line) · ⌘⌥M
  opens the menu · the first-ever boot never stacks the download
  modal on the walkthrough · Station wire/fix commands are palette-
  safe · nika_workspace refuses to aggregate without a folder ·
  forced-colors covers the new edge kinds.

### The station · the oracle · the kind vocabulary

- **The Station** · a third view in the container: the cockpit the
  engine always carried and the extension never asked for.
  `doctor --json` findings render as rows whose CLICK is the exact
  fix (`nika …` lines run in a terminal; `export KEY=…` lines go to
  the clipboard · the human owns secrets), `welcome --deep --json`
  supplies the wired agent clients (one-click `nika wire <client>`),
  the local providers with pulled models, cloud key COUNTS (never
  values), and the workspace audit rollup with the honest `≥` cost
  floor. The container badge counts doctor FAILS only. The engine row
  says which binary won the resolution ladder AND whether it speaks
  this extension's grammar generation: a fact with a door, never a
  crash.
- **The LSP oracle adopted** · graph projection now rides
  `nika/semanticDocument` when the server advertises format 2: one
  request against the live buffer (no spawn per refresh) carrying the
  canonical projection VERBATIM plus per-task declaration spans; the
  CLI lane stays as fallback, the client sketch last. Capability-
  gated: a format-1 server keeps the CLI lane.
- **The islands convergence** · when a server with completion runs,
  the gate and collection doors offer the engine's own suggestions
  first (the empty `when: `/`for_each: ` island position); the
  curated shapes remain offline fallback + the gestures no island can
  make. Gate-checked against the real server (`islandsReal.e2e`).
- **The edge speaks its kind** · the waist glyph becomes the kind
  vocabulary: chevron (value/control) · hollow dot (terminal
  observation) · diamond in the failure hue (failure observation ·
  the wire says which outcomes feed it) · open hook (recovery's
  parking loop). Every hover title states its pass-set verbatim
  (`admits {failure · skipped}`).
- **nika_workspace lives again** · the LM tool follows the renamed
  verb (`welcome --deep --json` on 0.104+, `context` on older dev
  builds): agents get the workspace aggregate back.
- **The generation floor is honest** · e2e suites probe whether the
  binary parses this grammar generation and skip WITH their reason on
  older engines instead of lying red (run them for real with
  `NIKA_BIN=<dev build>`).
- SPEC_PIN advances to `8e21866`: the newest spec point a real
  engine honors today (the predicate respellings beyond it land
  when the engine's lane does).

### The client speaks the typed-edge grammar

- **BREAKING (language wave, with the engine)**: `depends_on` is dead
  (`NIKA-PARSE-024` · `nika check --fix` migrates). The two boundary
  doors replace it: `with:` bindings ARE the data edges,
  `after: { producer: succeeded|failed|skipped|terminal }` is the
  control edge. `when:` reads LOCAL namespaces only (`tasks.*` there is
  `NIKA-VAR-021` · the hoist is machine-applicable) and `NIKA-DAG-005`
  guards the closed predicate set.
- **graph_format 2, no fallback**: the canvas consumes the typed
  projection (`nika inspect --format json`): edges carry
  `kind` (`value` · `terminal-observation` · `failure-observation` ·
  `control` · `recovery`), a control edge shows its predicate riding
  the wire, observation reads get a long-dash tinge, and
  `on_error.recover`'s parking read draws as a dim dotted thread that
  never flows, never glows, never joins waves or the critical path. A
  format-1 document is refused (a reader never guesses a format it
  does not speak); the client keystroke sketch emits the same typed
  shape from the same two doors.
- **The doors speak the new grammar**: "order on state" re-picks
  `after:` entries (predicates preserved), the gate picker writes
  LOCAL `when:` shapes (upstream state becomes an `after:` entry, an
  upstream value hoists through `with:` first), and the collection
  picker binds an upstream array through `with:` before `for_each:`
  reads the binding. Canvas connect writes `after: { from: succeeded }`;
  ⌥click removes CONTROL entries only (a binding is authored, never
  gesture-deleted).
- **Retired with their premise**: the ghost-edge overlay and the
  DAG-003 quick fixes (the binding IS the edge · the class is
  inexpressible), and the "redundant depends_on" transitive-reduction
  hint (pass-sets compose per edge; the engine's `one-obvious-way/010`
  owns the surviving narrow class).
## [0.104.0] · 2026-07-18

Lockstep on the engine's 0.104 line (moonshot — the 17th provider —
joins the catalog the pickers read live from the binary; the
extension's own surfaces are unchanged from 0.103.0). The refonte
wave keeps landing on main and ships with the engine's 1.0 train.

## 0.103.0 — 2026-07-13

Lockstep on the engine's 0.103 wave — **the language tightens**
(BREAKING: `command:` is argv-only · `shell:` is the explicit door ·
bare `${{ tasks.X }}` is an error · the gate algebra is normative).
Editor-side, the starters and guided-edit registers re-projected from
the 0.103 spec (#108 — `command · argv` default, `shell · the
explicit door`); the sections below fold the one-voice arc.


### One voice — the client yields capability-wise when the server speaks
- **The double voice dies** (#105 · closes #103) — on a 0.102 pair,
  completion/hover/definition/documentSymbol answered TWICE (merged
  duplicate suggestions, stacked hover cards — or subtly different
  answers, worse). Every client language provider now registers
  through a capability-keyed registry (`core/capabilityYield`): the
  server's `initializeResult.capabilities` silence their client twins
  on every (re)start; a crash or downgrade RESTORES the client voice
  — the « client-side intelligence stays active » toast is now
  mechanically true. Capability-gated, never version-gated: an older
  binary keeps full client intelligence, and a capability the server
  GAINS in a future release silences its twin with zero extension
  change (rename · references · semanticTokens · folding · links ·
  selectionRange · linkedEditing · callHierarchy are all pre-keyed).
  The capability KEYS are pinned against the LSP ServerCapabilities
  names (a typo'd key would double-voice forever, silently).

### The lens path goes linear — and the seam gets its law
- **One pass for every ref count** (#102) — the per-task lens row
  called `findTaskRefs` per task (O(V·L) per repaint); `countTaskRefs`
  walks the document once for every id, with an EQUIVALENCE test
  against the single-id walk (and an 800-task fan-in under an
  interactive budget). Paired with **linear `descendantsOf`** (#101 —
  reverse adjacency + BFS, pinned on a 2000-task chain), the per-task
  lens path is linear end-to-end.
- **The server-convergence map** (#100) — SSOT.md names the law of the
  LSP seam: a KNOWLEDGE register duplicated across it (gate shapes ·
  collection candidates) converges on the server as shipped binaries
  reach its lanes (engine ≥ 0.103); a GESTURE (the lens doors) stays
  editor-side forever. New pickers must say which they are to ship.

## 0.102.0 — 2026-07-13

Lockstep on the engine's 0.102 wave (**the editor speaks the
language** — the LSP arc lands server-side: space-trigger completions,
args/modes/members from the file and the catalog, hover cards that
read the graph, closure-aware references). Extension-side, the wave
folds the guided-edit arc below — the doors and their SSOT
consolidation.

### One source for every piece of language knowledge (the SSOT consolidation)
- **The guided-edit registers become spec truth** (#96) — the schema
  shapes (« type its output ») and the armor walls (« make it
  resilient ») now project from nika-spec
  `stdlib/authoring-shapes-v0.1.yaml` (oracle-proven at projection,
  like the starters) into `authoringShapes.generated.ts`; the CI gate
  grows `authoring-projector.py --check` next to starters and design.
  `schemaEdit`/`armorEdit` keep only the editor mechanics.
- **The provider presentation order leaves code** (#96) — the
  local-first ranking (operator lock 2026-06-12) is now
  `presentation.providers_order` in the spec's `design/tokens.yaml`,
  projected as `NIKA_PROVIDERS_ORDER`; the ledger gate greps any fork.
- **The 25 hand-written snippets die** (#96) — every one was a second
  (or third) copy: verb bodies duplicated the starters SSOT, the
  workflow snippet hardcoded a 7-model list the catalog had already
  outgrown. Add-a-task now lands the verb's FIRST spec starter (one
  voice with the « choose a starter » door); new-file paths (command ·
  `nika new` templates · walkthrough) already covered the rest.
- **`SSOT.md` — the knowledge ledger, made structural** (#96) — every
  artifact is declared in one of three lanes (runtime binary ·
  projected+gated · declared prose), and `ssotLedger.test.ts` fails
  the suite on a generated file outside the ledger, a row pointing
  nowhere, a resurrected snippets dir, or a forked provider order.
  The offline tool blurbs (Lane C courtesy cache) gain a real-binary
  belt: fallback NAMES must equal the catalog's — no ghosts, no gaps.

### The agent register — « choose its tools » (#87)
- **One lens on the agent's `tools:` line** (#94) — a `canPickMany`
  multi-pick over the binary's catalog (category-grouped, the offline
  blurbs as fallback), pre-checked from the block. Ownership law:
  the picker owns only plain catalog `nika:<bare>` refs — MCP refs,
  glob patterns (`nika:fs_*`, the spec's whitelist semantics) and
  unknown names are the author's sentences, preserved verbatim; their
  diagnostics stay the ENGINE's to give (the Real e2e pins a preserved
  stranger surfacing as a check finding, not a picker guess). An
  empty pick writes `tools: []` — least privilege is a valid answer,
  never a removal. A tools-less agent (pure reasoning) grows no lens.

### The armor doors — the spec's three error walls, offered when proven needed
- **« make it resilient »** (#93) — a task that FAILED its last run
  (the flight recorder's fold) grows one contextual lens offering the
  walls it doesn't wear yet: *retry transient failures* (max_attempts
  + backoff — exponential + jitter are the engine defaults), *recover
  with a fallback* (an upstream output — resolved at recovery time,
  not an execution edge — or a literal), *skip on error* (the DAG
  continues, the original error stays readable), *bound its time*
  (Go-duration timeout). Contextual, not ambient: no failure → no
  lens; proactive armoring lives one palette command away (`Nika:
  Make Task Resilient`). Recover sources honor the spec's parse-time
  acyclicity rule (NIKA-DAG-004) via the same cycle-safe candidate
  list the flow doors use — and the Real e2e pins the REJECTION of a
  descendant recovery, not just the acceptance of a clean one.
- **The missing brain** (#93) — infer/agent present, no model
  ANYWHERE (envelope or per-task): the status row offers « choose
  your model » (the same door, one voice) and inserts the envelope
  default at the spec's canonical slot (after `description:`),
  local-first catalog as always. Gone the moment a model lands.

### The flow doors — wire, gate, fan out
- **« wire its inputs »** (#91) — the `depends_on:` line re-picks what
  the task waits for, verb-glyph rows pre-checked from the file.
  Cycle-safe by construction: descendants never enter the candidate
  list. Block-list forms collapse to the spec's flow form; an empty
  pick removes the key.
- **« choose a gate »** (#91) — the `when:` line offers a CEL v0.1
  register built from THIS file: `vars.<x>` equals/flag shapes for
  every input, `status == 'success'` and `size(output) > 0` shapes for
  every upstream task. Always writes the wrapped canonical form. A
  `tasks.*` gate **wires its `depends_on` edge first** — the spec's
  §referencing-requires-an-edge law, composed so the door can never
  write the parse rejection (the Real e2e pins the rejection itself).
- **« choose the collection »** (#91) — the `for_each:` line swaps the
  collection: typed `array` inputs lead, upstream outputs follow (edge
  wired the same way), other vars offered honestly (« runs if it holds
  a list at launch »). The placeholder teaches `${{ item }}` /
  `${{ index }}`.
- Doors sit ONLY on existing lines — an absent key is LSP territory,
  not lens noise. All three commands are lens-bound (palette-hidden).

### The contract doors — inputs, outputs, and the typed unit
- **« type its output »** (#89) — an `infer:`/`agent:` without `schema:`
  offers the language's hardest block as a picker of proven shapes
  (named fields · a list · a verdict · a grade — every one a top-level
  object, appended child-indented at the end of the verb block). The
  door only opens where the schema is missing: an untyped infer is
  legitimate, a second schema never is.
- **« choose what it publishes »** (#89) — `outputs:` as a multi-pick
  over the DAG (verb-glyph rows, pre-checked from the block). The
  picker owns only the rows it can regenerate
  (`<id>: "${{ tasks.<id>.output }}"`); typed outputs, jq paths and
  commented rows are the author's sentences and survive verbatim. It
  never writes the bare-`${{ tasks.X }}` trap. The door also rides the
  status row when a `dead-spend` hint fires with no `outputs:` at all —
  publishing is one of the two honest fixes.
- **« declare an input » · « make it callable »** (#89) — the `vars:`
  line grows the input half of the callable contract: name → type (or
  the untyped shorthand) → default, where an EMPTY default on a typed
  input means `required: true` (the semantics, not an extra prompt).
  Untyped rows offer promotion to the typed form — `type:` inferred
  from each default, value and trailing comment preserved.
- **Proven against the real engine** — a `*Real.e2e` belt chains the
  four pure edits exactly as the pickers do and pipes the result to
  `nika check -`: every shape combination checks clean (self-skips
  without a binary, CELLAR-first).

## 0.101.0 — 2026-07-13

Lockstep on the engine's 0.101 wave — **the sovereign lane ships
whole**: every engine release binary now carries `local-infer`
(`nika model pull` → `serve` → workflow `infer`, no cloud, no build
wall). The extension already speaks to whatever binary answers — a
lane the binary now always has.

### The doors speak — a lens title is a call, not a caption
- **The naked nouns retire** (#86) — `model:` now offers **choose your
  model**, the verb keys **choose a starter** (`invoke:` **choose your
  tool**), the per-task graph lens **see it in the graph · N refs**.
  One vocabulary module (`core/lensVocab`) feeds every provider so the
  door words cannot fork per surface — and the vars CTA finally
  conjugates (*1 var rides --var* · *2 vars ride --var*).
- **Two new writing doors** (#86) — **add a task** rides the status
  row above `tasks:` (the palette's vocabulary one click away · ⌥⌘T ·
  offline fallback teaches the same 4 verbs); a DECLARED `permits:`
  block gets **tighten the boundary** — the same `check
  --infer-permits` recompute the undeclared case gets, because a
  boundary drifts as tasks accumulate.

## 0.100.2 — 2026-07-12

### The run door heals on 0.100 engines
- **`--no-color` → `--color never`** (#84) — the engine's Rams pass
  retired the per-verb `--no-color` twins; the ▶ Run door (`runLive`)
  and the infer-permits CTA still passed the dead flag, a clap error
  on every 0.100 binary. CI was blind (real-engine suites self-skip
  without a binary); the operator Cellar moving to 0.100.0 revealed
  it. Product + all real-engine test files swept — 590 green against
  the 0.100.0 Cellar. The README also learns the lens doors (#82/#80,
  rode this train).

## 0.100.1 — 2026-07-12

### The verb line becomes a door
- **One lens above every bare `<verb>:` key** (#82) — `◆ tool` on
  `invoke:` (spec starters + every builtin THIS binary carries,
  category-grouped, args skeleton derived from the tool's own schema —
  required args as `# SLOT` lines, typed placeholders); `◇ ▷ ✦
  starters` on `infer:`/`exec:`/`agent:` (the spec's canonical shapes).
  Picking replaces the verb block — one surgical edit, one undo; a
  moved anchor refuses a blind write.
- **Starters are spec-truth** — projected from nika-spec
  `stdlib/verb-starters-v0.1.yaml` by `starters-projector.py`, which
  refuses to project starters the conformance oracle rejects. Builtins
  stay engine-truth (`catalog --tools --json` — the picker shows what
  YOUR binary can run).

## 0.100.0 — 2026-07-12

The version line joins the engine's 0.100/0.101/… wave — every nika
repo (engine · extension · client-sdk · agents kit) ships the same
number per wave from here on.

### The envelope reads top-to-bottom
- **Every lens on the line it serves** (#80) — the GitHub door above
  `nika:` (the envelope names the language, the lens names where it
  lives), Check · DAG · Run above `workflow:`, Explain above
  `description:` (the narrative on the line it narrates); the status
  row stays above `tasks:`. One pure placement law (`core/lensAnchors`,
  10 tests) — partial files fall back up the chain so no door
  disappears.
- **The model line is a door** (#79) — `⇄ model` opens the embedded
  catalog picker (provider-grouped, local-first per the
  presentation-order doctrine) and surgically rewrites exactly that
  line. Its canvas twin retired same-day (#80): the DAG door already
  lives on the action row.

## 0.99.9 — 2026-07-12

The same operator day, second half: nine more merged PRs (#69–#77),
each sideloaded and re-proven live (0.99.4→0.99.8 were those steps;
0.99.9 is the publish candidate).

### One truth for where the user is
- **The journey** — four surfaces each re-derived « where is the
  user? » (status menu · welcome view · init nudge · New Session);
  `core/journey.ts` now computes it once — `noBinary → unequipped →
  empty → working`, precedence telling the story (workflows mean
  WORKING: equipping is an improvement, never a blocker) — and every
  surface consumes it (#77).
- **The menu head IS the next step, per stage** — Finish setup /
  Init this project / the 10-second proof + New session / the active
  file's Run · Check · Graph. Init Project and New Session finally
  enter the menu — the onboarding doors were missing from the one
  ordered surface (#77).
- **The sidebar says what the menu says** — viewsWelcome splits per
  stage via the `nika.journey` context key; the walkthrough's first
  step becomes one gesture (Finish Setup, completion wired) (#77).

### The language tells the truth
- **Colors stay honest** — links move OFF the verb keywords (a
  DocumentLink paints over token colors permanently in Cursor; hover
  keeps the teaching) and semantic tokens skip comment lines, so a
  `${{ … }}` in a comment reads as a comment (#70).
- **References navigable** — F12 / peek works on task names: wire
  references (`${{ tasks.X }}`, `needs:`) resolve to the task's
  definition and back (#70).

### The menu reads as intent, not inventory
- **Sections over a wall** — the active file leads with concrete
  labels (Run · Check · Graph on the filename), then Author · Prove ·
  Understand · Machine; the earned ask closes the list (#71).
- **Less but better** — one lifecycle toast, two lens segments, one
  menu row fewer (#69).

### One lightbulb, never two
- **The client yields renames to the server** — when the engine's LSP
  advertises code actions (the `check --fix` rename engine shipped as
  quickfixes), the extension's own rename quickfixes stand down; older
  engines keep the client fallback. Probed live on the initialize
  handshake, never version-guessed (#72).

### One voice, fewer moving parts
- **The palette speaks one voice** — category SSOT « Nika » (titles
  lose their prefix), one export command (`Export Graph` asks
  SVG/PNG/Mermaid/DOT), internal rows hidden: 54 → 47 palette
  entries (#74).
- **The vsix sheds its internal docs** — contributor docs and icon
  build notes leave the artifact (58 → 55 files); OFL.txt stays — the
  SIL license must travel with the font (#76).

### Belts
- **artifactsReal pins the released binary** — the e2e belt prefers
  the Homebrew Cellar path over bare PATH: a sister session's branch
  build on PATH can carry provenance attributes that Gatekeeper kills,
  reading as « no binary » in belts that must prove the RELEASED
  story (#73).

## 0.99.3 — 2026-07-12

The operator-loop day: ten screenshot-driven passes, nine merged PRs
(#59–#67), each installed and re-proven live between captures.

### The language reaches the editor, by default
- **Language identity enforced at runtime** — a `*.nika.yaml` opening
  under another languageId (the association fight Cursor lost silently)
  is set to `nika` on open; `filenamePatterns` joins the language
  contribution (#60).
- **The verb band, two layers** — each verb carries its own TextMate
  scope riding a well-known family (blue · orange · teal · purple in
  every theme, zero gestures), and `Nika: Apply Verb Colors` writes the
  exact canonical hexes into user settings, consented (#59, #60).
- **Required vs optional top keys** — `nika` · `workflow` · `tasks`
  keep the keyword family; every optional key (`description` · `model`
  · `vars` · `permits` · …) moves to `support.type` — two families
  every theme colors apart (#67).
- **The butterfly badge** — 🦋 on every workflow file in the Explorer
  (FileDecoration: identity without replacing the user's icon theme —
  icon themes match by extension and beat the language icon fallback).
  `nika.explorerBadge` opts out (#61). The real per-file icon is
  upstream: material-icon-theme PR #3530.

### Install = everything on
- **Auto-power** — first activation with the binary present silently
  runs the engine's own `nika wire <host>` (idempotent); a binary
  arriving MID-session (the download path) lights everything without a
  reload. `nika.autoSetup` opts out (#60, #63).
- **`Nika: Finish Setup`** — the one orchestrated gesture: verified
  download → wire MCP → optional repo init (consented) → recap (#63).
- **The download path tells the truth** — version via the quota-free
  releases/latest redirect (the unauthenticated API rate limit made
  the button a silent no-op), the aggregate SHA256SUMS is MANDATORY
  (per-asset .sha256 lookups silently skipped verification on every
  modern release), and a failed download answers with the error + two
  exits (#63).
- **The status menu reads the state** — no binary → Finish setup
  leads · fresh workspace → « Run the 10-second proof » (01-hello ·
  mock/echo · offline) · working workspace → operate verbs. Footer
  gains the one earned ask: ⭐ Star nika on GitHub (#63).

### The audit surface grows CTAs
- **Two lens rows, each in its place** — actions (Check · DAG ·
  Explain · Run) above the `nika:` envelope (never over the license
  header); status (clean/findings · tasks · waves · ceiling) above
  `tasks:` (#65).
- **Report-driven CTAs** — undeclared boundary → `$(shield) declare
  the boundary` (inferPermits) · required vars → `$(symbol-variable)
  N vars ride --var` → `Nika: Copy Run Line` (ready-to-paste,
  placeholder per var) (#67).
- **Ctrl-clickable teaching links** — verbs → docs concepts/verbs ·
  `nika:*` tools → nika.sh/tools · `permits:` → docs
  concepts/security (page-level only) (#67).
- **The envelope teaches, never warns** — hovering `nika: v1` got the
  unknown-builtin warning; it now explains the envelope (#66).

### Resilience
- **The EPIPE toast is gone** — transport errors are `handled` (the
  upstream client showed its raw toast even through #62's handler),
  two quiet restarts, then a clean stop with one-click « Restart
  server »; a successful restart re-arms the budget, so binary swaps
  mid-session self-heal silently (#62, #67).
- **The graph survives its tab** — a panel disposed under us (reload
  races · serializer restores) no longer bricks every later open:
  `show()` try/reveals, releases the corpse, builds fresh;
  `postMessage` self-releases (#62).
- **Version discipline** — the published 0.98.1 stomped a sideloaded
  0.98.1 carrying five merged PRs (same number, marketplace wins):
  every visible-feature merge now bumps the version (#64).

### Earlier in this release line (unpublished since 0.98.1 — the first-install arc)

- **The one earned ask** — after the FIRST completed run (and only then,
  once ever: the flag persists before the user answers, so a dismissal
  counts), a notification offers the two community doors, editor-aware:
  star the engine on GitHub · review where THIS editor installs from
  (Open VSX for Cursor/Windsurf/VSCodium, the Marketplace for VS Code).
  The walkthrough gains step 9 « Keep it findable » naming the three
  doors (star · review · registry). Working surfaces (check · run ·
  diagnostics) stay marketing-free by doctrine.
- **New Session — the intent-first launcher** (`Nika: New Session` ·
  💬 button atop the welcome view). Cursor's Agents panel is a
  proprietary list nika cannot join, so the extension ships its own
  front door: set up this project · the GUIDED WIZARD (the binary's
  own `nika new` on a TTY — a chat in the terminal, a checked file
  out) · describe → generate · templates · examples · canvas · tour,
  with the full command menu one row away. State-aware: an equipped
  workspace stops advertising setup; a binary-less one leads with
  install.

- **The walkthrough shows the product** (user-persona design pass) —
  the validate, run and DAG steps gain their posters (check-as-you-type
  findings · the run chaining green through the graph · the live
  canvas mid-run, a coalesced frame from the demo GIF). The
  walkthrough description drops its stale step count (it said five;
  there are eight — now count-free by the projection law), and
  Init Project completes the create and agents steps too. The parity
  scan learns to skip binary assets in walkthrough/.

- **First-run intelligence** (the socratic pass on « install and
  everything just works »):
  - the PATH gap is CLOSED, not warned: an extension-download-only
    user had a workspace MCP config saying `nika` with nothing on
    PATH — the oracle could never start. On Cursor the machine-scoped
    `~/.cursor/mcp.json` now gets the absolute path (PATH-probed:
    a brew install is never shadowed; other servers untouched).
  - the Cursor plugin nudge no longer burns its one-shot on an empty
    window (where « Wire this workspace » could only error).
  - per-workspace project detection: a repo carrying `.nika.yaml`
    workflows but not equipped (no scaffold) gets ONE offer per
    workspace — Init Project — at activation.

- **Init Project — the one-gesture setup** (`Nika: Init Project` ·
  welcome view 🚀 button · walkthrough) — runs the binary's own
  scaffold (`nika init`: 7 files, skip-if-exists) then wires MCP +
  agent rules for the detected host. One click = a fully equipped
  repo; the button IS the consent to write.

- **The post-download toast carries the next moves** — after the
  one-click engine download (consent modal · SHA-256 verified), the
  success toast offered nothing. It now hands over: Wire workspace
  (MCP + agent rules via `nika.setupMcp`) or Open walkthrough. Wiring
  stays click-explicit: downloading a binary is not consent to write
  files into the user's repo.

- **Cursor gets its guided setup** — running in Cursor now surfaces ONE
  toast (machine-scoped, never again): install the nika marketplace
  plugin (rules · skill · subagent · hooks · MCP in one Add) or wire
  just this workspace (`nika.setupMcp`). No install API exists on the
  plugin side, so the nudge guides instead of acting. Deliberately NOT
  gated on the binary (user-persona review): the plugin teaches the
  install line, so the no-binary user is exactly who must see it.

- **Add Task from the editor** (`⌘⌥T` · `Nika: Add Task` · editor
  context menu) — one QuickPick speaking the canvas palette's exact
  vocabulary: the 4 verbs, then every builtin as a pre-wired `invoke:`
  (binary-fed catalog with the engine's own descriptions; the fallback
  vocabulary offline). Inserts after the task under the cursor, lands
  the selection on the new id. The walkthrough's create step teaches
  it, and the time-travel step gains its own page (it was re-using the
  DAG one).

- **SVG previews + the engine's policy voice** (deep-e2e review wave) —
  `.svg` joins the image extensions: `nika:chart` writes byte-identical
  SVG artifacts and its card previewed NOTHING (a new real-binary e2e
  runs an actual chart workflow and pins the whole pipeline). On a
  0.99+ binary whose graph projects the declared policy, the cards now
  read `retry` / `timeout` / `on_error` / `outputs` from the ENGINE
  (the client YAML read degrades to the pre-0.99 fallback). Artifact
  refreshes are snapshots — a task whose fresh run produced no media
  loses its stale preview instead of wearing an older generation.

- **The generation lands ON the card** — media tasks now show their
  RECORDED artifact in a preview zone: image thumbnails (click opens
  the real file) and playable audio rows (▶ · one player canvas-wide ·
  nothing autoplays), with name, `1/N` count, and provider/model/size
  in the tip. Engine truth only: artifacts come from the latest
  matching trace (the same ≥60% membership gate as the averages), a
  file that no longer exists renders nothing, and a finishing live run
  pushes its fresh artifacts the moment it closes. The webview opens
  workspace `localResourceRoots` (+ a `media-src` CSP line) to read
  them — the architecture decision the previews waited for. Exports
  shed the preview bytes (webview URIs die outside the panel).

- **Live tasks count their observed elapsed** — a running/retrying
  card's verdict ticks `12.4s ⋯` (our clock from the observed start
  event, repainted at 1Hz — text, not motion); the engine's measured
  duration replaces it at settle. No observed start (restored panel ·
  scrub) → no number: observed, never invented. The
  wavy-throughput-ring idea was REJECTED on the same honesty gate —
  the engine streams no live token rate to modulate it with.

- **Every builtin, its face and its voice** — the task palette's tool
  rows now carry the 6 house category icons (core hub · file doc ·
  data braces · network globe · introspection lens · media frame — the
  same 24-grid stroke-2 language as the verb glyphs) and a one-line
  teaching blurb per tool: the binary's own `tools --json` description
  when it ships, a curated 27-tool fallback offline. Card tool chips
  wear the same category icon.

- **One palette EVERYWHERE** — the insert-on-edge `+` now opens the
  same task palette (verb or tool) instead of a verb-only QuickPick,
  and the omnibar's deterministic add learns the tool vocabulary:
  `+ jq after gather` lands an `invoke` pinned to `nika:jq` (known
  bares from the binary's `tools --json`; a full `nika:x` ref is
  always accepted — an unknown tool is the engine's diagnostic to
  give, not the parser's guess).

- **The task palette — a verb, or a tool, one searchable surface** —
  ＋ Task, the N key and the port-drop gesture now open one palette:
  the 4 verbs first, then the full builtin vocabulary grouped by
  category (`tools --json` when the binary ships it, the offline
  27-tool map otherwise). Picking a tool lands an `invoke` task PINNED
  to it — named after the tool (`jq`, not `invoke_4`) and deliberately
  argless: the check's findings teach that tool's required args in the
  engine's own voice.

- **Arriving is describing** — a workflow with zero tasks greets you
  with a centered describe bar (the same oracle-checked generate flow
  as the welcome) and the palette hint; it leaves the stage the moment
  the first task lands. A `⧇ New` toolbar button opens a fresh
  untitled workflow page without leaving the canvas.

- **Rename Task from the canvas** — the right-click menu gains Rename
  (every reference follows: `${{ tasks.X }}` islands, `depends_on`,
  `when:` CEL — the pure rename engine the LSP already trusted) and
  Focus Task (center the camera on the card).

- **The dense card — the substance moves ON the node, the hover slims
  to the run story** — the card gains an io row (the inbound wires,
  named: `alias ← producer`, data-hue, click jumps to the producer,
  `+N` overflow) and a policy row (declared execution policy as chips:
  `↻×N` retry budget · `⏱ 30s` timeout · on_error route — `✚ recover`
  amber / `⤼ skip` / `⛔ fail` red · `⤳ N` named output bindings ·
  `▦ N` permits, engine-projected per the affirmative permits
  contract). A settled task's verdict now carries its recorded spend
  (`✓ 1.2s · $0.0042`). The hover card stops mirroring the card
  (model/gate/cost/fan-out/wires rows removed) and keeps what only IT
  can say — output · spent-before-failure · wave · blast radius ·
  pinch · needs/unlocks jumps · ▸ run/⧉ dup — and it now anchors to
  the node's flank (flips on overflow) instead of chasing the cursor.
  Facts only: an undeclared policy renders nothing; permits come from
  `graph --format json` (previously dropped by the adapter).

- **Edge & port grammar** — every real wire (data included) gains the
  16px hover twin: hovering lights the wire, its alias label and its
  NEW mid-edge direction chevron (end arrowheads drown under target
  cards — the waist ⌃ reads at any pan; hidden on the far map read).
  The ⌥click-to-disconnect gesture now actually works through the
  twin (it was unreachable beneath it before); the insert-on-edge +
  stays dependency-wires-only. The in-port wears the data hue when
  named wires plug in, and both ports teach on hover.

- **Keyboard camera obeys the motion charter** — every
  keyboard-initiated camera move is now INSTANT (F fit · +/− zoom ·
  A auto-layout · Tab/↑↓ nav · `/`-Enter cycling); glides stay with
  pointer gestures. ←/→ join Tab as prev/next task.

- **Native right-click on a card** — a real VS Code context menu
  (`data-vscode-context` + `webview/context`): Run Task (upstream
  cone) · Open in YAML · Duplicate · Delete · Copy Task Id — the same
  levers the canvas gestures already used, zero hand-rolled DOM menus.

- **27-builtin glyph fallback** — `chart` and `image_fx` (the media
  family's 0.99 graduates) join the offline category-glyph map; the
  binary's own `tools --json` vocabulary still wins when present.

- **The phosphor skin** — `nika.dag.theme: phosphor`, an opt-in OLED
  register: true-black pool, phosphor-green ink and hairlines, and verb
  chroma that SLEEPS at rest and wakes to full hue exactly while a task
  is live — the color is the execution. Status voices keep their
  semantics (success green · failed red · retrying amber, retuned for
  black); forced-colors wins over it like every skin; `auto` never
  resolves to it (an OLED black is a choice, not an inference).

- **Two interaction paper-cuts** — double-clicking a card no longer
  ALSO zooms the camera (d3's default dblclick.zoom now yields to the
  card's open-YAML gesture), and the hover card's `pinch point` label
  no longer wraps its key column.

- **Execution particles — data made visible crossing the wire** — while
  a task computes, each edge feeding it carries a short train of bright
  beads (SVG `animateMotion` riding the edge path on the compositor; the
  dash-offset march is retired — it re-rasterized the stroke every
  frame). Existence is the honesty gate: a particle spawns only while
  data truly travels (source settled → target running/retrying), never
  on a resting graph. Reduced motion spawns none — the settled tint
  alone carries the state.

- **Hover-to-trace lineage** — rest the pointer on a card and its REAL
  data story lights: the transitive producers and consumers (the same
  closure the click-focus uses), everything else dims — minimap
  included — and the particle train rides the hovered lineage only. A
  click keeps its stronger claim; the caret-driven lineage restores
  itself when the pointer leaves.

- **Post-run afterglow** — the instant a live run closes, every wire
  that actually FIRED holds heat and cools over ~2.4s: success green,
  failure red, while cached (ADR-099 rehydration — nothing executed)
  and skipped wires stay cold. Pure opacity/glow decay, zero motion —
  reduced-motion keeps it, shorter. Replays and scrubs never fire it;
  only a live close does.

## [0.98.1] · 2026-07-09

- **The real butterfly, everywhere the logo stands** (operator lock) —
  the activity bar, the `*.nika.yaml` language icon and the DAG panel tab
  now carry the official butterfly-supernova mark (glow `#cfe6ff` dark ·
  ink `#04050d` light) instead of the interim simplified glyph; the
  `contrib/` Material + vscode-icons kits align with the upstream PR
  (material-extensions#3529, updated the same way). The 4 verb glyphs on
  the canvas keycaps are untouched — they are verb icons, not the logo.

- **The card tells its after-story** — the hover card now shows
  `spent $0.0018 recorded` (the terminal event's real spend) right
  under the static `cost $min → $max` estimate: before and after on
  one card. And the legend chips gain `✚ N recovered` — a repaired
  run says so in the run summary, not only on the card.


- **The canvas cost ticker** — the status pill now carries the run's
  recorded spend, live: `2 done · 4 running · ≥ $0.0022`. Engine truth
  only (the terminal events' `cost_usd`, summed as tasks settle), with
  the run-totals grammar: `≥` because unpriced tasks exist — the sum is
  a floor, never a bill — and a mock/local-only run shows nothing
  rather than a fake `$0.00`.


- **Every verb gets a soul** — each card now carries its execution
  model's matter and character, per the four-verb doctrine (a verb IS a
  distinct native execution model): `infer` wears a thought-aurora
  behind its head and the tile breathes while the model is actually
  thinking · `exec` shows faint CRT scanlines and blinks a terminal
  caret after the command while the subprocess is live · `invoke` has a
  socket gradient at rest and visible current flowing across the head
  while the tool call is in flight · `agent` carries a dashed orbit
  ring around its tile that rotates while the loop turns. Plus a
  skeuomorphic surface pass: light falls from above, the card edge is
  polished, param chips sit inset. Rest layers are static paint; the
  only continuous animations ride `status-running` (bounded by max
  parallelism), every one has a reduced-motion opt-out, and heat mode
  neutralizes the verb matter so the cost tint stays the only color
  story. Both skins pixel-proven.


- **The canvas card says `✚ recovered`** (engine ≥0.98 · D-2026-07-08-N4)
  — the repaired-success story reaches the DAG: the card's verdict word
  turns `✚ recovered` in retry-amber, the success dot wears the amber
  ring of the failure it absorbed, and the hover card names the code
  (`recovered from NIKA-… — on_error.recover absorbed the failure`).
  Live runs and trace overlays both feed it; the activity feed gains the
  matching `✚` line; scrub frames treat it as a resting truth (like the
  output preview). Both skins pixel-proven in the harness.


- **Version-skew warning leaves the LSP path** — the outdated-extension
  check now fires on every binary resolution (activation and the
  restart gesture), not only when `nika lsp` happens to start: an old
  extension against a new non-LSP binary previously got no signal.
- **The motion preference goes live** — the canvas reads
  `prefers-reduced-motion` through a media-query listener: toggling the
  OS setting takes effect on the next gesture, no panel reload needed.


- **The verbs wear their own faces** — the DAG card keycap, the drop-a-port
  verb palette (cmdk) and the add-a-task toolbar swap the unicode stand-ins
  (◇ ▷ ◆ ✦) for the icon ontology's house verb glyphs (sparkle · console ·
  api-roundtrip · agent-graph — [nika.sh/brand](https://nika.sh/brand)),
  built as safe DOM, inked by each surface's existing verb hue. Unknown
  verbs keep the unicode fallback (forward-compat contract unchanged).

- **The canvas gets a key** — `ctrl+alt+d` / `cmd+alt+d` opens the DAG
  on any `.nika.yaml` (Run and Check already had theirs).
- **Dead code swept** — the `dag:viewportChanged` protocol kind (declared
  and handled, sent by no one) is gone from both unions; the legacy LSP
  daemon-status poll (30s interval writing to a status-bar item that was
  never created) is deleted — the real status bar has owned that surface
  for a long time.


- **Repaired successes stop dressing as clean ones** (nika ≥ 0.98 ·
  D-2026-07-08-N4) — the fold now consumes `task_recovered`: the task
  keeps its ✓ (it IS a settled success) but the editor badge says
  `recovered`, the run card counts `✚ N recovered`, and the run report
  names what was absorbed (`recovered from NIKA-…`) in the verdict line
  and the task row. Old traces without the event are unaffected. The
  DAG-canvas card badge follows in a canvas pass (pixel-proof law).
- **First-run manners** — declining the binary-download consent is now
  remembered: the modal never re-fires on startup (the status bar and
  the welcome canvas keep the install affordance); the explicit
  `Nika: Restart Language Server` gesture asks again. The
  binary-not-found toast shows once ever instead of once per window.
- **The Runs view greets its first visitor** — an empty flight recorder
  now explains itself: run a workflow (mock needs no key) instead of a
  blank panel.
- **Two honesty fixes** — the README no longer promises schema
  completions without the binary (they read the engine's `nika schema`);
  the DAG walkthrough names the real flag (`nika graph <file> --format
  mermaid`).
- **The glyph reaches every small surface** — activity bar, editor-tab
  language icon and DAG panel tab now use the brand kit's 16 px teardrop
  glyph instead of scaling down the full butterfly-supernova (which turns
  to mush under 24 px; the light variant also wore an off-system navy
  `#0a2540` — now the canonical inks: glow `#cfe6ff` on dark · ink
  `#04050d` on light). The Marketplace tile is untouched. Icon sources are
  vendored from the brand kit — see `icons/README.md` and
  [nika.sh/brand](https://nika.sh/brand/nika-logo-dark.svg).
- **`contrib/` icon kit for file-icon themes** — ready-made, spec-compliant
  Nika icons + wiring for Material Icon Theme (interim `.nika` → `flow`
  folder association + upstream-ready `nika.svg` / `folder-nika.svg`) and
  vscode-icons (custom file/folder/open-folder set). The README grows an
  « Icons in your editor » section. Excluded from the `.vsix`.

## [0.98.0] · 2026-07-08

- **The estimate names its prices** (nika ≥ 0.98) — the preflight's
  Estimated-cost block carries the pricing snapshot's provenance from
  `check --json` (`pricing.snapshot`): `Prices: list rates (public
  catalog) · snapshot 2026-07-07 · 606 models`, with a staleness hint
  past the engine's 120-day threshold (`⚠ N days old — upgrade nika to
  refresh prices`). Old engines omit the key → the line is absent,
  never invented.

### The story speaks with one voice (30s-experience arc, continued)

- **Explain swaps to the engine's narrative** — with a binary that
  carries `nika explain <file>` (engine #298+, probed live), the
  `Explain Workflow` command shows the engine's own story: waves ·
  the wires drawing · cost honesty (FLOOR · unpriced, never « free ») ·
  the flight-recorder hand-off. One voice across terminal and editor;
  the client composer stays the fallback for older binaries and
  non-conformant files.
- **The walkthrough greets first activation** — the five-step story
  existed but relied on VS Code's post-install card (dismissed unseen
  by most). It now opens once, ever, on the first activation.

### Internal (30s-experience arc, continued)

- **`explainFile` capability probed, dormant** — engine #298's
  `nika explain <file>` (narrative + `--json` twin) is detected on the
  REAL `explain --help` doc line (the stdinDash law: help text over
  version numbers). Nothing consumes it yet; the swap point is
  `nika.explainWorkflow` once a release carries the file form.
- **Dead code out of `dagForDocument`** — the unreachable duplicate
  fallback after the `clientDagFor` return (and its orphaned
  `parseRichWorkflow` import — the lint proved the kill).

### The beginner meets the story (30s-experience arc)

- **¶ Explain joins the header lens** — the deterministic narrative
  (waves · cost · touches · risks) was palette-only; the one row every
  workflow shows now carries it.
- **First clean check hands over** — once per workspace (setting
  `nika.nudge.firstCleanCheck`), a clean verdict suggests the next
  step: run it, mock/echo needs no key. Verdicts no longer dead-end.
- **The empty sidebar pitches and opens the canvas** — one line of
  what Nika IS + a `◇ Open the canvas` entry (the DAG panel's welcome
  hero — describe→generate, examples, capabilities — was unreachable
  with zero files).

## [0.97.4] · 2026-07-07

### Evidence reaches the editor — reviewed, then released

Engine 0.97.0 shipped « the run becomes evidence »; this release turns
it on in the editor — after the adversarial pass the trust arc had
never had (two HIGHs died pre-ship, the law pays again):

- **Verify Journal** — one click asks the engine itself (`nika trace
  verify`): intact with its head, BROKEN at its exact line, or
  unchained (pre-0.96 — nothing to verify, nothing to distrust).
- **Reproduce Run** — the determinism taxonomy in the Runs view:
  `reproduced` · `NONDETERMINISTIC` (the flaky task, named) ·
  `authored` · `environment`. Reads two journals; never re-runs,
  never spends.
- **One head everywhere** — the run's verdict banner, the tooltip and
  the run report carry the engine's printed chain head.
- **The drift badge tells a re-encode from an edit** — the Runs view
  folds `workflow_sha256_lf` (engine #247's client twin): a CRLF↔LF
  save no longer cries « definition drifted ».

### Fixed (the adversarial pass)

- **A stopped run no longer wears the previous run's chain head** —
  the anchor only prints at run END, so Stop/crash/older-engine runs
  inherited the last run's head on their banner; the anchor now clears
  at spawn (HIGH).
- **A one-line torn journal is UNREADABLE, never a green** — the
  client walk returned « torn » with the constant genesis head on a
  file the engine rejects; torn now requires a verified prefix,
  mirroring the engine's exact hardening (HIGH).
- **The client chain walk matches the engine on CRLF journals** — a
  re-encoded journal verified INTACT by the engine read BROKEN in the
  tooltip (`\r` hashed into the line); and broken line numbers are
  FILE lines, blanks counted — client and engine name the same line.
- Banner/tooltip carry the engine's full **32-hex** anchor (16 was the
  forgeable width the engine's own review rejected) · a nameless
  recorded journal says so in the Reproduce picker instead of listing
  the whole workspace as siblings · the « Prove it ran » walkthrough
  step owns its media page.


- **Verify Journal** (nika ≥ 0.97) — one click on any recorded run asks
  the engine (`nika trace verify`) for its authoritative chain verdict:
  OK with the full head for the anchor comparison, or the broken line
  as a warning. The tooltip's instant client walk and the engine's own
  word are now both one gesture away.
- **Reproduce Run (determinism check)** (nika ≥ 0.97) — right-click any
  recorded run, pick another journal of the same workflow, and the
  engine's taxonomy answers WHY they diverge: reproduced ·
  NONDETERMINISTIC (same def+inputs, different output) · authored ·
  environment · status-changed — with the engine/platform attestation
  compared. The verdict opens as a markdown preview.
- **The anchor closes in the tooltip** — an intact run now shows its
  chain head (`$(verified-filled) chain intact — head …`) in the Runs
  view: compare it against the one the run printed to close the anchor
  loop by eye. Torn tails say "crash, not tampering".

## [0.97.3] · 2026-07-07

### The second adversarial pass — the review reviews the reviewers

Two more agents attacked the never-reviewed halves of the F5/OTel/rates
arc (client) and the `nika dap` server itself. The server's protocol
layer came back hardened (~30 hostile inputs, zero panics); the client
side pays its findings now:

- **Preflight rates were dead on the wire** — `parseCheckReport` never
  copied `pricing`: the exact class that hit `requirements` one review
  earlier, recurred one field later. Fixed — and a **full-wire
  round-trip ratchet** now types the fixture `Required<CheckReport>`,
  so any future field the parser forgets fails at compile time AND at
  test time. The class is structurally dead.
- **The generated launch.json no longer hijacks F5.** `workflow:
  "${file}"` reached the resolver before variable substitution, read as
  a literal path, missed the name, and silently replayed the newest run
  of ANY workflow. Resolution now runs in the substituted hook — and
  the newest-overall fallback is gone when the workflow's name is
  known: F5 says « no recorded run of `name` » instead of silently
  debugging a foreign journal (fork's never-silent-runs law, applied
  to the other direction).
- **Quoted workflow names match their journals** — `workflow:
  "deploy #7"` was truncated at the `#` by the line-scan extractor
  (the real parser handled it), so such workflows could never
  exact-match in the F5 direction.
- **OTel export trusts the engine's own answer** — the exported path
  is parsed from the engine's `exported → …` line instead of assumed
  from a suffix rule (a custom `.jsonl` traces glob made the assumed
  path point at the raw journal); a timed-out export no longer shows
  an empty error.
- Rates guard hardened (`typeof`, an omitted key renders nothing —
  never `$undefined`) · journal scan cap raised 100 → 500 stat-first.


## [0.97.2] · 2026-07-06

### The backlog paid — the review's remaining five

- **Fork resolves by NAME, asks on ambiguity.** The journal stamps its
  workflow name; fork now requires the exact match when present — an
  active sibling sharing task ids can no longer hijack the fork, several
  declaring files QuickPick instead of first-wins, and a no-match refusal
  names the workflow it looked for. The overlap heuristic survives only
  for nameless (truncated/foreign) journals.
- **The cross-run grid stops mixing siblings** — membership is the exact
  workflow name too, and the window is honest: stat-first newest-first,
  folding lazily until 12 members (the old shape folded an arbitrary
  100-file window eagerly — the « last 12 » could omit the actual newest
  runs, and 88 folds were thrown away).
- **Answering warns before killing a live run** — the notification click
  superseded any in-flight run silently; it now asks first.
- **Unknown pause modes degrade to the input box** — never the Yes/No
  picker (a boolean fails a choice gate every time); a future engine
  mode gets a string the gate validates against its own contract.

### Riding the same train

- **Preflight rates** (nika ≥ 0.96) — every model row in the flight plan
  shows what it will pay per token (`$2/$10 per 1M`, from the engine's
  vendored 602-model catalog) beside its key verdict. An UNKNOWN price
  renders nothing — never $0.
- **The AI authoring prompt teaches proof** — agents are now told to
  quote trace evidence (`trace outputs` · `trace peek --raw` · replay
  under `nika dap` · `trace export` to OTel), not vibes.
- **Runs view: the time-travel action rides inline** — the ▷ debug icon
  sits on every recorded run beside diff.
- **Fix: F5 via the generated launch.json snippet** — the snippet's
  `replay: ""` beat the trace the provider had just resolved (first F5
  died on `cannot read journal ''`). Resolved paths now win over
  empty/missing ones; user config keeps the cosmetics. (Landed minutes
  after 0.97.1 was cut — rides this train.)

## [0.97.1] · 2026-07-06

### The adversarial review pays — nine fixes in the day's own release

An end-of-day adversarial review of everything 0.97.0 shipped found
real edges in the untested seams; all confirmed on the code, fixed and
pinned the same day:

- **Housekeeping can no longer strand an answerable run.** The trace
  pruner was blind to what a journal IS: it could delete a PAUSED run's
  journal (the resume substrate) — including the very `--resume` target
  the click was about to consume, since it pruned BEFORE the spawn.
  Paused journals now survive any ranking (tail check), and the
  imminent spawn's resume target is explicitly protected.
- **An answer now targets its own pause.** The paused notification
  re-derived the journal at click time from a live map that EVERY run
  overwrites — a mock preview run between pause and answer could
  swallow a real human approval into a mock journal. The paused record
  now carries its journal path, captured at pause time; answering the
  same pause twice warns before re-running gated side effects.
- **Typed answers survive.** The engine JSON-parses answer values —
  answering `123` to an input gate arrived as a Number and failed the
  gate's string contract; numeric-looking choices could never match.
  Input and choice answers are JSON-encoded (text stays text).
- **Preflight's engine contract is alive.** `parseCheckReport` never
  copied the `requirements` section — the whole engine-stated-contract
  adapter was dead code on the wire. One copy, one wire-level test.
- **Diff v2 names the culprit, not a victim.** First-divergence ranked
  by clocks mixed across the two runs — a cascade-cancelled task (no
  compare clock) fell back to the OLDER run's epoch and always outranked
  the actual failure. Compare-run clocks only now.
- **Drift truth only speaks about its own workflow** (the sha check now
  requires the trace to match the active document), the runs-tree cache
  keys on mtime+size (same-tick appends on coarse filesystems), the
  .gitignore nudge re-reads before writing (a stale snapshot could
  revert edits made while the toast waited), and terminal runs (`run`
  fallback · golden test) honor the spawn-cwd law so their journals
  land beside the workflow.


### Time travel, for real

- **F5 time-travel debugger** (nika ≥ 0.96) — breakpoints in your
  `.nika.yaml`, F5 replays the newest recorded run of that workflow under
  the real VS Code debugger: step forward AND backward through task
  settles, recorded outputs in the Variables pane, `continue` runs to the
  next breakpointed task. Replay never re-executes — stepping back is
  free. Every run in the Runs view gains "Debug This Run (Replay · Time
  Travel)" (journal→source matched by workflow name; QuickPick on
  ambiguity). A walkthrough step teaches it.
- **Export to OpenTelemetry** (nika ≥ 0.96) — a context action on any
  recorded run projects its journal to OTLP/JSON lines: drag into Jaeger
  UI, or POST to Aspire/Grafana/Langfuse (cost rides `gen_ai.usage.cost`).
  Local file, zero collector. An engine older than the verb is told to
  upgrade instead of a clap parrot.
- **Runs view discoverability** — Run History and Diff join the view
  title bar; Preflight and Run History join the welcome capabilities grid.

## [0.97.0] · 2026-07-06

### The human-gate, answered

- **Paused runs ask — you answer — they finish.** A `nika:prompt` task
  pauses the run (exit 4, ADR-099): the verdict goes amber ⏸ with the
  question itself (a pause is not a failure), a notification offers
  « Answer… », and the control matches the mode (confirm → Yes/No ·
  choice → the workflow's own options · input → a box). The answer
  resumes the exact journal the engine wrote, downstream runs live on
  the canvas. Wired at every run gesture (run · mock · rerun · resume ·
  fork). Proven pause → answer → completed on a real 0.94 engine.

### Diff v2 · the cross-run grid · housekeeping

- **Diff v2 — output changes + the first divergence.** The run diff now
  compares recorded outputs (0.94 journals): same status but different
  data paints « ≠ output » (key-stable equality; a missing record never
  claims a change). The FIRST task whose story diverged — status flip
  or output change, never a timing wobble — is named in the feed and
  centered on the canvas: everything downstream of it is suspect.
- **`Nika: Run History` — the cross-run grid.** Tasks × the last 12
  matching runs: every cell a recorded terminal status (⚡ cache-hit),
  flaky tasks called out (mixed outcomes in the window — a fact), and
  slowdown callouts vs the window median (15% noise floor, ≥3 samples).
- **Journal housekeeping.** `nika.traces.keep` (default 200) prunes the
  workflow's journal dir before each run — newest always survive. The
  first journal in a workspace offers `.gitignore` coverage once
  (asked, remembered — never a silent edit).
- **Fork finds its workflow.** Fork-from-step resolves the matching
  workflow itself (active doc, then the workspace, majority-overlap
  law) and opens it — only a true no-match refuses.

### The user-POV review pass + the retry ladder

- **The retry ladder.** Failures grow their per-attempt story (each
  retry's NIKA-code detail and clock, then the terminal word) — in the
  Runs-view task tooltip and the run report. A single clean attempt
  tells no story.
- Eight review fixes from walking the shipped arcs as a user: replay of
  a trace-synthesized graph no longer highlights unrelated YAML files;
  closing a replay clears its source highlight; Runs-view artifacts
  resolve against the run's cwd and say « missing on disk » honestly;
  a preflight that could not check keys says « · preflight », never a
  green ✓; x-ray hints land after `}}`; missing-env marks skip comments
  and clear on edit; the flight-plan command reuses the catalog memo;
  gallery URLs survive paths with spaces.

### The P1 arc, second wave — Test Explorer · missing-env marks · est badges · the gallery

- **Test Explorer.** Golden-backed workflows (`<file>.golden.json`
  beside them) appear in the native testing UI: Run executes the
  engine's own harness (mock/echo · offline), the failure message IS
  the engine's per-path diff, and a second profile re-pins the golden —
  explicit, never silent. Discovery follows goldens as they appear.
- **Missing-env marks.** A red « ✗ not set » rides the first occurrence
  of every `${{ env.X }}` the environment cannot satisfy (workflow-
  defined keys count as satisfied). Only problems speak — the green
  story stays in the preflight chip.
- **Est badges.** Until a run exists, the check report's static
  per-task cost holds the badge slot in gray italic (` est $0.004` ·
  ` est ≥ $…` when unbounded); a real run replaces it with the solid
  actual in the same place.
- **The gallery.** Image artifacts the run report can resolve on disk
  render INLINE in the report preview, each captioned with its
  producing task.
- X-ray lookups are now memoized (the disk walk was not keystroke-cheap).

### The P1 arc — fork · report · x-ray · the chip

- **Fork-from-step.** Pick a task in a recorded run (Runs-view ⑂ or the
  palette): it and its downstream re-execute, upstream rehydrates from
  the trace (`--resume --from`) — counterfactual iteration without
  re-spending the cone above. Majority-overlap guarded.
- **Run report.** One markdown per recorded run: verdict, per-task
  table, artifacts with provenance, failures pointing at fork — every
  line the trace's own events, gaps stated (« no cost data », never $0).
- **X-ray ghost values.** Inlays show what each `${{ tasks.x… }}`
  resolved to in the last matching run (full outputs, drilled per path,
  loud ellipsis, tooltip carries the value). No record → no hint.
  Opt-out: `nika.editor.xray`.
- **Preflight chip on the run pill.** Red « ✗ N missing » (blockers in
  the tooltip) · amber « ⚠ flows » · green « ✓ preflight » — computed on
  every check; click opens the flight-plan document.

### Understandable before it runs · provable after (P0 of the IDE-experience arc)

- **Lineage mode — follow the data.** Click a card, or put the caret
  inside `${{ tasks.x… }}` in the YAML: the producer and every consumer
  stay lit (direct neighbors louder than the transitive cone), the data
  wires on the path saturate, everything else fades. Ghost wires
  (NIKA-DAG-003) count as real consumption. Esc clears; an explicit
  click wins over the caret.
- **`Nika: Preflight` — the flight plan before any token.** One command
  renders cost (ceiling · unbounded stays a loud floor), every
  infer/agent model resolved against the catalog's key requirements
  (local providers marked sovereign · mock marked zero-spend), secrets
  and env checked against the actual environment (`env` sources
  verified; vault/file say « declared », never « verified »), permits +
  capability escapes + secret flows, and the wave-by-wave plan. Missing
  requirements headline as blockers.
- **Artifacts in the flight recorder.** Task rows in the Runs view grow
  children for media/file outputs recovered from the trace (images ·
  audio with duration · manifest sidecars) — click opens, the tooltip
  carries artifact ↔ producing task ↔ provider/model.
- **The agent gate line.** Generated `.cursor/rules` and the
  `nika_check` tool description now carry the imperative: always check
  after every edit, never done while findings remain.
- **Source-bound run highlight — the YAML is the timeline.** While a
  run executes or a replay scrubs, the YAML spans of the RUNNING tasks
  glow (theme-safe, whole-line, ruler mark). Live batches, the platine
  and the Replayer feed one seam; live runs paint with the panel closed
  too. Opt-out: `nika.editor.runHighlight`.
- **Preflight env semantics fixed in review**: requirements are the
  `${{ env.X }}` refs the body reads — workflow-defined keys are
  covered, read-but-unset keys block. Plus a self-skipping REAL-binary
  e2e floor: a true run journal proves trace → artifact provenance, a
  true catalog proves the key story (proven on a fresh 0.94 build).
- **Golden testing joins the menu** · `Nika: Golden Test` runs
  `nika test <file>` (mock provider · offline) and `Update the Golden`
  re-pins `<file>.golden.json` — capability-probed, lights up on any
  engine whose `--help` lists `test`.
- **Doctor + Ping** (0.94+) · opt-in TCP probe of the LOCAL provider
  ports (loopback only · 300ms cap · nothing sent) from the status-bar
  menu and the palette.
- README: the audit family list is complete (arg typos with
  did-you-mean · dead `when:` gates), the stdin dash and golden testing
  documented.

## [0.96.1] · 2026-07-06

### The three blind finding families — a clean badge told a lie

- **`missing_args` · `unknown_args` · `gate_findings` now surface
  everywhere** (tree badge · canvas audit · workspace lint · diagnostics
  · the AI-generate gate). The engine fails `nika check` on a missing
  required tool arg, a typo'd arg key, or a provably dead `when:` gate —
  the extension used to paint those files CLEAN.
- **The AI-generate loop trusts the binary's exit code**: a draft only
  ships as clean when `nika check` itself exits 0 — a future finding
  family can never slip a dirty draft through again.
- **Paused runs read as paused** (ADR-099 `nika:prompt`): ⏸ card and
  pause icon in the Runs view instead of a forever-live pulse.

## [0.96.0] · 2026-07-06

### The tmp-file dance dies — dirty buffers ride the dash

- **Dirty and untitled buffers now pipe straight into the binary**
  (`nika check/graph -` · engine #190) instead of the
  write-tmp-spawn-unlink dance — diagnostics, the canvas, the permits
  lens, the cost-delta baseline and the generate oracle all take the
  stdin leg on a dash-capable engine.
- **Capability-probed, never version-gated**: the extension reads the
  binary's own `check --help` for the dash (dev builds from engine main
  carry it while still reporting an older version). Pre-dash binaries
  keep the tmp-file fallback — nothing changes for them.

## [0.95.2] · 2026-07-06

Version-number burn only: a cancelled release run had half-published
0.95.1 to OpenVSX (inactive · invisible) before the cancel landed, and
the registry refuses the number twice. 0.95.2 IS 0.95.1 — no code
change.

## [0.95.1] · 2026-07-06

### The replay owns its floor — the mega e2e review

- **Time-travel had a chrome collision** (the end-to-end journey review
  caught it): with the scrubber open, the status chips and progress bar
  sat half-buried in its floor and the omnibar poked out from under it.
  The scrubber now owns the bottom floor (`body.replaying`, the
  dock-tier pattern): chips + progress + omnibar yield — they describe
  a LIVE canvas, the scrubber time-travels a RECORDED one — and the
  minimap steps up one floor and keeps navigating.
- **The activity feed stopped repeating itself** — a burst lands many
  entries in the same second; the first entry of each second keeps the
  timestamp ink, repeats dim to a whisper (the value stays for
  hover/copy).

## [0.95.0] · 2026-07-06

### Heatmap 2.0 — a reading mode, not a one-card show

- **The √ perceptual ramp** — a long-tail metric (one 14s agent over
  100ms tools) crushed the linear scale into a single red card with a
  neutral graph around it. The ramp is now `√(metric/max)`: the
  gradient READS across the whole graph while the max stays the
  hotspot; tint ceiling raised for the deep pool.
- **One toggle = one question = one view** — while H is down,
  everything that isn't the heat gradient steps back: wires go quiet,
  verb tiles desaturate, param chips dim, and the critical-path chip
  (describing a trace the mode retired) yields.
- **A legend key** appears with the mode: a gradient bar + the metric
  actually in play (`measured time` once anything ran, `static cost`
  before) — the map finally ships its key.
- Wave bands re-tuned for the deep pool (they had sunk with the page).

### The deep register — darker pool, an intelligent background

- **The nika skin falls to true near-black** (`#0d0d0e` page) while the
  cards keep their level — the raise between pool and module face
  WIDENS instead of everything sinking. Hairlines retuned, vignette
  deepened.
- **The background became a four-layer instrument** (DESIGN.md §4):
  the survey grid now follows the CAMERA (far zoom swaps the fine 40px
  crosses for a calm 96px major graticule — the map read gets a map's
  grid), and the vignette KNOWS the run (the falloff tightens while
  tasks execute, pulling the eye to the lit work, then relaxes).
- **One blue.** The Run CTA now derives from the accent
  (`color-mix`) — the second, unrelated button-blue is gone.
- README `dag-execution.gif` re-captured on the deep register (661KB,
  −16% again — near-black compresses better).

### Edge-case hunt — four YAML-surgery bugs fixed, five dead ends gated

An adversarial multi-agent hunt over the edit surfaces confirmed four
real corruption/wrong-behavior bugs (each reproduced against the live
code before fixing) and five new-user dead ends. All fixed, all pinned
by tests:

- **Same-indent block lists survive connect** — `depends_on:` with
  items at the key's own indent (legal YAML the parser reads fine) was
  corrupted by drag-connect/quick-fix: the new item spliced two columns
  deep, making the file unparseable. The scan now accepts same-indent
  items and appends at THEIR indent.
- **Multi-line var values survive the VAR-001 quick fix** — declaring a
  missing var used to splice the declaration INTO a block scalar
  (`prompt: |` …), corrupting the document. The vars-block scan now
  understands continuations and 4-space styles.
- **Quoted deps disconnect** — `depends_on: ["a"]` made ⌥click-
  disconnect a silent no-op and turned insert-on-edge into a triangle
  (both ends kept). Items now compare unquoted, inline and block.
- **A doc comment belongs to the task below it** — deleting the task
  ABOVE a `# comment` used to delete the comment; ⌘D duplicated it onto
  the copy. Task spans no longer swallow trailing comments.
- **No more dead ends without the engine** — every no-binary path now
  lands on one actionable gate (Install / detect → re-resolve + the
  consent-gated download · or copy the brew line): check/inspect no
  longer open a terminal that says `command not found`; capture-baseline
  no longer OVERWRITES the grandfathered-debt record with an empty one;
  the status-bar menu finally contains the install row its tooltip
  promised; describe→generate keeps your typed intent through the
  install; a configured `nika.server.path` that doesn't run says so
  (with Open settings) instead of failing silently. The welcome shows
  an amber engine-missing banner with the same one-click recovery.

### The binary's own model catalog in the picker (E1 closed)

- The model picker's second step now lists the **exact runnable model
  ids** from `nika catalog --json` (engine ≥0.94) with the facts that
  matter — `200k ctx · reasoning · vision · json:schema` — the current
  model marked, `✎ custom…` one row away. The canon provider list
  stays step 1's skeleton (local providers keep free typing); older
  binaries keep the previous flow untouched.

### Readable at every distance — semantic zoom + insert-on-edge

- **The far zoom is a real map now** (DESIGN.md §6c). Below ~30% the
  card becomes a map tile — verb tile + id + status dot, dead-center,
  **zoom-compensated**: the pieces scale against the zoom so the id
  holds one optical size instead of shrinking into 5px lint. Ids clip
  at the START (`…ard_7`, not eight identical `shard…`) — fan-out ids
  differ at the tail. Tier boundaries are hysteresis bands (a pinch
  resting on a threshold never flaps the canvas); the geometry never
  moves, wires stay pinned.
- **Insert a task INTO a wire** — hovering a dependency edge mounts a
  floating + at its midpoint (riding an invisible 16px hit twin — a
  2px stroke is not a click target). Click → pick the verb → the task
  splices in: skeleton after the upstream end, the wire reroutes
  through it (`depends_on` rewired, data refs untouched). Dep wires
  only, by design.

### The engine's word on findings — severity + docs_url (E4 wire)

- `check --json` conformance findings from engine ≥0.94 stamp their own
  `severity` and `docs_url` (nika PR #184); the extension now prefers
  both — an engine-stamped severity drives the squiggle (unknown future
  names degrade to error, never soften), and the diagnostic code links
  to the engine's own URL. Older binaries keep the derived
  `nika.sh/errors/<CODE>` fallback — same register page either way
  (shipped on nika.sh in this arc: `/errors` + `/errors/:code`).

### Canvas quick wins — duplicate ⌘D · the binary's own tool vocabulary

- **Duplicate a task** — `⌘D`/`Ctrl+D` on the focused card, or the `⧉ dup`
  button on the hover card (next to `▸ run`). The copy lands right after
  the original with a fresh `<id>_copy` id; inbound wiring (`depends_on` ·
  `with:` refs) is kept, downstream refs stay on the original — the n8n
  most-loved move, now one key away.
- **Canvas glyphs speak the binary's vocabulary** — the extension consumes
  `nika tools --json` (engine ≥0.94 · E1) and pushes real
  builtin→category mappings to the canvas on every graph load; the
  hardcoded glyph map demotes to a fallback for older binaries. A future
  engine category shows up on cards without an extension release.

### The welcome home — onboarding from the first pixel

- **The empty canvas is the front door, not a void.** First open with no
  workflow shows the welcome home: the Nika mark + wordmark + tagline, a
  **describe → generate** bar (type a sentence, ✨ feeds
  `nika.generateWorkflow`), the start actions (＋ New · ▤ Examples ·
  ↻ Replay a trace · ⌘ All commands), **recent `*.nika.yaml`** from the
  workspace (mtime-sorted, click opens file + canvas), and the capability
  map — eight one-line commands (check · report · inspect · permits ·
  explain · spec · AI prompt · MCP setup) each wired to its real command.
- **Chrome retracts in welcome mode** — toolbar, omnibar, minimap, legend
  and activity feed hide while no graph is loaded (no dead controls over
  the door); the grid and aurora stay. Everything returns on load.
- **The sidebar tree greets too** — a native `viewsWelcome` teaches the
  same three verbs (new · describe → generate · examples) + the palette
  hint when the workflows view is empty, so first contact lands in either
  surface.
- Webview → extension commands are gated by an explicit whitelist
  (`WELCOME_COMMANDS`); recent files are pushed by the extension
  (`welcome:data`), the webview never touches the filesystem.

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
