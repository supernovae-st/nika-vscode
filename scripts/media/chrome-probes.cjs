#!/usr/bin/env node
// chrome-probes.cjs — the canvas CHROME proof suite (sister to a11y-probes).
//
// a11y-probes asks whether the canvas SPEAKS. This asks whether it FITS:
// five lenses swept across every skin, panel width and OS preference,
// each reporting instances so a fix can be structural instead of
// anecdotal.
//
//   CLIP      text truncated with no ellipsis affordance (inputs included —
//             a placeholder never grows scrollWidth, so its glyph run is
//             measured against the content box the browser paints into)
//   TARGET    interactive target under the WCAG 2.2 2.5.8 24x24 minimum
//   CONTRAST  text under the 4.5:1 AA floor (3:1 for >=18.66px bold / 24px),
//             alpha composited over its real backdrop first
//   SPILL     chrome painting outside the viewport
//   OCCLUDED  a card whose own title is painted over by another card
//             (the one lens that looks INSIDE the svg: the question is who
//             paints last, not layout geometry)
//   MOTION    (under MOTION=reduce only) a keyframe animation still
//             running, or a transition on a layout/transform property,
//             i.e. an effect that never got its reduced-motion opt-out
//
// It exists because four defects shipped invisible to `npm test`: a
// command-bar placeholder that lost four fifths of its lesson mid-word, a
// dim ink whose comment claimed an AA floor it measured 3.85:1 against,
// and a toolbar that spilled its run status and its own overflow door off
// screen across a 240px band of ordinary panel widths, and a press
// animation that kept moving under prefers-reduced-motion.
//
// Run: NIKA_PLAYWRIGHT=<path> node scripts/media/chrome-probes.cjs
//      SKINS=nika,editor,phosphor SIZES=520x760,1000x700,1440x900
//      SCENE=empty          drive a harness scene (empty · media · celebrate)
//      FORCED=1             OS High Contrast
//      MOTION=reduce        prefers-reduced-motion (arms the MOTION lens)
//      RUN=running|failed   drive the live run chrome (the sim only ends green)
// Headed, like its sister; playwright stays out of the manifest. Not
// wired to CI by design — the judge runs it, the belt stays fast.
const path = require('path');
const { chromium } = require(process.env.NIKA_PLAYWRIGHT || 'playwright');

const SKINS = (process.env.SKINS || 'nika,editor,phosphor').split(',');
const SIZES = (process.env.SIZES || '1440x900').split(',').map((s) => {
  const [w, h] = s.split('x').map(Number); return { width: w, height: h };
});
// SCENE joins the harness query (empty · media · celebrate · n=300); FORCED
// and MOTION drive the two OS-level preferences a panel must survive.
const SCENE = process.env.SCENE || '';
const FORCED = process.env.FORCED === '1';
const MOTION = process.env.MOTION === 'reduce' ? 'reduce' : 'no-preference';
// RUN drives the live run chrome: 'running' mid-flight, 'failed' at the red close.
const RUN = process.env.RUN === 'running' || process.env.RUN === 'failed' ? process.env.RUN : '';

