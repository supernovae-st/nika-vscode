// transport.ts — the platine: play/pause/scrub a recorded trace through
// the DAG (webview-side · vanilla · bundled into dag.js · zero deps).
//
// State is ONE variable p ∈ [0, 1]; apply(p) is idempotent and paints
// through the SAME visual path as dag:batchUpdateStatus (the renderer's
// batch update) — status classes only, NEVER an ELK relayout. Per frame
// it diffs against the last painted states and touches only the tasks
// that actually changed, so an idle scrub frame costs nothing.
//
// Playback compresses the REAL recorded clock (speed×, capped at 20s —
// the replayIntoDag law) with a floor so ms-scale mock traces stay
// watchable; the readout always shows the recorded clock, never the
// compressed one. prefers-reduced-motion: no inertia, scrub jumps
// straight to target, and auto-play lands directly on the verdict.

import {
  clamp01,
  formatClock,
  snapNext,
  snapPrev,
  statesAt,
  type TraceTimeline,
} from '../core/traceTimeline';

/** Mirror of the DAG status vocabulary (identical literal union). */
type TransportStatus =
  | 'pending'
  | 'running'
  | 'retrying'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface TransportHost {
  /** Wired to renderer.batchUpdateStatus — the one visual seam. */
  applyStates(
    updates: Array<{ taskId: string; status: TransportStatus; durationMs?: number }>,
  ): void;
}

export interface Transport {
  load(tl: TraceTimeline, opts?: { speed?: number; autoPlay?: boolean }): void;
  /** Hide the bar, stop every loop, drop the timeline. Idempotent. */
  deactivate(): void;
  /** Repaint the current p from scratch (after an async graph render). */
  resync(): void;
}

const SLIDER_STEPS = 1000;
const MIN_BUDGET_MS = 1200; // ms-scale mock traces still get a visible run
const MAX_BUDGET_MS = 20000; // the replayIntoDag ceiling — giant runs stay watchable
const INERTIA_TAU_MS = 90; // light decay — the thumb leads, the state glides
const SETTLE_EPS = 0.0005;

