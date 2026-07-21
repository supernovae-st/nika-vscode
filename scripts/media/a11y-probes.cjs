#!/usr/bin/env node
// a11y-probes.cjs — the canvas-speaks proof suite (V-SOTA.C PR C2).
//
// Real Playwright gestures against the harness, asserting the
// screen-reader contract end to end: Graphics Module roles, the
// roving tab stop and its DOM focus twin, the silent aria-label
// refresh, the ONE narrator (polite milestones coalesced · assertive
// failures), pan-to-focus, the focus ring, the help dialog, the
// C1 connect-mode's focus round-trip, and the O14 overlays (K panel ·
// task palette) handing the focus back. A change that silently drops a
// role, steals the focus, or turns the narrator per-tick fails here.
//
// Run: NIKA_PLAYWRIGHT=<path> node scripts/media/a11y-probes.cjs
// (headed — trusted gestures; playwright stays out of the manifest,
// installed --no-save when judging. Not wired to CI by design.)

const path = require('path');
const { chromium } = require(process.env.NIKA_PLAYWRIGHT || 'playwright');

let pass = 0;
let fail = 0;
function probe(name, ok, note = '') {
  if (ok) { pass += 1; } else { fail += 1; }
  console.log(`${ok ? '✓' : '✗'} ${name}${note ? ` · ${note}` : ''}`);
}

