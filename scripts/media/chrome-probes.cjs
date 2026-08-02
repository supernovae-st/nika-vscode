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
//      SHAPE=1              re-label with long / CJK / RTL / diacritic / 1-char ids
// Headed, like its sister; playwright stays out of the manifest. Not
// wired to CI by design — the judge runs it, the belt stays fast.
const path = require('path');
const { chromium } = require(process.env.NIKA_PLAYWRIGHT || 'playwright');

// `light` = the editor skin on a LIGHT host (the harness stamps VS
// Code Light+'s own --vscode-* · before v21 no light pixel was ever
// probed: the harness had no theme vars and « editor » fell back dark).
const SKINS = (process.env.SKINS || 'nika,editor,phosphor,light').split(',');
// A VS Code webview rarely gets the whole window. It lives in an editor
// group: half a split, a third beside a terminal, a narrow tall pane.
// The ladder judges the three registers that actually ship — full, a
// 50/50 split, and a narrow column. For eleven waves this read
// 1440x900 alone, so every proof in this arc was rendered at the one
// width users least often have.
const SIZES = (process.env.SIZES || '1440x900,860x720,620x820').split(',').map((s) => {
  const [w, h] = s.split('x').map(Number); return { width: w, height: h };
});
// SCENE joins the harness query (empty · media · celebrate · n=300); FORCED
// and MOTION drive the two OS-level preferences a panel must survive.
const SCENE = process.env.SCENE || '';
const FORCED = process.env.FORCED === '1';
const MOTION = process.env.MOTION === 'reduce' ? 'reduce' : 'no-preference';
// RUN drives the live run chrome: 'running' mid-flight, 'failed' at the red close.
const RUN = ['running', 'failed', 'refused'].includes(process.env.RUN ?? '') ? process.env.RUN : '';
// SHAPE=1 re-labels the fixture with pathological task names before probing.
// The metric ladder was tuned on short English ids; these are the shapes a
// real corpus brings. The card title renders the ID, so ids and every edge
// naming them are renamed together or the graph loses its wires.
const SHAPE = process.env.SHAPE === '1';
const SHAPE_NAMES = [
  'a-task-name-that-simply-refuses-to-end-and-keeps-going-well-past-any-card',
  '\u6458\u8981\u751f\u6210\u4e0e\u8d28\u91cf\u6821\u9a8c\u4efb\u52a1',
  '\u0645\u0647\u0645\u0629-\u0627\u0644\u062a\u062d\u0642\u0642-\u0645\u0646-\u0627\u0644\u062c\u0648\u062f\u0629',
  '\u00c4\u00d6\u00dc\u00df\u00e9\u00e0\u00e7\u00f1-diacritics-everywhere',
  'x',
];

