# Canvas media — the README hero capture

`media/canvas-live-run.gif` is captured from the extension's **real webview
bundle** (`out/webview/dag.{js,css}`), driven through the extension's own
message protocol (`dag:load` · `dag:batchUpdateStatus` · `dag:artifacts` ·
`run:state` · `run:progress` · `run:verdict`) — the same messages a live
`nika run` streams onto the DAG. The run timeline is a scripted replay
(states illustrative, chrome and card anatomy real).

## Regenerate

```sh
npm run compile                    # the harness loads out/webview/dag.{js,css}
node scripts/media/capture.cjs     # → scripts/media/canvas.webm (Chrome required)
ffmpeg -ss 1.3 -to 17.6 -i scripts/media/canvas.webm \
  -vf "fps=13,scale=1100:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  media/canvas-live-run.gif
gifsicle -O3 --lossy=70 media/canvas-live-run.gif -o media/canvas-live-run.gif
```

`harness.html` also serves as the ad-hoc pixel-proof page from
`docs/DESIGN.md` (stubbed `acquireVsCodeApi`, `?skin=editor|phosphor` to
flip the register). Keep every claim honest: if a card element or message
kind changes in `src/webview/dag.ts`, re-render rather than editing the GIF.

Budgets: README GIF ≤ 3 MB (the Marketplace renders it on the listing page).
