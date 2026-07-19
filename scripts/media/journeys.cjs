#!/usr/bin/env node
// journeys.cjs — the interaction-cost suite (W-COMPREHEND S3).
//
// The census counted the gestures each common journey costs; this
// suite makes those counts EXECUTABLE — real Playwright gestures
// against the harness, each journey asserting its budget. A future
// change that silently adds a gesture to a journey fails here.
//
// Run: NIKA_PLAYWRIGHT=<path> node scripts/media/journeys.cjs
// (headed — trusted gestures; playwright stays out of the manifest,
// installed --no-save when judging. Not wired to CI by design.)

const path = require('path');
const { chromium } = require(process.env.NIKA_PLAYWRIGHT || 'playwright');

const results = [];
function report(name, budget, used, ok, note = '') {
  results.push({ name, budget, used, ok });
  console.log(`${ok ? '✓' : '✗'} ${name} — ${used}/${budget} gestures${note ? ` · ${note}` : ''}`);
}

(async () => {
  const b = await chromium.launch({ headless: false });
  const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
  await p.goto('file://' + path.join(process.cwd(), 'scripts/media/harness.html?still'));
  await p.waitForSelector('.dag-node .nc', { timeout: 8000 });
  await p.waitForTimeout(1400);

  const center = (id) => p.evaluate((tid) => {
    const el = [...document.querySelectorAll('.dag-node')].find((e) => e.getAttribute('data-id') === tid);
    const r = el.getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  }, id);

  // J1 · « why did this task fail? » — 1 gesture (hover reads the story)
  {
    await p.evaluate(() => {
      window.postMessage({ kind: 'dag:batchUpdateStatus', updates: [
        { taskId: 'digest', status: 'failed', failPreview: 'NIKA-INFER-003 · provider refused' },
      ] }, '*');
    });
    await p.waitForTimeout(300);
    const t = await center('digest');
    await p.mouse.move(t.cx, t.cy); // gesture 1
    await p.waitForTimeout(700);
    const story = await p.evaluate(() => document.querySelector('#hover-card')?.textContent ?? '');
    report('J1 why-failed', 1, 1, story.includes('NIKA-INFER-003') || (await p.evaluate(() =>
      [...document.querySelectorAll('.dag-node')].find((e) => e.getAttribute('data-id') === 'digest')
        ?.querySelector('.nc-body')?.textContent ?? '')).includes('NIKA-INFER-003'));
    await p.keyboard.press('Escape');
    await p.evaluate(() => {
      window.postMessage({ kind: 'dag:batchUpdateStatus', updates: [{ taskId: 'digest', status: 'pending' }] }, '*');
    });
    await p.waitForTimeout(300);
  }

  // J2 · « what feeds this task? » — 1 gesture (click = lineage + io row lit)
  {
    const t = await center('notes');
    await p.mouse.click(t.cx, t.cy); // gesture 1
    await p.waitForTimeout(400);
    const dimmed = await p.evaluate(() => document.querySelectorAll('.dag-node.dimmed').length);
    report('J2 what-feeds', 1, 1, dimmed > 0, `${dimmed} dimmed = lineage lit`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
  }

  // J3 · « peek the run story, then the next task's » — 2 gestures for TWO stories
  {
    const t = await center('digest');
    await p.mouse.click(t.cx, t.cy); // gesture 1 (focus)
    await p.waitForTimeout(250);
    await p.keyboard.press(' '); // gesture 2 (pin)
    await p.waitForTimeout(350);
    const first = await p.evaluate(() => document.querySelector('#hover-card .hc-id')?.textContent);
    await p.keyboard.press('ArrowRight'); // gesture 3 → SECOND story free
    await p.waitForTimeout(350);
    const second = await p.evaluate(() => document.querySelector('#hover-card .hc-id')?.textContent);
    report('J3 peek-walk', 3, 3, first === 'digest' && second !== null && second !== 'digest',
      `${first} → ${second}`);
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
  }

  // J4 · « what breaks if the writer fails? » — 2 gestures (click + X)
  {
    const t = await center('notes');
    await p.mouse.click(t.cx, t.cy); // 1
    await p.waitForTimeout(250);
    await p.keyboard.press('x'); // 2
    await p.waitForTimeout(400);
    const lit = await p.evaluate(() => [...document.querySelectorAll('.dag-node.sim-lit')].map((n) => n.getAttribute('data-id')));
    report('J4 what-if', 2, 2, lit.includes('review'), `lit: ${lit.join(',')}`);
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
  }

  // J5 · « where did the time go? » — 1 gesture (T · toolbar carries the key)
  {
    await p.keyboard.press('t'); // 1
    await p.waitForTimeout(400);
    const on = await p.evaluate(() => document.body.classList.contains('timeline'));
    report('J5 timeline', 1, 1, on);
    await p.keyboard.press('t');
    await p.waitForTimeout(300);
  }

  // J6 · « what can this file DO? » — 1 gesture (P)
  {
    await p.keyboard.press('p'); // 1
    await p.waitForTimeout(500);
    const banner = await p.evaluate(() => document.getElementById('audit-banner')?.textContent ?? '');
    report('J6 audit', 1, 1, banner.includes('this file can'));
    await p.keyboard.press('p');
  }

  // J7 · « any action on this task » — 2 gestures, constant cost
  // (Raycast math: focus + K reaches EVERY action, however many).
  {
    // Setup, not journey: J5's timeline fit moved the camera — the
    // journey starts from a rested canvas (F = fit, uncounted).
    await p.keyboard.press('Escape');
    await p.keyboard.press('f');
    await p.waitForTimeout(500);
    const t = await center('brief');
    await p.mouse.click(t.cx, t.cy); // 1
    await p.waitForTimeout(250);
    await p.keyboard.press('k'); // 2
    await p.waitForTimeout(300);
    const rows = await p.evaluate(() => document.querySelectorAll('#nk-actions .nk-act-row').length);
    if (rows === 0) {
      console.log('   J7 debug:', await p.evaluate(() => JSON.stringify({
        panel: Boolean(document.getElementById('nk-actions')),
        active: document.activeElement?.id ?? document.activeElement?.tagName,
        focusedDim: document.querySelectorAll('.dag-node.dimmed').length,
        body: document.body.className,
      })));
    }
    report('J7 action-panel', 2, 2, rows >= 5, `${rows} actions at constant cost`);
    await p.keyboard.press('Escape');
  }

  await b.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} journeys within budget`);
  if (failed.length > 0) { process.exit(1); }
})().catch((e) => { console.error('SUITE FAIL', e.message); process.exit(1); });