const PROBE = () => {
  const out = { clip: [], target: [], contrast: [], spill: [], motion: [], occluded: [] };
  const vw = innerWidth, vh = innerHeight;

  const sel = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + id + cls;
  };
  // rgb()/rgba() carry 0-255; color(srgb r g b / a) carries 0-1. Reading the
  // second as the first is how a healthy 0.78-alpha token reads as ratio 1.
  const parse = (c) => {
    if (!c) return null;
    const m = c.match(/[-\d.]+(?:e[-+]?\d+)?/gi); if (!m) return null;
    const nums = m.map(Number);
    const srgb = /^color\(\s*srgb/i.test(c);
    const [r, g, b] = srgb ? nums.slice(0, 3).map((v) => v * 255) : nums.slice(0, 3);
    const a = nums.length > 3 ? nums[3] : 1;
    return { r, g, b, a };
  };
  const lumOf = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  // Alpha text composites over its backdrop before it is judged.
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const p = parse(getComputedStyle(n).backgroundColor);
      if (p && p.a > 0.85) return p;
      n = n.parentElement;
    }
    return parse(getComputedStyle(document.body).backgroundColor) || { r: 13, g: 13, b: 14, a: 1 };
  };

  // 6 · OCCLUDED — a card whose own TITLE is painted over by another card.
  // This one deliberately looks INSIDE the svg the other lenses skip: the
  // question is not layout geometry but who paints last. An expanded card
  // (the failure state grows one) can grow across a neighbour and swallow
  // the name that says which task the neighbour is.
  for (const g of document.querySelectorAll('#dag-container .dag-node')) {
    const title = g.querySelector('.nc-title, .nc-head, text');
    if (!title) continue;
    const tr = title.getBoundingClientRect();
    if (!(tr.width > 4 && tr.height > 4)) continue;
    // Sample the title's leading edge, where the name actually starts.
    const x = tr.left + Math.min(8, tr.width / 3), y = tr.top + tr.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
    const top = document.elementFromPoint(x, y);
    if (!top || g === top || g.contains(top) || top.contains(g)) continue;
    const other = top.closest ? top.closest('.dag-node') : null;
    if (!other || other === g) continue;
    // The design has an answer for this and says so in dag.css: "a card
    // grown past its laid-out box floats OVER its neighbors (the pinned
    // peek · a mid-run failure promote) — elevation says so". A cover that
    // wears nk-overgrown or nk-peek is DECLARED layering with a shadow to
    // prove it, so it is not a finding. What would be one is a card
    // covering a neighbour's name while claiming no elevation at all.
    if (other.classList.contains('nk-overgrown') || other.classList.contains('nk-peek')) continue;
    out.occluded.push({
      sel: 'card:' + (title.textContent || '').trim().slice(0, 18),
      coveredBy: 'card:' + (other.querySelector('.nc-title, .nc-head, text')?.textContent || '?')
        .trim().slice(0, 18),
      at: [Math.round(x), Math.round(y)],
    });
  }

  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // Only the chrome: the SVG canvas is transform-scaled, its geometry is layout-free.
    if (el.closest('#dag-container svg')) continue;
    // Visually-hidden live regions (#a11y-status · #a11y-alert) are a 1x1
    // box that text is SUPPOSED to overflow — a screen reader reads it, an
    // eye never sees it. Judging them as clipped is the lens misreading the
    // idiom, and it only shows once a run posts an announcement, so the
    // still scenes never surfaced it.
    if (cs.clipPath === 'inset(50%)' || /rect\(1px/.test(cs.clip || '')) continue;

    // 1 · CLIP — overflowing inline text with no ellipsis and no scrollbar
    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const isInput = el.tagName === 'INPUT';
    if ((hasOwnText || isInput) && el.scrollWidth > el.clientWidth + 1) {
      const ov = cs.textOverflow, ox = cs.overflowX;
      if (ov !== 'ellipsis' && ox !== 'auto' && ox !== 'scroll') {
        out.clip.push({
          sel: sel(el), text: (el.value || el.placeholder || el.textContent || '').trim().slice(0, 60),
          scroll: el.scrollWidth, client: el.clientWidth, textOverflow: ov, overflowX: ox,
        });
      }
    }

    // 1b · CLIP for inputs — a placeholder never grows scrollWidth, so measure
    // the glyph run against the content box the way the browser paints it.
    if (isInput && el.placeholder) {
      const c2 = document.createElement('canvas').getContext('2d');
      c2.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const w = c2.measureText(el.placeholder).width;
      const inner = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (w > inner + 2) {
        out.clip.push({
          sel: sel(el), text: el.placeholder.slice(0, 60), scroll: Math.round(w),
          client: Math.round(inner), textOverflow: cs.textOverflow, overflowX: cs.overflowX,
          kind: 'placeholder',
        });
      }
    }

    // 2 · TARGET — WCAG 2.2 2.5.8 (24x24 CSS px minimum for pointer targets)
    const clickable = el.matches('button,[role="button"],a[href],[role="menuitem"],[role="option"],input[type="submit"]');
    if (clickable && (r.width < 24 || r.height < 24)) {
      out.target.push({ sel: sel(el), w: +r.width.toFixed(1), h: +r.height.toFixed(1), text: (el.textContent || '').trim().slice(0, 30) });
    }

    // 3 · CONTRAST — own-text elements only
    if (hasOwnText) {
      const fg = parse(cs.color), bg = bgOf(el);
      if (fg && bg && fg.a >= 0.05) {
        const L1 = lumOf(over(fg, bg)), L2 = lumOf(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const px = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        const floor = (px >= 24 || (bold && px >= 18.66)) ? 3 : 4.5;
        if (ratio < floor) {
          out.contrast.push({
            sel: sel(el), text: (el.textContent || '').trim().slice(0, 40),
            ratio: +ratio.toFixed(2), floor, px: +px.toFixed(1), color: cs.color,
          });
        }
      }
    }

    // 4 · SPILL — chrome painting off-viewport
    if (el.matches('#dag-toolbar *, #omnibar *, #plan-rail *, #minimap *, #activity *')) {
      if (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1) {
        out.spill.push({ sel: sel(el), left: +r.left.toFixed(0), right: +r.right.toFixed(0), vw });
      }
    }

    // 5 · MOTION — only meaningful under prefers-reduced-motion: reduce.
    // The charter (spn-nika-canvas law 7) says reduce swaps motion for
    // OPACITY, never for nothing: a keyframe animation still running, or a
    // transition on a layout/transform property, is an un-opted-out effect.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const dur = (s) => Math.max(0, ...String(s).split(',').map((v) => parseFloat(v) || 0));
      if (cs.animationName !== 'none' && dur(cs.animationDuration) > 0) {
        out.motion.push({ sel: sel(el), kind: 'animation', name: cs.animationName.split(',')[0], dur: cs.animationDuration });
      }
      const props = String(cs.transitionProperty).split(',').map((s) => s.trim());
      const moving = props.filter((p) => /^(transform|left|top|right|bottom|width|height|margin|inset)/.test(p));
      if (moving.length && dur(cs.transitionDuration) > 0) {
        out.motion.push({ sel: sel(el), kind: 'transition', props: moving.join('+'), dur: cs.transitionDuration });
      }
    }
  }
  const uniq = (a, k) => { const s = new Set(); return a.filter((x) => !s.has(x[k]) && s.add(x[k])); };
  out.clip = uniq(out.clip, 'sel'); out.target = uniq(out.target, 'sel');
  out.contrast = uniq(out.contrast, 'sel'); out.spill = uniq(out.spill, 'sel');
  out.motion = uniq(out.motion, 'sel'); out.occluded = uniq(out.occluded, 'sel');
  return out;
};

