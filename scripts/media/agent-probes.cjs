// The agent readout on the real bundled webview. Scripted engine-shaped
// messages prove presentation only: no workflow, provider or spend is run.
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.NIKA_PLAYWRIGHT || 'playwright');

(async () => {
  const artifacts = mkdtempSync(join(tmpdir(), 'nika-agent-probes-'));
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  let cases = 0;
  try {
    for (const skin of ['nika', 'editor', 'phosphor', 'light']) {
      for (const mode of ['normal', 'reduced', 'forced']) {
        const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference', forcedColors: mode === 'forced' ? 'active' : 'none' });
        try {
          const url = pathToFileURL(resolve('scripts/media/harness.html'));
          url.search = `?still&grand${skin === 'nika' ? '' : skin === 'light' ? '&light' : `&skin=${skin}`}`;
          await page.goto(url.href);
          const node = page.locator('.dag-node[data-id="review"]');
          await node.waitFor({ state: 'visible' });
          const post = (data) => page.evaluate((value) => window.postMessage(value, '*'), data);
          const update = (turns, totalTokens, budget, status = 'running') => post({ kind: 'dag:batchUpdateStatus', updates: [{ taskId: 'review', status, agent: { turns, offered: 4, universe: 12, budget: { totalTokens, ...(budget === undefined ? {} : { budget }) } } }] });
          await post({ kind: 'run:state', running: true });
          await update(1, 25, 100);
          const meter = node.getByRole('meter', { name: 'Recorded agent token usage' });
          await meter.waitFor({ state: 'attached' });
          assert.equal(await meter.getAttribute('aria-valuenow'), '25');
          assert.equal(await meter.getAttribute('aria-valuetext'), '25 of 100 tokens used');
          await post({ kind: 'dag:focus', taskId: 'review' });
          // A 99% threshold is still an in-flight camera animation. Observe
          // the final transform before asserting the exact native scale.
          await page.waitForFunction(() => document.querySelector('[data-id="review"]')?.getCTM()?.a === 1);
          assert.equal(await node.evaluate((element) => element.getCTM().a), 1, 'focus should make the card readable at native size when it fits');
          await update(2, 50, 100);
          await node.locator('.nk-loop-update').waitFor({ state: 'attached' });
          const motion = await node.locator('.nc-agent-band').evaluate((band) => {
            const css = getComputedStyle(band, '::after');
            return { name: css.animationName, count: css.animationIterationCount, display: css.display, opacity: getComputedStyle(band).opacity };
          });
          assert.equal(motion.opacity, '1', 'the effect must not dim readable text');
          if (mode === 'normal') {
            assert.equal(motion.name, 'nk-loop-update');
            assert.equal(motion.count, '1');
          } else { assert.ok(motion.name === 'none' || motion.display === 'none', 'motion opt-out must suppress the effect'); }
          await update(2, 75, 100);
          await page.waitForFunction(() => document.querySelector('[data-id="review"] [role="meter"]')?.getAttribute('aria-valuenow') === '75');
          assert.equal(await node.locator('.nk-loop-update').count(), 0, 'same turn must not replay the effect');
          await update(3, 125, 100, 'paused');
          await page.waitForFunction(() => document.querySelector('[data-id="review"] [role="meter"]')?.getAttribute('aria-valuenow') === '100');
          assert.equal(await meter.getAttribute('aria-valuetext'), '125 of 100 tokens used');
          assert.equal(await node.locator('.nk-loop-update').count(), 0, 'paused state is not working');
          await update(3, 0, 0, 'paused');
          await node.locator('.nc-ab-tk').waitFor({ state: 'attached' });
          assert.equal(await meter.count(), 0, 'zero budget has no defined ratio');
          assert.ok((await node.locator('.nc-ab-tk').getAttribute('title')).includes('declared budget is zero'));
          await update(3, 75, undefined, 'paused');
          await page.waitForFunction(() => document.querySelector('[data-id="review"] .nc-ab-tk')?.textContent === '75 tk');
          assert.equal(await meter.count(), 0, 'unknown budget must not borrow a previous denominator');
          await page.screenshot({ path: join(artifacts, `${skin}-${mode}.png`) });
          cases++;
          console.log(`agent-probes: ${skin}/${mode} passed`);
        } finally { await page.close(); }
      }
    }
    const short = await browser.newPage({ viewport: { width: 620, height: 300 }, reducedMotion: 'reduce' });
    try {
      const url = pathToFileURL(resolve('scripts/media/harness.html'));
      url.search = '?still&grand';
      await short.goto(url.href);
      const card = short.locator('.dag-node[data-id="review"]');
      await card.waitFor({ state: 'visible' });
      await short.evaluate(() => window.postMessage({ kind: 'dag:focus', taskId: 'review' }, '*'));
      await short.waitForFunction(() => document.querySelector('[data-id="review"]')?.classList.contains('selected'));
      const rect = await card.evaluate((element) => {
        const { top, bottom } = element.getBoundingClientRect();
        return { top, bottom };
      });
      assert.ok(rect.top >= 54 && rect.bottom <= 204, `focused card must fit between chrome insets: ${JSON.stringify(rect)}`);
      await short.screenshot({ path: join(artifacts, 'short-focus.png') });
      cases++;
      console.log('agent-probes: short panel focus passed');
    } finally { await short.close(); }
  } finally { await browser.close(); }
  assert.equal(cases, 13, 'every skin, motion mode and short-panel focus must run');
  console.log(`agent-probes: ${cases} cases passed; screenshots ${artifacts}`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
