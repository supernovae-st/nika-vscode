// tour.cjs — driven captures for the README GIFs that need a camera or
// gestures (capture.cjs records the scripted timelines as-is; this one
// drives zoom, pan, clicks and lens keys against the same harness).
//
//   npm run compile
//   node scripts/media/tour.cjs media   # → scripts/media/media-tour.webm
//   node scripts/media/tour.cjs lens    # → scripts/media/lens-tour.webm
//
// media — the ?media brand-studio scene (38 nodes · every builtin):
//   the map lights up, the camera dives into the image/audio cluster
//   while the declared frames develop and the artifacts settle (grand
//   cards: floating header + pill), then Fit pulls back for the
//   deliver wave and the verdict.
// lens — the deck tour on the settled release-notes graph (?still,
//   statuses driven here): map → what-if on the writer (the frame
//   where review lights) → timeline → audit → dataflow → map.
//
// playwright is not a repo dependency — point NIKA_PLAYWRIGHT at any
// install (the capture.cjs note applies here verbatim).
const path = require('path');
const pw = process.env.NIKA_PLAYWRIGHT || 'playwright';
const { chromium } = require(pw);

const HTML = path.join(__dirname, 'harness.html');
const OUT = __dirname;
const MODE = process.argv[2] || 'media';
const VW = 1360; const VH = 860;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function zoomTo(page, pct, cap = 14) {
  // Spaced instant steps — back-to-back presses interrupt each other's
  // d3 transition (the measure.mjs probe); 60ms gaps are deterministic.
  for (let i = 0; i < cap; i++) {
    const now = await page.evaluate(() =>
      parseInt(document.getElementById('zoom-pct')?.textContent ?? '0', 10));
    if (now >= pct) { return now; }
    await page.keyboard.press('+');
    await sleep(60);
  }
  return page.evaluate(() =>
    parseInt(document.getElementById('zoom-pct')?.textContent ?? '0', 10));
}

