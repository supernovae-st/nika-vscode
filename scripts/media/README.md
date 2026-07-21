# Canvas media — the README captures

Three of the README GIFs are captured from the extension's **real
webview bundle** (`out/webview/dag.{js,css}`), driven through the
extension's own message protocol (`dag:load` · `dag:batchUpdateStatus` ·
`dag:artifacts` · `run:state` · `run:progress` · `run:verdict`) — the
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
launch `--channel chrome`. playwright is not a repo dependency — point
`NIKA_PLAYWRIGHT` at any install (`npx playwright@latest` works, or the
locally installed `node_modules/playwright` when judging).

The timeline lens is host-built truth (`timeline:request` →
`dag:timeline`): the harness has no host, so the lens tour answers the
request itself with recorded-shape rows whose clocks mirror the
scripted sim's (see `tour.cjs`).

`harness.html` also serves as the ad-hoc pixel-proof page from
`docs/DESIGN.md` (stubbed `acquireVsCodeApi`, `?skin=editor|phosphor` to
flip the register, `?media=1` the brand-studio scene, `?celebrate` the
confetti replay, `?n=300` the perf fixture). Keep every claim honest: if
a card element or message kind changes in `src/webview/dag.ts`,
re-render rather than editing the GIF.

Budgets: every README GIF ≤ 3 MB (the Marketplace renders them on the
listing page).
