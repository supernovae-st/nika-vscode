#!/usr/bin/env node
// measure.mjs — the V3-A proof harness (worker · cache · SWR · pan).
//
// Workers are BLOCKED on file:// pages, so this script serves the repo
// over a local node:http server and drives the media harness with
// Playwright — the SAME page the pixel judges shoot, now on the rung
// the real webview runs.
//
//   NIKA_PLAYWRIGHT=<playwright install> node scripts/perf/measure.mjs [scenario]
//
// Scenarios: cold · switch · pan · equivalence · all (default).
// cold        — n=300 worker vs ?noworker: nk:layout, nk:paint-final,
//               longtasks >100ms DURING the layout window (budget: zero
//               on the worker rung — the main thread is free).
// switch      — A(300) → B(120) → A(300): the third render must be a
//               CACHE HIT ≤300ms; then A+1 node: SWR frame ≤150ms and
//               an INTERACTIVE re-layout ≤40% of the cold layout; then
//               the LEAK gate: same structure under a different
//               workflowUri MUST miss (layoutKeyOf lives in the key).
// pan         — 3s continuous drag at n=300: rAF frame-delta p50/p95
//               (the PR-B culling baseline — pose the missing number).
// equivalence — n=40/120/300: laid JSON on the worker rung byte-equals
//               the ?noworker sync rung (maker≠checker refuter claim 1).
//
// Correctness assertions (equivalence · cache-hit · leak) exit 1 on
// failure; perf numbers are REPORTED for the PR body, not gated here.

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pw = process.env.NIKA_PLAYWRIGHT || 'playwright';
const { chromium } = await import(pw);

const scenario = process.argv[2] || 'all';
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.map': 'application/json',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const harnessUrl = (q) => `http://127.0.0.1:${port}/scripts/media/harness.html?${q}`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const failures = [];
const report = {};

async function settledPage(q, { afterSeq = 0 } = {}) {
  const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
  await page.addInitScript(() => {
    window.__nkLongtasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__nkLongtasks.push({ start: e.startTime, dur: e.duration });
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch { /* longtask unsupported → empty list, reported as such */ }
  });
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  await page.goto(harnessUrl(q));
  await page.waitForFunction((min) => {
    const l = window.__nkLayout;
    return l !== undefined && l.seq > min;
  }, afterSeq, { timeout: 120_000 });
  return page;
}

/** nk:* measures + longtasks overlapping the LAYOUT window. */
async function readPerf(page) {
  return page.evaluate(() => {
    const last = (name) => {
      const all = performance.getEntriesByName(name, 'measure');
      return all.length > 0 ? all[all.length - 1] : undefined;
    };
    const layout = last('nk:layout');
    const paint = last('nk:paint-final');
    const swr = last('nk:swr-frame');
    const win = layout ? [layout.startTime, layout.startTime + layout.duration] : [0, 0];
    const longtasks = (window.__nkLongtasks ?? []).filter((t) => t.dur > 100);
    // Layout-CAUSED tasks start inside the window. A page-boot task
    // (dag.js eval, ~57ms in, pre-render — identical before this PR)
    // can bleed over the window's opening edge on a cold profile; it
    // rides longtasksOver100 for the record, never the budget.
    const duringLayout = longtasks.filter((t) => t.start >= win[0] && t.start < win[1]);
    const l = window.__nkLayout;
    return {
      layoutMs: layout ? +layout.duration.toFixed(1) : null,
      elkMs: +l.elkMs.toFixed(1),
      paintFinalMs: paint ? +paint.duration.toFixed(1) : null,
      swrFrameMs: swr ? +swr.duration.toFixed(1) : null,
      longtasksOver100: longtasks.map((t) => +t.dur.toFixed(0)),
      longtasksDuringLayout: duringLayout.map((t) => +t.dur.toFixed(0)),
      rung: l.rung, cacheHit: l.cacheHit, swr: l.swr, seq: l.seq, hash: l.hash,
    };
  });
}

/** Post a dag:load built page-side (perfGraph is a harness global) from a
 *  STRUCTURED spec — no code strings cross the boundary. */
async function loadAndSettle(page, spec) {
  const before = await page.evaluate(() => window.__nkLayout.seq);
  await page.evaluate((s) => {
    const g = perfGraph(s.n);
    if (s.addTail) {
      const id = `t-tail-${s.addTail}`;
      g.nodes.push({ id, label: id, verb: 'exec', status: 'pending', producers: ['t0'] });
      g.edges.push({ id: `t0->${id}`, source: 't0', target: id, kind: 'value', isDataEdge: true, label: 'tail' });
    }
    if (s.uri) { g.workflowUri = s.uri; g.workflowName = s.name ?? g.workflowName; }
    window.postMessage({ kind: 'dag:load', graph: g }, '*');
  }, spec);
  await page.waitForFunction((min) => window.__nkLayout.seq > min, before, { timeout: 120_000 });
  return readPerf(page);
}

// ─── cold ───────────────────────────────────────────────────────────────────
if (scenario === 'all' || scenario === 'cold') {
  for (const mode of ['worker', 'noworker']) {
    const q = mode === 'worker' ? 'n=300' : 'n=300&noworker';
    const page = await settledPage(q);
    const perf = await readPerf(page);
    report[`cold-${mode}`] = perf;
    if (mode === 'worker' && perf.rung !== 'worker') {
      failures.push(`cold-worker: expected rung 'worker' over http, got '${perf.rung}'`);
    }
    if (mode === 'worker' && perf.longtasksDuringLayout.length > 0) {
      failures.push(`cold-worker: ${perf.longtasksDuringLayout.length} longtask(s) >100ms DURING layout (${perf.longtasksDuringLayout.join(',')}ms) — the worker did not free the main thread`);
    }
    await page.close();
  }
}