(async () => {
  const b = await chromium.launch({ headless: false });
  const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
  await p.goto('file://' + path.join(process.cwd(), 'scripts/media/harness.html?still'));
  await p.waitForSelector('.dag-node .nc', { timeout: 8000 });
  await p.waitForTimeout(1400);

  // ── 1 · Roles: the Graphics Module composite ─────────────────────────
  {
    const r = await p.evaluate(() => {
      const svg = document.querySelector('.dag-svg');
      const container = document.getElementById('dag-container');
      const nodes = [...document.querySelectorAll('.dag-node')];
      return {
        svgRole: svg?.getAttribute('role'),
        svgLabel: svg?.getAttribute('aria-label') ?? '',
        containerRole: container?.getAttribute('role'),
        toolbarInsideApp: Boolean(container?.contains(document.getElementById('dag-toolbar'))),
        omnibarInsideApp: Boolean(container?.contains(document.getElementById('omnibar'))),
        nodeCount: nodes.length,
        symbolCount: nodes.filter((n) => n.getAttribute('role') === 'graphics-symbol').length,
        roledescCount: nodes.filter((n) => n.getAttribute('aria-roledescription') === 'task node').length,
        labeledCount: nodes.filter((n) => (n.getAttribute('aria-label') ?? '').length > 0).length,
      };
    });
    probe('svg is a named graphics-document', r.svgRole === 'graphics-document' && /task/.test(r.svgLabel), r.svgLabel);
    probe('svg name carries the task count', new RegExp(`${r.nodeCount} tasks`).test(r.svgLabel));
    probe('application scoped TIGHT to the canvas container', r.containerRole === 'application' && !r.toolbarInsideApp && !r.omnibarInsideApp);
    probe('every card is a graphics-symbol', r.symbolCount === r.nodeCount && r.nodeCount > 0, `${r.symbolCount}/${r.nodeCount}`);
    probe('every card is a "task node"', r.roledescCount === r.nodeCount);
    probe('every card has an accessible name', r.labeledCount === r.nodeCount);
  }

  // ── 2 · The accessible name reads label · mechanism · status · degree ─
  {
    const label = await p.evaluate(() =>
      [...document.querySelectorAll('.dag-node')].find((e) => e.getAttribute('data-id') === 'digest')
        ?.getAttribute('aria-label') ?? '');
    probe('name shape: label, mechanism, status', /digest, .+, (pending|success|running)/.test(label), label);
    probe('name carries the degree (dependencies/dependents)', /(dependenc|dependent)/.test(label));
  }

  // ── 3 · Roving tabindex: ONE stop, the DOM twin follows ──────────────
  {
    const before = await p.evaluate(() => ({
      svgTab: document.querySelector('.dag-svg')?.getAttribute('tabindex'),
      zeroNodes: [...document.querySelectorAll('.dag-node')].filter((n) => n.getAttribute('tabindex') === '0').length,
    }));
    probe('idle: the svg holds the single stop', before.svgTab === '0' && before.zeroNodes === 0);

    await p.keyboard.press('ArrowRight'); // DAG-walk → first node
    await p.waitForTimeout(250);
    const after = await p.evaluate(() => {
      const zero = [...document.querySelectorAll('.dag-node')].filter((n) => n.getAttribute('tabindex') === '0');
      const ae = document.activeElement;
      return {
        zeroCount: zero.length,
        svgTab: document.querySelector('.dag-svg')?.getAttribute('tabindex'),
        aeIsFocusedNode: Boolean(ae && zero[0] === ae),
        aeSelected: Boolean(ae && ae.classList?.contains('selected')),
        focusVisible: document.querySelector('.dag-node:focus-visible') !== null,
      };
    });
    probe('keyboard move: exactly one roving stop on the focused card', after.zeroCount === 1 && after.svgTab === '-1');
    probe('the DOM focus IS the visual focus', after.aeIsFocusedNode && after.aeSelected);
    probe('keyboard focus is :focus-visible (the hard ring arms)', after.focusVisible);
    const ring = await p.evaluate(() => {
      const nc = document.querySelector('.dag-node:focus-visible .nc');
      return nc ? getComputedStyle(nc).boxShadow : '';
    });
    probe('focus ring paints (box-shadow live)', ring !== '' && ring !== 'none', ring.slice(0, 60));
  }

  // ── 4 · Pan-to-focus: a keyboard move never lands off-viewport ───────
  {
    // Throw the camera far away, then walk — the focused card must come back.
    await p.evaluate(() => {
      window.postMessage({ kind: 'dag:fitToView' }, '*');
    });
    await p.waitForTimeout(300);
    await p.mouse.move(700, 500);
    await p.mouse.down();
    await p.mouse.move(2600, 2400, { steps: 3 }); // drag the canvas far off
    await p.mouse.up();
    await p.waitForTimeout(200);
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(300);
    const inView = await p.evaluate(() => {
      const el = [...document.querySelectorAll('.dag-node')].find((n) => n.getAttribute('tabindex') === '0');
      if (!el) { return { ok: false, why: 'no focused node' }; }
      const r = el.getBoundingClientRect();
      const ok = r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
      return { ok, why: `${Math.round(r.left)},${Math.round(r.top)}→${Math.round(r.right)},${Math.round(r.bottom)}` };
    });
    probe('pan-to-focus: the focused card is fully in the viewport', inView.ok, inView.why);
  }

  // ── 5 · The narrator: run start assertive · milestones coalesced ─────
  {
    const post = (msg) => p.evaluate((m) => window.postMessage(m, '*'), msg);
    await post({ kind: 'run:state', running: true });
    await p.waitForTimeout(200);
    const started = await p.evaluate(() => document.getElementById('a11y-alert')?.textContent ?? '');
    probe('run start speaks assertive with the count', /^Run started, \d+ tasks$/.test(started), started);

    // Two ticks inside the gap: ONE milestone, the latest census.
    await post({ kind: 'dag:batchUpdateStatus', updates: [{ taskId: 'history', status: 'running' }] });
    await p.waitForTimeout(120);
    await post({ kind: 'dag:batchUpdateStatus', updates: [{ taskId: 'history', status: 'success', durationMs: 900 }, { taskId: 'digest', status: 'running' }] });
    await p.waitForTimeout(700);
    const early = await p.evaluate(() => document.getElementById('a11y-status')?.textContent ?? '');
    await p.waitForTimeout(1900); // past the 2s gap → the parked milestone ripens
    const milestone = await p.evaluate(() => document.getElementById('a11y-status')?.textContent ?? '');
    probe('milestones are throttled (silent inside the gap)', !/tasks complete/.test(early), early || '(silent)');
    probe('the coalesced milestone speaks the latest census', /^1 of \d+ tasks complete, 1 running$/.test(milestone), milestone);

    // The silent label refresh: the card's name follows the state.
    const liveLabel = await p.evaluate(() =>
      [...document.querySelectorAll('.dag-node')].find((e) => e.getAttribute('data-id') === 'digest')
        ?.getAttribute('aria-label') ?? '');
    probe('aria-label follows the status silently', /digest, .+, running/.test(liveLabel), liveLabel);

    // A failure interrupts (assertive), once.
    await post({ kind: 'dag:batchUpdateStatus', updates: [{ taskId: 'digest', status: 'failed', failPreview: 'NIKA-INFER-003 · provider refused' }] });
    await p.waitForTimeout(200);
    const alerted = await p.evaluate(() => document.getElementById('a11y-alert')?.textContent ?? '');
    probe('a failure speaks assertive with its story', alerted === 'Task digest failed: NIKA-INFER-003 · provider refused', alerted);

    // The close: one voice with the verdict banner (polite on green).
    await post({ kind: 'run:state', running: false });
    await post({ kind: 'run:verdict', icon: '✓', text: 'run succeeded · 7 ✓ · 4.2s', cls: 'st-success' });
    await p.waitForTimeout(200);
    const closed = await p.evaluate(() => document.getElementById('a11y-status')?.textContent ?? '');
    probe('the green close is the polite verdict line', closed === 'run succeeded · 7 ✓ · 4.2s', closed);

    // A failed close goes assertive.
    await post({ kind: 'run:verdict', icon: '✗', text: 'run failed · 1 ✗', cls: 'st-failed' });
    await p.waitForTimeout(200);
    const redClose = await p.evaluate(() => document.getElementById('a11y-alert')?.textContent ?? '');
    probe('a failed close speaks assertive', redClose === 'run failed · 1 ✗', redClose);

    // Reset the board for the next probes.
    await post({ kind: 'dag:batchUpdateStatus', updates: [{ taskId: 'history', status: 'pending' }, { taskId: 'digest', status: 'pending' }] });
    await p.waitForTimeout(200);
  }

  // ── 6 · The help dialog: alt+F1 in, Esc out, focus round-trips ───────
  {
    await p.keyboard.press('Alt+F1');
    await p.waitForTimeout(250);
    const open = await p.evaluate(() => {
      const ex = document.getElementById('explainer');
      return {
        visible: ex ? !ex.hasAttribute('hidden') : false,
        role: ex?.getAttribute('role'),
        named: (ex?.getAttribute('aria-label') ?? '').length > 0,
        focused: document.activeElement === ex,
        keymapRows: ex ? ex.querySelectorAll('.ex-keys kbd').length : 0,
      };
    });
    probe('alt+F1 opens the keymap as a real dialog', open.visible && open.role === 'dialog' && open.named);
    probe('the dialog takes the reader with it', open.focused);
    probe('the dialog teaches the whole keymap', open.keymapRows >= 27, `${open.keymapRows} keys`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(250);
    const closed = await p.evaluate(() => ({
      hidden: document.getElementById('explainer')?.hasAttribute('hidden') ?? false,
      backOnCard: document.activeElement?.classList?.contains('dag-node') ?? false,
    }));
    probe('Esc closes and hands the focus back to the card', closed.hidden && closed.backOnCard);
  }

  // ── 7 · C1 regression: connect-mode round-trips the focus ────────────
  {
    await p.keyboard.press('c');
    await p.waitForTimeout(300);
    const cm = await p.evaluate(() => ({
      open: document.getElementById('connect-cmdk')?.hasAttribute('hidden') === false,
      inputFocused: document.activeElement === document.getElementById('connect-input'),
    }));
    probe('connect-mode still opens focused (C1 intact)', cm.open && cm.inputFocused);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    const back = await p.evaluate(() => ({
      closed: document.getElementById('connect-cmdk')?.hasAttribute('hidden') !== false,
      backOnCard: document.activeElement?.classList?.contains('dag-node') ?? false,
      canceled: document.getElementById('a11y-status')?.textContent ?? '',
    }));
    probe('cancel restores the DOM focus to the card', back.closed && back.backOnCard, back.canceled);
  }

  // ── 8 · O14: the K panel + task palette round-trip the focus too ─────
  {
    // K — the actions panel opens on the focused card (it never steals
    // the DOM focus)… and Esc hands the roving stop straight back.
    await p.keyboard.press('k');
    await p.waitForTimeout(250);
    const kOpen = await p.evaluate(() => document.getElementById('nk-actions') !== null);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(250);
    const kBack = await p.evaluate(() => ({
      closed: document.getElementById('nk-actions') === null,
      backOnCard: document.activeElement?.classList?.contains('dag-node') ?? false,
    }));
    probe('K opens the actions panel on the focused card', kOpen);
    probe('K panel Esc hands the focus back to the card', kBack.closed && kBack.backOnCard);

    // The MOUSE path — a row click parks the DOM focus on a button the
    // close() removes; the seam must hand it back to the card.
    await p.keyboard.press('k');
    await p.waitForTimeout(250);
    await p.click('#nk-actions .nk-act-row:has-text("Expand")');
    await p.waitForTimeout(250);
    const kClick = await p.evaluate(() => ({
      closed: document.getElementById('nk-actions') === null,
      backOnCard: document.activeElement?.classList?.contains('dag-node') ?? false,
    }));
    probe('K panel row CLICK hands the focus back to the card', kClick.closed && kClick.backOnCard);

    // N — the task palette TAKES the input… and Esc hands it back.
    await p.keyboard.press('n');
    await p.waitForTimeout(250);
    const nOpen = await p.evaluate(() => ({
      open: document.getElementById('verb-cmdk')?.hasAttribute('hidden') === false,
      inputFocused: document.activeElement === document.getElementById('cmdk-input'),
    }));
    await p.keyboard.press('Escape');
    await p.waitForTimeout(250);
    const nBack = await p.evaluate(() => ({
      closed: document.getElementById('verb-cmdk')?.hasAttribute('hidden') !== false,
      backOnCard: document.activeElement?.classList?.contains('dag-node') ?? false,
    }));
    probe('the task palette opens focused (N)', nOpen.open && nOpen.inputFocused);
    probe('palette Esc hands the focus back to the card', nBack.closed && nBack.backOnCard);

    // The card VANISHES while the palette is open (a run pruned it) —
    // the restore falls back to the svg root, never a throw.
    const goneId = await p.evaluate(() => {
      const focused = document.querySelector('.dag-node[tabindex="0"]');
      return focused?.getAttribute('data-id') ?? null;
    });
    await p.keyboard.press('n');
    await p.waitForTimeout(250);
    await p.evaluate((id) => {
      const graph = GRAPH; // harness fixture — top-level const, same realm
      window.postMessage({
        kind: 'dag:load',
        graph: {
          ...graph,
          nodes: graph.nodes.filter((n) => n.id !== id),
          edges: graph.edges.filter((e) => e.source !== id && e.target !== id),
        },
      }, '*');
    }, goneId);
    await p.waitForTimeout(900); // the reload lands (ELK round-trip)
    await p.keyboard.press('Escape');
    await p.waitForTimeout(250);
    const svgBack = await p.evaluate(() => ({
      closed: document.getElementById('verb-cmdk')?.hasAttribute('hidden') !== false,
      onSvg: document.activeElement === document.querySelector('.dag-svg'),
    }));
    probe('card gone mid-palette: the restore lands on the svg root', svgBack.closed && svgBack.onSvg);
  }

  // ── 8b · RC-2b: the K toggle lifecycle (the leaked listener dies) ────
  {
    // The ⋯ door lives on the EXPANDED card's pill: focus, expand,
    // open with K, then toggle CLOSED via ⋯ (the openNodeActions
    // re-entry path — where the old code left its window-capture
    // listener alive). One Esc must then still reach the canvas chain
    // (clearFocus → the svg re-takes the stop): the leaked listener
    // used to eat it.
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(250);
    await p.keyboard.press('e');
    await p.waitForTimeout(700);
    const dots = await p.evaluate(() =>
      document.querySelector('.dag-node[tabindex="0"] .nc-x-panel') !== null);
    await p.keyboard.press('k');
    await p.waitForTimeout(200);
    const kOpen2 = await p.evaluate(() => document.getElementById('nk-actions') !== null);
    await p.evaluate(() => {
      const el = document.querySelector('.dag-node[tabindex="0"] .nc-x-panel');
      if (el instanceof HTMLElement) { el.click(); }
    });
    await p.waitForTimeout(200);
    const toggled = await p.evaluate(() => ({
      closed: document.getElementById('nk-actions') === null,
      backOnCard: document.activeElement?.classList?.contains('dag-node') ?? false,
    }));
    probe('the ⋯ toggle closes the panel and restores the card', dots && kOpen2 && toggled.closed && toggled.backOnCard);
    await p.keyboard.press('e');
    await p.waitForTimeout(500);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(250);
    const afterEsc = await p.evaluate(() => ({
      svgTab: document.querySelector('.dag-svg')?.getAttribute('tabindex'),
      zeroNodes: [...document.querySelectorAll('.dag-node')].filter((n) => n.getAttribute('tabindex') === '0').length,
    }));
    probe('no stale listener: the very next Esc clears the focus', afterEsc.svgTab === '0' && afterEsc.zeroNodes === 0);
  }

  // ── 8c · RC-2b: typing filters the K rows (the / count voice) ────────
  {
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(250);
    await p.keyboard.press('k');
    await p.waitForTimeout(200);
    const baseline = await p.evaluate(() =>
      document.querySelectorAll('#nk-actions .nk-act-row:not(.nk-act-hidden)').length);
    await p.keyboard.type('run');
    await p.waitForTimeout(150);
    const narrowed = await p.evaluate(() => ({
      visible: [...document.querySelectorAll('#nk-actions .nk-act-row:not(.nk-act-hidden)')].map((r) => r.textContent ?? ''),
      line: document.querySelector('#nk-actions .nk-act-query')?.textContent ?? '',
      activeHidden: document.querySelector('#nk-actions .nk-act-row.active')?.classList.contains('nk-act-hidden') ?? true,
    }));
    probe('typing narrows the K rows', narrowed.visible.length > 0 && narrowed.visible.length < baseline
      && narrowed.visible.every((t) => /run/i.test(t)), `${narrowed.visible.length}/${baseline}`);
    probe('the query line speaks the / count grammar', /^⌕ run · \d+ match/.test(narrowed.line), narrowed.line);
    probe('the active row is never a filtered-out row', !narrowed.activeHidden);
    await p.keyboard.type('zzz');
    await p.waitForTimeout(150);
    const zero = await p.evaluate(() => ({
      visible: document.querySelectorAll('#nk-actions .nk-act-row:not(.nk-act-hidden)').length,
      line: document.querySelector('#nk-actions .nk-act-query')?.textContent ?? '',
    }));
    probe('zero-match speaks the one voice', zero.visible === 0 && zero.line.includes('no match — Backspace widens'), zero.line);
    await p.keyboard.press('Backspace');
    await p.keyboard.press('Backspace');
    await p.keyboard.press('Backspace');
    await p.waitForTimeout(150);
    const widened = await p.evaluate(() =>
      document.querySelectorAll('#nk-actions .nk-act-row:not(.nk-act-hidden)').length);
    probe('Backspace widens back to the narrowed set', widened === narrowed.visible.length);
    await p.keyboard.press('k');
    await p.waitForTimeout(120);
    const stillOpen = await p.evaluate(() => document.getElementById('nk-actions') !== null);
    probe('k mid-query types — the toggle waits for an empty query', stillOpen);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
  }

  // ── 8d · RC-2b: the ⌘⏎ secondary (taught on the focused row) ─────────
  {
    await p.keyboard.press('k');
    await p.waitForTimeout(200);
    const hint = await p.evaluate(() => {
      const activeAlt = document.querySelector('#nk-actions .nk-act-row.active .nk-act-alt');
      return {
        text: activeAlt?.textContent ?? '',
        shown: activeAlt ? getComputedStyle(activeAlt).display !== 'none' : false,
        othersQuiet: [...document.querySelectorAll('#nk-actions .nk-act-row:not(.active) .nk-act-alt')]
          .every((el) => getComputedStyle(el).display === 'none'),
      };
    });
    probe('the focused row teaches its secondary', hint.shown && hint.text === '⌘⏎ run all' && hint.othersQuiet, hint.text);
    await p.keyboard.press('Meta+Enter');
    await p.waitForTimeout(150);
    const fired = await p.evaluate(() => ({
      closed: document.getElementById('nk-actions') === null,
      backOnCard: document.activeElement?.classList?.contains('dag-node') ?? false,
      runDoor: document.body.classList.contains('run-starting') || document.body.classList.contains('running'),
    }));
    probe('⌘⏎ fires the run-all door and closes through the seam', fired.closed && fired.backOnCard && fired.runDoor);
  }

  // ── 8e · RC-2b: habits rise WITHIN their group (the fences hold) ─────
  {
    await p.keyboard.press('k');
    await p.waitForTimeout(200);
    await p.click('#nk-actions .nk-act-row:has-text("Peek")');
    await p.waitForTimeout(200);
    await p.keyboard.press('k');
    await p.waitForTimeout(200);
    await p.click('#nk-actions .nk-act-row:has-text("Peek")');
    await p.waitForTimeout(200);
    await p.keyboard.press('k');
    await p.waitForTimeout(200);
    const order = await p.evaluate(() => {
      const kids = [...(document.getElementById('nk-actions')?.children ?? [])];
      const sepIdx = kids.findIndex((el) => el.classList.contains('nk-act-sep'));
      const afterSep = kids.slice(sepIdx + 1).filter((el) => el.classList.contains('nk-act-row'));
      const rowsAll = kids.filter((el) => el.classList.contains('nk-act-row'));
      return {
        sepFound: sepIdx !== -1,
        groupHead: afterSep[0]?.querySelector('span')?.textContent ?? '',
        first: rowsAll[0]?.querySelector('span')?.textContent ?? '',
        second: rowsAll[1]?.querySelector('span')?.textContent ?? '',
      };
    });
    probe('a habit lifts the row to its GROUP head (never across)', order.sepFound && /Peek/.test(order.groupHead), order.groupHead);
    probe('the pinned primary never moves', /Run from here/.test(order.first) && /What if/.test(order.second), `${order.first} · ${order.second}`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(150);
  }

  await b.close();
  console.log(`\na11y-probes: ${pass}/${pass + fail} green`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