(async () => {
  const b = await chromium.launch({ headless: false, channel: 'chrome' });
  for (const skin of SKINS) for (const vp of SIZES) {
    const p = await b.newPage({
      viewport: vp,
      forcedColors: FORCED ? 'active' : 'none',
      reducedMotion: MOTION,
    });
    let qs = '?still' + (skin === 'nika' ? '' : `&skin=${skin}`);
    if (SCENE) { qs += '&' + SCENE; }
    await p.goto('file://' + path.join(process.cwd(), 'scripts/media/harness.html' + qs));
    await p.waitForTimeout(2400);
    // RUN=running|failed drives the live chrome the still scenes never show.
    // The harness sim only ever ends green, so the red path is POSTED the
    // way the extension posts it (the shapes a11y-probes drives).
    if (RUN) {
      const post = (m) => p.evaluate((msg) => window.postMessage(msg, '*'), m);
      await post({ kind: 'run:state', running: true });
      await post({ kind: 'dag:batchUpdateStatus', updates: [
        { taskId: 'history', status: 'success', durationMs: 900 },
        { taskId: 'digest', status: 'running' },
        { taskId: 'chart', status: 'running' }] });
      if (RUN === 'failed') {
        await post({ kind: 'dag:batchUpdateStatus', updates: [{
          taskId: 'digest', status: 'failed',
          failPreview: 'NIKA-INFER-003 · provider refused the request' }] });
        await post({ kind: 'run:state', running: false });
        await post({ kind: 'run:verdict', icon: '✗', cls: 'st-failed',
          text: 'run failed · 1 ✗ · ≥ $0.0104 · 8.3s · chain 3c92f1de' });
      }
      await p.waitForTimeout(900);
    }
    const r = await p.evaluate(PROBE);
    const tag = [SCENE, RUN, FORCED ? 'forced-colors' : '', MOTION === 'reduce' ? 'reduced-motion' : '']
      .filter(Boolean).join(' · ');
    console.log(`\n===== ${skin.toUpperCase()} @ ${vp.width}x${vp.height}${tag ? ' · ' + tag : ''} =====`);
    for (const lens of ['clip', 'target', 'contrast', 'spill', 'motion', 'occluded']) {
      const rows = r[lens];
      console.log(`-- ${lens} (${rows.length})`);
      rows.slice(0, 14).forEach((x) => console.log('   ', JSON.stringify(x)));
    }
    await p.close();
  }
  await b.close();
})();