const PROBE = () => {
  const out = { clip: [], target: [], contrast: [], spill: [], motion: [], occluded: [], glyph: [], collide: [], truncated: [] };
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

    // 3 · CONTRAST — own-text elements only.
    // The ink is the color TIMES the cumulative opacity: an element
    // dimmed with `opacity:` used to measure at full strength and
    // could never fail (the flat keycap sat at 3.08:1 and this lens
    // said green · v21). Ancestors count — opacity multiplies down.
    if (hasOwnText) {
      const fg0 = parse(cs.color), bg = bgOf(el);
      let op = 1;
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        op *= Number(getComputedStyle(n).opacity || 1);
      }
      const fg = fg0 ? { ...fg0, a: fg0.a * op } : null;
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
            ...(op < 0.999 ? { opacity: +op.toFixed(2) } : {}),
          });
        }
      }
    }

    // 4 · SPILL — chrome painting off-viewport.
    // A row inside a SCROLLABLE ancestor is off-viewport because it is
    // scrolled, not because the layout broke: at 300 nodes the plan rail
    // holds 24 rows in a 418px scroll box that itself sits 140→560 inside
    // a 700px viewport, and five rows report past the bottom purely from
    // scrollTop. Ask the container before blaming the child.
    if (el.matches('#dag-toolbar *, #omnibar *, #plan-rail *, #minimap *, #activity *')) {
      let scrolled = false;
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const ov = getComputedStyle(n).overflowY;
        if ((ov === 'auto' || ov === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
          scrolled = true; break;
        }
      }
      if (!scrolled && (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1)) {
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

  // ── TRUNCATED IDENTIFIERS ─────────────────────────────────────────────
  // A name the operator TYPES must render whole. The binding alias is
  // the token in `${{ tasks.X.commits }}`; a wave label, a chip fact and
  // a legend word are read the same way. They shared a row with context
  // that can be read elsewhere, and flex shrank both IN PROPORTION TO
  // THEIR OWN LENGTH — so the short, load-bearing one died first:
  // measured, `commits` got 13px of the 47 it needed and rendered « c… »
  // while the producer beside it kept 27 characters.
  //
  // The measurement only works in ONE coordinate space: the card lives
  // in a zoomed foreignObject, so getBoundingClientRect is screen px
  // while measureText is CSS px, and every element reads truncated by
  // exactly the zoom factor. offsetWidth/rect gives the scale back
  // whatever ancestor applies it. `scrollWidth > clientWidth` is NOT a
  // substitute: it reported « fits » on a box the screen showed
  // ellipsised.
  {
    const cv = document.createElement('canvas');
    const g2 = cv.getContext('2d');
    const LOAD_BEARING = '.nc-io-alias, .pr-n, .legend-chip, .nc-pol, .nc-id';
    for (const el of document.querySelectorAll(LOAD_BEARING)) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || el.offsetWidth === 0) { continue; }
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') { continue; }
      const text = (el.textContent || '').trim();
      if (text === '') { continue; }
      const zoom = r.width / el.offsetWidth;
      const cssW = r.width / (zoom || 1);
      g2.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const need = g2.measureText(text).width;
      // Half a pixel is the difference between « commits » and « commi… ».
      if (need <= cssW + 0.5) { continue; }
      // A long name CAN truncate — a 74-character task id will never fit
      // a 176px card and an ellipsis is the honest answer. What it may
      // not do is truncate SILENTLY: the full string has to stay one
      // hover (or one screen-reader stop) away.
      const full = el.getAttribute('title') ?? el.closest('[title]')?.getAttribute('title')
        ?? el.getAttribute('aria-label') ?? el.closest('[aria-label]')?.getAttribute('aria-label') ?? '';
      if (full.includes(text)) { continue; }
      out.truncated.push({
        sel: sel(el), text: text.slice(0, 28),
        has: +cssW.toFixed(1), needs: +need.toFixed(1),
        recoverable: false,
      });
    }
  }

  // ── CHROME COLLISION ──────────────────────────────────────────────────
  // Two chrome clusters may touch, never overlap. Every offset in the
  // corner stack is DERIVED from a neighbour's geometry, and for eleven
  // waves two of those derivations were hand-copied literals that
  // outlived the geometry they came from: the zoom dock painted 148x34
  // straight across the minimap, and the legend was buried 596x19 under
  // the omnibar. Neither showed at 1440 wide, which is the only width
  // anything was ever probed at.
  {
    const IDS = ['dag-toolbar', 'omnibar', 'zoom-dock', 'minimap', 'activity',
      'dag-legend', 'plan-rail', 'dag-status', 'transport', 'scrubber', 'nk-display'];
    const live = [];
    for (const id of IDS) {
      const e = document.getElementById(id);
      if (!e) { continue; }
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) { continue; }
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) { continue; }
      live.push({ id, e, r });
    }
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const A = live[i], B = live[j];
        if (A.e.contains(B.e) || B.e.contains(A.e)) { continue; }
        const ox = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
        const oy = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
        if (ox > 1 && oy > 1) {
          out.collide.push({ a: A.id, b: B.id, overlap: `${Math.round(ox)}x${Math.round(oy)}` });
        }
      }
    }
  }

  // ── GLYPH COVERAGE ────────────────────────────────────────────────────
  // A character the house font does not carry renders in whatever the OS
  // supplies: foreign metrics, foreign weight, different per machine. The
  // house shipped a braille spinner in neither face for eleven waves and
  // every gate stayed green, because no gate ever asked the font.
  // Exact test: paint the glyph in the element's own family, then in a
  // family that cannot exist. Identical pixels means the fallback drew
  // both, so the house never supplied it.
  {
    const cv = document.createElement('canvas'); cv.width = 72; cv.height = 72;
    const g2 = cv.getContext('2d', { willReadFrequently: true });
    const paint = (ch, fam) => {
      g2.clearRect(0, 0, 72, 72); g2.fillStyle = '#000';
      g2.font = '44px ' + fam; g2.fillText(ch, 5, 54);
      return g2.getImageData(0, 0, 72, 72).data.join(',');
    };
    const cache = new Map();
    const covered = (ch, fam) => {
      const k = ch + '|' + fam;
      if (!cache.has(k)) { cache.set(k, paint(ch, fam) !== paint(ch, '"__nk_no_font__"')); }
      return cache.get(k);
    };
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = new Map();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement; if (!el) { continue; }
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) { continue; }
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') { continue; }
      for (const ch of new Set(n.nodeValue)) {
        const cp = ch.codePointAt(0);
        if (cp < 128 || /\s/.test(ch)) { continue; }
        if (covered(ch, cs.fontFamily)) { continue; }
        // A SCRIPT no Latin face carries (Arabic · CJK · Devanagari) is
        // a correct fallback, not a defect: we ship two Latin faces and
        // will never vendor a mark per script. What this lens holds is
        // the SYMBOL vocabulary — the marks the house chose and must
        // therefore own. Letters and ideographs are the system's job.
        if (/\p{L}|\p{M}|\p{N}/u.test(ch)) { continue; }
        const key = ch + '|' + cs.fontFamily;
        if (!hits.has(key)) {
          hits.set(key, { glyph: ch, cp: 'U+' + cp.toString(16).toUpperCase(),
            font: cs.fontFamily.split(',')[0].replace(/"/g, ''),
            sel: sel(el) });
        }
      }
    }
    out.glyph = [...hits.values()];
  }
  return out;
};

