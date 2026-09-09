# Canvas media · the README captures

Three of the README GIFs are captured from the extension's **real
webview bundle** (`out/webview/dag.{js,css}`), driven through the
extension's own message protocol (`dag:load` · `dag:batchUpdateStatus` ·
`dag:artifacts` · `run:state` · `run:progress` · `run:verdict`) · the
same messages a live `nika run` streams onto the DAG. The run timelines
are scripted replays (states illustrative, chrome and card anatomy
real). `media/check-as-you-type.gif` is the exception: a real-editor
capture (VS Code + a live engine), re-shot by hand when the diagnostics
surface changes.

## Regenerate

```sh
npm run compile                    # every capture loads out/webview/dag.{js,css}

# 1 · the hero — the scripted release-notes run + the first-green confetti
node scripts/media/capture.cjs '?celebrate'    # → scripts/media/canvas.webm
ffmpeg -ss 1.3 -to 17.6 -i scripts/media/canvas.webm \
  -vf "fps=12,scale=1100:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  media/canvas-live-run.gif
gifsicle -O3 --lossy=70 media/canvas-live-run.gif -o media/canvas-live-run.gif

# 2 · the run tour — the ?media brand-studio scene (38 nodes · grand cards),
#     camera driven: map → dive on the developing frames → Fit → verdict
node scripts/media/tour.cjs media              # → scripts/media/media-tour.webm
ffmpeg -ss 3.0 -to 19.4 -i scripts/media/media-tour.webm \
  -vf "fps=10,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  media/dag-execution.gif
gifsicle -O3 --lossy=90 media/dag-execution.gif -o media/dag-execution.gif

# 3 · the lens deck — map → what-if on the writer → timeline → audit → dataflow
node scripts/media/tour.cjs lens               # → scripts/media/lens-tour.webm
ffmpeg -ss 1.0 -to 24.1 -i scripts/media/lens-tour.webm \
  -vf "fps=10,scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  media/lens-deck.gif
gifsicle -O3 --lossy=90 media/lens-deck.gif -o media/lens-deck.gif
```

Chrome is required (no bundled chromium on dev machines): both runners
launch `--channel chrome`. playwright is not a repo dependency · point
`NIKA_PLAYWRIGHT` at any install (`npx playwright@latest` works, or the
locally installed `node_modules/playwright` when judging).

The timeline lens is host-built truth (`timeline:request` →
`dag:timeline`): the harness has no host, so the lens tour answers the
request itself with recorded-shape rows whose clocks mirror the
scripted sim's (see `tour.cjs`).

## The browser probe suites

`harness.html` is also what the probe suites drive. The `probes` job
in `.github/workflows/ci.yml` runs them on pull requests through
`npm run probes`, separately from the unit/parity belt.

```sh
NIKA_PLAYWRIGHT=<path> node scripts/media/a11y-probes.cjs      # does it SPEAK
NIKA_PLAYWRIGHT=<path> node scripts/media/chrome-probes.cjs    # does it FIT
```

`chrome-probes` sweeps twelve lenses (clipping · targets · contrast · spill ·
motion · occlusion · glyphs · collisions · truncation · harmony · type ladder ·
semantic state) across `SKINS` ×
`SIZES`. Its defaults are four skins (`nika,editor,phosphor,light`) at
1440×900, 860×720 and 620×820. The complete `npm run probes` gate also
checks the shape corpus, forced colors and the accessibility journeys.
`probes:agents` exercises recorded token ratios and turn-only effects in all
four skins, reduced motion and forced colors. Its screenshots and assertions
also check that explicit task focus restores native text size when it fits.
An additional short-panel case keeps the focused card between chrome insets.
An additional targeted width sweep can run locally:

```sh
SKINS=nika,editor,phosphor,light SIZES=520x760,880x700,1000x700,1440x900 \
  NIKA_PLAYWRIGHT=<path> node scripts/media/chrome-probes.cjs
```

It reports concrete instances and exits nonzero on findings. These checks
cover the rendered browser harness, not native editor activation, terminal
processes or release installation; those retain their own gates.

`harness.html` also serves as the ad-hoc pixel-proof page from
`docs/DESIGN.md` (stubbed `acquireVsCodeApi`, `?skin=editor|phosphor` to
flip the register, `?media=1` the brand-studio scene, `?celebrate` the
confetti replay, `?n=300` the perf fixture). Keep every claim honest: if
a card element or message kind changes in `src/webview/dag.ts`,
re-render rather than editing the GIF.

Budgets: every README GIF ≤ 3 MB (the Marketplace renders them on the
listing page).