export function createTransport(host: TransportHost): Transport {
  const bar = document.getElementById('transport');
  const playBtn = document.getElementById('tr-play') as HTMLButtonElement | null;
  const slider = document.getElementById('tr-scrub') as HTMLInputElement | null;
  const tickHost = document.getElementById('tr-ticks');
  const timeEl = document.getElementById('tr-time');

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let tl: TraceTimeline | undefined;
  let p = 0; // painted position
  let target = 0; // where the transport is heading (scrub/snap/play)
  let playing = false;
  let dragging = false;
  let budgetMs = MIN_BUDGET_MS;
  let raf: number | undefined;
  let lastFrame = 0;
  /** taskId → "status|durationMs" — the diff floor for apply(). */
  const painted = new Map<string, string>();

  // ── paint · the idempotent apply(p) ──────────────────────────────────

  function paint(next: number): void {
    if (!tl) { return; }
    p = clamp01(next);

    const states = statesAt(tl, p);
    const updates: Array<{ taskId: string; status: TransportStatus; durationMs?: number }> = [];
    for (const [taskId, s] of states) {
      const sig = `${s.status}|${s.durationMs ?? ''}`;
      if (painted.get(taskId) !== sig) {
        painted.set(taskId, sig);
        updates.push({ taskId, status: s.status, durationMs: s.durationMs });
      }
    }
    if (updates.length > 0) { host.applyStates(updates); }

    // Chrome: fill + thumb + readout — style/state writes only.
    if (slider) {
      if (!dragging) { slider.value = String(Math.round(p * SLIDER_STEPS)); }
      slider.style.setProperty('--tr-p', String(p));
      slider.setAttribute(
        'aria-valuetext',
        `${formatClock(p * tl.totalMs, tl.totalMs)} of ${formatClock(tl.totalMs, tl.totalMs)}`,
      );
    }
    if (timeEl) {
      timeEl.textContent =
        `${formatClock(p * tl.totalMs, tl.totalMs)} / ${formatClock(tl.totalMs, tl.totalMs)}`;
    }
  }

  // ── the one rAF loop · play advance + scrub inertia ──────────────────

  function frame(now: number): void {
    raf = undefined;
    if (!tl) { return; }
    const dt = Math.max(0, Math.min(100, now - lastFrame));
    lastFrame = now;

    if (playing) { target = clamp01(target + dt / budgetMs); }

    // While playing (or under reduced motion) the state tracks the target
    // exactly; a hand scrub glides after it with a light decay.
    let next = playing || REDUCED ? target : p + (target - p) * (1 - Math.exp(-dt / INERTIA_TAU_MS));
    if (Math.abs(next - target) < SETTLE_EPS) { next = target; }
    if (next !== p) { paint(next); }

    if (playing && p >= 1) { setPlaying(false); }
    if (playing || p !== target) { schedule(); }
  }

  function schedule(): void {
    if (raf === undefined) {
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function setPlaying(on: boolean): void {
    playing = on;
    if (playBtn) {
      playBtn.textContent = on ? '❚❚' : '▶';
      playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    }
    if (on) { schedule(); }
  }

  function togglePlay(): void {
    if (!tl) { return; }
    if (!playing && p >= 1 - SETTLE_EPS) {
      // Replay from the top — the platine's rewind-on-play.
      target = 0;
      paint(0);
    }
    setPlaying(!playing);
  }

  function seekTo(v: number): void {
    if (!tl) { return; }
    target = clamp01(v);
    if (REDUCED) { paint(target); return; }
    schedule();
  }

  // ── controls ──────────────────────────────────────────────────────────

  playBtn?.addEventListener('click', () => togglePlay());

  slider?.addEventListener('pointerdown', () => { dragging = true; });
  window.addEventListener('pointerup', () => { dragging = false; });
  slider?.addEventListener('input', () => {
    if (!tl || !slider) { return; }
    seekTo(Number(slider.value) / SLIDER_STEPS);
  });

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!tl) { return; }
    // Buttons own Space; foreign inputs (the search box) own their keys.
    if (e.target instanceof HTMLButtonElement) { return; }
    const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (inField && e.target !== slider) { return; }
    switch (e.key) {
      case ' ':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault(); // replaces the slider's native step: snap to events
        seekTo(snapPrev(tl.events, target));
        break;
      case 'ArrowRight':
        e.preventDefault();
        seekTo(snapNext(tl.events, target));
        break;
      case 'Home':
        e.preventDefault();
        seekTo(0);
        break;
      case 'End':
        e.preventDefault();
        seekTo(1);
        break;
    }
  });

  // ── lifecycle ─────────────────────────────────────────────────────────

  function buildTicks(): void {
    if (!tickHost || !tl) { return; }
    tickHost.textContent = '';
    for (const f of tl.ticks) {
      const mark = document.createElement('span');
      mark.className = 'tr-tick';
      mark.style.left = `${f * 100}%`;
      tickHost.appendChild(mark);
    }
  }

  return {
    load(newTl, opts): void {
      tl = newTl;
      painted.clear();
      budgetMs = Math.max(
        MIN_BUDGET_MS,
        Math.min(newTl.totalMs / Math.max(opts?.speed ?? 6, 1), MAX_BUDGET_MS),
      );
      buildTicks();
      bar?.removeAttribute('hidden');
      document.body.classList.add('transport-on');
      setPlaying(false);
      target = 0;
      paint(0);
      if (opts?.autoPlay) {
        if (REDUCED) {
          // Reduced motion: land directly on the verdict, bar stays scrubbable.
          target = 1;
          paint(1);
        } else {
          setPlaying(true);
        }
      }
    },

    deactivate(): void {
      if (!tl) { return; }
      tl = undefined;
      setPlaying(false);
      if (raf !== undefined) { cancelAnimationFrame(raf); raf = undefined; }
      painted.clear();
      bar?.setAttribute('hidden', '');
      document.body.classList.remove('transport-on');
    },

    resync(): void {
      if (!tl) { return; }
      painted.clear();
      paint(p);
    },
  };
}