(async () => {
  let total = 0;
  const b = await chromium.launch({ headless: process.env.HEADLESS === '1', channel: 'chrome' });
  for (const skin of SKINS) for (const vp of SIZES) {
    const p = await b.newPage({
      viewport: vp,
      forcedColors: FORCED ? 'active' : 'none',
      reducedMotion: MOTION,
    });
    let qs = '?still' + (skin === 'nika' ? '' : skin === 'light' ? '&light' : `&skin=${skin}`);
    if (SCENE) { qs += '&' + SCENE; }
    await p.goto('file://' + path.join(process.cwd(), 'scripts/media/harness.html' + qs));
    await p.waitForTimeout(2400);
    // An instrument that silently renders another width is worse than no
    // instrument: three of this wave's measurements agreed with each
    // other because all three had quietly fallen back to one viewport.
    const seen = await p.evaluate(() => `${innerWidth}x${innerHeight}`);
    if (seen !== `${vp.width}x${vp.height}`) {
      throw new Error(`viewport not applied · asked ${vp.width}x${vp.height} · page reports ${seen}`);
    }
    if (SHAPE) {
      const html = require('fs').readFileSync(
        path.join(process.cwd(), 'scripts/media/harness.html'), 'utf8');
      const st = html.indexOf('const GRAPH = {');
      const ls = html.indexOf('{', st), end = html.indexOf('\n    };', ls);
      const g = new Function('return ' + html.slice(ls, end + 6).replace(/;\s*$/, ''))();
      const map = {};
      g.nodes.forEach((n, i) => {
        if (i < SHAPE_NAMES.length) { map[n.id] = SHAPE_NAMES[i]; n.id = SHAPE_NAMES[i]; n.label = SHAPE_NAMES[i]; }
      });
      g.nodes.forEach((n) => {
        if (n.producers) { n.producers = n.producers.map((x) => map[x] || x); }
        if (n.bindingsIn) { n.bindingsIn.forEach((bd) => { bd.from = map[bd.from] || bd.from; }); }
      });
      g.edges.forEach((e) => {
        e.source = map[e.source] || e.source; e.target = map[e.target] || e.target;
        if (e.id) { e.id = `${e.source}->${e.target}`; }
      });
      await p.evaluate((gg) => window.postMessage({ kind: 'dag:load', graph: gg }, '*'), g);
      await p.waitForTimeout(2600);
    }

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
      if (RUN === 'refused') {
        // The check-refused shape (exit 2 · EMPTY journal): the exact
        // messages runLive's close handler posts — a verdict with a NIKA
        // code but NO failedTask, and zero task status updates (nothing
        // ever lit). Probes judge the banner alone carrying the story.
        await post({ kind: 'run:state', running: false });
        await post({ kind: 'dag:note', icon: '✗', cls: 'st-failed',
          text: 'check refused the run · NIKA-AUTH-006 — fix the finding, then ▶' });
        await post({ kind: 'run:verdict', icon: '✗', cls: 'st-failed',
          text: 'check refused the run · NIKA-AUTH-006 — fix the finding, then ▶',
          failedCode: 'NIKA-AUTH-006' });
      }
      await p.waitForTimeout(900);
    }
    const r = await p.evaluate(PROBE);
    const tag = [SCENE, RUN, SHAPE ? 'shape' : '', FORCED ? 'forced-colors' : '', MOTION === 'reduce' ? 'reduced-motion' : '']
      .filter(Boolean).join(' · ');
    console.log(`\n===== ${skin.toUpperCase()} @ ${vp.width}x${vp.height}${tag ? ' · ' + tag : ''} =====`);
    for (const lens of ['clip', 'target', 'contrast', 'spill', 'motion', 'occluded', 'glyph', 'collide', 'truncated']) {
      const rows = r[lens];
      console.log(`-- ${lens} (${rows.length})`);
      rows.slice(0, 14).forEach((x) => console.log('   ', JSON.stringify(x)));
      total += rows.length;
    }
    await p.close();
  }
  await b.close();
  // A probe that only PRINTS is a report, not a gate. Nine lenses ran
  // across every skin and width this sweep was given; if any of them
  // has something to say, the build hears it.
  console.log(`\nchrome-probes: ${total === 0 ? 'clean' : total + ' finding' + (total === 1 ? '' : 's')} · ${SKINS.length} skin(s) x ${SIZES.length} size(s)${FORCED ? ' · forced-colors' : ''}${SHAPE ? ' · shape corpus' : ''}`);
  process.exit(total === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
