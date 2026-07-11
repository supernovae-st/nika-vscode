// capture.cjs — record the canvas harness to media/canvas-live-run.gif.
//
// The harness drives the REAL webview bundle (out/webview/dag.{js,css})
// through the extension's own postMessage protocol — a scripted replay of
// the messages a live `nika run` streams. Chrome is required (no bundled
// chromium on dev machines): `--channel chrome`.
//
//   npm run compile                       # build out/webview first
//   node scripts/media/capture.cjs        # → scripts/media/canvas.webm
//   ffmpeg -ss 1.3 -to 17.6 -i scripts/media/canvas.webm \
//     -vf "fps=13,scale=1100:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
//     media/canvas-live-run.gif
//   gifsicle -O3 --lossy=70 media/canvas-live-run.gif -o media/canvas-live-run.gif
//
// playwright is not a repo dependency — point NIKA_PLAYWRIGHT at any
// install (npx playwright@latest works: NIKA_PLAYWRIGHT=$(npx --yes
// playwright@latest --version >/dev/null && echo playwright)).
const path = require('path');
const pw = process.env.NIKA_PLAYWRIGHT || 'playwright';
const { chromium } = require(pw);

const HTML = path.join(__dirname, 'harness.html');
const OUT = __dirname;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1360, height: 860 },
    recordVideo: { dir: OUT, size: { width: 1360, height: 860 } },
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  await page.goto('file://' + HTML + (process.argv[2] || ''));
  await page.waitForTimeout(17800);
  const video = page.video();
  await ctx.close();
  await video.saveAs(path.join(OUT, 'canvas.webm'));
  await browser.close();
  console.log('saved', path.join(OUT, 'canvas.webm'));
})().catch((e) => { console.error(e); process.exit(1); });
