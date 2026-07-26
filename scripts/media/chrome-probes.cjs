#!/usr/bin/env node
// chrome-probes.cjs — the canvas CHROME proof suite (sister to a11y-probes).
//
// a11y-probes asks whether the canvas SPEAKS. This asks whether it FITS:
// four lenses swept across every skin and every panel width, each
// reporting instances so a fix can be structural instead of anecdotal.
//
//   CLIP      text truncated with no ellipsis affordance (inputs included —
//             a placeholder never grows scrollWidth, so its glyph run is
//             measured against the content box the browser paints into)
//   TARGET    interactive target under the WCAG 2.2 2.5.8 24x24 minimum
//   CONTRAST  text under the 4.5:1 AA floor (3:1 for >=18.66px bold / 24px),
//             alpha composited over its real backdrop first
//   SPILL     chrome painting outside the viewport
//
// It exists because three defects shipped invisible to `npm test`: a
// command-bar placeholder that lost four fifths of its lesson mid-word, a
// dim ink whose comment claimed an AA floor it measured 3.85:1 against,
// and a toolbar that spilled its run status and its own overflow door off
// screen across a 240px band of ordinary panel widths.
//
// Run: NIKA_PLAYWRIGHT=<path> node scripts/media/chrome-probes.cjs
//      SKINS=nika,editor,phosphor SIZES=520x760,1000x700,1440x900 ...
// Headed, like its sister; playwright stays out of the manifest. Not
// wired to CI by design — the judge runs it, the belt stays fast.
const path = require('path');
const { chromium } = require(process.env.NIKA_PLAYWRIGHT || 'playwright');

const SKINS = (process.env.SKINS || 'nika,editor,phosphor').split(',');
const SIZES = (process.env.SIZES || '1440x900').split(',').map((s) => {
  const [w, h] = s.split('x').map(Number); return { width: w, height: h };
});

const PROBE = () => {
  const out = { clip: [], target: [], contrast: [], spill: [] };
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

  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // Only the chrome: the SVG canvas is transform-scaled, its geometry is layout-free.
    if (el.closest('#dag-container svg')) continue;

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
  }
  const uniq = (a, k) => { const s = new Set(); return a.filter((x) => !s.has(x[k]) && s.add(x[k])); };
  out.clip = uniq(out.clip, 'sel'); out.target = uniq(out.target, 'sel');
  out.contrast = uniq(out.contrast, 'sel'); out.spill = uniq(out.spill, 'sel');
  return out;
};

(async () => {
  const b = await chromium.launch({ headless: false, channel: 'chrome' });
  for (const skin of SKINS) for (const vp of SIZES) {
    const p = await b.newPage({ viewport: vp });
    const qs = skin === 'nika' ? '?still' : `?still&skin=${skin}`;
    await p.goto('file://' + path.join(process.cwd(), 'scripts/media/harness.html' + qs));
    await p.waitForTimeout(2400);
    const r = await p.evaluate(PROBE);
    console.log(`\n===== ${skin.toUpperCase()} @ ${vp.width}x${vp.height} =====`);
    for (const lens of ['clip', 'target', 'contrast', 'spill']) {
      const rows = r[lens];
      console.log(`-- ${lens} (${rows.length})`);
      rows.slice(0, 14).forEach((x) => console.log('   ', JSON.stringify(x)));
    }
    await p.close();
  }
  await b.close();
})();