async function centerOn(page, taskId) {
  // Wheel = the canvas' own camera pan (a drag would grab a card).
  const box = await page.evaluate((tid) => {
    const el = [...document.querySelectorAll('.dag-node')]
      .find((e) => e.getAttribute('data-id') === tid);
    if (!el) { return null; }
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, taskId);
  if (!box) { return false; }
  await page.mouse.move(VW / 2, VH / 2);
  await page.mouse.wheel(Math.round(box.x - VW / 2), Math.round(box.y - VH / 2));
  return true;
}

async function clickCard(page, taskId) {
  const box = await page.evaluate((tid) => {
    const el = [...document.querySelectorAll('.dag-node')]
      .find((e) => e.getAttribute('data-id') === tid);
    if (!el) { return null; }
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + Math.min(18, r.height / 2) };
  }, taskId);
  if (!box) { return false; }
  await page.mouse.click(box.x, box.y);
  return true;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    recordVideo: { dir: OUT, size: { width: VW, height: VH } },
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });

  if (MODE === 'media') {
    // The msim clock is absolute from page load: run 2.0s · develop
    // 3.4-11.2s (hero images 6.8s · fx 8.9s · charts 11.2s) · verdict
    // 16.2s. The camera rides it.
    await page.goto('file://' + HTML + '?media=1');
    await page.waitForSelector('.dag-node', { timeout: 8000 });
    await sleep(2400);                        // the map · the run starts
    await zoomTo(page, 68);                   // dive to the frames' read
    await centerOn(page, 'hero');             // the image/audio cluster
    await sleep(9200);                        // declare → develop → deliver
    await page.keyboard.press('f');           // pull back — the whole run
    await sleep(5600);                        // deliver wave · verdict lands
  } else if (MODE === 'lens') {
    // ?still — the scripted demo stays quiet; the tour paints the
    // settled run itself (the sim's own final facts), then walks the
    // deck in the README's order.
    await page.goto('file://' + HTML + '?still');
    await page.waitForSelector('.dag-node .nc', { timeout: 8000 });
    await sleep(1200);
    await page.evaluate(() => {
      const post = (m) => window.postMessage(m, '*');
      post({ kind: 'dag:batchUpdateStatus', updates: [
        { taskId: 'history', status: 'success', durationMs: 245, outputPreview: '8 commits' },
        { taskId: 'stats', status: 'success', durationMs: 182 },
        { taskId: 'digest', status: 'success', durationMs: 2840, outputPreview: 'headline: « the release train picks up parallel rails »' },
        { taskId: 'chart', status: 'success', durationMs: 3405 },
        { taskId: 'polish', status: 'success', durationMs: 2130, usd: 0.0031 },
        { taskId: 'notes', status: 'success', durationMs: 96, outputPreview: 'RELEASE_NOTES.md · 1.4 KB' },
        { taskId: 'review', status: 'success', durationMs: 2760, agent: { turns: 4, offered: 5, universe: 12, budget: { totalTokens: 11200, budget: 20000 } } },
      ] });
      post({ kind: 'run:verdict', icon: '✓', text: 'run completed · 7/7 · ≥ $0.0031 · 12.6s · chain 8f41c2aa', cls: 'st-success' });
    });
    await sleep(2600);                        // the settled map
    await clickCard(page, 'notes');           // pick the writer …
    await sleep(900);
    await page.keyboard.press('x');           // … what-if: review lights
    await sleep(3600);
    await page.keyboard.press('Escape');      // clear the sim …
    await sleep(300);
    await page.keyboard.press('Escape');      // … then the selection
    await sleep(300);
    await page.keyboard.press('t');           // timeline — the lens asks
    await sleep(200);                         // the host; the tour answers
    await page.evaluate(() => {               // with the run's own clocks
      window.postMessage({ kind: 'dag:timeline', data: {
        startMs: 0, spanMs: 12600, rows: [
          { id: 'history', status: 'success', wave: 0, estMs: 1500, segments: [{ startMs: 0, endMs: 245, final: true }], bar: { startMs: 0, endMs: 245 } },
          { id: 'stats', status: 'success', wave: 0, estMs: 900, segments: [{ startMs: 0, endMs: 182, final: true }], bar: { startMs: 0, endMs: 182 } },
          { id: 'digest', status: 'success', wave: 1, estMs: 6200, segments: [{ startMs: 300, endMs: 3140, final: true }], bar: { startMs: 300, endMs: 3140 } },
          { id: 'chart', status: 'success', wave: 1, estMs: 1400, segments: [{ startMs: 300, endMs: 3705, final: true }], bar: { startMs: 300, endMs: 3705 } },
          { id: 'polish', status: 'success', wave: 2, estMs: 2100, usd: 0.0031, segments: [{ startMs: 3800, endMs: 5930, final: true }], bar: { startMs: 3800, endMs: 5930 } },
          { id: 'notes', status: 'success', wave: 3, estMs: 700, segments: [
            { startMs: 6200, endMs: 6280, final: false },
            { startMs: 6420, endMs: 6516, final: true },
          ], bar: { startMs: 6200, endMs: 6516 } },
          { id: 'review', status: 'success', wave: 4, estMs: 2700, agentTurns: 4, segments: [{ startMs: 6700, endMs: 9460, final: true }], bar: { startMs: 6700, endMs: 9460 } },
        ],
      } }, '*');
    });
    await sleep(3600);
    await page.keyboard.press('t');           // lens down
    await sleep(200);
    await page.keyboard.press('f');           // the map's own fit back
    await sleep(500);
    await page.keyboard.press('p');           // audit · capability hulls
    await sleep(3600);
    await page.keyboard.press('p');           // hulls down
    await sleep(300);
    await page.keyboard.press('d');           // dataflow · the data story
    await sleep(3600);
    await page.keyboard.press('d');           // back to the map
    await sleep(1600);
  } else {
    throw new Error(`unknown tour "${MODE}" — media | lens`);
  }

  const video = page.video();
  await ctx.close();
  const out = path.join(OUT, `${MODE}-tour.webm`);
  await video.saveAs(out);
  await browser.close();
  console.log('saved', out);
})().catch((e) => { console.error(e); process.exit(1); });