// ─── switch (cache hit · SWR · leak) ────────────────────────────────────────
if (scenario === 'all' || scenario === 'switch') {
  const page = await settledPage('n=300');
  const coldA = await readPerf(page);
  const b = await loadAndSettle(page, { n: 120 });
  const hitA = await loadAndSettle(page, { n: 300 });
  report['switch'] = { coldA, b: { layoutMs: b.layoutMs, cacheHit: b.cacheHit }, hitA };
  if (hitA.cacheHit !== true) { failures.push('switch: A→B→A third render was NOT a cache hit'); }
  if (hitA.paintFinalMs !== null && hitA.paintFinalMs > 300) {
    failures.push(`switch: cache-hit paint ${hitA.paintFinalMs}ms > 300ms budget`);
  }
  // SWR — same workflow, a node added: provisional frame + INTERACTIVE.
  // Three mutations, median layout (single runs wobble ±15% on Chrome
  // scheduling; the budget compares two noisy clocks).
  const swrRuns = [];
  for (const tail of ['a', 'b', 'c']) {
    swrRuns.push(await loadAndSettle(page, { n: 300, addTail: tail }));
  }
  const mid = [...swrRuns].sort((x, y) => (x.elkMs ?? 0) - (y.elkMs ?? 0))[1];
  report['swr'] = { median: mid, runs: swrRuns.map((r) => ({ elkMs: r.elkMs, layoutMs: r.layoutMs, swrFrameMs: r.swrFrameMs, swr: r.swr })) };
  if (swrRuns.some((r) => r.swr !== true)) { failures.push('swr: a provisional frame did not paint (swr=false)'); }
  if (mid.swrFrameMs !== null && mid.swrFrameMs > 150) {
    failures.push(`swr: frame 0 at ${mid.swrFrameMs}ms > 150ms budget`);
  }
  // ELK-vs-ELK on the engine's own clock: the main-thread WAIT absorbs
  // the browser painting the provisional frame (the feature itself) and
  // must not masquerade as re-layout cost (layoutMs reported alongside).
  if (mid.elkMs > coldA.elkMs * 0.4) {
    failures.push(`swr: INTERACTIVE re-layout median ${mid.elkMs}ms (engine clock) > 40% of cold ${coldA.elkMs}ms`);
  }
  // LEAK — same structure, different workflowUri: MUST miss.
  const leak = await loadAndSettle(page, { n: 300, uri: 'file:///work/perf-leak.nika.yaml', name: 'perf-leak' });
  report['leak'] = { cacheHit: leak.cacheHit, hash: leak.hash };
  if (leak.cacheHit === true) {
    failures.push('LEAK: a different workflowUri with identical structure HIT the cache — layoutKeyOf must scope the key');
  }
  if (leak.hash === hitA.hash) {
    failures.push('LEAK: hashes collide across workflows with identical structure');
  }
  await page.close();
}

// ─── pan (the PR-B baseline) ────────────────────────────────────────────────
if (scenario === 'all' || scenario === 'pan') {
  const page = await settledPage('n=300&still');
  await page.evaluate(() => {
    window.__nkFrames = [];
    window.__nkStopFrames = false;
    let last = performance.now();
    const loop = (t) => {
      window.__nkFrames.push(t - last); last = t;
      if (!window.__nkStopFrames) { requestAnimationFrame(loop); }
    };
    requestAnimationFrame(loop);
  });
  await page.mouse.move(680, 430);
  await page.mouse.down();
  const t0 = Date.now();
  let phase = 0;
  while (Date.now() - t0 < 3000) {
    const dx = Math.sin(phase / 8) * 240;
    const dy = Math.cos(phase / 11) * 160;
    await page.mouse.move(680 + dx, 430 + dy);
    phase++;
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  const frames = await page.evaluate(() => {
    window.__nkStopFrames = true;
    return window.__nkFrames.slice(5); // drop the warmup frames
  });
  const sorted = [...frames].sort((a, b) => a - b);
  const pct = (p) => +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(1);
  report['pan'] = { frames: frames.length, p50: pct(0.5), p95: pct(0.95), max: pct(1) };
  await page.close();
}

// ─── equivalence (refuter claim 1: worker ≡ sync) ──────────────────────────
if (scenario === 'all' || scenario === 'equivalence') {
  for (const n of [40, 120, 300]) {
    const laidOf = async (q) => {
      const page = await settledPage(q);
      const out = await page.evaluate(() => ({
        rung: window.__nkLayout.rung,
        json: JSON.stringify(window.__nkLayout.laid),
      }));
      await page.close();
      return out;
    };
    const w = await laidOf(`n=${n}`);
    const s = await laidOf(`n=${n}&noworker`);
    const equal = w.json === s.json;
    report[`equivalence-n${n}`] = {
      workerRung: w.rung, syncRung: s.rung, bytes: w.json.length, byteEqual: equal,
    };
    if (w.rung !== 'worker') { failures.push(`equivalence n=${n}: worker page ran rung '${w.rung}'`); }
    if (s.rung !== 'sync') { failures.push(`equivalence n=${n}: noworker page ran rung '${s.rung}'`); }
    if (!equal) { failures.push(`equivalence n=${n}: worker laid JSON ≠ sync laid JSON`); }
  }
}

await browser.close();
server.close();

console.log('\n═══ V3-A measure report ═══');
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) {
  console.log('\n✗ FAILURES:');
  for (const f of failures) { console.log(`  ✗ ${f}`); }
  process.exit(1);
}
console.log('\n✓ correctness assertions hold (perf numbers above ride the PR body)');
