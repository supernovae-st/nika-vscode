#!/usr/bin/env node
// focus-probes.cjs — the keyboard-path proof suite (third sibling).
//
// a11y-probes asks whether the canvas SPEAKS. chrome-probes asks whether it
// FITS. This asks whether a keyboard can SEE where it is:
//
//   INDICATOR  a focused control that paints no visible change at all
//              (outline · box-shadow · border · background · outline-offset)
//   OBSCURED   WCAG 2.2 2.4.11 Focus Not Obscured (Minimum): the focused
//              control is entirely covered by other chrome, so the ring
//              exists and nobody can see it
//   TRAP       Tab does not advance (the focus is stuck on one control)
//
// The walk is a real Tab walk, because :focus-visible only arms for the
// keyboard: el.focus() from script does not paint a ring on a <button> in
// Chromium, so a script-driven probe would report a false all-clear.
//
// Run: NIKA_PLAYWRIGHT=<path> node scripts/media/focus-probes.cjs
//      SKIN=nika|editor|phosphor   SIZE=1440x900   STOPS=60
// Headed, out of CI, like its siblings.
const path = require('path');
const { chromium } = require(process.env.NIKA_PLAYWRIGHT || 'playwright');

const SKIN = process.env.SKIN || 'nika';
const [W, H] = (process.env.SIZE || '1440x900').split('x').map(Number);
const STOPS = Number(process.env.STOPS || 60);

const SNAP = () => {
  const el = document.activeElement;
  if (!el || el === document.body) { return null; }
  // The graph is ONE tab stop by design (a roving tabindex; the cards are
  // walked with arrows, and a11y-probes owns that contract). A chrome walk
  // that counted card stops would read the roving pattern as a trap.
  if (el.closest && el.closest('#dag-container')) { return { canvas: true }; }
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const id = el.id ? '#' + el.id : '';
  const cls = (typeof el.className === 'string' && el.className)
    ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
  return {
    sel: el.tagName.toLowerCase() + id + cls,
    text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 28),
    focusVisible: el.matches(':focus-visible'),
    style: [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.outlineOffset,
            cs.boxShadow, cs.borderColor, cs.borderWidth, cs.backgroundColor].join('|'),
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    // Who actually paints at the control's own centre? If it is not the
    // focused element or one of its descendants, something covers it.
    topAtCentre: (() => {
      const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return t ? (el === t || el.contains(t) || t.contains(el)) : false;
    })(),
  };
};

// The same element, unfocused, is the baseline every ring is measured against.
const BLUR_STYLE = (sel) => {
  const el = document.querySelector(sel);
  if (!el) { return null; }
  const cs = getComputedStyle(el);
  return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.outlineOffset,
          cs.boxShadow, cs.borderColor, cs.borderWidth, cs.backgroundColor].join('|');
};

(async () => {
  const b = await chromium.launch({ headless: false, channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const qs = '?still' + (SKIN === 'nika' ? '' : `&skin=${SKIN}`);
  await p.goto('file://' + path.join(process.cwd(), 'scripts/media/harness.html' + qs));
  await p.waitForTimeout(2400);

  const findings = { indicator: [], obscured: [], trap: [] };
  const seen = new Set();
  let prev = null, stuck = 0, canvasStops = 0;

  for (let i = 0; i < STOPS; i++) {
    await p.keyboard.press('Tab');
    await p.waitForTimeout(60);
    const snap = await p.evaluate(SNAP);
    if (!snap) { continue; }
    // Inside the graph the roving stop absorbs Tab; step back out to the
    // chrome and keep walking rather than declaring a trap.
    if (snap.canvas) {
      canvasStops += 1;
      if (canvasStops > 2) { await p.keyboard.press('Escape'); }
      continue;
    }

    if (prev && snap.sel === prev.sel && snap.rect.x === prev.rect.x) {
      if (++stuck >= 3) { findings.trap.push({ sel: snap.sel, text: snap.text }); break; }
    } else { stuck = 0; }
    prev = snap;

    if (seen.has(snap.sel)) { continue; }
    seen.add(snap.sel);

    const blurred = await p.evaluate(BLUR_STYLE, snap.sel);
    if (blurred !== null && blurred === snap.style) {
      findings.indicator.push({ sel: snap.sel, text: snap.text, focusVisible: snap.focusVisible });
    }
    if (!snap.topAtCentre && snap.rect.w > 0) {
      findings.obscured.push({ sel: snap.sel, text: snap.text, rect: snap.rect });
    }
  }

  console.log(`\n===== FOCUS · ${SKIN} @ ${W}x${H} · ${seen.size} distinct stops =====`);
  // A walk that reached no chrome is NOT a clean bill: it means Tab never
  // left the graph. Say so loudly rather than printing three zeros, which
  // would read as "the keyboard path is fine" when nothing was measured.
  if (seen.size === 0) {
    console.log(`!! INCONCLUSIVE · ${STOPS} Tab presses, ${canvasStops} of them inside`);
    console.log('   #dag-container and zero on the chrome. The canvas binds Tab to');
    console.log('   card cycling, so the toolbar and omnibar are not on the Tab path.');
    console.log('   Whether that is the roving-tabindex design (single-key lenses ·');
    console.log('   Alt+F1 teaches 30 keys) or a WCAG 2.1.1 gap for the controls with');
    console.log('   NO printed key (⧇ New · ∿ curve · ⋯ more · ⤓ svg · ⤓ png) is an');
    console.log('   open question this probe cannot answer alone. Do not read it green.');
  }
  for (const lens of ['indicator', 'obscured', 'trap']) {
    console.log(`-- ${lens} (${findings[lens].length})`);
    findings[lens].slice(0, 12).forEach((x) => console.log('   ', JSON.stringify(x)));
  }
  await b.close();
})();
